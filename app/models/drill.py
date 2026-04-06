from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, func

from app.database import Base


class Drill(Base):
    """A golf practice drill — system defaults or user-created."""
    __tablename__ = "drills"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    target = Column(String(300), nullable=True)  # success criteria
    sg_category = Column(String(20), nullable=True)  # off_the_tee, approach, short_game, putting
    focus_area = Column(String(50), nullable=True)  # accuracy, distance_control, tempo, etc.
    club_type = Column(String(30), nullable=True)  # "Driver", "wedge", None = any
    session_types = Column(Text, nullable=True)  # JSON array: ["trackman_range", "outdoor_range"]
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
