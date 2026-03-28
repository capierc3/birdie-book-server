from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict

from app.database import get_db
from app.models.range_session import RangeSession, RangeShot
from app.models.trackman_shot import TrackmanShot
from app.services.rapsodo_csv_parser import parse_mlm2pro_csv
from app.services.rapsodo_import_service import import_rapsodo_session
from app.services.trackman_import_service import import_trackman_report
from app.services.rapsodo_club_types import get_standard_club_type
from app.api.clubs import _default_club_color
from app.services.club_stats_service import compute_club_stats

router = APIRouter(prefix="/api/range", tags=["range"])


# ── Helpers ──

def _resolve_display_name(shot) -> str:
    """Get the best display name: linked club type > standard mapping > raw. Works for RangeShot and TrackmanShot."""
    if shot.club and shot.club.club_type:
        return shot.club.club_type
    # For TrackmanShot, club_type_raw is already a readable name like "Driver", "7Iron"
    raw = shot.club_type_raw or ""
    mapped = get_standard_club_type(raw)
    if mapped:
        return mapped
    # Try Trackman name mapping
    from app.services.trackman_import_service import _standard_club_name
    tm_name = _standard_club_name(raw)
    if tm_name != raw:
        return tm_name
    return raw


def _resolve_club_color(shot) -> str:
    """Get the club color: stored on club > default for type. Works for RangeShot and TrackmanShot."""
    if shot.club and shot.club.color:
        return shot.club.color
    name = _resolve_display_name(shot)
    return _default_club_color(name)


# ── Response Models ──

class RangeSessionSummary(BaseModel):
    id: int
    source: str
    session_date: str
    title: Optional[str] = None
    shot_count: int = 0

class RangeShotResponse(BaseModel):
    id: str  # Unique across sources: "mlm_{id}" or "tm_{id}"
    raw_id: int  # Original DB id for API calls (reassign, etc.)
    session_id: Optional[int] = None
    shot_number: int
    club_type_raw: str
    club_name: Optional[str] = None
    club_color: Optional[str] = None
    club_brand: Optional[str] = None
    club_model: Optional[str] = None
    carry_yards: Optional[float] = None
    total_yards: Optional[float] = None
    ball_speed_mph: Optional[float] = None
    launch_angle_deg: Optional[float] = None
    launch_direction_deg: Optional[float] = None
    apex_yards: Optional[float] = None
    side_carry_yards: Optional[float] = None
    club_speed_mph: Optional[float] = None
    smash_factor: Optional[float] = None
    descent_angle_deg: Optional[float] = None
    attack_angle_deg: Optional[float] = None
    club_path_deg: Optional[float] = None
    spin_rate_rpm: Optional[float] = None
    spin_axis_deg: Optional[float] = None
    # Trackman-specific fields (None for MLM2PRO shots)
    face_angle_deg: Optional[float] = None
    face_to_path_deg: Optional[float] = None
    dynamic_loft_deg: Optional[float] = None
    spin_loft_deg: Optional[float] = None
    swing_plane_deg: Optional[float] = None
    swing_direction_deg: Optional[float] = None
    dynamic_lie_deg: Optional[float] = None
    impact_offset_in: Optional[float] = None
    impact_height_in: Optional[float] = None
    low_point_distance_in: Optional[float] = None
    curve_yards: Optional[float] = None
    hang_time_sec: Optional[float] = None
    side_total_yards: Optional[float] = None
    smash_index: Optional[float] = None
    ball_speed_diff_mph: Optional[float] = None
    trajectory_json: Optional[str] = None
    source: str = "rapsodo_mlm2pro"

class ClubGroupStats(BaseModel):
    club_type_raw: str
    club_name: Optional[str] = None
    avg_carry: Optional[float] = None
    avg_total: Optional[float] = None
    avg_ball_speed: Optional[float] = None
    avg_club_speed: Optional[float] = None
    avg_launch_angle: Optional[float] = None
    avg_spin_rate: Optional[float] = None
    shot_count: int = 0

class RangeSessionDetail(BaseModel):
    id: int
    source: str
    session_date: str
    title: Optional[str] = None
    notes: Optional[str] = None
    shot_count: int = 0
    club_groups: list[ClubGroupStats] = []
    shots: list[RangeShotResponse] = []


# ── Endpoints ──

@router.post("/import/rapsodo")
async def import_rapsodo_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload and import a Rapsodo MLM2PRO CSV shot export."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv file")

    content = (await file.read()).decode("utf-8-sig")

    try:
        parsed = parse_mlm2pro_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    result = import_rapsodo_session(db, parsed, content)

    if result["status"] == "imported":
        compute_club_stats(db)

    return result


class TrackmanImportRequest(BaseModel):
    url: str


