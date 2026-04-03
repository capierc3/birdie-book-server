from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from datetime import date
from typing import Optional

from app.database import get_db
from app.models import Round, RoundHole, Shot

router = APIRouter(prefix="/api/rounds", tags=["rounds"])


# --- Pydantic response schemas ---

class ShotResponse(BaseModel):
    id: int
    shot_number: int
    club: Optional[str] = None
    shot_type: Optional[str] = None
    start_lie: Optional[str] = None
    end_lie: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    distance_yards: Optional[float] = None
    # Computed spatial metrics
    pin_distance_yards: Optional[float] = None
    fairway_side: Optional[str] = None
    fairway_side_yards: Optional[float] = None
    fairway_progress_yards: Optional[float] = None
    nearest_hazard_type: Optional[str] = None
    nearest_hazard_name: Optional[str] = None
    nearest_hazard_yards: Optional[float] = None
    green_distance_yards: Optional[float] = None
    on_green: Optional[bool] = None
    sg_pga: Optional[float] = None
    sg_personal: Optional[float] = None

    class Config:
        from_attributes = True


class RoundHoleResponse(BaseModel):
    id: int
    hole_number: int
    strokes: Optional[int] = None
    handicap_strokes: Optional[int] = None
    putts: Optional[int] = None
    fairway: Optional[str] = None
    gir: Optional[bool] = None
    penalty_strokes: int = 0
    shots: list[ShotResponse] = []

    class Config:
        from_attributes = True


class RoundSummaryResponse(BaseModel):
    id: int
    garmin_id: Optional[int] = None
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    tee_name: Optional[str] = None
    tee_id: Optional[int] = None
    date: date
    holes_completed: Optional[int] = None
    total_strokes: Optional[int] = None
    score_vs_par: Optional[int] = None
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None
    shots_tracked: Optional[int] = None
    source: Optional[str] = None
    exclude_from_stats: bool = False
    game_format: Optional[str] = None

    class Config:
        from_attributes = True


class RoundDetailResponse(RoundSummaryResponse):
    handicapped_strokes: Optional[int] = None
    player_handicap: Optional[float] = None
    session_type: Optional[str] = None
    game_format: Optional[str] = None
    weather_temp_f: Optional[float] = None
    weather_description: Optional[str] = None
    overall_rating: Optional[int] = None
    key_takeaway: Optional[str] = None
    holes: list[RoundHoleResponse] = []

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("/", response_model=list[RoundSummaryResponse])
def list_rounds(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    rounds = (db.query(Round)
              .order_by(Round.date.desc())
              .offset(skip).limit(limit)
              .all())

    results = []
    for r in rounds:
        results.append(RoundSummaryResponse(
            id=r.id,
            garmin_id=r.garmin_id,
            course_id=r.course_id,
            course_name=r.course.display_name if r.course else None,
            tee_name=r.tee.tee_name if r.tee_id and r.tee else None,
            tee_id=r.tee_id,
            date=r.date,
            holes_completed=r.holes_completed,
            total_strokes=r.total_strokes,
            score_vs_par=r.score_vs_par,
            course_rating=r.course_rating,
            slope_rating=r.slope_rating,
            shots_tracked=r.shots_tracked,
            source=r.source,
            exclude_from_stats=r.exclude_from_stats or False,
            game_format=r.game_format,
        ))
    return results


@router.get("/{round_id}", response_model=RoundDetailResponse)
def get_round(round_id: int, db: Session = Depends(get_db)):
    r = (db.query(Round)
         .options(joinedload(Round.holes).joinedload(RoundHole.shots))
         .filter(Round.id == round_id)
         .first())

    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    return RoundDetailResponse(
        id=r.id,
        garmin_id=r.garmin_id,
        course_id=r.course_id,
        course_name=r.course.display_name if r.course else None,
        tee_name=r.tee.tee_name if r.tee_id and r.tee else None,
        tee_id=r.tee_id,
        date=r.date,
        holes_completed=r.holes_completed,
        total_strokes=r.total_strokes,
        score_vs_par=r.score_vs_par,
        course_rating=r.course_rating,
        slope_rating=r.slope_rating,
        shots_tracked=r.shots_tracked,
        source=r.source,
        handicapped_strokes=r.handicapped_strokes,
        player_handicap=r.player_handicap,
        session_type=r.session_type,
        game_format=r.game_format,
        weather_temp_f=r.weather_temp_f,
        weather_description=r.weather_description,
        overall_rating=r.overall_rating,
        key_takeaway=r.key_takeaway,
        holes=[RoundHoleResponse(
            id=h.id,
            hole_number=h.hole_number,
            strokes=h.strokes,
            handicap_strokes=h.handicap_strokes,
            putts=h.putts,
            fairway=h.fairway,
            gir=h.gir,
            penalty_strokes=h.penalty_strokes,
            shots=[ShotResponse.model_validate(s) for s in sorted(h.shots, key=lambda s: s.shot_number)],
        ) for h in sorted(r.holes, key=lambda x: x.hole_number)],
    )


class RoundUpdate(BaseModel):
    game_format: Optional[str] = None
    exclude_from_stats: Optional[bool] = None
    tee_id: Optional[int] = None


@router.patch("/{round_id}")
def update_round(round_id: int, body: RoundUpdate, db: Session = Depends(get_db)):
    """Update round metadata (game format, exclude from stats)."""
    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    exclude_changed = False
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "exclude_from_stats" and getattr(r, field) != value:
            exclude_changed = True
        setattr(r, field, value)

    db.commit()

    # Recompute stats if exclusion changed
    if exclude_changed:
        from app.services.club_stats_service import compute_club_stats
        compute_club_stats(db)

    return {"status": "updated", "round_id": round_id}


@router.post("/{round_id}/recalc")
def recalc_round(round_id: int, db: Session = Depends(get_db)):
    """Recalculate computed spatial metrics for all shots in a round."""
    from app.services.course_calc_service import recalc_round_shots

    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    count = recalc_round_shots(db, round_id)
    return {"status": "ok", "shots_updated": count}
