#!/usr/bin/env python3
"""
Batch Add Obsidian Audio Embed Links to Markdown Files
======================================================

为指定目录树下每个 .md 文件的开头，添加 Obsidian 格式的音频嵌入链接：
    ![[音频文件名.m4a]]

匹配规则：在 .md 文件的同目录查找任意支持的音频文件，取第一个。

使用：
1. 配置 ROOT 目录
2. python add_obsidian_audio_embed.py

依赖：无（纯标准库）
"""

import os

# ===== Configuration =====
# 要处理的根目录（会递归所有子目录）
ROOT = r"E:\path\to\your\shadow-reading-materials"

# 支持的音频扩展名（小写比较）
AUDIO_EXTS = {".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg"}
# =========================


def find_audio_in_dir(dir_path):
    """查找目录中第一个音频文件。"""
    for f in os.listdir(dir_path):
        ext = os.path.splitext(f)[1].lower()
        if ext in AUDIO_EXTS:
            return f
    return None


def main():
    processed = 0
    skipped_done = 0
    skipped_no_audio = 0
    errors = 0

    for root, dirs, files in os.walk(ROOT):
        md_files = [f for f in files if f.lower().endswith(".md")]
        if not md_files:
            continue

        audio_file = find_audio_in_dir(root)
        if not audio_file:
            for md in md_files:
                skipped_no_audio += 1
                print(f"  SKIP (no audio): {os.path.relpath(os.path.join(root, md), ROOT)}")
            continue

        for md_file in md_files:
            md_path = os.path.join(root, md_file)
            rel_path = os.path.relpath(md_path, ROOT)

            try:
                with open(md_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                print(f"  ERROR reading: {rel_path} - {e}")
                errors += 1
                continue

            # Already has the embed link? Skip.
            if content.startswith("![["):
                skipped_done += 1
                print(f"  SKIP (already done): {rel_path}")
                continue

            # Prepend the embed link
            embed = f"![[{audio_file}]]\n\n"
            new_content = embed + content

            with open(md_path, "w", encoding="utf-8") as f:
                f.write(new_content)

            processed += 1
            print(f"  OK: {rel_path} -> ![[{audio_file}]]")

    print(f"\n{'=' * 60}")
    print(f"  Processed: {processed}")
    print(f"  Skipped (already done): {skipped_done}")
    print(f"  Skipped (no audio): {skipped_no_audio}")
    print(f"  Errors: {errors}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()