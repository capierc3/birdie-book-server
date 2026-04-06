"""Automatic SQLite database backup service.

Runs silently — users never need to think about backups.

Backup types:
  - daily: checked once per day at midnight, keeps 7
  - weekly: checked once per week, keeps 4
  - pre_import: triggered before any data import, keeps 5
"""

import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from app.config import settings

BACKUP_DIR = Path("backups")
MAX_DAILY_BACKUPS = 7
MAX_WEEKLY_BACKUPS = 4
MAX_IMPORT_BACKUPS = 5


def _get_db_path() -> str | None:
    """Extract the file path from the SQLite DATABASE_URL."""
    url = settings.database_url
    if not url.startswith("sqlite"):
        return None
    path = url.replace("sqlite:///", "")
    return path


def _backup_filename(backup_type: str = "daily") -> str:
    """Generate a timestamped backup filename."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"birdie_book_{backup_type}_{ts}.db"


def create_backup(backup_type: str = "daily") -> str | None:
    """Create a safe backup of the SQLite database.

    Uses SQLite's built-in backup API — safe even with active connections.
    Returns the backup file path or None if backup not applicable.
    Skips backup if DB is essentially empty (< 50KB — just schema + seed data).
    """
    db_path = _get_db_path()
    if not db_path or not os.path.exists(db_path):
        return None

    # Don't backup a near-empty DB (first run, no user data yet)
    if os.path.getsize(db_path) < 50_000:
        return None

    BACKUP_DIR.mkdir(exist_ok=True)
    backup_name = _backup_filename(backup_type)
    backup_path = BACKUP_DIR / backup_name

    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(str(backup_path))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    prune_old_backups()
    return str(backup_path)


def create_pre_import_backup() -> str | None:
    """Create a backup before any data import.

    Call this before FIT imports, Garmin JSON imports, Rapsodo CSV, Trackman uploads.
    Lets the user roll back if an import corrupts or breaks something.
    """
    return create_backup("pre_import")


def prune_old_backups():
    """Remove old backups beyond retention limits."""
    if not BACKUP_DIR.exists():
        return

    daily = sorted(BACKUP_DIR.glob("birdie_book_daily_*.db"), reverse=True)
    weekly = sorted(BACKUP_DIR.glob("birdie_book_weekly_*.db"), reverse=True)
    imports = sorted(BACKUP_DIR.glob("birdie_book_pre_import_*.db"), reverse=True)

    for old in daily[MAX_DAILY_BACKUPS:]:
        old.unlink(missing_ok=True)
    for old in weekly[MAX_WEEKLY_BACKUPS:]:
        old.unlink(missing_ok=True)
    for old in imports[MAX_IMPORT_BACKUPS:]:
        old.unlink(missing_ok=True)


def _newest_backup_age(pattern: str) -> timedelta | None:
    """Get the age of the most recent backup matching a glob pattern."""
    if not BACKUP_DIR.exists():
        return None
    backups = sorted(BACKUP_DIR.glob(pattern), reverse=True)
    if not backups:
        return None
    return datetime.now() - datetime.fromtimestamp(backups[0].stat().st_mtime)


def run_backup_if_needed():
    """Run backup on startup if needed. Called once at app start."""
    if _get_db_path() is None:
        return

    # Daily: if no backup in last 24h
    age = _newest_backup_age("birdie_book_daily_*.db")
    if age is None or age > timedelta(hours=24):
        create_backup("daily")

    # Weekly: if no weekly in last 7 days
    age = _newest_backup_age("birdie_book_weekly_*.db")
    if age is None or age > timedelta(days=7):
        create_backup("weekly")


def start_backup_scheduler():
    """Start a background thread that checks for backups once per day around midnight."""
    if _get_db_path() is None:
        return

    def _backup_loop():
        while True:
            # Sleep until next midnight check
            now = datetime.now()
            tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0)
            sleep_seconds = (tomorrow - now).total_seconds()
            time.sleep(sleep_seconds)

            try:
                create_backup("daily")
                # Weekly check
                age = _newest_backup_age("birdie_book_weekly_*.db")
                if age is None or age > timedelta(days=7):
                    create_backup("weekly")
            except Exception:
                pass  # Never crash the backup thread

    t = threading.Thread(target=_backup_loop, daemon=True)
    t.start()


def list_backups() -> list[dict]:
    """List all existing backups with metadata."""
    if not BACKUP_DIR.exists():
        return []

    result = []
    for f in sorted(BACKUP_DIR.glob("birdie_book_*.db"), reverse=True):
        stat = f.stat()
        btype = "weekly" if "weekly" in f.name else "pre_import" if "pre_import" in f.name else "daily"
        result.append({
            "filename": f.name,
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "created": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "type": btype,
        })
    return result