@router.post("/import/trackman")
def import_trackman(body: TrackmanImportRequest, db: Session = Depends(get_db)):
    """Import a Trackman report by URL or report ID."""
    try:
        result = import_trackman_report(db, body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result["status"] == "imported":
        compute_club_stats(db)

    return result


@router.get("/sessions", response_model=list[RangeSessionSummary])
def list_range_sessions(
    source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List all range sessions, optionally filtered by source."""
    query = db.query(RangeSession).order_by(RangeSession.session_date.desc())
    if source:
        query = query.filter(RangeSession.source == source)
    sessions = query.all()

    return [
        RangeSessionSummary(
            id=s.id,
            source=s.source,
            session_date=s.session_date.isoformat(),
            title=s.title,
            shot_count=s.shot_count or 0,
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=RangeSessionDetail)
def get_range_session(session_id: int, db: Session = Depends(get_db)):
    """Get a range session with all shots and per-club aggregates."""
    session = (
        db.query(RangeSession)
        .options(joinedload(RangeSession.shots).joinedload(RangeShot.club))
        .filter(RangeSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Build per-club group stats — group by resolved display name
    groups: dict[str, list[RangeShot]] = defaultdict(list)
    for shot in session.shots:
        groups[_resolve_display_name(shot)].append(shot)

    def _avg(vals: list) -> float | None:
        clean = [v for v in vals if v is not None]
        return round(sum(clean) / len(clean), 1) if clean else None

    club_groups = []
    for display_name, group_shots in groups.items():
        # Use the first shot's raw type for the raw field
        raw = group_shots[0].club_type_raw
        club_groups.append(ClubGroupStats(
            club_type_raw=raw,
            club_name=display_name,
            avg_carry=_avg([s.carry_yards for s in group_shots]),
            avg_total=_avg([s.total_yards for s in group_shots]),
            avg_ball_speed=_avg([s.ball_speed_mph for s in group_shots]),
            avg_club_speed=_avg([s.club_speed_mph for s in group_shots]),
            avg_launch_angle=_avg([s.launch_angle_deg for s in group_shots]),
            avg_spin_rate=_avg([s.spin_rate_rpm for s in group_shots]),
            shot_count=len(group_shots),
        ))

    # Sort club groups by avg total distance descending
    club_groups.sort(key=lambda g: g.avg_total or 0, reverse=True)

    shot_responses = [
        RangeShotResponse(
            id=s.id,
            session_id=s.session_id,
            shot_number=s.shot_number,
            club_type_raw=s.club_type_raw,
            club_name=_resolve_display_name(s),
            club_color=_resolve_club_color(s),
            club_brand=s.club_brand,
            club_model=s.club_model,
            carry_yards=s.carry_yards,
            total_yards=s.total_yards,
            ball_speed_mph=s.ball_speed_mph,
            launch_angle_deg=s.launch_angle_deg,
            launch_direction_deg=s.launch_direction_deg,
            apex_yards=s.apex_yards,
            side_carry_yards=s.side_carry_yards,
            club_speed_mph=s.club_speed_mph,
            smash_factor=s.smash_factor,
            descent_angle_deg=s.descent_angle_deg,
            attack_angle_deg=s.attack_angle_deg,
            club_path_deg=s.club_path_deg,
            spin_rate_rpm=s.spin_rate_rpm,
            spin_axis_deg=s.spin_axis_deg,
        )
        for s in sorted(session.shots, key=lambda s: s.shot_number)
    ]

    return RangeSessionDetail(
        id=session.id,
        source=session.source,
        session_date=session.session_date.isoformat(),
        title=session.title,
        notes=session.notes,
        shot_count=session.shot_count or 0,
        club_groups=club_groups,
        shots=shot_responses,
    )


class RangeShotsResponse(BaseModel):
    sessions: list[RangeSessionSummary] = []
    shots: list[RangeShotResponse] = []
    clubs: list[str] = []


def _mlm_to_response(s: RangeShot) -> RangeShotResponse:
    """Convert a RangeShot (MLM2PRO) to the unified response format."""
    return RangeShotResponse(
        id=f"mlm_{s.id}",
        raw_id=s.id,
        session_id=s.session_id,
        shot_number=s.shot_number,
        club_type_raw=s.club_type_raw,
        club_name=_resolve_display_name(s),
        club_color=_resolve_club_color(s),
        club_brand=s.club_brand,
        club_model=s.club_model,
        carry_yards=s.carry_yards,
        total_yards=s.total_yards,
        ball_speed_mph=s.ball_speed_mph,
        launch_angle_deg=s.launch_angle_deg,
        launch_direction_deg=s.launch_direction_deg,
        apex_yards=s.apex_yards,
        side_carry_yards=s.side_carry_yards,
        club_speed_mph=s.club_speed_mph,
        smash_factor=s.smash_factor,
        descent_angle_deg=s.descent_angle_deg,
        attack_angle_deg=s.attack_angle_deg,
        club_path_deg=s.club_path_deg,
        spin_rate_rpm=s.spin_rate_rpm,
        spin_axis_deg=s.spin_axis_deg,
        source="rapsodo_mlm2pro",
    )


def _tm_to_response(s: TrackmanShot) -> RangeShotResponse:
    """Convert a TrackmanShot to the unified response format."""
    # Map apex_ft to apex_yards for chart consistency (convert ft → yds)
    apex_yds = round(s.apex_ft / 3.0, 1) if s.apex_ft else None
    return RangeShotResponse(
        id=f"tm_{s.id}",
        raw_id=s.id,
        session_id=s.session_id,
        shot_number=s.shot_number,
        club_type_raw=s.club_type_raw or "",
        club_name=_resolve_display_name(s),
        club_color=_resolve_club_color(s),
        carry_yards=s.carry_yards,
        total_yards=s.total_yards,
        ball_speed_mph=s.ball_speed_mph,
        launch_angle_deg=s.launch_angle_deg,
        launch_direction_deg=s.launch_direction_deg,
        apex_yards=apex_yds,
        side_carry_yards=s.side_carry_yards,
        club_speed_mph=s.club_speed_mph,
        smash_factor=s.smash_factor,
        descent_angle_deg=s.landing_angle_deg,
        attack_angle_deg=s.attack_angle_deg,
        club_path_deg=s.club_path_deg,
        spin_rate_rpm=s.spin_rate_rpm,
        spin_axis_deg=s.spin_axis_deg,
        # Trackman-specific fields
        face_angle_deg=s.face_angle_deg,
        face_to_path_deg=s.face_to_path_deg,
        dynamic_loft_deg=s.dynamic_loft_deg,
        spin_loft_deg=s.spin_loft_deg,
        swing_plane_deg=s.swing_plane_deg,
        swing_direction_deg=s.swing_direction_deg,
        dynamic_lie_deg=s.dynamic_lie_deg,
        impact_offset_in=s.impact_offset_in,
        impact_height_in=s.impact_height_in,
        low_point_distance_in=s.low_point_distance_in,
        curve_yards=s.curve_yards,
        hang_time_sec=s.hang_time_sec,
        side_total_yards=s.side_total_yards,
        smash_index=s.smash_index,
        ball_speed_diff_mph=s.ball_speed_diff_mph,
        trajectory_json=s.trajectory_json,
        source="trackman",
    )


@router.get("/shots", response_model=RangeShotsResponse)
def get_range_shots(
    session_id: Optional[str] = Query("all"),
    club: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Get filtered range shots across sessions for analytics view."""
    # Get all sessions for the dropdown
    all_sessions = db.query(RangeSession).order_by(RangeSession.session_date.desc()).all()
    session_summaries = [
        RangeSessionSummary(
            id=s.id, source=s.source,
            session_date=s.session_date.isoformat(),
            title=s.title, shot_count=s.shot_count or 0,
        )
        for s in all_sessions
    ]

    # Get ALL clubs across all sessions (for stable dropdown) — query both tables
    all_mlm = db.query(RangeShot).options(joinedload(RangeShot.club)).all()
    all_tm = db.query(TrackmanShot).options(joinedload(TrackmanShot.club)).all()
    all_clubs = sorted({_resolve_display_name(s) for s in all_mlm} | {_resolve_display_name(s) for s in all_tm})

    # Filter by session
    sid = None
    if session_id and session_id != "all":
        try:
            sid = int(session_id)
        except ValueError:
            pass

    # Query MLM2PRO shots
    mlm_query = (
        db.query(RangeShot)
        .join(RangeSession)
        .options(joinedload(RangeShot.club))
        .order_by(RangeSession.session_date.desc(), RangeShot.shot_number)
    )
    if sid:
        mlm_query = mlm_query.filter(RangeShot.session_id == sid)
    mlm_shots = mlm_query.all()

    # Query Trackman shots
    tm_query = (
        db.query(TrackmanShot)
        .join(RangeSession)
        .options(joinedload(TrackmanShot.club))
        .order_by(RangeSession.session_date.desc(), TrackmanShot.shot_number)
    )
    if sid:
        tm_query = tm_query.filter(TrackmanShot.session_id == sid)
    tm_shots = tm_query.all()

    # Build unified responses
    shot_responses = []
    for s in mlm_shots:
        resp = _mlm_to_response(s)
        if club and resp.club_name != club:
            continue
        shot_responses.append(resp)

    for s in tm_shots:
        resp = _tm_to_response(s)
        if club and resp.club_name != club:
            continue
        shot_responses.append(resp)

    # Sort combined results by session date (newest first), then shot number
    session_dates = {s.id: s.session_date for s in all_sessions}
    shot_responses.sort(key=lambda r: (session_dates.get(r.session_id, ""), r.shot_number), reverse=True)

    return RangeShotsResponse(
        sessions=session_summaries,
        shots=shot_responses,
        clubs=all_clubs,
    )


@router.delete("/sessions/{session_id}")
def delete_range_session(session_id: int, db: Session = Depends(get_db)):
    """Delete a range session and recompute club stats."""
    session = db.query(RangeSession).filter(RangeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()
    compute_club_stats(db)

    return {"status": "deleted", "session_id": session_id}
