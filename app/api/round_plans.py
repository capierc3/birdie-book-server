from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sql_func
from pydantic import BaseModel
from datetime import date
from typing import Optional

from app.database import get_db
from app.models import (
    RoundPlan, RoundPlanHole, RoundPlanShot,
    Course, CourseTee, CourseHole, Round, RoundHole, Shot,
)

router = APIRouter(prefix="/api/plans", tags=["plans"])


# --- Pydantic schemas ---

class PlanShotResponse(BaseModel):
    id: int
    shot_number: int
    club: Optional[str] = None
    aim_lat: Optional[float] = None
    aim_lng: Optional[float] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class PlanHoleResponse(BaseModel):
    id: int
    hole_number: int
    goal_score: Optional[int] = None
    strategy_notes: Optional[str] = None
    shots: list[PlanShotResponse] = []

    class Config:
        from_attributes = True


class PlanSummaryResponse(BaseModel):
    id: int
    course_id: int
    tee_id: int
    round_id: Optional[int] = None
    name: str
    planned_date: Optional[date] = None
    status: str
    focus_areas: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class PlanDetailResponse(PlanSummaryResponse):
    holes: list[PlanHoleResponse] = []


class CreatePlanRequest(BaseModel):
    course_id: int
    tee_id: int
    name: str
    planned_date: Optional[date] = None
    notes: Optional[str] = None
    focus_areas: Optional[str] = None


class UpdatePlanRequest(BaseModel):
    name: Optional[str] = None
    planned_date: Optional[date] = None
    status: Optional[str] = None
    score_goal: Optional[int] = None
    notes: Optional[str] = None
    focus_areas: Optional[str] = None
    round_id: Optional[int] = None


class UpdatePlanHoleRequest(BaseModel):
    goal_score: Optional[int] = None
    strategy_notes: Optional[str] = None


class PlanShotInput(BaseModel):
    shot_number: int
    club: Optional[str] = None
    aim_lat: Optional[float] = None
    aim_lng: Optional[float] = None
    notes: Optional[str] = None


class UpdatePlanShotsRequest(BaseModel):
    shots: list[PlanShotInput]


# --- Endpoints ---

