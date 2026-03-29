from sqlalchemy import Boolean, Column, Integer, String, Float, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class GolfClub(Base):
    """Golf club / venue — the physical location that contains one or more courses."""
    __tablename__ = "golf_clubs"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    address = Column(String(500))
    lat = Column(Float)
    lng = Column(Float)
    google_place_id = Column(String(200))
    photo_url = Column(String(500))
    user_rating = Column(Float)
    user_notes = Column(String(2000))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    courses = relationship("Course", back_populates="club", cascade="all, delete-orphan")


class Course(Base):
    """A specific course within a golf club (e.g., 'Eagle' at Pine Knob)."""
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True)
    golf_club_id = Column(Integer, ForeignKey("golf_clubs.id", ondelete="CASCADE"), nullable=False)
    garmin_snapshot_id = Column(Integer, unique=True, index=True)
    name = Column(String(200))  # NULL for single-course clubs
    holes = Column(Integer, default=18)
    par = Column(Integer)
    slope_rating = Column(Float)
    course_rating = Column(Float)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    club = relationship("GolfClub", back_populates="courses")
    tees = relationship("CourseTee", back_populates="course", cascade="all, delete-orphan")
    rounds = relationship("Round", back_populates="course")

    @property
    def display_name(self) -> str:
        """Full display name combining club and course."""
        if self.club and self.name:
            return f"{self.club.name} — {self.name}"
        if self.club:
            return self.club.name
        return self.name or "Unknown"


class CourseTee(Base):
    """Tee box configuration for a course."""
    __tablename__ = "course_tees"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    tee_name = Column(String(50), nullable=False)
    course_rating = Column(Float)
    slope_rating = Column(Float)
    par_total = Column(Integer)
    number_of_holes = Column(Integer, default=18)
    total_yards = Column(Integer)
    inferred = Column(Boolean, default=False)

    course = relationship("Course", back_populates="tees")
    holes = relationship("CourseHole", back_populates="tee", cascade="all, delete-orphan")


class CourseHole(Base):
    """Per-hole data for a specific tee."""
    __tablename__ = "course_holes"

    id = Column(Integer, primary_key=True)
    tee_id = Column(Integer, ForeignKey("course_tees.id", ondelete="CASCADE"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    par = Column(Integer, nullable=False)
    yardage = Column(Integer)
    handicap = Column(Integer)
    flag_lat = Column(Float)
    flag_lng = Column(Float)
    tee_lat = Column(Float)
    tee_lng = Column(Float)
    fairway_path = Column(Text)  # JSON array of [lat, lng] waypoints
    green_boundary = Column(Text)  # JSON array of [lat, lng] polygon points defining green edge
    rotation_deg = Column(Integer, default=0)  # deprecated — Leaflet handles rotation
    custom_zoom = Column(Integer)  # deprecated — Leaflet auto-fits
    custom_bounds = Column(Text)  # deprecated — no more cropping
    shot_offset_x = Column(Float)  # deprecated — no more offset hacks
    shot_offset_y = Column(Float)

    tee = relationship("CourseTee", back_populates="holes")
    images = relationship("HoleImage", back_populates="hole")


class CourseHazard(Base):
    """A hazard on a course — bunker, water, OB, etc. Course-level, shared across holes."""
    __tablename__ = "course_hazards"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    hazard_type = Column(String(30), nullable=False)  # bunker, water, out_of_bounds, trees, waste_area
    name = Column(String(100))  # e.g. "Left Fairway Bunker", "Pond"
    boundary = Column(Text, nullable=False)  # JSON: [[lat, lng], ...]

    course = relationship("Course")
