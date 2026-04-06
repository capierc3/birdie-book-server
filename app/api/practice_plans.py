"""Smart Practice Plans API — generate, save, and manage practice plans."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict
import json

from app.database import get_db
from app.models import RoundPlan, Course, GolfClub
from app.models.practice_plan import PracticePlan, PracticeSession, PracticeActivity
from app.services.practice_recommendation_service import generate_practice_plan

router = APIRouter(prefix="/api/practice", tags=["practice"])


# ── Pydantic schemas ──────────────────────────────────────────────────

class SessionSpecInput(BaseModel):
    session_type: str
    ball_count: Optional[int] = None
    duration_minutes: Optional[int] = None


class GenerateRequest(BaseModel):
    plan_type: str  # "round_prep" or "general"
    round_plan_id: Optional[int] = None
    goal: Optional[str] = None
    focus_tags: Optional[list[str]] = None
    sessions: list[SessionSpecInput]


class SaveActivityInput(BaseModel):
    activity_order: int
    club: Optional[str] = None
    club_id: Optional[int] = None
    drill_id: Optional[int] = None
    ball_count: Optional[int] = None
    duration_minutes: Optional[int] = None
    focus_area: str
    sg_category: Optional[str] = None
    rationale: Optional[str] = None
    target_metric: Optional[str] = None
    notes: Optional[str] = None


class SaveSessionInput(BaseModel):
    session_order: int
    session_type: str
    ball_count: Optional[int] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    activities: list[SaveActivityInput]


class SavePlanRequest(BaseModel):
    plan_type: str
    round_plan_id: Optional[int] = None
    goal: Optional[str] = None
    focus_tags: Optional[list[str]] = None
    notes: Optional[str] = None
    analysis_snapshot: Optional[str] = None
    range_session_id: Optional[int] = None
    sessions: list[SaveSessionInput]


class UpdatePlanRequest(BaseModel):
    goal: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    focus_tags: Optional[list[str]] = None
    range_session_id: Optional[int] = None
    sessions: Optional[list[SaveSessionInput]] = None


# ── Endpoints ─────────────────────────────────────────────────────────

@router.post("/generate")
def generate(req: GenerateRequest, db: Session = Depends(get_db)):
    """Run the recommendation engine and return a preview (no DB write)."""
    import traceback
    sessions_spec = [s.model_dump() for s in req.sessions]

    try:
        result = generate_practice_plan(
            db=db,
            plan_type=req.plan_type,
            sessions_spec=sessions_spec,
            round_plan_id=req.round_plan_id,
            focus_tags=req.focus_tags,
        )
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plans")
def save_plan(req: SavePlanRequest, db: Session = Depends(get_db)):
    """Save a practice plan with sessions and activities."""
    plan = PracticePlan(
        plan_type=req.plan_type,
        round_plan_id=req.round_plan_id,
        goal=req.goal,
        focus_tags=json.dumps(req.focus_tags) if req.focus_tags else None,
        notes=req.notes,
        analysis_snapshot=req.analysis_snapshot,
        range_session_id=req.range_session_id,
        status="saved",
    )
    db.add(plan)
    db.flush()

    for s in req.sessions:
        session = PracticeSession(
            practice_plan_id=plan.id,
            session_order=s.session_order,
            session_type=s.session_type,
            ball_count=s.ball_count,
            duration_minutes=s.duration_minutes,
            notes=s.notes,
        )
        db.add(session)
        db.flush()

        for a in s.activities:
            db.add(PracticeActivity(
                session_id=session.id,
                activity_order=a.activity_order,
                club=a.club,
                club_id=a.club_id,
                drill_id=a.drill_id,
                ball_count=a.ball_count,
                duration_minutes=a.duration_minutes,
                focus_area=a.focus_area,
                sg_category=a.sg_category,
                rationale=a.rationale,
                target_metric=a.target_metric,
                notes=a.notes,
            ))

    db.commit()
    db.refresh(plan)
    return _plan_detail(db, plan.id)


@router.get("/plans")
def list_plans(
    round_plan_id: Optional[int] = None,
    status: Optional[str] = None,
    plan_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List practice plans with optional filters."""
    q = db.query(PracticePlan).order_by(PracticePlan.created_at.desc())

    if round_plan_id is not None:
        q = q.filter(PracticePlan.round_plan_id == round_plan_id)
    if status:
        q = q.filter(PracticePlan.status == status)
    if plan_type:
        q = q.filter(PracticePlan.plan_type == plan_type)

    plans = q.all()
    result = []
    for p in plans:
        # Get session count and completion info
        sessions = (
            db.query(PracticeSession)
            .filter(PracticeSession.practice_plan_id == p.id)
            .all()
        )
        session_ids = [s.id for s in sessions]
        total_activities = 0
        completed_activities = 0
        if session_ids:
            activities = (
                db.query(PracticeActivity)
                .filter(PracticeActivity.session_id.in_(session_ids))
                .all()
            )
            total_activities = len(activities)
            completed_activities = sum(1 for a in activities if a.completed)

        # Get linked round plan info
        round_plan_info = None
        if p.round_plan_id:
            rp = db.query(RoundPlan).filter(RoundPlan.id == p.round_plan_id).first()
            if rp:
                course = db.query(Course).filter(Course.id == rp.course_id).first()
                golf_club = db.query(GolfClub).filter(GolfClub.id == course.golf_club_id).first() if course else None
                course_name = golf_club.name if golf_club else ""
                if course and course.name:
                    course_name = f"{course_name} — {course.name}" if course_name else course.name
                round_plan_info = {
                    "id": rp.id,
                    "name": rp.name,
                    "course_name": course_name,
                    "planned_date": rp.planned_date.isoformat() if rp.planned_date else None,
                }

        # Parse focus_tags from JSON
        try:
            focus_tags = json.loads(p.focus_tags) if p.focus_tags else None
        except (json.JSONDecodeError, TypeError):
            focus_tags = None

        result.append({
            "id": p.id,
            "plan_type": p.plan_type,
            "goal": p.goal,
            "status": p.status,
            "notes": p.notes,
            "focus_tags": focus_tags,
            "round_plan_id": p.round_plan_id,
            "round_plan_info": round_plan_info,
            "range_session_id": p.range_session_id,
            "session_count": len(sessions),
            "total_activities": total_activities,
            "completed_activities": completed_activities,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })

    return result


