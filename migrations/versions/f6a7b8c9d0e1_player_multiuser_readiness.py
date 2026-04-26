"""player multi-user readiness: add auth/trackman columns, merge duplicate self-rows

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-26 18:30:00.000000

Schema additions to `players`:
  - email (nullable, unique) — for future login
  - password_hash (nullable) — for future login
  - trackman_user_id (nullable, unique) — Trackman portal handle (e.g. "Cpierce2113")
  - is_app_user (bool, NOT NULL, default false) — distinguishes registered users from buddies
  - updated_at

Data migration:
  - Heuristic merge: any pair of player rows where one represents the user's
    Trackman handle (recorded by the importer using the portal `Name`) gets
    folded into the canonical row. We pick the canonical row as the one with
    a `rounds` FK or, failing that, the lowest id. The other row's
    `clubs` / `range_sessions` are reassigned, the row deleted, and the
    canonical row gets `is_app_user=true` plus the merged `trackman_user_id`.

  - For the dev database with a single user this collapses
    {id=1 "Chase Pierce", id=2 "Cpierce2113"} into id=1 with
    trackman_user_id="Cpierce2113".

  - For a fresh install with one row, that row simply gets `is_app_user=true`.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("players") as batch:
        batch.add_column(sa.Column("email", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("trackman_user_id", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column(
            "is_app_user", sa.Boolean(), nullable=False, server_default=sa.text("0"),
        ))
        batch.add_column(sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True,
        ))
        batch.create_unique_constraint("uq_players_email", ["email"])
        batch.create_unique_constraint("uq_players_trackman_user_id", ["trackman_user_id"])

    players = sa.table(
        "players",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("trackman_user_id", sa.String),
        sa.column("is_app_user", sa.Boolean),
    )

    rows = list(bind.execute(sa.select(players.c.id, players.c.name)).fetchall())

    if not rows:
        return

    # Score each row: prefer the one with `rounds` references (the manually
    # named "real" account) as canonical; fall back to lowest id.
    scored = []
    for row in rows:
        round_count = bind.execute(
            sa.text("SELECT COUNT(*) FROM rounds WHERE player_id = :pid"),
            {"pid": row.id},
        ).scalar() or 0
        scored.append((row.id, row.name, round_count))

    scored.sort(key=lambda r: (-r[2], r[0]))
    canonical_id, canonical_name, _ = scored[0]
    losers = scored[1:]

    # Pick a trackman_user_id: prefer a loser's name (the importer-created
    # row), since that *is* the Trackman handle. Fall back to None if no
    # loser exists.
    merged_trackman_id: str | None = None
    if losers:
        merged_trackman_id = losers[0][1]

    for loser_id, _loser_name, _ in losers:
        op.execute(sa.text(
            "UPDATE clubs SET player_id = :keep WHERE player_id = :drop"
        ).bindparams(keep=canonical_id, drop=loser_id))
        op.execute(sa.text(
            "UPDATE range_sessions SET player_id = :keep WHERE player_id = :drop"
        ).bindparams(keep=canonical_id, drop=loser_id))
        op.execute(sa.text(
            "UPDATE rounds SET player_id = :keep WHERE player_id = :drop"
        ).bindparams(keep=canonical_id, drop=loser_id))
        op.execute(sa.text(
            "UPDATE play_sessions SET player_id = :keep WHERE player_id = :drop"
        ).bindparams(keep=canonical_id, drop=loser_id))
        op.execute(sa.text(
            "UPDATE play_session_partners SET player_id = :keep WHERE player_id = :drop"
        ).bindparams(keep=canonical_id, drop=loser_id))
        op.execute(sa.text("DELETE FROM players WHERE id = :drop").bindparams(drop=loser_id))

    op.execute(sa.text(
        "UPDATE players SET is_app_user = 1, trackman_user_id = :tm WHERE id = :pid"
    ).bindparams(tm=merged_trackman_id, pid=canonical_id))


def downgrade() -> None:
    with op.batch_alter_table("players") as batch:
        batch.drop_constraint("uq_players_trackman_user_id", type_="unique")
        batch.drop_constraint("uq_players_email", type_="unique")
        batch.drop_column("updated_at")
        batch.drop_column("is_app_user")
        batch.drop_column("trackman_user_id")
        batch.drop_column("password_hash")
        batch.drop_column("email")
    # Note: data merge is not reversed — the deleted Trackman-handle player
    # rows are not recreated. Alembic downgrade restores schema only.
