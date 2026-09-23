#!/usr/bin/env python3
"""
MinerU Multi-Format to Markdown Batch Converter
================================================

通用批量转换脚本：将指定目录下所有 MinerU 支持的文件（PDF / Word / PPT / Excel / 图片）
转换为同名 Markdown 文件，存放在原文件同目录下。

已内置的最佳实践（来自实操沉淀）：
- 速率限制处理（BATCH_SIZE=40, BATCH_DELAY=70s 避开 50/分钟限速）
- CDN 下载 SSL 修复（PowerShell Invoke-WebRequest 兜底）
- HTTP 429 重试 + 字符串类型检查
- 断点续传：跳过已有同名 .md
- 大小写扩展名规范化
- 通过 data_id 匹配本地文件
- 单文件失败不影响整批

依赖安装：pip install requests PyPDF2

使用：
1. 在脚本顶部配置 TOKEN 和 ROOT_DIR
2. python mineru_convert.py

作者：李轶凡 (liyifan2004)
日期：2026-07
许可：MIT
"""

import os
import sys
import time
import json
import zipfile
import subprocess
import tempfile
import requests

# ===== Configuration =====
# 从 https://mineru.net/apiManage/apiManage 获取你的 Token
TOKEN = "YOUR_TOKEN_HERE"
BASE_URL = "https://mineru.net"

# 要扫描的根目录（脚本会递归扫描所有子目录）
ROOT_DIR = r"YOUR_ROOT_DIR"

# 模型版本：vlm（推荐，精度高）/ pipeline（默认，常规）/ MinerU-HTML（仅 HTML）
MODEL_VERSION = "vlm"

# 语言：ch（中英文混排）/ en / japan / korean / latin / ... 详见 docs/01-API文档理解.md
LANGUAGE = "ch"

# 公式识别和表格识别（vlm 模型下公式只影响行内公式）
ENABLE_FORMULA = True
ENABLE_TABLE = True

# 批次参数
BATCH_SIZE = 40          # 每批文件数（API 限速 50/分钟，留缓冲）
BATCH_DELAY = 70         # 批次间隔秒数（避开 429）
POLL_INTERVAL = 15       # 轮询间隔秒数
MAX_POLL_TIME = 7200     # 单批最大轮询时间（2 小时）
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB（API 限制）

# 支持的扩展名（小写比较，自动兼容大写）
SUPPORTED_EXTS = {
    ".pdf",
    ".png", ".jpg", ".jpeg", ".jp2", ".webp", ".gif", ".bmp",
    ".doc", ".docx",
    ".ppt", ".pptx",
    ".xls", ".xlsx",
    ".html", ".htm",
}
# =========================


def find_supported_files(root_dir):
    """Find all MinerU-supported files without a corresponding .md yet."""
    found_files = []
    skipped_md = 0
    skipped_size = 0

    for root, dirs, files in os.walk(root_dir):
        # Skip hidden/scratch dirs to avoid loops
        dirs[:] = [d for d in dirs if not d.startswith(".") or d == ".obsidian"]
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext not in SUPPORTED_EXTS:
                continue
            full_path = os.path.join(root, f)
            md_path = os.path.splitext(full_path)[0] + ".md"
            if os.path.exists(md_path) and os.path.getsize(md_path) > 0:
                skipped_md += 1
                continue
            file_size = os.path.getsize(full_path)
            if file_size > MAX_FILE_SIZE:
                print(f"  SKIP (too large {file_size / 1024 / 1024:.1f}MB): {full_path}")
                skipped_size += 1
                continue
            found_files.append(full_path)

    return found_files, skipped_md, skipped_size


