from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field
from datetime import date as DateType, datetime
from typing import Optional

from app.database import get_db
from app.models import (
    PlaySession, PlaySessionPartner, PlaySessionWeatherSample,
    Course, CourseTee, GolfClub, Player,
)
from app.services.active_user import get_active_player
from app.services.weather_service import fetch_current_weather, WeatherFetchError

router = APIRouter(prefix="/api/play-sessions", tags=["play-sessions"])


VALID_STATES = {"PRE", "ACTIVE", "COMPLETE", "ABANDONED"}


# --- Pydantic schemas ---

class PartnerIn(BaseModel):
    player_id: Optional[int] = None
    player_name: str
    is_teammate: bool = False


class PartnerOut(PartnerIn):
    id: int

    class Config:
        from_attributes = True


class WeatherSampleOut(BaseModel):
    id: int
    hole_number: Optional[int] = None
    sampled_at: datetime
    temp_f: Optional[float] = None
    wind_speed_mph: Optional[float] = None
    wind_gust_mph: Optional[float] = None
    wind_dir_deg: Optional[int] = None
    wind_dir_cardinal: Optional[str] = None
    precipitation_in: Optional[float] = None
    weather_code: Optional[int] = None
    weather_desc: Optional[str] = None
    humidity_pct: Optional[float] = None
    pressure_mb: Optional[float] = None

    class Config:
        from_attributes = True


class PlaySessionSummary(BaseModel):
    id: int
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    tee_id: Optional[int] = None
    tee_name: Optional[str] = None
    date: DateType
    game_format: Optional[str] = None
    holes_played: Optional[int] = None
    state: str
    score: Optional[int] = None
    overall_rating: Optional[int] = None
    garmin_round_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PlaySessionDetail(PlaySessionSummary):
    energy_rating: Optional[int] = None
    focus_rating: Optional[int] = None
    physical_rating: Optional[int] = None
    pre_session_notes: Optional[str] = None
    session_goals: Optional[str] = None
    clubs_focused: Optional[str] = None
    what_worked: Optional[str] = None
    what_struggled: Optional[str] = None
    key_takeaway: Optional[str] = None
    next_focus: Optional[str] = None
    post_session_notes: Optional[str] = None
    partners: list[PartnerOut] = []
    weather_samples: list[WeatherSampleOut] = []


class PlaySessionCreate(BaseModel):
    course_id: Optional[int] = None
    tee_id: Optional[int] = None
    date: Optional[DateType] = None
    game_format: Optional[str] = "STROKE_PLAY"
    holes_played: Optional[int] = 18
    # Optional pre-round fields at creation
    energy_rating: Optional[int] = None
    focus_rating: Optional[int] = None
    physical_rating: Optional[int] = None
    pre_session_notes: Optional[str] = None
    session_goals: Optional[str] = None
    clubs_focused: Optional[str] = None
    partners: list[PartnerIn] = Field(default_factory=list)


class PlaySessionUpdate(BaseModel):
    course_id: Optional[int] = None
    tee_id: Optional[int] = None
    date: Optional[DateType] = None
    game_format: Optional[str] = None
    holes_played: Optional[int] = None
    state: Optional[str] = None

    energy_rating: Optional[int] = None
    focus_rating: Optional[int] = None
    physical_rating: Optional[int] = None
    pre_session_notes: Optional[str] = None
    session_goals: Optional[str] = None
    clubs_focused: Optional[str] = None

    overall_rating: Optional[int] = None
    what_worked: Optional[str] = None
    what_struggled: Optional[str] = None
    key_takeaway: Optional[str] = None
    next_focus: Optional[str] = None
    post_session_notes: Optional[str] = None
    score: Optional[int] = None

    garmin_round_id: Optional[int] = None


# --- Helpers ---

