from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from collections import defaultdict

from app.database import get_db
from app.models.range_session import RangeSession, RangeShot
from app.models.trackman_shot import TrackmanShot
from app.services.rapsodo_csv_parser import parse_mlm2pro_csv
from app.services.rapsodo_import_service import import_rapsodo_session
from app.services.trackman_import_service import (
    import_trackman_report,
    import_trackman_range_activity,
    _resolve_club,
)
from app.services.trackman_api import fetch_trackman_activities
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
    source: str = "rapsodo"

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
    from app.services.backup_service import create_pre_import_backup
    create_pre_import_backup()

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
    from app.services.backup_service import create_pre_import_backup
    create_pre_import_backup()

    try:
        result = import_trackman_report(db, body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result["status"] == "imported":
        compute_club_stats(db)

    return result


# ── Trackman Sync (authenticated API) ──

_SUPPORTED_SYNC_KINDS = {
    "shot-analysis": "Shot Analysis",
    "urn:trackman:dr:practice:1": "Practice",
    "urn:trackman:dr:find-my-distance:1": "Find My Distance",
}


class TrackmanSyncSessionItem(BaseModel):
    id: str
    range_id: Optional[str] = None  # Range API activity ID (different from portal ID for practice/FMD)
    kind: str
    time: str
    display_type: str
    facility: Optional[str] = None
    shot_count: Optional[int] = None
    already_imported: bool


class TrackmanSyncSessionsResponse(BaseModel):
    sessions: list[TrackmanSyncSessionItem]
    page: int
    page_count: int
    total: int


class TrackmanSyncImportRequest(BaseModel):
    token: str
    activity_id: str
    range_id: Optional[str] = None  # Range API ID for practice/FMD sessions
    kind: str
    activity_time: Optional[str] = None


@router.get("/import/trackman-sync/sessions")
def list_trackman_sync_sessions(
    token: str = Query(...),
    page: int = Query(1),
    db: Session = Depends(get_db),
):
    """List available Trackman sessions for sync."""
    try:
        data = fetch_trackman_activities(token, page)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build set of already-imported report IDs
    imported_ids = set(
        r[0]
        for r in db.query(RangeSession.report_id).filter(
            RangeSession.report_id.isnot(None)
        ).all()
    )

    sessions: list[TrackmanSyncSessionItem] = []
    for item in data.get("items", []):
        kind = item.get("kind", "")
        display_type = _SUPPORTED_SYNC_KINDS.get(kind)
        if not display_type:
            continue

        # Extract facility name and Range activity ID from tags
        facility = None
        range_activity_id = None
        for tag in item.get("tags", []):
            tag_kind = tag.get("kind", "")
            if "Facility" in tag_kind or "facility" in tag_kind:
                facility = tag.get("name")
            if tag_kind == "urn:trackman:dr:activity-tag-type:activity-id":
                range_activity_id = tag.get("id")

        # Extract shot count
        ad = item.get("activityData", {})
        shot_count = ad.get("TotalNumberOfStrokes") or ad.get("StrokeCount")

        activity_id = item.get("id", "")
        # For dedup, check both portal ID and range ID
        is_imported = activity_id in imported_ids or (
            range_activity_id is not None and range_activity_id in imported_ids
        )

        sessions.append(TrackmanSyncSessionItem(
            id=activity_id,
            range_id=range_activity_id,
            kind=kind,
            time=item.get("time", ""),
            display_type=display_type,
            facility=facility,
            shot_count=shot_count,
            already_imported=is_imported,
        ))

    return TrackmanSyncSessionsResponse(
        sessions=sessions,
        page=data.get("page", 1),
        page_count=data.get("pageCount", 1),
        total=len(sessions),
    )


@router.post("/import/trackman-sync")
def import_trackman_sync(
    body: TrackmanSyncImportRequest,
    db: Session = Depends(get_db),
):
    """Import a single Trackman session via sync."""
    from app.services.backup_service import create_pre_import_backup
    create_pre_import_backup()

    try:
        if body.kind == "shot-analysis":
            # Shot analysis uses existing public reports API (activity ID as bare UUID)
            result = import_trackman_report(db, body.activity_id)
        else:
            # Practice / FMD use authenticated Range strokes API
            # The Range API uses a different ID than the portal API
            range_id = body.range_id or body.activity_id
            result = import_trackman_range_activity(
                db,
                range_id,
                body.token,
                body.activity_time,
                body.kind,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result["status"] == "imported":
        compute_club_stats(db)

    return result


# ── CSV / Manual Import ──

class CsvImportRequest(BaseModel):
    csv_text: str
    title: Optional[str] = None
    session_date: Optional[str] = None
    notes: Optional[str] = None


class ManualShotInput(BaseModel):
    club: str
    carry_yards: Optional[float] = None
    total_yards: Optional[float] = None
    ball_speed_mph: Optional[float] = None
    height_ft: Optional[float] = None
    launch_angle_deg: Optional[float] = None
    launch_direction_deg: Optional[float] = None
    carry_side_ft: Optional[float] = None
    from_pin_yds: Optional[float] = None
    spin_rate_rpm: Optional[float] = None
    club_speed_mph: Optional[float] = None
    smash_factor: Optional[float] = None
    attack_angle_deg: Optional[float] = None
    club_path_deg: Optional[float] = None
    spin_axis_deg: Optional[float] = None


class ManualSessionRequest(BaseModel):
    title: Optional[str] = None
    session_date: Optional[str] = None
    notes: Optional[str] = None
    shots: list[ManualShotInput] = []


def _create_trackman_shot_from_manual(
    session_id: int,
    shot_number: int,
    club_id: int,
    club_raw: str,
    data: dict,
) -> TrackmanShot:
    """Create a TrackmanShot from manually-entered data."""
    # Convert carry_side from feet to yards for storage
    side_carry_yds = None
    if data.get("carry_side_ft") is not None:
        side_carry_yds = round(data["carry_side_ft"] / 3.0, 2)

    return TrackmanShot(
        session_id=session_id,
        club_id=club_id,
        shot_number=shot_number,
        club_type_raw=club_raw,
        carry_yards=data.get("carry_yards"),
        total_yards=data.get("total_yards"),
        ball_speed_mph=data.get("ball_speed_mph"),
        apex_ft=data.get("height_ft"),
        launch_angle_deg=data.get("launch_angle_deg"),
        launch_direction_deg=data.get("launch_direction_deg"),
        side_carry_yards=side_carry_yds,
        spin_rate_rpm=data.get("spin_rate_rpm"),
        club_speed_mph=data.get("club_speed_mph"),
        smash_factor=data.get("smash_factor"),
        attack_angle_deg=data.get("attack_angle_deg"),
        club_path_deg=data.get("club_path_deg"),
        spin_axis_deg=data.get("spin_axis_deg"),
    )


def _import_manual_shots(
    db: Session,
    session: RangeSession,
    shots_data: list[dict],
    player_id: int,
) -> int:
    """Import a list of shot dicts into a session. Returns count of shots added."""
    existing_max = 0
    if session.trackman_shots:
        existing_max = max(s.shot_number for s in session.trackman_shots)

    count = 0
    for i, shot_data in enumerate(shots_data, start=existing_max + 1):
        club_raw = shot_data.get("club", "Unknown")
        club_id = _resolve_club(db, club_raw, player_id)
        db.add(_create_trackman_shot_from_manual(
            session_id=session.id,
            shot_number=i,
            club_id=club_id,
            club_raw=club_raw,
            data=shot_data,
        ))
        count += 1

    session.shot_count = (session.shot_count or 0) + count
    return count


def _do_csv_import(
    db: Session,
    csv_text: str,
    meta_title: Optional[str],
    meta_date: Optional[str],
    meta_notes: Optional[str],
) -> dict:
    """Shared logic for CSV import (text or file)."""
    from app.services.csv_manual_parser import parse_manual_csv
    from app.services.backup_service import create_pre_import_backup

    try:
        shots_data = parse_manual_csv(csv_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    create_pre_import_backup()

    sess_date = datetime.now()
    if meta_date:
        try:
            sess_date = datetime.fromisoformat(meta_date)
        except ValueError:
            pass

    session_title = meta_title or f"Manual Import — {sess_date.strftime('%b %d, %Y')}"

    session = RangeSession(
        player_id=1,
        source="manual_csv",
        session_date=sess_date,
        title=session_title,
        notes=meta_notes,
        shot_count=0,
    )
    db.add(session)
    db.flush()

    count = _import_manual_shots(db, session, shots_data, player_id=1)
    db.commit()
    compute_club_stats(db)

    return {
        "status": "imported",
        "session_id": session.id,
        "shot_count": count,
    }


@router.post("/import/csv")
def import_csv_text(body: CsvImportRequest, db: Session = Depends(get_db)):
    """Import range shots from pasted CSV text."""
    return _do_csv_import(db, body.csv_text, body.title, body.session_date, body.notes)


@router.post("/import/csv-file")
async def import_csv_file(
    file: UploadFile = File(...),
    title: Optional[str] = Query(None),
    session_date: Optional[str] = Query(None),
    notes: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Import range shots from an uploaded CSV file."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv file")
    content = (await file.read()).decode("utf-8-sig")
    return _do_csv_import(db, content, title, session_date, notes)


@router.post("/sessions/manual")
def create_manual_session(body: ManualSessionRequest, db: Session = Depends(get_db)):
    """Create a range session with manually entered shots."""
    from app.services.backup_service import create_pre_import_backup
    create_pre_import_backup()

    sess_date = datetime.now()
    if body.session_date:
        try:
            sess_date = datetime.fromisoformat(body.session_date)
        except ValueError:
            pass

    session_title = body.title or f"Manual Session — {sess_date.strftime('%b %d, %Y')}"

    session = RangeSession(
        player_id=1,
        source="manual",
        session_date=sess_date,
        title=session_title,
        notes=body.notes,
        shot_count=0,
    )
    db.add(session)
    db.flush()

    if body.shots:
        shots_data = [s.model_dump() for s in body.shots]
        _import_manual_shots(db, session, shots_data, player_id=1)

    db.commit()
    compute_club_stats(db)

    return {
        "status": "created",
        "session_id": session.id,
        "shot_count": session.shot_count,
    }


@router.post("/sessions/{session_id}/shots")
def add_shots_to_session(
    session_id: int,
    shots: list[ManualShotInput],
    db: Session = Depends(get_db),
):
    """Add shots to an existing range session."""
    session = (
        db.query(RangeSession)
        .options(joinedload(RangeSession.trackman_shots))
        .filter(RangeSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    shots_data = [s.model_dump() for s in shots]
    count = _import_manual_shots(db, session, shots_data, player_id=session.player_id or 1)
    db.commit()
    compute_club_stats(db)

    return {"status": "added", "shots_added": count, "total_shots": session.shot_count}


@router.put("/shots/{shot_id}")
def update_shot(shot_id: int, body: ManualShotInput, db: Session = Depends(get_db)):
    """Update an individual trackman shot."""
    shot = db.query(TrackmanShot).filter(TrackmanShot.id == shot_id).first()
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    club_id = _resolve_club(db, body.club, 1)
    shot.club_id = club_id
    shot.club_type_raw = body.club
    shot.carry_yards = body.carry_yards
    shot.total_yards = body.total_yards
    shot.ball_speed_mph = body.ball_speed_mph
    shot.apex_ft = body.height_ft
    shot.launch_angle_deg = body.launch_angle_deg
    shot.launch_direction_deg = body.launch_direction_deg
    shot.side_carry_yards = round(body.carry_side_ft / 3.0, 2) if body.carry_side_ft is not None else None
    shot.spin_rate_rpm = body.spin_rate_rpm
    shot.club_speed_mph = body.club_speed_mph
    shot.smash_factor = body.smash_factor
    shot.attack_angle_deg = body.attack_angle_deg
    shot.club_path_deg = body.club_path_deg
    shot.spin_axis_deg = body.spin_axis_deg

    db.commit()
    compute_club_stats(db)

    return {"status": "updated", "shot_id": shot_id}


@router.delete("/shots/{shot_id}")
def delete_shot(shot_id: int, db: Session = Depends(get_db)):
    """Delete an individual trackman shot and update session count."""
    shot = db.query(TrackmanShot).filter(TrackmanShot.id == shot_id).first()
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    session = db.query(RangeSession).filter(RangeSession.id == shot.session_id).first()
    db.delete(shot)
    if session:
        session.shot_count = max(0, (session.shot_count or 1) - 1)
    db.commit()
    compute_club_stats(db)

    return {"status": "deleted", "shot_id": shot_id}


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
        .options(
            joinedload(RangeSession.shots).joinedload(RangeShot.club),
            joinedload(RangeSession.trackman_shots).joinedload(TrackmanShot.club),
        )
        .filter(RangeSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    def _avg(vals: list) -> float | None:
        clean = [v for v in vals if v is not None]
        return round(sum(clean) / len(clean), 1) if clean else None

    # Combine MLM2PRO and Trackman shots into unified responses
    shot_responses: list[RangeShotResponse] = []
    all_shots_for_groups: list = []

    for s in session.shots:
        all_shots_for_groups.append(s)
        shot_responses.append(RangeShotResponse(
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
            source="rapsodo",
        ))

    for s in session.trackman_shots:
        all_shots_for_groups.append(s)
        shot_responses.append(_tm_to_response(s))

    shot_responses.sort(key=lambda r: r.shot_number)

    # Build per-club group stats from all shots
    groups: dict[str, list] = defaultdict(list)
    for shot in all_shots_for_groups:
        groups[_resolve_display_name(shot)].append(shot)

    club_groups = []
    for display_name, group_shots in groups.items():
        raw = group_shots[0].club_type_raw or ""
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

    club_groups.sort(key=lambda g: g.avg_total or 0, reverse=True)

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
        source="rapsodo",
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


# ── OCR Extract (test endpoint) ──

@router.post("/import/ocr")
async def ocr_extract(file: UploadFile = File(...)):
    """Extract table data from a Trackman screenshot using preprocessed Tesseract OCR."""
    import pytesseract
    from PIL import Image
    import io

    contents = await file.read()
    img = Image.open(io.BytesIO(contents))

    # Preprocessing for light-gray-on-white Trackman screenshots
    img = img.convert("L")                                    # grayscale
    img = img.resize((img.width * 3, img.height * 3), Image.LANCZOS)  # scale up 3x
    img = img.point(lambda x: 0 if x < 200 else 255)         # threshold: gray->black

    # Tesseract config — no whitelist so confidence scores are accurate
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    data = pytesseract.image_to_data(
        img,
        config="--psm 6 --oem 3",
        output_type=pytesseract.Output.DICT,
    )

    # Group words into rows by block_num + par_num + line_num
    import re
    from collections import OrderedDict
    line_words: dict[tuple, list] = OrderedDict()
    for i in range(len(data["text"])):
        txt = data["text"][i].strip()
        if not txt:
            continue
        # Strip non-numeric chars (keep digits, decimal, L, R)
        clean = re.sub(r"[^0-9.LR]", "", txt)
        if not clean:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        conf = int(data["conf"][i])
        # If result is just L or R, assume it was 1L or 1R
        if clean in ("L", "R"):
            clean = "1" + clean
        # If cleaning removed digits or result has no digits, flag as low confidence
        if not re.search(r"\d", clean):
            conf = 0
        elif clean != txt:
            conf = min(conf, 50)
        line_words.setdefault(key, []).append({"text": clean, "conf": conf})

    rows = []
    for words in line_words.values():
        cells = [{"text": w["text"], "conf": w["conf"]} for w in words]
        rows.append(cells)

    return {"rows": rows}
