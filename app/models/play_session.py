from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, DateTime,
    ForeignKey, Text, func
)
from sqlalchemy.orm import relationship

from app.database import Base


class PlaySession(Base):
    """In-app round journal — pre/post reflection, mindset, weather, goals.

    Distinct from `Round` (Garmin-imported shot data). A PlaySession stands on
    its own and may later be linked to a Garmin Round via `garmin_round_id`.
    See ROADMAP Feature 11.
    """
    __tablename__ = "play_sessions"

    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    tee_id = Column(Integer, ForeignKey("course_tees.id"), nullable=True)
    date = Column(Date, nullable=False)

    # Round setup
    game_format = Column(String(30), default="STROKE_PLAY")
    holes_played = Column(Integer, default=18)

    # State machine: PRE → ACTIVE → COMPLETE (or ABANDONED)
    state = Column(String(20), nullable=False, default="PRE")

    # Pre-round journal
    body_rating = Column(Integer)        # physical feel (1-5)
    mind_rating = Column(Integer)        # mental clarity (1-5)
    commitment_rating = Column(Integer)  # willingness to trust yourself (1-5)
    intention_notes = Column(Text)       # freeform "anything else" alongside intention tags

    # Round goal — target score (e.g. 99 for "break 100"). Drives personal-par
    # allocation across holes by handicap index. Per-session for now; a Settings
    # default may pre-fill this in a later iteration.
    score_goal = Column(Integer, nullable=True)

    # Post-round journal
    overall_rating = Column(Integer)
    what_worked = Column(Text)
    what_struggled = Column(Text)
    key_takeaway = Column(Text)
    next_focus = Column(Text)
    post_session_notes = Column(Text)
    score = Column(Integer)

    # Link to Garmin round (after-the-fact matching)
    garmin_round_id = Column(Integer, ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    course = relationship("Course")
    tee = relationship("CourseTee")
    player = relationship("Player")
    garmin_round = relationship("Round")

    partners = relationship(
        "PlaySessionPartner",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    weather_samples = relationship(
        "PlaySessionWeatherSample",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="PlaySessionWeatherSample.sampled_at",
    )
    session_tags = relationship(
        "PlaySessionTag",
        cascade="all, delete-orphan",
        backref="session",
    )


class PlaySessionPartner(Base):
    """A playing partner for a PlaySession (denormalized name for display)."""
    __tablename__ = "play_session_partners"

    id = Column(Integer, primary_key=True)
    session_id = Column(
        Integer, ForeignKey("play_sessions.id", ondelete="CASCADE"), nullable=False
    )
    player_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    player_name = Column(String(100), nullable=False)
    is_teammate = Column(Boolean, default=False)

    session = relationship("PlaySession", back_populates="partners")


class PlaySessionWeatherSample(Base):
    """Time-series weather sample captured during a PlaySession.

    See ROADMAP Feature 6d. Fetched from Open-Meteo at round start, on
    throttled hole advance, and on manual refresh.
    """
    __tablename__ = "play_session_weather_samples"

    id = Column(Integer, primary_key=True)
    session_id = Column(
        Integer, ForeignKey("play_sessions.id", ondelete="CASCADE"), nullable=False
    )
    hole_number = Column(Integer, nullable=True)
    sampled_at = Column(DateTime, server_default=func.now(), nullable=False)

    temp_f = Column(Float)
    wind_speed_mph = Column(Float)
    wind_gust_mph = Column(Float)
    wind_dir_deg = Column(Integer)
    wind_dir_cardinal = Column(String(8))
    precipitation_in = Column(Float)
    weather_code = Column(Integer)
    weather_desc = Column(String(100))
    humidity_pct = Column(Float)
    pressure_mb = Column(Float)

    session = relationship("PlaySession", back_populates="weather_samples")
