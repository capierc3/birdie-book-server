from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class Club(Base):
    """A club in the player's bag — maps to ClubBaseline in the Android app."""
    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True)
    garmin_id = Column(Integer, unique=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    club_type = Column(String(30), nullable=False)  # Standard type: Driver, 7 Wood, etc.
    club_type_id = Column(Integer)  # Garmin clubTypeId
    name = Column(String(100))  # Custom user name (e.g. "Old Shillelagh"), null = use club_type
    model = Column(String(100))
    shaft_length_in = Column(Float)
    flex = Column(String(20))
    loft_deg = Column(Float)
    lie_deg = Column(Float)
    color = Column(String(7))  # Hex color e.g. "#42a5f5", assigned on creation
    source = Column(String(30), default="manual")  # "garmin", "rapsodo_mlm2pro", "trackman", "manual"
    retired = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    garmin_last_modified = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    stats = relationship("ClubStats", back_populates="club", uselist=False, cascade="all, delete-orphan")
    player = relationship("Player")


class ClubStats(Base):
    """Aggregated distance stats for a club — computed from shot data."""
    __tablename__ = "club_stats"

    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, unique=True)
    avg_yards = Column(Float)
    median_yards = Column(Float)
    std_dev = Column(Float)
    min_yards = Column(Float)
    max_yards = Column(Float)
    p10 = Column(Float)
    p90 = Column(Float)
    sample_count = Column(Integer)

    # Range/sim stats (from launch monitor data)
    range_avg_yards = Column(Float)
    range_median_yards = Column(Float)
    range_max_yards = Column(Float)
    range_sample_count = Column(Integer)

    # Combined on-course + range stats
    combined_avg_yards = Column(Float)
    combined_median_yards = Column(Float)
    combined_max_yards = Column(Float)
    combined_sample_count = Column(Integer)

    last_computed = Column(DateTime, server_default=func.now())

    club = relationship("Club", back_populates="stats")
