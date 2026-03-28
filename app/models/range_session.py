from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class RangeSession(Base):
    """A range/sim practice session from a launch monitor (e.g. Rapsodo MLM2PRO, Trackman)."""
    __tablename__ = "range_sessions"

    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    source = Column(String(30), nullable=False, default="rapsodo_mlm2pro")
    session_date = Column(DateTime, nullable=False)
    title = Column(String(200))
    notes = Column(String(2000))
    shot_count = Column(Integer, default=0)
    import_fingerprint = Column(String(64), unique=True, index=True)  # SHA-256 for CSV, report_id for Trackman
    report_id = Column(String(64), unique=True, nullable=True, index=True)  # Trackman report UUID
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    shots = relationship("RangeShot", back_populates="session", cascade="all, delete-orphan")
    trackman_shots = relationship("TrackmanShot", back_populates="session", cascade="all, delete-orphan")
    player = relationship("Player")


class RangeShot(Base):
    """A single shot from a launch monitor session."""
    __tablename__ = "range_shots"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("range_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    club_type_raw = Column(String(30), nullable=False)
    club_brand = Column(String(100))
    club_model = Column(String(100))
    shot_number = Column(Integer, nullable=False)

    # Launch monitor metrics
    carry_yards = Column(Float)
    total_yards = Column(Float)
    ball_speed_mph = Column(Float)
    launch_angle_deg = Column(Float)
    launch_direction_deg = Column(Float)
    apex_yards = Column(Float)
    side_carry_yards = Column(Float)
    club_speed_mph = Column(Float)
    smash_factor = Column(Float)
    descent_angle_deg = Column(Float)
    attack_angle_deg = Column(Float)
    club_path_deg = Column(Float)
    club_data_est_type = Column(Integer)
    spin_rate_rpm = Column(Float)
    spin_axis_deg = Column(Float)

    session = relationship("RangeSession", back_populates="shots")
    club = relationship("Club")
