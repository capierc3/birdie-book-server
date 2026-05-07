"""add in_bag flag to clubs

Per-club toggle for "in bag" vs "standby". Standby clubs are excluded
from caddie suggestions (rankClubs, getTeeStrategy, computeCarryProbabilities)
via the /courses/{id}/strategy endpoint, but stay visible on the bag page so
the user can flip them back.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-05-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c0d1e2f3a4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'clubs',
        sa.Column('in_bag', sa.Boolean(), nullable=True, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column('clubs', 'in_bag')