def submit_batch(files, token, max_retries=3):
    """Submit a batch of files for processing. Returns (batch_id, file_urls, result_dict)."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    files_data = []
    for i, file_path in enumerate(files):
        file_name = os.path.basename(file_path)
        files_data.append({"name": file_name, "data_id": str(i)})

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
                headers=headers,
                json=payload,
                timeout=60,
            )
        except Exception as e:
            print(f"    Request error (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(10)
            continue

        # ⭐ Rate limit handling
        if response.status_code == 429:
            print(f"    Rate limited (429). Waiting 65s before retry...")
            time.sleep(65)
            continue

        try:
            result = response.json()
        except Exception as e:
            print(f"    JSON parse error: {e}")
            if attempt < max_retries - 1:
                time.sleep(10)
            continue

        # ⭐ 429 returns string not dict; handle that
        if not isinstance(result, dict):
            print(f"    Unexpected response type: {type(result).__name__}")
            print(f"    Response (first 200): {str(result)[:200]}")
            if attempt < max_retries - 1:
                time.sleep(10)
            continue

        if result.get("code") != 0:
            print(f"    API error: {result}")
            return None, None, result

        batch_id = result["data"]["batch_id"]
        file_urls = result["data"]["file_urls"]
        return batch_id, file_urls, result

    return None, None, {"code": -1, "msg": "Max retries exceeded"}


def upload_file(url, file_path, max_retries=3):
    """Upload a single file to the given pre-signed URL."""
    for attempt in range(max_retries):
        try:
            with open(file_path, "rb") as f:
                response = requests.put(url, data=f, timeout=300)
            if response.status_code == 200:
                return True
            print(f"    Upload attempt {attempt + 1} failed: HTTP {response.status_code}")
        except Exception as e:
            print(f"    Upload attempt {attempt + 1} error: {e}")
        if attempt < max_retries - 1:
            time.sleep(5)
    return False


def poll_batch_results(batch_id, token, num_files):
    """Poll the batch results endpoint. Yields (data_id, extract_result, status)."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    processed = set()
    start_time = time.time()

    while len(processed) < num_files:
        elapsed = int(time.time() - start_time)
        if elapsed > MAX_POLL_TIME:
            print(f"\n  TIMEOUT after {elapsed}s: {num_files - len(processed)} files not completed")
            break

        time.sleep(POLL_INTERVAL)

        try:
            response = requests.get(
                f"{BASE_URL}/api/v4/extract-results/batch/{batch_id}",
                headers=headers,
                timeout=30,
            )
            result = response.json()
        except Exception as e:
            print(f"  Poll error: {e}")
            continue

        if not isinstance(result, dict) or result.get("code") != 0:
            print(f"  Poll API error: {result}")
            continue

        extract_results = result.get("data", {}).get("extract_result", [])
        pending_count = 0

        for er in extract_results:
            data_id = er.get("data_id", "")
            if data_id in processed:
                continue

            state = er.get("state", "")
            file_name = er.get("file_name", "unknown")

            if state == "done":
                processed.add(data_id)
                yield data_id, er, "done"
            elif state == "failed":
                processed.add(data_id)
                err_msg = er.get("err_msg", "unknown error")
                print(f"  FAILED: {file_name} - {err_msg}")
                yield data_id, er, "failed"
            else:
                pending_count += 1

        if pending_count > 0:
            print(f"  [{elapsed}s] {len(processed)}/{num_files} done, {pending_count} pending...")


def download_and_save_md(zip_url, file_path, max_retries=3):
    """Download result ZIP via PowerShell (Python SSL workaround), extract full.md, save to disk."""
    for attempt in range(max_retries):
        tmp_zip = os.path.join(tempfile.gettempdir(), f"mineru_{int(time.time() * 1000)}.zip")
        try:
            # ⭐ PowerShell works around Python SSL issues with MinerU CDN
            ps_cmd = (
                f"try {{ "
                f"Invoke-WebRequest -Uri '{zip_url}' -UseBasicParsing -TimeoutSec 60 "
                f"-OutFile '{tmp_zip}'; "
                f"$size = (Get-Item '{tmp_zip}').Length; "
                f"Write-Output \"OK:$size\" "
                f"}} catch {{ Write-Output \"ERR:$($_.Exception.Message)\" }}"
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=90
            )
            output = result.stdout.strip()
            if not output.startswith("OK:"):
                print(f"    Download attempt {attempt + 1} (PS) failed: {output[:200]}")
                if os.path.exists(tmp_zip):
                    try:
                        os.remove(tmp_zip)
                    except OSError:
                        pass
                if attempt < max_retries - 1:
                    time.sleep(5)
                continue

            # Extract full.md from ZIP
            zip_file = zipfile.ZipFile(tmp_zip)
            md_names = [n for n in zip_file.namelist() if n.endswith("full.md")]

            if md_names:
                md_content = zip_file.read(md_names[0]).decode("utf-8")
                md_path = os.path.splitext(file_path)[0] + ".md"
                with open(md_path, "w", encoding="utf-8") as f:
                    f.write(md_content)
                zip_file.close()
                try:
                    os.remove(tmp_zip)
                except OSError:
                    pass
                return True
            else:
                print(f"    No full.md found in ZIP (attempt {attempt + 1})")
                zip_file.close()
                try:
                    os.remove(tmp_zip)
                except OSError:
                    pass
                return False

        except Exception as e:
            print(f"    Download attempt {attempt + 1} error: {e}")
            if os.path.exists(tmp_zip):
                try:
                    os.remove(tmp_zip)
                except OSError:
                    pass

        if attempt < max_retries - 1:
            time.sleep(5)

    return False


