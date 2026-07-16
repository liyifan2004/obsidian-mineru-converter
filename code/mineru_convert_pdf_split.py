#!/usr/bin/env python3
"""
MinerU PDF Converter with Auto-Splitting for >200 Page PDFs
============================================================

完整流程：检测页数 → >200页自动拆分 → 分别提交 → 下载 → 合并 Markdown。

适用于含大 PDF 的场景，比如雅思王听力剑20版（322页）、雅思口语真经总纲（211页）。

使用：
1. 在脚本顶部配置 TOKEN 和 TARGET_FILES / TARGET_DIR
2. python mineru_convert_pdf_split.py

依赖：pip install requests PyPDF2
"""

import os
import time
import json
import zipfile
import subprocess
import tempfile
import requests
from PyPDF2 import PdfReader, PdfWriter

# ===== Configuration =====
TOKEN = "YOUR_TOKEN_HERE"
BASE_URL = "https://mineru.net"

# 多个 PDF 文件
TARGET_FILES = [
    r"D:\path\to\your\file1.pdf",
    r"D:\path\to\your\file2.pdf",
    # ...
]

# 输出目录（生成的 .md 文件会保存在这里，文件名与原 PDF 同名）
OUTPUT_DIR = r"D:\path\to\output"

# 模型与语言
MODEL_VERSION = "vlm"
LANGUAGE = "ch"
ENABLE_FORMULA = True
ENABLE_TABLE = True

# 轮询参数
POLL_INTERVAL = 15
MAX_POLL_TIME = 7200

# API 限制：每个文件不超过 200 页
MAX_PAGES = 200
# =========================


def split_pdf_if_needed(file_path):
    """如果 PDF 页数超过 MAX_PAGES，自动拆分为多个 part。返回 [(part_path, part_info), ...]"""
    reader = PdfReader(file_path)
    total_pages = len(reader.pages)
    base_name = os.path.splitext(os.path.basename(file_path))[0]

    if total_pages <= MAX_PAGES:
        return [(file_path, {"original": file_path, "part": None, "total_parts": 1, "part_idx": 0})]

    num_parts = (total_pages + MAX_PAGES - 1) // MAX_PAGES
    print(f"  Splitting '{base_name}' ({total_pages} pages) into {num_parts} parts...")

    parts = []
    tmp_dir = os.path.join(tempfile.gettempdir(), "mineru_split")
    os.makedirs(tmp_dir, exist_ok=True)

    for part_idx in range(num_parts):
        start_page = part_idx * MAX_PAGES
        end_page = min(start_page + MAX_PAGES, total_pages)

        writer = PdfWriter()
        for page_num in range(start_page, end_page):
            writer.add_page(reader.pages[page_num])

        part_name = f"{base_name}_part{part_idx + 1}of{num_parts}.pdf"
        part_path = os.path.join(tmp_dir, part_name)
        with open(part_path, "wb") as f:
            writer.write(f)

        part_size = os.path.getsize(part_path)
        print(f"    Part {part_idx + 1}/{num_parts}: pages {start_page + 1}-{end_page} ({part_size / 1024 / 1024:.1f}MB)")
        parts.append((part_path, {
            "original": file_path,
            "part": part_path,
            "total_parts": num_parts,
            "part_idx": part_idx,
        }))

    return parts


