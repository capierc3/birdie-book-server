from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class TrackmanShot(Base):
    """A single shot from a Trackman session — full fidelity Trackman data."""
    __tablename__ = "trackman_shots"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("range_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    shot_number = Column(Integer, nullable=False)
    trackman_id = Column(String(64), unique=True, index=True)  # Trackman's UUID per shot
    timestamp = Column(DateTime)

    # Distances (stored in yards)
    carry_yards = Column(Float)
    total_yards = Column(Float)
    side_carry_yards = Column(Float)
    side_total_yards = Column(Float)
    apex_ft = Column(Float)          # MaxHeight in feet
    curve_yards = Column(Float)

    # Speeds (stored in mph)
    club_speed_mph = Column(Float)
    ball_speed_mph = Column(Float)
    ball_speed_diff_mph = Column(Float)

    # Angles (degrees)
    launch_angle_deg = Column(Float)
    launch_direction_deg = Column(Float)
    attack_angle_deg = Column(Float)
    club_path_deg = Column(Float)
    face_angle_deg = Column(Float)
    face_to_path_deg = Column(Float)
    dynamic_loft_deg = Column(Float)
    spin_loft_deg = Column(Float)
    swing_plane_deg = Column(Float)
    swing_direction_deg = Column(Float)
    landing_angle_deg = Column(Float)
    dynamic_lie_deg = Column(Float)

    # Spin
    spin_rate_rpm = Column(Float)
    spin_axis_deg = Column(Float)

    # Derived metrics
    smash_factor = Column(Float)
    smash_index = Column(Float)
    hang_time_sec = Column(Float)

    # Impact (stored in inches)
    impact_offset_in = Column(Float)
    impact_height_in = Column(Float)
    low_point_distance_in = Column(Float)
    low_point_height_in = Column(Float)
    low_point_side_in = Column(Float)

    # Trajectory and accuracy (stored as JSON text)
    trajectory_json = Column(Text)          # [{X, Y, Z}, ...] in meters
    reduced_accuracy_json = Column(Text)    # ["SpinRate", "SpinAxis", ...]

    # Raw club name from Trackman (e.g. "Driver", "7Iron", "PitchingWedge")
    club_type_raw = Column(String(50))

    session = relationship("RangeSession", back_populates="trackman_shots")
    club = relationship("Club")