def main():
    print("=" * 60)
    print("MinerU Multi-Format to Markdown Converter")
    print("=" * 60)
    print(f"Root: {ROOT_DIR}")
    print(f"Model: {MODEL_VERSION}, Language: {LANGUAGE}")
    print(f"Batch size: {BATCH_SIZE}, Delay between batches: {BATCH_DELAY}s")
    print()

    # Validate config
    if TOKEN == "YOUR_TOKEN_HERE":
        print("ERROR: Please set your TOKEN in the script first.")
        print("Get one at: https://mineru.net/apiManage/apiManage")
        return
    if not os.path.isdir(ROOT_DIR):
        print(f"ERROR: ROOT_DIR does not exist: {ROOT_DIR}")
        return

    # Find files
    all_files, skipped_md, skipped_size = find_supported_files(ROOT_DIR)
    print(f"Found {len(all_files)} files to process")
    print(f"  ({skipped_md} already have .md, {skipped_size} too large)")
    print()

    if not all_files:
        print("No files to process. Done!")
        return

    # Print file list
    total_size = 0
    for i, f in enumerate(all_files):
        size = os.path.getsize(f)
        total_size += size
        rel_path = os.path.relpath(f, ROOT_DIR)
        ext = os.path.splitext(f)[1].lower()
        print(f"  [{i + 1:3d}] ({ext}) {rel_path} ({size / 1024:.0f}KB)")

    print(f"\nTotal size: {total_size / 1024 / 1024:.1f}MB")

    total_batches = (len(all_files) + BATCH_SIZE - 1) // BATCH_SIZE
    total_success = 0
    total_failed = 0
    failed_files = []

    for batch_start in range(0, len(all_files), BATCH_SIZE):
        batch = all_files[batch_start: batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1

        # Wait between batches (except first)
        if batch_start > 0:
            print(f"\nWaiting {BATCH_DELAY}s to respect rate limit...")
            time.sleep(BATCH_DELAY)

        print(f"\n{'=' * 60}")
        print(f"Batch {batch_num}/{total_batches} ({len(batch)} files)")
        print(f"{'=' * 60}")

        # Submit
        print("Submitting batch...")
        batch_id, file_urls, result = submit_batch(batch, TOKEN)
        if batch_id is None:
            print(f"ERROR: Batch submit failed: {result}")
            for fp in batch:
                failed_files.append(fp)
            total_failed += len(batch)
            continue

        print(f"Batch ID: {batch_id}")

        # Upload
        print("\nUploading files...")
        upload_success = 0
        for i, file_path in enumerate(batch):
            file_name = os.path.basename(file_path)
            print(f"  [{batch_start + i + 1}/{len(all_files)}] {file_name}")
            if upload_file(file_urls[i], file_path):
                upload_success += 1
            else:
                print(f"    WARNING: Upload failed for {file_name}")

        print(f"\nUploaded {upload_success}/{len(batch)} files")
        print("Waiting for processing...\n")

        # Map data_id -> file_path
        file_map = {str(i): batch[i] for i in range(len(batch))}

        # Poll and process
        for data_id, er, status in poll_batch_results(batch_id, TOKEN, len(batch)):
            file_path = file_map.get(data_id)
            if not file_path:
                continue

            if status == "done":
                if er.get("full_zip_url"):
                    if download_and_save_md(er["full_zip_url"], file_path):
                        print(f"  OK: {os.path.basename(file_path)} -> .md")
                        total_success += 1
                    else:
                        print(f"  FAIL: {os.path.basename(file_path)} (download failed)")
                        failed_files.append(file_path)
                        total_failed += 1
                else:
                    print(f"  FAIL: {os.path.basename(file_path)} (no zip URL)")
                    failed_files.append(file_path)
                    total_failed += 1
            else:
                failed_files.append(file_path)
                total_failed += 1

    # Summary
    print(f"\n{'=' * 60}")
    print("CONVERSION COMPLETE")
    print(f"  Success: {total_success}")
    print(f"  Failed:  {total_failed}")
    print(f"  Total:   {total_success + total_failed}")
    print(f"{'=' * 60}")

    if failed_files:
        print("\nFailed files:")
        for fp in failed_files:
            print(f"  - {os.path.relpath(fp, ROOT_DIR)}")


if __name__ == "__main__":
    main()