def submit_batch(file_paths, token, max_retries=3):
    """提交文件批量，返回 (batch_id, file_urls, result)。"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    files_data = [
        {"name": os.path.basename(fp), "data_id": str(i)}
        for i, fp in enumerate(file_paths)
    ]
    payload = {
        "files": files_data,
        "model_version": MODEL_VERSION,
        "enable_formula": ENABLE_FORMULA,
        "enable_table": ENABLE_TABLE,
        "language": LANGUAGE,
    }
    for attempt in range(max_retries):
        try:
            response = requests.post(
                f"{BASE_URL}/api/v4/file-urls/batch",
                headers=headers, json=payload, timeout=60,
            )
        except Exception as e:
            print(f"    Request error (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(10)
            continue
        if response.status_code == 429:
            print(f"    Rate limited (429). Waiting 65s...")
            time.sleep(65)
            continue
        try:
            result = response.json()
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(10)
            continue
        if not isinstance(result, dict):
            if attempt < max_retries - 1:
                time.sleep(10)
            continue
        if result.get("code") != 0:
            return None, None, result
        return result["data"]["batch_id"], result["data"]["file_urls"], result
    return None, None, {"code": -1, "msg": "Max retries exceeded"}


def upload_file(url, file_path, max_retries=3):
    for attempt in range(max_retries):
        try:
            with open(file_path, "rb") as f:
                response = requests.put(url, data=f, timeout=300)
            if response.status_code == 200:
                return True
        except Exception as e:
            print(f"    Upload attempt {attempt + 1} error: {e}")
        if attempt < max_retries - 1:
            time.sleep(5)
    return False


def poll_batch_results(batch_id, token, num_files):
    """轮询直到所有文件完成。yield (data_id, extract_result, status)。"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    processed = set()
    start_time = time.time()
    while len(processed) < num_files:
        elapsed = int(time.time() - start_time)
        if elapsed > MAX_POLL_TIME:
            print(f"\n  TIMEOUT after {elapsed}s")
            break
        time.sleep(POLL_INTERVAL)
        try:
            response = requests.get(
                f"{BASE_URL}/api/v4/extract-results/batch/{batch_id}",
                headers=headers, timeout=30,
            )
            result = response.json()
        except Exception as e:
            print(f"  Poll error: {e}")
            continue
        if not isinstance(result, dict) or result.get("code") != 0:
            continue
        for er in result.get("data", {}).get("extract_result", []):
            data_id = er.get("data_id", "")
            if data_id in processed:
                continue
            state = er.get("state", "")
            if state == "done":
                processed.add(data_id)
                yield data_id, er, "done"
            elif state == "failed":
                processed.add(data_id)
                print(f"  FAILED: {er.get('file_name')} - {er.get('err_msg')}")
                yield data_id, er, "failed"
        pending = num_files - len(processed)
        if pending > 0:
            print(f"  [{elapsed}s] {len(processed)}/{num_files} done, {pending} pending...")


def download_zip_ps(zip_url, max_retries=5):
    """用 PowerShell 下载 ZIP（避开 Python SSL 问题）。"""
    tmp_zip = os.path.join(tempfile.gettempdir(), f"mineru_{int(time.time() * 1000)}.zip")
    for attempt in range(max_retries):
        try:
            ps_cmd = (
                f"try {{ "
                f"Invoke-WebRequest -Uri '{zip_url}' -UseBasicParsing -TimeoutSec 120 "
                f"-OutFile '{tmp_zip}'; "
                f"$size = (Get-Item '{tmp_zip}').Length; "
                f"Write-Output \"OK:$size\" "
                f"}} catch {{ Write-Output \"ERR:$($_.Exception.Message)\" }}"
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=180,
            )
            output = result.stdout.strip()
            if output.startswith("OK:"):
                return tmp_zip
            else:
                print(f"    Download attempt {attempt + 1} (PS) failed: {output[:200]}")
                if os.path.exists(tmp_zip):
                    try: os.remove(tmp_zip)
                    except OSError: pass
                if attempt < max_retries - 1:
                    time.sleep(10 * (attempt + 1))
        except Exception as e:
            print(f"    Download attempt {attempt + 1} error: {e}")
            if os.path.exists(tmp_zip):
                try: os.remove(tmp_zip)
                except OSError: pass
    return None


def extract_md_from_zip(zip_path):
    """从 ZIP 中提取 full.md 内容。"""
    try:
        zf = zipfile.ZipFile(zip_path)
        md_names = [n for n in zf.namelist() if n.endswith("full.md")]
        if md_names:
            content = zf.read(md_names[0]).decode("utf-8")
            zf.close()
            return content
        zf.close()
    except Exception as e:
        print(f"    ZIP extract error: {e}")
    return None


