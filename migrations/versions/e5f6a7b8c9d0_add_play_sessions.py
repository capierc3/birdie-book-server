"""add play_sessions, play_session_partners, play_session_weather_samples

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-19 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 11e: PlaySession — in-app round journal, separate from Garmin rounds
    op.create_table(
        'play_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('player_id', sa.Integer(), sa.ForeignKey('players.id'), nullable=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=True),
        sa.Column('tee_id', sa.Integer(), sa.ForeignKey('course_tees.id'), nullable=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('game_format', sa.String(30), server_default='STROKE_PLAY'),
        sa.Column('holes_played', sa.Integer(), server_default='18'),
        sa.Column('state', sa.String(20), nullable=False, server_default='PRE'),

        # Pre-round
        sa.Column('energy_rating', sa.Integer(), nullable=True),
        sa.Column('focus_rating', sa.Integer(), nullable=True),
        sa.Column('physical_rating', sa.Integer(), nullable=True),
        sa.Column('pre_session_notes', sa.Text(), nullable=True),
        sa.Column('session_goals', sa.Text(), nullable=True),
        sa.Column('clubs_focused', sa.String(200), nullable=True),

        # Post-round
        sa.Column('overall_rating', sa.Integer(), nullable=True),
        sa.Column('what_worked', sa.Text(), nullable=True),
        sa.Column('what_struggled', sa.Text(), nullable=True),
        sa.Column('key_takeaway', sa.Text(), nullable=True),
        sa.Column('next_focus', sa.Text(), nullable=True),
        sa.Column('post_session_notes', sa.Text(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=True),

        # Link to Garmin round
        sa.Column('garmin_round_id', sa.Integer(), sa.ForeignKey('rounds.id', ondelete='SET NULL'), nullable=True),

        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_play_sessions_state', 'play_sessions', ['state'])
    op.create_index('ix_play_sessions_course_id', 'play_sessions', ['course_id'])
    op.create_index('ix_play_sessions_garmin_round_id', 'play_sessions', ['garmin_round_id'])

    # 11e: play session partners
    op.create_table(
        'play_session_partners',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('play_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('player_id', sa.Integer(), sa.ForeignKey('players.id'), nullable=True),
        sa.Column('player_name', sa.String(100), nullable=False),
        sa.Column('is_teammate', sa.Boolean(), server_default=sa.false()),
    )
    op.create_index('ix_play_session_partners_session_id', 'play_session_partners', ['session_id'])

    # 6d: weather samples (time-series)
    op.create_table(
        'play_session_weather_samples',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('play_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('hole_number', sa.Integer(), nullable=True),
        sa.Column('sampled_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('temp_f', sa.Float(), nullable=True),
        sa.Column('wind_speed_mph', sa.Float(), nullable=True),
        sa.Column('wind_gust_mph', sa.Float(), nullable=True),
        sa.Column('wind_dir_deg', sa.Integer(), nullable=True),
        sa.Column('wind_dir_cardinal', sa.String(8), nullable=True),
        sa.Column('precipitation_in', sa.Float(), nullable=True),
        sa.Column('weather_code', sa.Integer(), nullable=True),
        sa.Column('weather_desc', sa.String(100), nullable=True),
        sa.Column('humidity_pct', sa.Float(), nullable=True),
        sa.Column('pressure_mb', sa.Float(), nullable=True),
    )
    op.create_index('ix_play_session_weather_samples_session_id', 'play_session_weather_samples', ['session_id'])


def downgrade() -> None:
    op.drop_index('ix_play_session_weather_samples_session_id', table_name='play_session_weather_samples')
    op.drop_table('play_session_weather_samples')
    op.drop_index('ix_play_session_partners_session_id', table_name='play_session_partners')
    op.drop_table('play_session_partners')
    op.drop_index('ix_play_sessions_garmin_round_id', table_name='play_sessions')
    op.drop_index('ix_play_sessions_course_id', table_name='play_sessions')
    op.drop_index('ix_play_sessions_state', table_name='play_sessions')
    op.drop_table('play_sessions')