@router.get("")
def list_plans(course_id: int, db: Session = Depends(get_db)):
    """List all plans for a course."""
    plans = (
        db.query(RoundPlan)
        .filter(RoundPlan.course_id == course_id)
        .order_by(RoundPlan.created_at.desc())
        .all()
    )
    return [
        {
            "id": p.id,
            "course_id": p.course_id,
            "tee_id": p.tee_id,
            "round_id": p.round_id,
            "name": p.name,
            "planned_date": p.planned_date.isoformat() if p.planned_date else None,
            "status": p.status,
            "focus_areas": p.focus_areas,
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in plans
    ]


@router.post("")
def create_plan(req: CreatePlanRequest, db: Session = Depends(get_db)):
    """Create a new round plan with auto-generated hole rows."""
    tee = db.query(CourseTee).filter(CourseTee.id == req.tee_id).first()
    if not tee or tee.course_id != req.course_id:
        raise HTTPException(status_code=400, detail="Invalid tee for this course")

    plan = RoundPlan(
        course_id=req.course_id,
        tee_id=req.tee_id,
        name=req.name,
        planned_date=req.planned_date,
        notes=req.notes,
        focus_areas=req.focus_areas,
        status="draft",
    )
    db.add(plan)
    db.flush()

    # Create a hole row for each course hole on this tee
    course_holes = (
        db.query(CourseHole)
        .filter(CourseHole.tee_id == req.tee_id)
        .order_by(CourseHole.hole_number)
        .all()
    )
    for ch in course_holes:
        db.add(RoundPlanHole(plan_id=plan.id, hole_number=ch.hole_number))

    db.commit()
    db.refresh(plan)
    return _plan_detail(plan)


@router.get("/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    """Get full plan detail with holes and shots."""
    plan = (
        db.query(RoundPlan)
        .options(
            joinedload(RoundPlan.holes).joinedload(RoundPlanHole.shots)
        )
        .filter(RoundPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _plan_detail(plan)


@router.put("/{plan_id}")
def update_plan(plan_id: int, req: UpdatePlanRequest, db: Session = Depends(get_db)):
    """Update plan metadata."""
    plan = db.query(RoundPlan).filter(RoundPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if req.name is not None:
        plan.name = req.name
    if req.planned_date is not None:
        plan.planned_date = req.planned_date
    if req.status is not None:
        plan.status = req.status
    if req.score_goal is not None:
        # 0 / negative clears it (lets the UI "remove goal" with one input).
        plan.score_goal = req.score_goal if req.score_goal > 0 else None
    if req.notes is not None:
        plan.notes = req.notes if req.notes.strip() else None
    if req.focus_areas is not None:
        plan.focus_areas = req.focus_areas if req.focus_areas.strip() else None
    if req.round_id is not None:
        plan.round_id = req.round_id if req.round_id > 0 else None
        if req.round_id > 0 and req.status is None:
            plan.status = "played"

    db.commit()
    db.refresh(plan)
    return {"status": "ok", "id": plan.id}


@router.delete("/{plan_id}")
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    """Delete a plan and all its holes/shots."""
    plan = db.query(RoundPlan).filter(RoundPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(plan)
    db.commit()
    return {"status": "ok"}


@router.put("/{plan_id}/holes/{hole_number}")
def update_plan_hole(plan_id: int, hole_number: int, req: UpdatePlanHoleRequest, db: Session = Depends(get_db)):
    """Update goal score or strategy notes for a plan hole."""
    hole = (
        db.query(RoundPlanHole)
        .filter(RoundPlanHole.plan_id == plan_id, RoundPlanHole.hole_number == hole_number)
        .first()
    )
    if not hole:
        raise HTTPException(status_code=404, detail="Plan hole not found")

    if req.goal_score is not None:
        hole.goal_score = req.goal_score if req.goal_score > 0 else None
    if req.strategy_notes is not None:
        hole.strategy_notes = req.strategy_notes.strip() if req.strategy_notes.strip() else None

    db.commit()
    return {"status": "ok"}


@router.put("/{plan_id}/holes/{hole_number}/shots")
def update_plan_shots(plan_id: int, hole_number: int, req: UpdatePlanShotsRequest, db: Session = Depends(get_db)):
    """Replace the planned shot sequence for a hole."""
    hole = (
        db.query(RoundPlanHole)
        .filter(RoundPlanHole.plan_id == plan_id, RoundPlanHole.hole_number == hole_number)
        .first()
    )
    if not hole:
        raise HTTPException(status_code=404, detail="Plan hole not found")

    # Delete existing shots
    db.query(RoundPlanShot).filter(RoundPlanShot.plan_hole_id == hole.id).delete()

    # Insert new shots
    for s in req.shots:
        db.add(RoundPlanShot(
            plan_hole_id=hole.id,
            shot_number=s.shot_number,
            club=s.club,
            aim_lat=s.aim_lat,
            aim_lng=s.aim_lng,
            notes=s.notes,
        ))

    db.commit()

    # Return updated shots
    shots = (
        db.query(RoundPlanShot)
        .filter(RoundPlanShot.plan_hole_id == hole.id)
        .order_by(RoundPlanShot.shot_number)
        .all()
    )
    return [
        {"id": s.id, "shot_number": s.shot_number, "club": s.club,
         "aim_lat": s.aim_lat, "aim_lng": s.aim_lng, "notes": s.notes}
        for s in shots
    ]


@router.get("/{plan_id}/insights")
def get_plan_insights(plan_id: int, db: Session = Depends(get_db)):
    """Data-driven per-hole insights for round planning."""
    plan = db.query(RoundPlan).filter(RoundPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Get all course holes for this tee
    course_holes = (
        db.query(CourseHole)
        .filter(CourseHole.tee_id == plan.tee_id)
        .all()
    )
    hole_numbers = [ch.hole_number for ch in course_holes]

    # Get all rounds on this course/tee that aren't excluded
    rounds = (
        db.query(Round)
        .filter(
            Round.course_id == plan.course_id,
            Round.tee_id == plan.tee_id,
            Round.exclude_from_stats == False,  # noqa: E712
        )
        .all()
    )
    round_ids = [r.id for r in rounds]

    if not round_ids:
        return {"holes": {}}

    # Get all round holes for these rounds
    round_holes = (
        db.query(RoundHole)
        .filter(RoundHole.round_id.in_(round_ids))
        .all()
    )

    # Get tee shots (shot_number=1) for each hole
    tee_shots = (
        db.query(Shot)
        .filter(
            Shot.round_id.in_(round_ids),
            Shot.shot_number == 1,
        )
        .all()
    )

    # Build round_hole lookup: (round_id, hole_number) -> RoundHole
    rh_map = {}
    for rh in round_holes:
        rh_map[(rh.round_id, rh.hole_number)] = rh

    # Build tee shot lookup: (round_id, hole_number) -> Shot
    # Need to join through round_hole to get hole_number
    rh_id_to_info = {}
    for rh in round_holes:
        rh_id_to_info[rh.id] = (rh.round_id, rh.hole_number)

    tee_shot_map = {}  # (round_id, hole_number) -> Shot
    for s in tee_shots:
        info = rh_id_to_info.get(s.round_hole_id)
        if info:
            tee_shot_map[info] = s

    insights = {}
    for hn in hole_numbers:
        hole_rhs = [(rid, rh_map[(rid, hn)]) for rid in round_ids if (rid, hn) in rh_map]
        if not hole_rhs:
            continue

        # Scoring stats
        scores = [rh.strokes for _, rh in hole_rhs if rh.strokes and rh.strokes > 0]
        if not scores:
            continue

        avg_score = sum(scores) / len(scores)
        best_score = min(scores)
        par = next((ch.par for ch in course_holes if ch.hole_number == hn), 4)

        # Scoring distribution
        dist = {"eagle": 0, "birdie": 0, "par": 0, "bogey": 0, "double_plus": 0}
        for sc in scores:
            diff = sc - par
            if diff <= -2:
                dist["eagle"] += 1
            elif diff == -1:
                dist["birdie"] += 1
            elif diff == 0:
                dist["par"] += 1
            elif diff == 1:
                dist["bogey"] += 1
            else:
                dist["double_plus"] += 1

        # Club-score correlation for tee shots
        club_scores = {}  # club -> [scores]
        club_fw = {}  # club -> {"hit": 0, "miss": 0}
        for rid, rh in hole_rhs:
            ts = tee_shot_map.get((rid, hn))
            if ts and ts.club and rh.strokes and rh.strokes > 0:
                club_scores.setdefault(ts.club, []).append(rh.strokes)
                if rh.fairway is not None:
                    club_fw.setdefault(ts.club, {"hit": 0, "miss": 0})
                    if rh.fairway == "HIT":
                        club_fw[ts.club]["hit"] += 1
                    else:
                        club_fw[ts.club]["miss"] += 1

        club_data = []
        for club, sc_list in club_scores.items():
            fw_info = club_fw.get(club, {"hit": 0, "miss": 0})
            total_fw = fw_info["hit"] + fw_info["miss"]
            club_data.append({
                "club": club,
                "avg_score": round(sum(sc_list) / len(sc_list), 2),
                "rounds": len(sc_list),
                "fw_pct": round(fw_info["hit"] / total_fw * 100) if total_fw > 0 else None,
            })
        club_data.sort(key=lambda x: x["avg_score"])

        best_tee_club = club_data[0] if club_data else None

        # Fairway impact on scoring
        fw_hit_scores = [rh.strokes for _, rh in hole_rhs if rh.fairway == "HIT" and rh.strokes and rh.strokes > 0]
        fw_miss_scores = [rh.strokes for _, rh in hole_rhs if rh.fairway in ("LEFT", "RIGHT") and rh.strokes and rh.strokes > 0]

        fairway_impact = None
        if fw_hit_scores and fw_miss_scores:
            hit_avg = sum(fw_hit_scores) / len(fw_hit_scores)
            miss_avg = sum(fw_miss_scores) / len(fw_miss_scores)
            fairway_impact = {
                "hit_avg": round(hit_avg, 2),
                "miss_avg": round(miss_avg, 2),
                "savings": round(miss_avg - hit_avg, 2),
            }

        insights[str(hn)] = {
            "avg_score": round(avg_score, 2),
            "best_score": best_score,
            "par": par,
            "rounds_played": len(scores),
            "scoring_dist": dist,
            "best_tee_club": best_tee_club,
            "club_scores": club_data,
            "fairway_impact": fairway_impact,
        }

    return {"holes": insights}


# --- Helpers ---

def _plan_detail(plan: RoundPlan) -> dict:
    """Serialize a plan with all holes and shots."""
    return {
        "id": plan.id,
        "course_id": plan.course_id,
        "tee_id": plan.tee_id,
        "round_id": plan.round_id,
        "name": plan.name,
        "planned_date": plan.planned_date.isoformat() if plan.planned_date else None,
        "status": plan.status,
        "score_goal": plan.score_goal,
        "focus_areas": plan.focus_areas,
        "notes": plan.notes,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "holes": [
            {
                "id": h.id,
                "hole_number": h.hole_number,
                "goal_score": h.goal_score,
                "strategy_notes": h.strategy_notes,
                "shots": [
                    {
                        "id": s.id,
                        "shot_number": s.shot_number,
                        "club": s.club,
                        "aim_lat": s.aim_lat,
                        "aim_lng": s.aim_lng,
                        "notes": s.notes,
                    }
                    for s in (h.shots or [])
                ],
            }
            for h in (plan.holes or [])
        ],
    }