def _to_summary(s: PlaySession) -> PlaySessionSummary:
    return PlaySessionSummary(
        id=s.id,
        course_id=s.course_id,
        course_name=s.course.display_name if s.course else None,
        tee_id=s.tee_id,
        tee_name=s.tee.tee_name if s.tee else None,
        date=s.date,
        game_format=s.game_format,
        holes_played=s.holes_played,
        state=s.state,
        score=s.score,
        overall_rating=s.overall_rating,
        garmin_round_id=s.garmin_round_id,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _to_detail(s: PlaySession) -> PlaySessionDetail:
    summary = _to_summary(s)
    return PlaySessionDetail(
        **summary.model_dump(),
        energy_rating=s.energy_rating,
        focus_rating=s.focus_rating,
        physical_rating=s.physical_rating,
        pre_session_notes=s.pre_session_notes,
        session_goals=s.session_goals,
        clubs_focused=s.clubs_focused,
        what_worked=s.what_worked,
        what_struggled=s.what_struggled,
        key_takeaway=s.key_takeaway,
        next_focus=s.next_focus,
        post_session_notes=s.post_session_notes,
        partners=[PartnerOut.model_validate(p) for p in s.partners],
        weather_samples=[WeatherSampleOut.model_validate(w) for w in s.weather_samples],
    )


# --- Endpoints ---

@router.get("/", response_model=list[PlaySessionSummary])
def list_play_sessions(
    state: Optional[str] = Query(None, description="Filter by state (PRE, ACTIVE, COMPLETE, ABANDONED). Comma-separated for multiple."),
    course_id: Optional[int] = None,
    unlinked: Optional[bool] = Query(None, description="If true, only sessions with no Garmin round linked."),
    limit: int = 100,
    skip: int = 0,
    db: Session = Depends(get_db),
):
    q = (
        db.query(PlaySession)
        .options(joinedload(PlaySession.course), joinedload(PlaySession.tee))
        .order_by(PlaySession.updated_at.desc())
    )

    if state:
        states = [s.strip() for s in state.split(",") if s.strip()]
        bad = [s for s in states if s not in VALID_STATES]
        if bad:
            raise HTTPException(status_code=400, detail=f"Invalid state(s): {bad}")
        q = q.filter(PlaySession.state.in_(states))

    if course_id is not None:
        q = q.filter(PlaySession.course_id == course_id)

    if unlinked is True:
        q = q.filter(PlaySession.garmin_round_id.is_(None))
    elif unlinked is False:
        q = q.filter(PlaySession.garmin_round_id.isnot(None))

    sessions = q.offset(skip).limit(limit).all()
    return [_to_summary(s) for s in sessions]


@router.get("/{session_id}", response_model=PlaySessionDetail)
def get_play_session(session_id: int, db: Session = Depends(get_db)):
    s = (
        db.query(PlaySession)
        .options(
            joinedload(PlaySession.course),
            joinedload(PlaySession.tee),
            joinedload(PlaySession.partners),
            joinedload(PlaySession.weather_samples),
        )
        .filter(PlaySession.id == session_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")
    return _to_detail(s)


@router.post("/", response_model=PlaySessionDetail)
def create_play_session(body: PlaySessionCreate, db: Session = Depends(get_db)):
    # Validate course and tee if provided
    if body.course_id is not None:
        if not db.query(Course).filter(Course.id == body.course_id).first():
            raise HTTPException(status_code=400, detail="course_id not found")
    if body.tee_id is not None:
        if not db.query(CourseTee).filter(CourseTee.id == body.tee_id).first():
            raise HTTPException(status_code=400, detail="tee_id not found")

    me = get_active_player(db)

    s = PlaySession(
        player_id=me.id,
        course_id=body.course_id,
        tee_id=body.tee_id,
        date=body.date or DateType.today(),
        game_format=body.game_format or "STROKE_PLAY",
        holes_played=body.holes_played if body.holes_played is not None else 18,
        state="PRE",
        energy_rating=body.energy_rating,
        focus_rating=body.focus_rating,
        physical_rating=body.physical_rating,
        pre_session_notes=body.pre_session_notes,
        session_goals=body.session_goals,
        clubs_focused=body.clubs_focused,
    )
    db.add(s)
    db.flush()

    # Resolve each partner's name to a Player row (creating one if needed) so
    # we can later show "rounds played with X" rollups. Self-as-partner is
    # rejected — Player 1 is implicit.
    for p in body.partners:
        partner_name = (p.player_name or "").strip()
        if not partner_name:
            continue
        if partner_name.lower() == me.name.lower():
            continue

        player_row: Player | None = None
        if p.player_id is not None:
            player_row = db.query(Player).filter(Player.id == p.player_id).first()
        if player_row is None:
            player_row = db.query(Player).filter(Player.name.ilike(partner_name)).first()
        if player_row is None:
            player_row = Player(name=partner_name, is_app_user=False)
            db.add(player_row)
            db.flush()

        db.add(PlaySessionPartner(
            session_id=s.id,
            player_id=player_row.id,
            player_name=player_row.name,
            is_teammate=p.is_teammate,
        ))

    db.commit()
    db.refresh(s)
    return _to_detail(s)


@router.patch("/{session_id}", response_model=PlaySessionDetail)
def update_play_session(session_id: int, body: PlaySessionUpdate, db: Session = Depends(get_db)):
    s = db.query(PlaySession).filter(PlaySession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")

    data = body.model_dump(exclude_unset=True)

    if "state" in data and data["state"] not in VALID_STATES:
        raise HTTPException(status_code=400, detail=f"Invalid state: {data['state']}")

    if "course_id" in data and data["course_id"] is not None:
        if not db.query(Course).filter(Course.id == data["course_id"]).first():
            raise HTTPException(status_code=400, detail="course_id not found")
    if "tee_id" in data and data["tee_id"] is not None:
        if not db.query(CourseTee).filter(CourseTee.id == data["tee_id"]).first():
            raise HTTPException(status_code=400, detail="tee_id not found")

    for field, value in data.items():
        setattr(s, field, value)

    db.commit()
    db.refresh(s)
    return _to_detail(s)


@router.delete("/{session_id}")
def delete_play_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(PlaySession).filter(PlaySession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")
    db.delete(s)
    db.commit()
    return {"status": "deleted", "session_id": session_id}


# --- Partners ---

@router.post("/{session_id}/partners", response_model=PartnerOut)
def add_partner(session_id: int, body: PartnerIn, db: Session = Depends(get_db)):
    s = db.query(PlaySession).filter(PlaySession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")
    p = PlaySessionPartner(
        session_id=session_id,
        player_id=body.player_id,
        player_name=body.player_name,
        is_teammate=body.is_teammate,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return PartnerOut.model_validate(p)


@router.delete("/{session_id}/partners/{partner_id}")
def delete_partner(session_id: int, partner_id: int, db: Session = Depends(get_db)):
    p = (
        db.query(PlaySessionPartner)
        .filter(PlaySessionPartner.id == partner_id, PlaySessionPartner.session_id == session_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    db.delete(p)
    db.commit()
    return {"status": "deleted"}


# --- Garmin round linking (11f) ---

@router.post("/{session_id}/link/{round_id}", response_model=PlaySessionDetail)
def link_garmin_round(session_id: int, round_id: int, db: Session = Depends(get_db)):
    from app.models import Round as GarminRound

    s = db.query(PlaySession).filter(PlaySession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")
    if not db.query(GarminRound).filter(GarminRound.id == round_id).first():
        raise HTTPException(status_code=404, detail="Round not found")

    # Prevent double-linking: one PlaySession per Garmin round
    existing = (
        db.query(PlaySession)
        .filter(PlaySession.garmin_round_id == round_id, PlaySession.id != session_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Round {round_id} is already linked to play session {existing.id}",
        )

    s.garmin_round_id = round_id
    db.commit()
    db.refresh(s)
    return _to_detail(s)


@router.delete("/{session_id}/link", response_model=PlaySessionDetail)
def unlink_garmin_round(session_id: int, db: Session = Depends(get_db)):
    s = db.query(PlaySession).filter(PlaySession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")
    s.garmin_round_id = None
    db.commit()
    db.refresh(s)
    return _to_detail(s)


# --- Weather samples (6d) ---

@router.post("/{session_id}/weather/sample", response_model=WeatherSampleOut)
def sample_weather(
    session_id: int,
    hole_number: Optional[int] = Query(None, description="Optional hole number to stamp the sample"),
    lat: Optional[float] = Query(None, description="Override lat (otherwise use the session's course club location)"),
    lng: Optional[float] = Query(None, description="Override lng (otherwise use the session's course club location)"),
    db: Session = Depends(get_db),
):
    """Fetch current weather from Open-Meteo and persist a sample on this session."""
    s = (
        db.query(PlaySession)
        .options(joinedload(PlaySession.course).joinedload(Course.club))
        .filter(PlaySession.id == session_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Play session not found")

    use_lat, use_lng = lat, lng
    if use_lat is None or use_lng is None:
        club: Optional[GolfClub] = s.course.club if s.course else None
        if not club or club.lat is None or club.lng is None:
            raise HTTPException(
                status_code=400,
                detail="No lat/lng available — session has no course club location; pass lat/lng query params",
            )
        use_lat, use_lng = club.lat, club.lng

    try:
        data = fetch_current_weather(use_lat, use_lng)
    except WeatherFetchError as e:
        raise HTTPException(status_code=502, detail=str(e))

    sample = PlaySessionWeatherSample(
        session_id=session_id,
        hole_number=hole_number,
        **data,
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return WeatherSampleOut.model_validate(sample)


@router.get("/{session_id}/weather", response_model=list[WeatherSampleOut])
def list_weather_samples(session_id: int, db: Session = Depends(get_db)):
    if not db.query(PlaySession).filter(PlaySession.id == session_id).first():
        raise HTTPException(status_code=404, detail="Play session not found")
    samples = (
        db.query(PlaySessionWeatherSample)
        .filter(PlaySessionWeatherSample.session_id == session_id)
        .order_by(PlaySessionWeatherSample.sampled_at.asc())
        .all()
    )
    return [WeatherSampleOut.model_validate(w) for w in samples]


@router.delete("/{session_id}/weather/{sample_id}")
def delete_weather_sample(session_id: int, sample_id: int, db: Session = Depends(get_db)):
    w = (
        db.query(PlaySessionWeatherSample)
        .filter(
            PlaySessionWeatherSample.id == sample_id,
            PlaySessionWeatherSample.session_id == session_id,
        )
        .first()
    )
    if not w:
        raise HTTPException(status_code=404, detail="Weather sample not found")
    db.delete(w)
    db.commit()
    return {"status": "deleted"}
