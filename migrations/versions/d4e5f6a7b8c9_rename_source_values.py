"""rename source values: course->garmin, rapsodo_mlm2pro->rapsodo

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-12 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE clubs SET source = 'rapsodo' WHERE source = 'rapsodo_mlm2pro'")
    op.execute("UPDATE range_sessions SET source = 'rapsodo' WHERE source = 'rapsodo_mlm2pro'")


def downgrade() -> None:
    op.execute("UPDATE clubs SET source = 'rapsodo_mlm2pro' WHERE source = 'rapsodo'")
    op.execute("UPDATE range_sessions SET source = 'rapsodo_mlm2pro' WHERE source = 'rapsodo'")
