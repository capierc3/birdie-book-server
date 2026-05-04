from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class RoundPlan(Base):
    """A game plan for an upcoming round — goals, shot plans, strategy notes."""
    __tablename__ = "round_plans"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    tee_id = Column(Integer, ForeignKey("course_tees.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    planned_date = Column(Date, nullable=True)
    status = Column(String(20), default="draft")  # draft, active, played
    score_goal = Column(Integer, nullable=True)  # target round score (drives per-hole personal-par allocation)
    focus_areas = Column(Text)  # JSON array of focus tags
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    course = relationship("Course")
    tee = relationship("CourseTee")
    round = relationship("Round")
    holes = relationship("RoundPlanHole", back_populates="plan", cascade="all, delete-orphan",
                         order_by="RoundPlanHole.hole_number")


class RoundPlanHole(Base):
    """Per-hole plan — goal score and strategy notes."""
    __tablename__ = "round_plan_holes"

    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("round_plans.id", ondelete="CASCADE"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    goal_score = Column(Integer, nullable=True)
    strategy_notes = Column(Text, nullable=True)

    plan = relationship("RoundPlan", back_populates="holes")
    shots = relationship("RoundPlanShot", back_populates="plan_hole", cascade="all, delete-orphan",
                         order_by="RoundPlanShot.shot_number")


class RoundPlanShot(Base):
    """A planned shot in sequence — club + aim point on the map."""
    __tablename__ = "round_plan_shots"

    id = Column(Integer, primary_key=True)
    plan_hole_id = Column(Integer, ForeignKey("round_plan_holes.id", ondelete="CASCADE"), nullable=False)
    shot_number = Column(Integer, nullable=False)
    club = Column(String(30), nullable=True)
    aim_lat = Column(Float, nullable=True)
    aim_lng = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    plan_hole = relationship("RoundPlanHole", back_populates="shots")
