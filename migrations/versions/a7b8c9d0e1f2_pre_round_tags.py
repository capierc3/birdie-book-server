"""pre-round tag system + rating column renames

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-26 20:15:00.000000

Schema changes:
  - play_sessions: rename three rating columns
      energy_rating    -> body_rating
      focus_rating     -> mind_rating
      physical_rating  -> commitment_rating
  - play_sessions: rename `session_goals` -> `intention_notes`
      (becomes the freeform "anything else" overflow alongside the new
      tag-based intention picker)
  - play_sessions: drop `pre_session_notes`, drop `clubs_focused`
  - new `tags` table: structured library backing the pre-round tag pickers
      (categories: bring_in, pull_out, intention)
  - new `play_session_tags` join table
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("play_sessions") as batch:
        batch.alter_column("energy_rating", new_column_name="body_rating")
        batch.alter_column("focus_rating", new_column_name="mind_rating")
        batch.alter_column("physical_rating", new_column_name="commitment_rating")
        batch.alter_column("session_goals", new_column_name="intention_notes")
        batch.drop_column("pre_session_notes")
        batch.drop_column("clubs_focused")

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("sub_category", sa.String(length=50), nullable=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.UniqueConstraint("category", "name", name="uq_tags_category_name"),
    )
    op.create_index("ix_tags_category", "tags", ["category"])

    op.create_table(
        "play_session_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("play_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            sa.Integer(),
            sa.ForeignKey("tags.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("session_id", "tag_id", name="uq_play_session_tags_session_tag"),
    )
    op.create_index("ix_play_session_tags_session", "play_session_tags", ["session_id"])
    op.create_index("ix_play_session_tags_tag", "play_session_tags", ["tag_id"])


def downgrade() -> None:
    op.drop_index("ix_play_session_tags_tag", table_name="play_session_tags")
    op.drop_index("ix_play_session_tags_session", table_name="play_session_tags")
    op.drop_table("play_session_tags")

    op.drop_index("ix_tags_category", table_name="tags")
    op.drop_table("tags")

    with op.batch_alter_table("play_sessions") as batch:
        batch.add_column(sa.Column("clubs_focused", sa.String(length=200), nullable=True))
        batch.add_column(sa.Column("pre_session_notes", sa.Text(), nullable=True))
        batch.alter_column("intention_notes", new_column_name="session_goals")
        batch.alter_column("commitment_rating", new_column_name="physical_rating")
        batch.alter_column("mind_rating", new_column_name="focus_rating")
        batch.alter_column("body_rating", new_column_name="energy_rating")
