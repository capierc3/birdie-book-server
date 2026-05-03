"""add score_goal to play_sessions

Per-round target score (e.g. 99 for "break 100"). Drives personal-par
allocation across holes by handicap index. See ROADMAP Feature 17g.

Revision ID: a8b9c0d1e2f3
Revises: f6a7b8c9d0e1
Create Date: 2026-05-02 19:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'play_sessions',
        sa.Column('score_goal', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('play_sessions', 'score_goal')
