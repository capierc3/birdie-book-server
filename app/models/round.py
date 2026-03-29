from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, DateTime,
    ForeignKey, func
)
from sqlalchemy.orm import relationship

from app.database import Base


class Round(Base):
    """A played round — combines Session + Garmin scorecard data."""
    __tablename__ = "rounds"

    id = Column(Integer, primary_key=True)
    garmin_id = Column(Integer, unique=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    tee_id = Column(Integer, ForeignKey("course_tees.id"))
    date = Column(Date, nullable=False)
    holes_completed = Column(Integer)
    total_strokes = Column(Integer)
    handicapped_strokes = Column(Integer)
    score_vs_par = Column(Integer)
    player_handicap = Column(Float)
    course_rating = Column(Float)
    slope_rating = Column(Float)
    shots_tracked = Column(Integer)
    exclude_from_stats = Column(Boolean, default=False)

    # Session fields from Android app (two-way sync)
    session_type = Column(String(20), default="ROUND")
    game_format = Column(String(30), default="STROKE_PLAY")
    session_state = Column(String(20), default="COMPLETE")
    weather_temp_f = Column(Float)
    weather_wind_speed_mph = Column(Float)
    weather_wind_direction = Column(String(10))
    weather_description = Column(String(100))
    weather_precipitation_in = Column(Float)
    weather_code = Column(Integer)

    # Pre/post session notes
    energy_rating = Column(Integer)
    focus_rating = Column(Integer)
    physical_rating = Column(Integer)
    pre_session_notes = Column(String(2000))
    session_goals = Column(String(2000))
    overall_rating = Column(Integer)
    what_worked = Column(String(2000))
    what_struggled = Column(String(2000))
    key_takeaway = Column(String(2000))
    next_focus = Column(String(2000))
    post_session_notes = Column(String(2000))

    # Garmin extras
    distance_walked_m = Column(Integer)
    steps_taken = Column(Integer)
    garmin_last_modified = Column(DateTime)
    locally_modified = Column(Boolean, default=False)

    source = Column(String(20), default="garmin")  # garmin | app | manual
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="rounds")
    tee = relationship("CourseTee")
    holes = relationship("RoundHole", back_populates="round", cascade="all, delete-orphan")
    player = relationship("Player")


class RoundHole(Base):
    """Per-hole scoring for a round."""
    __tablename__ = "round_holes"

    id = Column(Integer, primary_key=True)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    strokes = Column(Integer)
    handicap_strokes = Column(Integer)
    putts = Column(Integer)
    fairway = Column(String(10))  # HIT, LEFT, RIGHT, null (par 3)
    gir = Column(Boolean)
    penalty_strokes = Column(Integer, default=0)

    round = relationship("Round", back_populates="holes")
    shots = relationship("Shot", back_populates="round_hole", cascade="all, delete-orphan")


class Shot(Base):
    """Individual shot GPS data from Garmin FIT/JSON."""
    __tablename__ = "shots"

    id = Column(Integer, primary_key=True)
    garmin_id = Column(Integer, unique=True, index=True)  # from JSON export
    round_hole_id = Column(Integer, ForeignKey("round_holes.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    shot_number = Column(Integer, nullable=False)
    club = Column(String(30))
    club_garmin_id = Column(Integer)  # FK to clubs.garmin_id
    start_lat = Column(Float)
    start_lng = Column(Float)
    start_lie = Column(String(30))  # Tee Box, Fairway, Rough, Green, etc.
    end_lat = Column(Float)
    end_lng = Column(Float)
    end_lie = Column(String(30))
    distance_yards = Column(Float)
    shot_type = Column(String(20))  # TEE, APPROACH, CHIP, PUTT, PENALTY
    auto_shot_type = Column(String(20))  # USED, PENALTY
    timestamp = Column(DateTime)

    round_hole = relationship("RoundHole", back_populates="shots")
