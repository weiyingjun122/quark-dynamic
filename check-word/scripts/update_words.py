#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
违禁词库自动更新脚本
- 从开源词库仓库拉取最新数据
- 与本地 word/*.txt（可人工补充）合并去重
- 生成 js/words.js 供前端使用
- 本地运行: python scripts/update_words.py
- 仅本地合并: python scripts/update_words.py --local
"""
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_DIR = os.path.join(ROOT, "word")
JS_DIR = os.path.join(ROOT, "js")
WORDS_JS = os.path.join(JS_DIR, "words.js")

# 各平台的远程词库来源
# 字段说明: url 下载地址, fmt 解析格式(php/txt/md), target 归属词库
SOURCES = [
    # 广告法极限词库（咸鱼/电商/抖音/小红书通用底座）
    {
        "url": "https://raw.githubusercontent.com/spetacular/ad_checker/master/pub_ad_blocked_words.php",
        "fmt": "php",
        "target": "base",
    },
    # 通用广告类词库
    {
        "url": "https://raw.githubusercontent.com/konsheng/Sensitive-lexicon/main/Vocabulary/%E5%B9%BF%E5%91%8A%E7%B1%BB%E5%9E%8B.txt",
        "fmt": "txt",
        "target": "base",
    },
    # AI/通用违禁词补充
    {
        "url": "https://raw.githubusercontent.com/konsheng/Sensitive-lexicon/main/Vocabulary/%E5%85%B6%E4%BB%96%E8%AF%8D%E5%BA%93.txt",
        "fmt": "txt",
        "target": "ai",
    },
    {
        "url": "https://raw.githubusercontent.com/konsheng/Sensitive-lexicon/main/Vocabulary/%E8%89%B2%E6%83%85%E7%B1%BB%E5%9E%8B.txt",
        "fmt": "txt",
        "target": "ai",
    },
    {
        "url": "https://raw.githubusercontent.com/konsheng/Sensitive-lexicon/main/Vocabulary/%E6%9A%B4%E6%81%90%E8%AF%8D%E5%BA%93.txt",
        "fmt": "txt",
        "target": "ai",
    },
    {
        "url": "https://raw.githubusercontent.com/konsheng/Sensitive-lexicon/main/Vocabulary/%E6%B0%91%E7%94%9F%E8%AF%8D%E5%BA%93.txt",
        "fmt": "txt",
        "target": "ai",
    },
    # 抖音平台规则词库（解析 markdown 中 ``` 代码块内的关键词）
    {
        "url": "https://raw.githubusercontent.com/Duanjyy/content-compliance-checker/main/references/platform-douyin.md",
        "fmt": "md",
        "target": "douyin",
    },
    # 小红书平台规则词库
    {
        "url": "https://raw.githubusercontent.com/Duanjyy/content-compliance-checker/main/references/platform-xiaohongshu.md",
        "fmt": "md",
        "target": "xiaohongshu",
    },
]

# 词库归属: target -> 本地文件名
TARGET_FILES = {
    "base": "base.txt",
    "xianyu": "xianyu.txt",
    "ai": "ai.txt",
    "douyin": "douyin.txt",
    "xiaohongshu": "xiaohongshu.txt",
}

# uutool.cn 同步词库文件 -> 归属词库（由 scripts/sync_uutool.js 生成）
UUTOOL_FILES = {
    "xianyu": "xianyu-uutool.txt",
    "douyin": "douyin-uutool.txt",
    "xiaohongshu": "xiaohongshu-uutool.txt",
}

# 最终各平台 = base ∪ 平台专有
PLATFORMS = ["ai", "xianyu", "douyin", "xiaohongshu"]


def fetch(url, timeout=30):
    """下载文本内容，失败返回 None"""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    for enc in ("utf-8", "gbk", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def parse_php(text):
    """解析 PHP array('word' => 'desc', ...)"""
    words = []
    for m in re.finditer(r"['\"]([^'\"]+)['\"]\s*=>", text):
        w = m.group(1).strip()
        if w:
            words.append(w)
    return words


def parse_txt(text):
    words = []
    for line in text.splitlines():
        w = line.strip().strip("，,、").strip()
        if not w or w.startswith("#") or w.startswith("//"):
            continue
        words.append(w)
    return words


def parse_md(text):
    """提取 markdown 代码块内容，按顿号/逗号/换行拆分关键词"""
    words = []
    for block in re.findall(r"```[^`]*```", text, re.S):
        content = re.sub(r"^```[^\n]*\n|```$", "", block, flags=re.S)
        for line in content.splitlines():
            for part in re.split(r"[、，,，;；\s]+", line):
                part = part.strip()
                if part and not part.startswith("#"):
                    words.append(part)
    return words


def read_local(target):
    """读取本地词库文件中的词"""
    path = os.path.join(WORD_DIR, TARGET_FILES[target])
    words = []
    if os.path.exists(path):
        with io.open(path, encoding="utf-8") as f:
            words = parse_txt(f.read())
    return words


def read_uutool(target):
    """读取 uutool 同步词库文件中的词（不存在时返回空）"""
    fname = UUTOOL_FILES.get(target)
    if not fname:
        return []
    path = os.path.join(WORD_DIR, fname)
    words = []
    if os.path.exists(path):
        with io.open(path, encoding="utf-8") as f:
            words = parse_txt(f.read())
    return words


def write_local(target, words):
    """写回本地词库文件（保留人工添加的词）"""
    path = os.path.join(WORD_DIR, TARGET_FILES[target])
    with io.open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(words) + "\n")


def dedupe(words):
    seen = set()
    out = []
    for w in words:
        w = w.strip()
        if not w or w in seen:
            continue
        if len(w) > 50:  # 过滤异常长条目
            continue
        seen.add(w)
        out.append(w)
    out.sort()
    return out


def main():
    local_only = "--local" in sys.argv

    bucket = {t: [] for t in TARGET_FILES}
    fetched = []
    failed = []

    if not local_only:
        for src in SOURCES:
            url = src["url"]
            fmt = src["fmt"]
            target = src["target"]
            try:
                text = fetch(url)
                if fmt == "php":
                    words = parse_php(text)
                elif fmt == "md":
                    words = parse_md(text)
                else:
                    words = parse_txt(text)
                bucket[target].extend(words)
                fetched.append(url)
                print("[OK] %s -> %s (%d 词)" % (url, target, len(words)))
            except Exception as e:
                failed.append(url)
                print("[FAIL] %s : %s" % (url, e))
    else:
        print("[local] 跳过网络下载，仅使用本地词库")

    # 合并本地词库（保留人工补充）+ uutool 同步词库
    merged = {}
    for t in TARGET_FILES:
        merged[t] = dedupe(bucket[t] + read_local(t) + read_uutool(t))
        write_local(t, merged[t])
        print("[merge] %s: %d 词" % (t, len(merged[t])))

    # 组合最终平台词库
    base = merged["base"]
    data = {}
    for p in PLATFORMS:
        extra = merged.get(p, [])
        data[p] = dedupe(base + extra)

    # 生成 words.js
    if not os.path.isdir(JS_DIR):
        os.makedirs(JS_DIR)
    generated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    meta = {
        "generated": generated,
        "counts": {p: len(data[p]) for p in PLATFORMS},
        "sources": fetched,
    }
    js = (
        "/* 违禁词库（自动生成，请勿手动编辑）\n"
        " * 生成时间: %s\n"
        " * 来源: %s\n"
        " */\n"
        "window.WORD_DATA = %s;\n"
        "window.WORD_META = %s;\n"
    ) % (generated, "; ".join(fetched) or "local", json.dumps(data, ensure_ascii=False, indent=1), json.dumps(meta, ensure_ascii=False))

    # 仅当词库数据有变化时才写入，避免生成时间戳导致无意义的提交（触发工作流死循环）
    changed = True
    if os.path.exists(WORDS_JS):
        try:
            with io.open(WORDS_JS, encoding="utf-8") as f:
                old = f.read()
            old_data = old.split("window.WORD_DATA = ", 1)[1].rsplit(";\nwindow.WORD_META", 1)[0]
            new_data = json.dumps(data, ensure_ascii=False, indent=1)
            changed = old_data != new_data
        except Exception:
            changed = True

    if changed:
        with io.open(WORDS_JS, "w", encoding="utf-8") as f:
            f.write(js)
        print("[done] 词库有变化，已生成 %s" % WORDS_JS)
    else:
        print("[done] 词库无变化，跳过写入 %s" % WORDS_JS)
    for p in PLATFORMS:
        print("  %-12s %d 词" % (p, len(data[p])))
    if failed:
        print("[warn] %d 个来源下载失败: %s" % (len(failed), "; ".join(failed)))
    if not fetched and not local_only:
        print("[warn] 所有远程来源均失败，词库可能未更新")


if __name__ == "__main__":
    main()
