"""add hole notes and round plan tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-04 18:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 17a: per-hole strategy notes
    op.add_column('course_holes', sa.Column('notes', sa.Text(), nullable=True))

    # 17b: round plan tables
    op.create_table(
        'round_plans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tee_id', sa.Integer(), sa.ForeignKey('course_tees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('round_id', sa.Integer(), sa.ForeignKey('rounds.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('planned_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(20), server_default='draft'),
        sa.Column('focus_areas', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'round_plan_holes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('plan_id', sa.Integer(), sa.ForeignKey('round_plans.id', ondelete='CASCADE'), nullable=False),
        sa.Column('hole_number', sa.Integer(), nullable=False),
        sa.Column('goal_score', sa.Integer(), nullable=True),
        sa.Column('strategy_notes', sa.Text(), nullable=True),
    )

    op.create_table(
        'round_plan_shots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('plan_hole_id', sa.Integer(), sa.ForeignKey('round_plan_holes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('shot_number', sa.Integer(), nullable=False),
        sa.Column('club', sa.String(30), nullable=True),
        sa.Column('aim_lat', sa.Float(), nullable=True),
        sa.Column('aim_lng', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('round_plan_shots')
    op.drop_table('round_plan_holes')
    op.drop_table('round_plans')
    op.drop_column('course_holes', 'notes')
