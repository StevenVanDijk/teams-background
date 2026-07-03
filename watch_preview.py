#!/usr/bin/env python3
"""
Watch hexagons_video.py and regenerate teams_background_preview.png whenever it changes.

Usage:
  python watch_preview.py
  python watch_preview.py --once
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_FILE = ROOT / "hexagons_video.py"
PREVIEW_FILE = ROOT / "teams_background_preview.png"


def run_command(cmd: list[str], label: str) -> None:
    print(f"[{label}] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed with exit code {result.returncode}")


def build_preview() -> None:
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Source file not found: {SOURCE_FILE}")

    run_command(
        [
            sys.executable,
            str(SOURCE_FILE),
            "--preview-only",
            "--preview-output",
            str(PREVIEW_FILE),
        ],
        "preview",
    )

    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] Updated {PREVIEW_FILE.name}")


def watch() -> None:
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Source file not found: {SOURCE_FILE}")

    print(f"Watching {SOURCE_FILE.name} via Windows file notifications (Ctrl+C to stop)")

    # Initial generation on startup.
    build_preview()

    # Windows API constants.
    FILE_LIST_DIRECTORY = 0x0001
    FILE_SHARE_READ = 0x00000001
    FILE_SHARE_WRITE = 0x00000002
    FILE_SHARE_DELETE = 0x00000004
    OPEN_EXISTING = 3
    FILE_FLAG_BACKUP_SEMANTICS = 0x02000000

    FILE_NOTIFY_CHANGE_FILE_NAME = 0x00000001
    FILE_NOTIFY_CHANGE_LAST_WRITE = 0x00000010
    FILE_NOTIFY_CHANGE_SIZE = 0x00000008

    INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    CreateFileW = kernel32.CreateFileW
    CreateFileW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    ]
    CreateFileW.restype = wintypes.HANDLE

    ReadDirectoryChangesW = kernel32.ReadDirectoryChangesW
    ReadDirectoryChangesW.argtypes = [
        wintypes.HANDLE,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.BOOL,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
        wintypes.LPVOID,
        wintypes.LPVOID,
    ]
    ReadDirectoryChangesW.restype = wintypes.BOOL

    CloseHandle = kernel32.CloseHandle
    CloseHandle.argtypes = [wintypes.HANDLE]
    CloseHandle.restype = wintypes.BOOL

    handle = CreateFileW(
        str(ROOT),
        FILE_LIST_DIRECTORY,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS,
        None,
    )
    if handle == INVALID_HANDLE_VALUE:
        raise OSError(ctypes.get_last_error(), "CreateFileW failed for watched directory")

    source_name = SOURCE_FILE.name.lower()
    buffer_size = 64 * 1024
    buffer = ctypes.create_string_buffer(buffer_size)

    try:
        while True:
            bytes_returned = wintypes.DWORD(0)
            ok = ReadDirectoryChangesW(
                handle,
                buffer,
                buffer_size,
                False,
                FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_SIZE,
                ctypes.byref(bytes_returned),
                None,
                None,
            )
            if not ok:
                raise OSError(ctypes.get_last_error(), "ReadDirectoryChangesW failed")

            data = memoryview(buffer)[: bytes_returned.value]
            offset = 0
            changed_target = False

            while offset < len(data):
                next_offset = int.from_bytes(data[offset:offset + 4], "little")
                # action = int.from_bytes(data[offset + 4:offset + 8], "little")  # unused
                name_len = int.from_bytes(data[offset + 8:offset + 12], "little")
                name_start = offset + 12
                name_end = name_start + name_len
                name = data[name_start:name_end].tobytes().decode("utf-16-le", errors="ignore")

                if name.lower() == source_name:
                    changed_target = True

                if next_offset == 0:
                    break
                offset += next_offset

            if changed_target:
                print(f"[{time.strftime('%H:%M:%S')}] Detected change in {SOURCE_FILE.name}")
                time.sleep(0.12)
                try:
                    build_preview()
                except Exception as exc:
                    print(f"Error while updating preview: {exc}")
    finally:
        CloseHandle(handle)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Watch hexagons_video.py and regenerate preview image on save.")
    parser.add_argument("--once", action="store_true", help="Generate preview once, then exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        if args.once:
            build_preview()
            return 0

        watch()
        return 0
    except KeyboardInterrupt:
        print("\nStopped watcher")
        return 0
    except Exception as exc:
        print(f"Fatal error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
