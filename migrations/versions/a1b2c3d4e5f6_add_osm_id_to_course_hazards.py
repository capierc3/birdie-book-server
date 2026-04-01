"""add osm_id to course_hazards

Revision ID: a1b2c3d4e5f6
Revises: 773aa2497a92
Create Date: 2026-03-31 20:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '773aa2497a92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course_hazards', sa.Column('osm_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_course_hazards_osm_id'), 'course_hazards', ['osm_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_course_hazards_osm_id'), table_name='course_hazards')
    op.drop_column('course_hazards', 'osm_id')
