# -*- coding: utf-8 -*-
"""拼豆图纸卡密批量生成脚本

生成 14 位大写字母数字卡密 (剔除易混淆字符 0/O/1/I), 输出 CSV 与可导入闲管家的 SQL/列表。

用法:
    python scripts/gen_cards.py --plan 1d --count 50
    python scripts/gen_cards.py --plan 1d --count 50 --plan 7d --count 20 --plan forever --count 10
    python scripts/gen_cards.py --plan 1d --count 10 --csv cards_1d.csv --sql out.sql

参数:
    --plan PLAN --count N   生成某类型卡 N 张 (可重复多次)
    --csv PATH              导出 CSV (可选)
    --sql PATH              导出 D1 导入 SQL (可选, 含 INSERT)
    --no-sql-filename       默认不导出 SQL 文件名前缀日志
输出:
    默认打印格式: 卡密,类型  (每行一个)
    类型: 1d=1天卡, 7d=7天卡, forever=永久卡
"""
import argparse
import random
import secrets
import sys
import time

# 可用字符: 去除 I/O/0/1 (易混淆)
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 14


def gen_code(rng):
    return "".join(rng.choice(ALPHABET) for _ in range(CODE_LEN))


def gen_unique(rng, count, existing):
    codes = set(existing)
    out = []
    guard = 0
    while len(out) < count:
        guard += 1
        if guard > count * 100:
            raise RuntimeError("生成卡密去重失败, 请检查随机源")
        c = gen_code(rng)
        if c not in codes:
            codes.add(c)
            out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser(description="拼豆图纸卡密生成器")
    ap.add_argument("--plan", action="append", required=True, help="卡类型: 1d/7d/forever")
    ap.add_argument("--count", action="append", required=True, help="对应类型的数量")
    ap.add_argument("--csv", help="导出 CSV 路径")
    ap.add_argument("--sql", help="导出 D1 导入 SQL 路径")
    ap.add_argument("--seed-file", help="已有卡密文件 (每行一个, 用于去重, 可选)")
    args = ap.parse_args()

    if len(args.plan) != len(args.count):
        sys.stderr.write("--plan 与 --count 数量必须一致\n")
        sys.exit(1)

    plan_names = {"1d": "1天卡", "7d": "7天卡", "forever": "永久卡"}
    existing = set()
    if args.seed_file:
        with open(args.seed_file, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip().upper()
                if s:
                    existing.add(s)

    rng = random.SystemRandom()
    results = []  # (plan, code)
    css = []
    total = 0
    seen = set()
    for plan, count in zip(args.plan, args.count):
        n = int(count)
        pool = [c for p, c in results]
        codes = gen_unique(rng, n, set(pool) | existing | seen)
        seen.update(codes)
        for c in codes:
            results.append((plan, c))
            total += 1

        # CSV 行: 类型,卡密 (前 500 行可被闲管家/闲鱼自动发货识别为"卡密,类型"列)
        for c in codes:
            css.append("%s,%s" % (plan_names[plan], c))

    for plan, c in results:
        print("%s,%s" % (plan_names[plan], c))

    if args.csv:
        with open(args.csv, "w", encoding="utf-8-sig", newline="") as f:
            f.write("类型,卡密\n")
            f.write("\n".join(css) + "\n")
        sys.stderr.write("已写入 CSV: %s (%d 行)\n" % (args.csv, len(css)))

    if args.sql:
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with open(args.sql, "w", encoding="utf-8") as f:
            f.write("-- 拼豆卡密批量导入 (生成于 %s, 共 %d 张)\n\n" % (now, total))
            f.write("INSERT INTO pindou_cards (code, plan) VALUES\n")
            lines = []
            for plan, c in results:
                lines.append("  ('%s', '%s')" % (c, plan))
            f.write(",\n".join(lines) + ";\n")
        sys.stderr.write("已写入 SQL: %s (%d 行)\n" % (args.sql, total))

    sys.stderr.write("共生成 %d 张卡密\n" % total)


if __name__ == "__main__":
    main()