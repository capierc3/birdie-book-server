"""scope osm_holes to a course

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-05-03 14:00:00.000000

Adds `course_id` (nullable FK to courses.id) on `osm_holes` so the matcher
can scope candidates to the course an OSM relation actually came from.

Background: at multi-course clubs (e.g. Tullymore Resort with both Tullymore
and St. Ives), every OSM hole was stored with only `golf_club_id` and the
matcher saw all 36 holes when matching either course. The "closest to course
centroid" tie-break used `course.club.lat/lng` — a single coordinate near
the Tullymore clubhouse — so St. Ives's holes (miles away) got pre-filtered
out and ref-tag matching wired Tullymore's geometry into St. Ives.

Backfill: single-course clubs are tagged trivially. Multi-course clubs are
left NULL — re-run the per-course OSM link to re-populate (the import path
now sets course_id).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Batch mode: SQLite can't ALTER TABLE ADD a column with an FK constraint
    # in-place. batch_alter_table recreates the table with the new schema.
    with op.batch_alter_table('osm_holes') as batch_op:
        batch_op.add_column(
            sa.Column(
                'course_id',
                sa.Integer(),
                sa.ForeignKey('courses.id', name='fk_osm_holes_course_id', ondelete='SET NULL'),
                nullable=True,
            )
        )
        batch_op.create_index(batch_op.f('ix_osm_holes_course_id'), ['course_id'], unique=False)

    # Backfill: any club with exactly one course can have all its OSM holes
    # tagged with that course unambiguously. Multi-course clubs left NULL —
    # the user re-runs the per-course OSM link to fix.
    bind = op.get_bind()
    bind.execute(sa.text("""
        UPDATE osm_holes
           SET course_id = (
               SELECT c.id FROM courses c
                WHERE c.golf_club_id = osm_holes.golf_club_id
                LIMIT 1
           )
         WHERE course_id IS NULL
           AND (
               SELECT COUNT(*) FROM courses c
                WHERE c.golf_club_id = osm_holes.golf_club_id
           ) = 1
    """))


def downgrade() -> None:
    with op.batch_alter_table('osm_holes') as batch_op:
        batch_op.drop_index(batch_op.f('ix_osm_holes_course_id'))
        batch_op.drop_column('course_id')
