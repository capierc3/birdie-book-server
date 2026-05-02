"""One-off prod schema alignment.

Idempotently brings the prod DB up to the current model + alembic head:
  1. Adds `players.updated_at` if missing.
  2. Runs the player-merge data step from migration f6a7b8c9d0e1
     (set is_app_user=1 on the canonical row, fold duplicate
     Trackman-handle rows, populate trackman_user_id).
  3. Stamps alembic_version to current head so future migrations run.

Safe to re-run — every step checks state first and skips if already done.

Run:
    docker compose exec -T app python - < scripts/align_prod_schema.py
"""
import sqlite3
import sys
from pathlib import Path

DB_PATH = "/app/data/birdie_book.db"
ALEMBIC_HEAD = "f6a7b8c9d0e1"


def step1_add_updated_at(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)").fetchall()}
    if "updated_at" in cols:
        print("  [skip] players.updated_at already exists")
        return
    # SQLite forbids CURRENT_TIMESTAMP as a default in ADD COLUMN, so add the
    # column with no default, then backfill from created_at where possible.
    conn.execute("ALTER TABLE players ADD COLUMN updated_at DATETIME")
    n = conn.execute(
        "UPDATE players SET updated_at = created_at WHERE updated_at IS NULL"
    ).rowcount
    print(f"  [add] players.updated_at  (backfilled {n} row(s) from created_at)")


def step2_data_merge(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT id, name FROM players").fetchall()
    if not rows:
        print("  [skip] no players rows")
        return

    # Already done?
    has_app_user = conn.execute(
        "SELECT COUNT(*) FROM players WHERE is_app_user = 1"
    ).fetchone()[0]
    if has_app_user:
        print(f"  [skip] {has_app_user} player(s) already marked is_app_user=1")
        return

    # Score: prefer row with most rounds; tiebreak on lowest id.
    scored = []
    for row in rows:
        round_count = conn.execute(
            "SELECT COUNT(*) FROM rounds WHERE player_id = ?", (row[0],)
        ).fetchone()[0]
        scored.append((row[0], row[1], round_count))
    scored.sort(key=lambda r: (-r[2], r[0]))
    canonical_id, canonical_name, canonical_rounds = scored[0]
    losers = scored[1:]

    print(
        f"  canonical: id={canonical_id} name={canonical_name!r} "
        f"({canonical_rounds} rounds)"
    )
    if losers:
        print(f"  losers: {[(r[0], r[1]) for r in losers]}")

    merged_trackman_id = losers[0][1] if losers else None

    for loser_id, loser_name, _ in losers:
        for tbl in (
            "clubs",
            "range_sessions",
            "rounds",
            "play_sessions",
            "play_session_partners",
        ):
            # Some tables may not have player_id (older schemas) — guard.
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()}
            if "player_id" not in cols:
                continue
            n = conn.execute(
                f"UPDATE {tbl} SET player_id = ? WHERE player_id = ?",
                (canonical_id, loser_id),
            ).rowcount
            if n:
                print(f"  [reassign] {tbl}: {n} row(s) {loser_id} → {canonical_id}")
        conn.execute("DELETE FROM players WHERE id = ?", (loser_id,))
        print(f"  [delete] players.id={loser_id}")

    conn.execute(
        "UPDATE players SET is_app_user = 1, trackman_user_id = ? WHERE id = ?",
        (merged_trackman_id, canonical_id),
    )
    print(
        f"  [update] canonical id={canonical_id}: "
        f"is_app_user=1, trackman_user_id={merged_trackman_id!r}"
    )


def step3_stamp_alembic(conn: sqlite3.Connection) -> None:
    # Create alembic_version table (matches alembic's own DDL).
    conn.execute(
        "CREATE TABLE IF NOT EXISTS alembic_version ("
        "version_num VARCHAR(32) NOT NULL, "
        "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)"
        ")"
    )
    existing = [r[0] for r in conn.execute("SELECT version_num FROM alembic_version").fetchall()]
    if existing:
        print(f"  [skip] alembic_version already set: {existing}")
        return
    conn.execute(
        "INSERT INTO alembic_version (version_num) VALUES (?)", (ALEMBIC_HEAD,)
    )
    print(f"  [stamp] alembic_version = {ALEMBIC_HEAD}")


def main() -> int:
    if not Path(DB_PATH).exists():
        print(f"DB not found at {DB_PATH}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        print("Step 1: add players.updated_at")
        step1_add_updated_at(conn)
        print("\nStep 2: player data merge (migration f6a7b8c9d0e1)")
        step2_data_merge(conn)
        print("\nStep 3: stamp alembic_version")
        step3_stamp_alembic(conn)
        conn.commit()
        print("\nDone. Restart the app: docker compose restart app")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
