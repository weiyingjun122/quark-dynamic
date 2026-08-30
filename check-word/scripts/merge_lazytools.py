#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从懒人工具 JS 文件提取词库，与本地词库合并去重
用法: python scripts/merge_lazytools.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_DIR = os.path.join(ROOT, "word")

# 懒人工具 JS 文件 URL
LAZYTOOLS_JS = {
    "xiaohongshu": "https://lanren-tools.com/static/js/word-filter-redbook.min.js",
    "douyin": "https://lanren-tools.com/static/js/word-filter-tiktok.js",
    "xianyu": "https://lanren-tools.com/static/js/word-filter-idlefish.js",
    "pinduoduo": "https://lanren-tools.com/static/js/word-filter-pdd.min.js",
    "jd": "https://lanren-tools.com/static/js/word-filter-jd.min.js",
}

# 本地词库文件 -> 平台
LOCAL_FILES = {
    "xiaohongshu": "xiaohongshu.txt",
    "douyin": "douyin.txt",
    "xianyu": "xianyu.txt",
    "pinduoduo": "pinduoduo.txt",
    "jd": "jd.txt",
    "ai": "ai.txt",
    "bilibili": "bilibili.txt",
    "gongzhonghao": "gongzhonghao.txt",
    "kuaishou": "kuaishou.txt",
    "taobao": "taobao.txt",
}


def fetch(url, timeout=30):
    """下载文本内容"""
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    for enc in ("utf-8", "gbk", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def extract_words_from_js(code):
    """从 JS 代码中提取 builtInWords 数组和混淆的 z 数组中的词"""
    words = []

    # 方法1: 提取 builtInWords 数组（非混淆版）
    # 匹配 const builtInWords = ['...', '...', ...];
    m = re.search(r"builtInWords\s*=\s*\[(.*?)\]", code, re.S)
    if m:
        content = m.group(1)
        for w in re.findall(r"'([^']+)'", content):
            w = w.strip()
            if w and len(w) <= 50:
                words.append(w)

    # 方法2: 提取混淆版 z 数组中的词
    # 匹配 const z=['word1','word2',...];
    z_match = re.search(r"const\s+z\s*=\s*\[(.*?)\];", code, re.S)
    if z_match:
        content = z_match.group(1)
        for w in re.findall(r"'([^']+)'", content):
            w = w.strip()
            # 过滤掉非中文/非关键词的项
            if w and len(w) <= 50 and not w.startswith('-') and not w.startswith('<') and not w.startswith('&') and not w.startswith('\\') and not w.startswith('0x') and not w.isdigit():
                words.append(w)

    return list(set(words))


def read_local_words(filename):
    """读取本地词库文件"""
    path = os.path.join(WORD_DIR, filename)
    words = []
    if os.path.exists(path):
        with io.open(path, encoding="utf-8") as f:
            for line in f:
                w = line.strip().strip("，,、").strip()
                if w and not w.startswith("#") and not w.startswith("//"):
                    words.append(w)
    return words


def dedupe(words):
    """去重并排序"""
    seen = set()
    out = []
    for w in words:
        w = w.strip()
        if not w or w in seen:
            continue
        if len(w) > 50:
            continue
        seen.add(w)
        out.append(w)
    out.sort()
    return out


def main():
    merged_stats = {}

    for platform, js_url in LAZYTOOLS_JS.items():
        local_file = LOCAL_FILES.get(platform)
        if not local_file:
            continue

        print(f"\n=== {platform} ===")

        # 读取本地词库
        local_words = read_local_words(local_file)
        print(f"  本地词库: {len(local_words)} 词")

        # 下载并提取懒人工具词库
        try:
            code = fetch(js_url)
            lazy_words = extract_words_from_js(code)
            print(f"  懒人工具: {len(lazy_words)} 词")
        except Exception as e:
            print(f"  [FAIL] 下载失败: {e}")
            lazy_words = []

        # 合并去重
        merged = dedupe(local_words + lazy_words)
        print(f"  合并后: {len(merged)} 词 (新增 {len(merged) - len(local_words)} 词)")

        # 写回本地文件
        path = os.path.join(WORD_DIR, local_file)
        with io.open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(merged) + "\n")

        merged_stats[platform] = {
            "local": len(local_words),
            "lazy": len(lazy_words),
            "merged": len(merged),
            "new": len(merged) - len(local_words),
        }

    # 汇总
    print("\n=== 汇总 ===")
    for p, s in merged_stats.items():
        print(f"  {p:12s} 本地 {s['local']:4d} + 懒人 {s['lazy']:4d} = 合并 {s['merged']:4d} (新增 {s['new']:3d})")


if __name__ == "__main__":
    main()
