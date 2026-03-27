from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class HoleImage(Base):
    """Cached satellite image of a course hole."""
    __tablename__ = "hole_images"

    id = Column(Integer, primary_key=True)
    hole_id = Column(Integer, ForeignKey("course_holes.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(200), nullable=False)
    zoom_level = Column(Integer, default=17)
    center_lat = Column(Float)
    center_lng = Column(Float)
    width_px = Column(Integer, default=640)
    height_px = Column(Integer, default=640)
    fetched_at = Column(DateTime, server_default=func.now())

    hole = relationship("CourseHole", back_populates="images")
