from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class Course(Base):
    """Golf course — maps to Venue in the Android app."""
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True)
    garmin_snapshot_id = Column(Integer, unique=True, index=True)
    name = Column(String(200), nullable=False)
    address = Column(String(500))
    lat = Column(Float)
    lng = Column(Float)
    google_place_id = Column(String(200))
    holes = Column(Integer, default=18)
    par = Column(Integer)
    slope_rating = Column(Float)
    course_rating = Column(Float)
    user_rating = Column(Float)
    user_notes = Column(String(2000))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    tees = relationship("CourseTee", back_populates="course", cascade="all, delete-orphan")
    rounds = relationship("Round", back_populates="course")


class CourseTee(Base):
    """Tee box configuration — maps to VenueTee in the Android app."""
    __tablename__ = "course_tees"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    tee_name = Column(String(50), nullable=False)
    course_rating = Column(Float)
    slope_rating = Column(Float)
    par_total = Column(Integer)
    number_of_holes = Column(Integer, default=18)
    total_yards = Column(Integer)

    course = relationship("Course", back_populates="tees")
    holes = relationship("CourseHole", back_populates="tee", cascade="all, delete-orphan")


class CourseHole(Base):
    """Per-hole data for a specific tee — maps to VenueHoleData in the Android app."""
    __tablename__ = "course_holes"

    id = Column(Integer, primary_key=True)
    tee_id = Column(Integer, ForeignKey("course_tees.id", ondelete="CASCADE"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    par = Column(Integer, nullable=False)
    yardage = Column(Integer)
    handicap = Column(Integer)
    flag_lat = Column(Float)
    flag_lng = Column(Float)

    tee = relationship("CourseTee", back_populates="holes")
    images = relationship("HoleImage", back_populates="hole")
