"""add fairway_boundary and data_source provenance

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-04 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course_holes', sa.Column('fairway_boundary', sa.Text(), nullable=True))
    op.add_column('course_holes', sa.Column('data_source', sa.String(20), nullable=True))
    op.add_column('course_hazards', sa.Column('data_source', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('course_hazards', 'data_source')
    op.drop_column('course_holes', 'data_source')
    op.drop_column('course_holes', 'fairway_boundary')
