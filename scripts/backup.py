#!/usr/bin/env python3
"""
SPAA Backup Utility (§67)
Creates atomic timestamped backups of the master SQLite database and enforces retention:
- 7 daily backups
- 4 weekly backups
Audio files (MP3/WAV) are not included as they can be deterministically regenerated.
"""

import argparse
import datetime
import os
import shutil
import sqlite3
import sys
from pathlib import Path


def create_backup(db_path: Path, backups_dir: Path) -> Path:
    if not db_path.exists():
        print(f"[ERROR] Database file not found at: {db_path}", file=sys.stderr)
        sys.exit(1)

    backups_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Generate Daily Backup filename
    daily_filename = f"spaa_backup_daily_{now.strftime('%Y%m%d_%H%M%S')}.sqlite"
    daily_path = backups_dir / daily_filename

    print(f"[*] Creating atomic SQLite backup: {daily_path.name}...")

    # Use SQLite online backup API to ensure 0-corruption atomic copy even with concurrent reads
    src_conn = sqlite3.connect(str(db_path))
    dst_conn = sqlite3.connect(str(daily_path))
    with dst_conn:
        src_conn.backup(dst_conn, pages=100)
    dst_conn.close()
    src_conn.close()

    size_kb = round(daily_path.stat().st_size / 1024, 2)
    print(f"[+] Daily backup created ({size_kb} KB)")

    # 2. Check/create weekly backup (e.g. on ISO week boundary)
    iso_year, iso_week, _ = now.isocalendar()
    weekly_filename = f"spaa_backup_weekly_{iso_year}_w{iso_week:02d}.sqlite"
    weekly_path = backups_dir / weekly_filename

    if not weekly_path.exists():
        print(f"[*] Creating weekly backup snapshot: {weekly_path.name}...")
        shutil.copy2(daily_path, weekly_path)
        print(f"[+] Weekly backup created: {weekly_path.name}")

    # 3. Enforce Retention Policy
    enforce_retention(backups_dir, max_daily=7, max_weekly=4)

    return daily_path


def enforce_retention(backups_dir: Path, max_daily: int = 7, max_weekly: int = 4) -> None:
    # Daily backups
    daily_backups = sorted(
        backups_dir.glob("spaa_backup_daily_*.sqlite"),
        key=os.path.getmtime,
        reverse=True,
    )
    if len(daily_backups) > max_daily:
        to_delete = daily_backups[max_daily:]
        for old_file in to_delete:
            print(f"[-] Pruning old daily backup: {old_file.name}")
            old_file.unlink()

    # Weekly backups
    weekly_backups = sorted(
        backups_dir.glob("spaa_backup_weekly_*.sqlite"),
        key=os.path.getmtime,
        reverse=True,
    )
    if len(weekly_backups) > max_weekly:
        to_delete = weekly_backups[max_weekly:]
        for old_file in to_delete:
            print(f"[-] Pruning old weekly backup: {old_file.name}")
            old_file.unlink()


def main():
    parser = argparse.ArgumentParser(description="SPAA Automated SQLite Backup & Retention")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "spaa_master.sqlite",
        help="Path to spaa_master.sqlite",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "backups",
        help="Directory to store backups",
    )
    args = parser.parse_args()

    create_backup(args.db, args.out)


if __name__ == "__main__":
    main()