def main():
    print("=" * 60)
    print("MinerU PDF Converter (with Auto-Split)")
    print("=" * 60)

    if TOKEN == "YOUR_TOKEN_HERE":
        print("ERROR: Please set TOKEN first.")
        return

    # Step 1: Split PDFs if needed
    print("\n--- Step 1: Checking/Splitting PDFs ---")
    all_parts = []
    for fp in TARGET_FILES:
        if not os.path.exists(fp):
            print(f"  NOT FOUND: {fp}")
            continue
        parts = split_pdf_if_needed(fp)
        all_parts.extend(parts)

    if not all_parts:
        print("No files to process.")
        return

    # Filter: skip files that already have .md (only for non-split single files)
    parts_to_process = []
    for part_path, part_info in all_parts:
        if part_info["total_parts"] == 1:
            md_path = os.path.splitext(part_info["original"])[0] + ".md"
            if os.path.exists(md_path) and os.path.getsize(md_path) > 0:
                print(f"  SKIP (has .md): {os.path.basename(part_info['original'])}")
                continue
        parts_to_process.append((part_path, part_info))

    if not parts_to_process:
        print("All files already processed.")
        return

    # Step 2: Submit
    print(f"\n--- Step 2: Submitting {len(parts_to_process)} parts ---")
    file_paths = [pp for pp, _ in parts_to_process]
    batch_id, file_urls, result = submit_batch(file_paths, TOKEN)
    if batch_id is None:
        print(f"ERROR: {result}")
        return
    print(f"Batch ID: {batch_id}")

    # Step 3: Upload
    print("\n--- Step 3: Uploading ---")
    for i, fp in enumerate(file_paths):
        print(f"  [{i+1}/{len(file_paths)}] {os.path.basename(fp)}")
        upload_file(file_urls[i], fp)

    # Step 4: Poll and collect
    print("\n--- Step 4: Waiting for processing ---")
    file_map = {str(i): parts_to_process[i] for i in range(len(parts_to_process))}
    md_results = {}  # original_path -> {part_idx: md_content}

    for data_id, er, status in poll_batch_results(batch_id, TOKEN, len(parts_to_process)):
        part_path, part_info = file_map.get(data_id, (None, None))
        if not part_info:
            continue
        original_path = part_info["original"]
        part_idx = part_info["part_idx"]

        if status == "done":
            zip_url = er.get("full_zip_url")
            if not zip_url:
                continue
            zip_path = download_zip_ps(zip_url)
            if not zip_path:
                continue
            md_content = extract_md_from_zip(zip_path)
            try: os.remove(zip_path)
            except OSError: pass
            if md_content is None:
                continue
            md_results.setdefault(original_path, {})[part_idx] = md_content
            print(f"  OK: {os.path.basename(part_path)} ({len(md_content)} chars)")

    # Step 5: Merge and save
    print(f"\n--- Step 5: Merging and saving ---")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    saved = 0
    for original_path, parts_dict in md_results.items():
        base_name = os.path.splitext(os.path.basename(original_path))[0]
        md_path = os.path.join(OUTPUT_DIR, base_name + ".md")

        merged = []
        for idx in sorted(parts_dict.keys()):
            if idx > 0:
                merged.append(f"\n\n<!-- Part {idx + 1} -->\n\n")
            merged.append(parts_dict[idx])
        final_md = "".join(merged)
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(final_md)
        print(f"  SAVED: {md_path} ({len(final_md)} chars)")
        saved += 1

    # Cleanup temp splits
    for _, part_info in parts_to_process:
        if part_info["part"] and os.path.exists(part_info["part"]):
            try: os.remove(part_info["part"])
            except OSError: pass

    print(f"\n{'=' * 60}")
    print(f"DONE: {saved} Markdown file(s) saved to {OUTPUT_DIR}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()