@router.get("/plans/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    """Get full plan detail with sessions and activities."""
    return _plan_detail(db, plan_id)


@router.put("/plans/{plan_id}")
def update_plan(plan_id: int, req: UpdatePlanRequest, db: Session = Depends(get_db)):
    """Update plan metadata and optionally replace sessions/activities."""
    plan = db.query(PracticePlan).filter(PracticePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Practice plan not found")

    if req.goal is not None:
        plan.goal = req.goal
    if req.notes is not None:
        plan.notes = req.notes if req.notes.strip() else None
    if req.status is not None:
        plan.status = req.status
    if req.focus_tags is not None:
        plan.focus_tags = json.dumps(req.focus_tags) if req.focus_tags else None
    if req.range_session_id is not None:
        plan.range_session_id = req.range_session_id if req.range_session_id > 0 else None

    # If sessions provided, replace all sessions and activities
    if req.sessions is not None:
        # Delete existing sessions (cascades to activities)
        db.query(PracticeSession).filter(
            PracticeSession.practice_plan_id == plan.id
        ).delete()
        db.flush()

        for s in req.sessions:
            session = PracticeSession(
                practice_plan_id=plan.id,
                session_order=s.session_order,
                session_type=s.session_type,
                ball_count=s.ball_count,
                duration_minutes=s.duration_minutes,
                notes=s.notes,
            )
            db.add(session)
            db.flush()

            for a in s.activities:
                db.add(PracticeActivity(
                    session_id=session.id,
                    activity_order=a.activity_order,
                    club=a.club,
                    club_id=a.club_id,
                    ball_count=a.ball_count,
                    duration_minutes=a.duration_minutes,
                    focus_area=a.focus_area,
                    sg_category=a.sg_category,
                    rationale=a.rationale,
                    target_metric=a.target_metric,
                    notes=a.notes,
                ))

    db.commit()
    return _plan_detail(db, plan.id)


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    """Delete a practice plan and all its sessions/activities."""
    plan = db.query(PracticePlan).filter(PracticePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Practice plan not found")
    db.delete(plan)
    db.commit()
    return {"status": "ok"}


@router.patch("/plans/{plan_id}/activities/{activity_id}")
def toggle_activity(plan_id: int, activity_id: int, db: Session = Depends(get_db)):
    """Toggle an activity's completed status."""
    activity = (
        db.query(PracticeActivity)
        .join(PracticeSession)
        .filter(
            PracticeSession.practice_plan_id == plan_id,
            PracticeActivity.id == activity_id,
        )
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    activity.completed = not activity.completed
    db.commit()

    # Check if all activities are complete
    session_ids = [
        s.id for s in
        db.query(PracticeSession)
        .filter(PracticeSession.practice_plan_id == plan_id)
        .all()
    ]
    if session_ids:
        all_activities = (
            db.query(PracticeActivity)
            .filter(PracticeActivity.session_id.in_(session_ids))
            .all()
        )
        all_complete = all(a.completed for a in all_activities)
        if all_complete:
            plan = db.query(PracticePlan).filter(PracticePlan.id == plan_id).first()
            if plan:
                plan.status = "completed"
                db.commit()

    return {"completed": activity.completed}


class UpdateActivityRequest(BaseModel):
    club: Optional[str] = None
    club_id: Optional[int] = None
    drill_id: Optional[int] = None
    ball_count: Optional[int] = None
    duration_minutes: Optional[int] = None
    focus_area: Optional[str] = None
    target_metric: Optional[str] = None
    notes: Optional[str] = None
    rationale: Optional[str] = None


@router.put("/plans/{plan_id}/activities/{activity_id}")
def update_activity(plan_id: int, activity_id: int, req: UpdateActivityRequest, db: Session = Depends(get_db)):
    """Update individual activity fields on a saved plan."""
    activity = (
        db.query(PracticeActivity)
        .join(PracticeSession)
        .filter(
            PracticeSession.practice_plan_id == plan_id,
            PracticeActivity.id == activity_id,
        )
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    if req.club is not None:
        activity.club = req.club if req.club else None
    if req.club_id is not None:
        activity.club_id = req.club_id if req.club_id > 0 else None
    if req.drill_id is not None:
        activity.drill_id = req.drill_id if req.drill_id > 0 else None
    if req.ball_count is not None:
        activity.ball_count = req.ball_count if req.ball_count > 0 else None
    if req.duration_minutes is not None:
        activity.duration_minutes = req.duration_minutes if req.duration_minutes > 0 else None
    if req.focus_area is not None:
        activity.focus_area = req.focus_area
    if req.target_metric is not None:
        activity.target_metric = req.target_metric if req.target_metric.strip() else None
    if req.notes is not None:
        activity.notes = req.notes if req.notes.strip() else None
    if req.rationale is not None:
        activity.rationale = req.rationale if req.rationale.strip() else None

    db.commit()
    return {
        "id": activity.id,
        "club": activity.club,
        "club_id": activity.club_id,
        "drill_id": activity.drill_id,
        "ball_count": activity.ball_count,
        "focus_area": activity.focus_area,
        "target_metric": activity.target_metric,
        "notes": activity.notes,
    }


class AddActivityRequest(BaseModel):
    club: Optional[str] = None
    club_id: Optional[int] = None
    drill_id: Optional[int] = None
    ball_count: Optional[int] = None
    duration_minutes: Optional[int] = None
    focus_area: str = "distance_control"
    sg_category: Optional[str] = None
    rationale: Optional[str] = None
    target_metric: Optional[str] = None
    notes: Optional[str] = None


@router.post("/plans/{plan_id}/sessions/{session_id}/activities")
def add_activity(plan_id: int, session_id: int, req: AddActivityRequest, db: Session = Depends(get_db)):
    """Add a new activity to a session on a saved plan."""
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id, PracticeSession.practice_plan_id == plan_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get next activity_order
    max_order = (
        db.query(PracticeActivity.activity_order)
        .filter(PracticeActivity.session_id == session_id)
        .order_by(PracticeActivity.activity_order.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 1

    activity = PracticeActivity(
        session_id=session_id,
        activity_order=next_order,
        club=req.club,
        club_id=req.club_id,
        drill_id=req.drill_id,
        ball_count=req.ball_count,
        duration_minutes=req.duration_minutes,
        focus_area=req.focus_area,
        sg_category=req.sg_category,
        rationale=req.rationale,
        target_metric=req.target_metric,
        notes=req.notes,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return {
        "id": activity.id,
        "activity_order": activity.activity_order,
        "club": activity.club,
        "focus_area": activity.focus_area,
    }


@router.delete("/plans/{plan_id}/activities/{activity_id}")
def delete_activity(plan_id: int, activity_id: int, db: Session = Depends(get_db)):
    """Remove an activity from a saved plan."""
    activity = (
        db.query(PracticeActivity)
        .join(PracticeSession)
        .filter(
            PracticeSession.practice_plan_id == plan_id,
            PracticeActivity.id == activity_id,
        )
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    db.delete(activity)
    db.commit()
    return {"status": "ok"}


@router.get("/plans/{plan_id}/review")
def get_plan_review(plan_id: int, db: Session = Depends(get_db)):
    """Get before/after comparison for a completed practice plan."""
    from app.services.practice_recommendation_service import (
        _build_miss_analysis, _build_proximity_analysis,
        _build_scoring_pattern_analysis,
    )

    plan = db.query(PracticePlan).filter(PracticePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # "Before" — from analysis_snapshot saved at generation time
    before = {}
    if plan.analysis_snapshot:
        try:
            before = json.loads(plan.analysis_snapshot)
        except (json.JSONDecodeError, TypeError):
            pass

    # "After" — fresh analysis of current data
    after_miss = _build_miss_analysis(db)
    after_prox = _build_proximity_analysis(db)
    after_scoring = _build_scoring_pattern_analysis(db)

    # Build deltas
    deltas = {}

    # SG category deltas
    if before.get("sg_by_category"):
        sg_deltas = []
        for cat_before in before["sg_by_category"]:
            cat_name = cat_before["category"]
            before_val = cat_before.get("sg_per_round", 0)
            # We don't have after SG directly here since we'd need to recompute —
            # for now just show the before snapshot. Full delta needs the fresh SG computation.
            sg_deltas.append({
                "category": cat_name,
                "label": cat_before.get("label", cat_name),
                "before": before_val,
            })
        deltas["sg_categories"] = sg_deltas

    # Scoring pattern deltas (only practice-relevant stats)
    if before.get("scoring_patterns") and after_scoring:
        bp = before["scoring_patterns"]
        deltas["scoring"] = {
            "three_putt_before": bp.get("three_putt_rate"),
            "three_putt_after": after_scoring.get("three_putt_rate"),
        }

    # Linked range session stats
    if plan.range_session_id:
        from app.models import RangeShot, RangeSession
        from app.models.trackman_shot import TrackmanShot as TmShot
        rs = db.query(RangeSession).filter(RangeSession.id == plan.range_session_id).first()
        if rs:
            session_stats = {"session_date": rs.session_date.isoformat() if rs.session_date else None,
                             "title": rs.title, "shot_count": rs.shot_count, "clubs": {}}

            # Get per-club stats from this session
            range_shots = (
                db.query(RangeShot)
                .filter(RangeShot.session_id == rs.id, RangeShot.club_id.isnot(None))
                .all()
            )
            tm_shots = (
                db.query(TmShot)
                .filter(TmShot.session_id == rs.id, TmShot.club_id.isnot(None))
                .all()
            )

            from app.models import Club
            club_id_to_name = {c.id: c.club_type for c in db.query(Club).all()}
            club_data = defaultdict(lambda: {"carries": [], "laterals": [], "speeds": []})

            for s in range_shots:
                name = club_id_to_name.get(s.club_id, "Unknown")
                if s.carry_yards: club_data[name]["carries"].append(s.carry_yards)
                if s.side_carry_yards: club_data[name]["laterals"].append(s.side_carry_yards)
                if s.ball_speed_mph: club_data[name]["speeds"].append(s.ball_speed_mph)

            for s in tm_shots:
                name = club_id_to_name.get(s.club_id, "Unknown")
                if s.carry_yards: club_data[name]["carries"].append(s.carry_yards)
                if s.side_carry_yards: club_data[name]["laterals"].append(s.side_carry_yards)
                if s.ball_speed_mph: club_data[name]["speeds"].append(s.ball_speed_mph)

            import statistics
            for club_name, data in club_data.items():
                entry = {"shot_count": len(data["carries"])}
                if data["carries"]:
                    entry["avg_carry"] = round(statistics.mean(data["carries"]), 1)
                    entry["std_carry"] = round(statistics.stdev(data["carries"]), 1) if len(data["carries"]) >= 2 else 0
                if data["laterals"]:
                    entry["avg_lateral"] = round(statistics.mean(data["laterals"]), 1)
                    entry["lateral_std"] = round(statistics.stdev(data["laterals"]), 1) if len(data["laterals"]) >= 2 else 0
                if data["speeds"]:
                    entry["avg_ball_speed"] = round(statistics.mean(data["speeds"]), 1)
                session_stats["clubs"][club_name] = entry

            deltas["range_session"] = session_stats

    # Miss direction deltas
    if before.get("miss_highlights") and after_miss:
        miss_deltas = []
        for mb in before["miss_highlights"]:
            club = mb["club"]
            after_club = after_miss.get(club)
            if after_club and after_club.get("course_miss"):
                ac = after_club["course_miss"]
                miss_deltas.append({
                    "club": club,
                    "before_pct": mb["pct"],
                    "before_side": mb["dominant"],
                    "after_pct": ac.get("left_pct") if mb["dominant"] == "left" else ac.get("right_pct"),
                    "after_dominant": ac.get("dominant"),
                })
        deltas["miss_direction"] = miss_deltas

    # Gap deltas
    if before.get("range_course_gaps"):
        from app.services.club_stats_service import compute_windowed_club_stats
        # Compare current gaps
        from app.models import ClubStats, Club
        gap_deltas = []
        for gb in before["range_course_gaps"]:
            cs = db.query(ClubStats).filter(ClubStats.club_id == gb["club_id"]).first()
            if cs and cs.avg_yards and cs.range_avg_yards:
                current_gap = round(cs.range_avg_yards - cs.avg_yards, 1)
                gap_deltas.append({
                    "club": gb["club_name"],
                    "before_gap": gb["gap"],
                    "after_gap": current_gap,
                    "trend": "closing" if abs(current_gap) < abs(gb["gap"]) else "widening" if abs(current_gap) > abs(gb["gap"]) else "stable",
                })
        deltas["gaps"] = gap_deltas

    return {
        "plan_id": plan_id,
        "status": plan.status,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "before": before,
        "deltas": deltas,
    }


@router.get("/round-plans-available")
def round_plans_available(db: Session = Depends(get_db)):
    """List RoundPlans that are still active or draft (for wizard dropdown)."""
    plans = (
        db.query(RoundPlan)
        .filter(RoundPlan.status.in_(["draft", "active"]))
        .order_by(RoundPlan.created_at.desc())
        .all()
    )

    result = []
    for p in plans:
        course = db.query(Course).filter(Course.id == p.course_id).first()
        golf_club = db.query(GolfClub).filter(GolfClub.id == course.golf_club_id).first() if course else None
        course_name = golf_club.name if golf_club else ""
        if course and course.name:
            course_name = f"{course_name} — {course.name}" if course_name else course.name

        result.append({
            "id": p.id,
            "name": p.name,
            "course_name": course_name,
            "planned_date": p.planned_date.isoformat() if p.planned_date else None,
            "status": p.status,
        })

    return result


# ── Helpers ───────────────────────────────────────────────────────────

def _plan_detail(db: Session, plan_id: int) -> dict:
    """Serialize a practice plan with all sessions and activities."""
    plan = (
        db.query(PracticePlan)
        .options(
            joinedload(PracticePlan.sessions).joinedload(PracticeSession.activities)
        )
        .filter(PracticePlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Practice plan not found")

    # Get round plan info if linked
    round_plan_info = None
    if plan.round_plan_id:
        rp = db.query(RoundPlan).filter(RoundPlan.id == plan.round_plan_id).first()
        if rp:
            course = db.query(Course).filter(Course.id == rp.course_id).first()
            golf_club = db.query(GolfClub).filter(GolfClub.id == course.golf_club_id).first() if course else None
            course_name = golf_club.name if golf_club else ""
            if course and course.name:
                course_name = f"{course_name} — {course.name}" if course_name else course.name
            round_plan_info = {
                "id": rp.id,
                "name": rp.name,
                "course_name": course_name,
                "planned_date": rp.planned_date.isoformat() if rp.planned_date else None,
            }

    # Parse analysis snapshot
    analysis = None
    if plan.analysis_snapshot:
        try:
            analysis = json.loads(plan.analysis_snapshot)
        except (json.JSONDecodeError, TypeError):
            pass

    # Parse focus_tags
    focus_tags = None
    if plan.focus_tags:
        try:
            focus_tags = json.loads(plan.focus_tags)
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "id": plan.id,
        "plan_type": plan.plan_type,
        "goal": plan.goal,
        "status": plan.status,
        "notes": plan.notes,
        "focus_tags": focus_tags,
        "round_plan_id": plan.round_plan_id,
        "round_plan_info": round_plan_info,
        "range_session_id": plan.range_session_id,
        "analysis": analysis,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
        "sessions": [
            {
                "id": s.id,
                "session_order": s.session_order,
                "session_type": s.session_type,
                "ball_count": s.ball_count,
                "duration_minutes": s.duration_minutes,
                "notes": s.notes,
                "activities": [
                    {
                        "id": a.id,
                        "activity_order": a.activity_order,
                        "club": a.club,
                        "club_id": a.club_id,
                        "drill_id": a.drill_id,
                        "drill_name": a.drill.name if a.drill else None,
                        "drill_description": a.drill.description if a.drill else None,
                        "ball_count": a.ball_count,
                        "duration_minutes": a.duration_minutes,
                        "focus_area": a.focus_area,
                        "sg_category": a.sg_category,
                        "rationale": a.rationale,
                        "target_metric": a.target_metric,
                        "notes": a.notes,
                        "completed": a.completed,
                    }
                    for a in (s.activities or [])
                ],
            }
            for s in (plan.sessions or [])
        ],
    }
