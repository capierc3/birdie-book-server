"""add score_goal to round_plans

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-05-03 15:00:00.000000

Plan-level target round score (e.g. 99 for "break 100"). Drives the
desktop scorecard's per-hole "goal par" allocation in the Goal/HCP rows
when a plan is active. Mirrors PlaySession.score_goal but lives on the
plan so it can be set/refined during pre-round planning.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'c0d1e2f3a4b5'
down_revision: Union[str, None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('round_plans', sa.Column('score_goal', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('round_plans', 'score_goal')
