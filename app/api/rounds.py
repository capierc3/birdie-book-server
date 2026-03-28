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
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    distance_yards: Optional[float] = None

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
    date: date
    holes_completed: Optional[int] = None
    total_strokes: Optional[int] = None
    score_vs_par: Optional[int] = None
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None
    shots_tracked: Optional[int] = None
    source: Optional[str] = None

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
            tee_name=None,
            date=r.date,
            holes_completed=r.holes_completed,
            total_strokes=r.total_strokes,
            score_vs_par=r.score_vs_par,
            course_rating=r.course_rating,
            slope_rating=r.slope_rating,
            shots_tracked=r.shots_tracked,
            source=r.source,
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
        tee_name=None,
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
