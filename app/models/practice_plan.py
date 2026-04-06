from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class PracticePlan(Base):
    """A structured practice plan — either linked to an upcoming round or general improvement."""
    __tablename__ = "practice_plans"

    id = Column(Integer, primary_key=True)
    round_plan_id = Column(Integer, ForeignKey("round_plans.id", ondelete="SET NULL"), nullable=True)
    plan_type = Column(String(20), nullable=False)  # "round_prep" or "general"
    goal = Column(String(500))
    status = Column(String(20), default="draft")  # draft, generated, saved, completed
    focus_tags = Column(Text, nullable=True)  # JSON array: ["driver", "distance", "swing_change"]
    notes = Column(Text, nullable=True)
    analysis_snapshot = Column(Text, nullable=True)  # JSON blob of analysis at generation time
    range_session_id = Column(Integer, ForeignKey("range_sessions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    round_plan = relationship("RoundPlan")
    range_session = relationship("RangeSession")
    sessions = relationship("PracticeSession", back_populates="plan", cascade="all, delete-orphan",
                            order_by="PracticeSession.session_order")


class PracticeSession(Base):
    """A single practice session within a plan (e.g., one range visit)."""
    __tablename__ = "practice_sessions"

    id = Column(Integer, primary_key=True)
    practice_plan_id = Column(Integer, ForeignKey("practice_plans.id", ondelete="CASCADE"), nullable=False)
    session_order = Column(Integer, nullable=False)
    session_type = Column(String(30), nullable=False)  # trackman_range, outdoor_range, home_net, short_game_area, putting_green, simulator
    ball_count = Column(Integer, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    plan = relationship("PracticePlan", back_populates="sessions")
    activities = relationship("PracticeActivity", back_populates="session", cascade="all, delete-orphan",
                              order_by="PracticeActivity.activity_order")


class PracticeActivity(Base):
    """A single drill/activity within a practice session."""
    __tablename__ = "practice_activities"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("practice_sessions.id", ondelete="CASCADE"), nullable=False)
    activity_order = Column(Integer, nullable=False)
    club = Column(String(30), nullable=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="SET NULL"), nullable=True)
    drill_id = Column(Integer, ForeignKey("drills.id", ondelete="SET NULL"), nullable=True)
    ball_count = Column(Integer, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    focus_area = Column(String(50), nullable=False)  # distance_control, accuracy, tempo, start_line, trajectory, speed_control, lag_putting, short_putt, chipping, bunker, warm_up
    sg_category = Column(String(20), nullable=True)  # off_the_tee, approach, short_game, putting
    rationale = Column(String(500), nullable=True)
    target_metric = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    completed = Column(Boolean, default=False)

    session = relationship("PracticeSession", back_populates="activities")
    club_ref = relationship("Club")
    drill = relationship("Drill")
