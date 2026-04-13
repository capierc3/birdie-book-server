from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.club import Club, ClubStats
from app.models.round import Shot, Round, RoundHole
from app.models.range_session import RangeSession, RangeShot
from app.models.trackman_shot import TrackmanShot
from app.services.club_stats_service import compute_club_stats, compute_windowed_club_stats

router = APIRouter(prefix="/api/clubs", tags=["clubs"])


# ── Response Models ──

class ClubStatsResponse(BaseModel):
    avg_yards: Optional[float] = None
    median_yards: Optional[float] = None
    std_dev: Optional[float] = None
    min_yards: Optional[float] = None
    max_yards: Optional[float] = None
    p10: Optional[float] = None
    p90: Optional[float] = None
    sample_count: Optional[int] = None
    # Range/sim stats
    range_avg_yards: Optional[float] = None
    range_median_yards: Optional[float] = None
    range_std_dev: Optional[float] = None
    range_min_yards: Optional[float] = None
    range_max_yards: Optional[float] = None
    range_p10: Optional[float] = None
    range_p90: Optional[float] = None
    range_sample_count: Optional[int] = None
    # Combined on-course + range
    combined_avg_yards: Optional[float] = None
    combined_median_yards: Optional[float] = None
    combined_std_dev: Optional[float] = None
    combined_min_yards: Optional[float] = None
    combined_max_yards: Optional[float] = None
    combined_p10: Optional[float] = None
    combined_p90: Optional[float] = None
    combined_sample_count: Optional[int] = None


class WindowedStatsResponse(BaseModel):
    avg_yards: Optional[float] = None
    median_yards: Optional[float] = None
    std_dev: Optional[float] = None
    min_yards: Optional[float] = None
    max_yards: Optional[float] = None
    p10: Optional[float] = None
    p90: Optional[float] = None
    sample_count: Optional[int] = None


class ClubResponse(BaseModel):
    id: int
    club_type: str
    name: Optional[str] = None
    model: Optional[str] = None
    shaft_length_in: Optional[float] = None
    flex: Optional[str] = None
    loft_deg: Optional[float] = None
    lie_deg: Optional[float] = None
    color: Optional[str] = None
    retired: bool = False
    sort_order: int = 0
    source: str = "manual"
    garmin_id: Optional[int] = None
    stats: Optional[ClubStatsResponse] = None
    windowed_stats: Optional[WindowedStatsResponse] = None


# ── Request Models ──

class ClubCreate(BaseModel):
    club_type: str
    name: Optional[str] = None
    model: Optional[str] = None
    shaft_length_in: Optional[float] = None
    flex: Optional[str] = None
    loft_deg: Optional[float] = None
    lie_deg: Optional[float] = None
    color: Optional[str] = None


class ClubUpdate(BaseModel):
    club_type: Optional[str] = None
    name: Optional[str] = None
    model: Optional[str] = None
    shaft_length_in: Optional[float] = None
    color: Optional[str] = None
    flex: Optional[str] = None
    loft_deg: Optional[float] = None
    lie_deg: Optional[float] = None
    retired: Optional[bool] = None


class ReassignShotRequest(BaseModel):
    shot_type: str  # "range" or "course"
    shot_id: int
    target_club_id: Optional[int] = None
    new_club: Optional[ClubCreate] = None


# ── Helpers ──

# Unique default color for each club type
DEFAULT_CLUB_COLORS: dict[str, str] = {
    "Driver":         "#2196F3",
    "2 Wood":         "#1565C0",
    "3 Wood":         "#1E88E5",
    "4 Wood":         "#42A5F5",
    "5 Wood":         "#64B5F6",
    "7 Wood":         "#90CAF9",
    "9 Wood":         "#BBDEFB",
    "2 Hybrid":       "#7B1FA2",
    "3 Hybrid":       "#9C27B0",
    "4 Hybrid":       "#AB47BC",
    "5 Hybrid":       "#CE93D8",
    "6 Hybrid":       "#E1BEE7",
    "1 Iron":         "#B71C1C",
    "2 Iron":         "#C62828",
    "3 Iron":         "#D32F2F",
    "4 Iron":         "#E53935",
    "5 Iron":         "#EF5350",
    "6 Iron":         "#E91E63",
    "7 Iron":         "#F06292",
    "8 Iron":         "#F48FB1",
    "9 Iron":         "#F8BBD0",
    "Pitching Wedge": "#FF6F00",
    "Gap Wedge":      "#FF9800",
    "Sand Wedge":     "#FFB74D",
    "Lob Wedge":      "#FFE0B2",
    "Putter":         "#78909C",
    "Unknown":        "#9E9E9E",
}


def _default_club_color(club_type: str) -> str:
    """Get a default color for a club type."""
    if club_type in DEFAULT_CLUB_COLORS:
        return DEFAULT_CLUB_COLORS[club_type]
    # Hash-based fallback for unknown types
    h = hash(club_type) % 360
    return f"hsl({h}, 65%, 55%)"


def _build_club_response(c: Club, windowed: dict = None) -> ClubResponse:
    return ClubResponse(
        id=c.id,
        club_type=c.club_type,
        name=c.name,
        model=c.model,
        shaft_length_in=c.shaft_length_in,
        flex=c.flex,
        loft_deg=c.loft_deg,
        lie_deg=c.lie_deg,
        color=c.color or _default_club_color(c.club_type),
        retired=c.retired or False,
        sort_order=c.sort_order or 0,
        source=c.source or "manual",
        garmin_id=c.garmin_id,
        stats=ClubStatsResponse(
            avg_yards=c.stats.avg_yards,
            median_yards=c.stats.median_yards,
            std_dev=c.stats.std_dev,
            min_yards=c.stats.min_yards,
            max_yards=c.stats.max_yards,
            p10=c.stats.p10,
            p90=c.stats.p90,
            sample_count=c.stats.sample_count,
            range_avg_yards=c.stats.range_avg_yards,
            range_median_yards=c.stats.range_median_yards,
            range_std_dev=c.stats.range_std_dev,
            range_min_yards=c.stats.range_min_yards,
            range_max_yards=c.stats.range_max_yards,
            range_p10=c.stats.range_p10,
            range_p90=c.stats.range_p90,
            range_sample_count=c.stats.range_sample_count,
            combined_avg_yards=c.stats.combined_avg_yards,
            combined_median_yards=c.stats.combined_median_yards,
            combined_std_dev=c.stats.combined_std_dev,
            combined_min_yards=c.stats.combined_min_yards,
            combined_max_yards=c.stats.combined_max_yards,
            combined_p10=c.stats.combined_p10,
            combined_p90=c.stats.combined_p90,
            combined_sample_count=c.stats.combined_sample_count,
        ) if c.stats else None,
        windowed_stats=WindowedStatsResponse(**windowed[c.id]) if windowed and c.id in windowed else None,
    )


# ── Endpoints ──

@router.get("/", response_model=list[ClubResponse])
def list_clubs(
    retired: bool = False,
    window_type: Optional[str] = Query(None, regex="^(rounds|sessions|months)$"),
    window_value: Optional[int] = Query(None, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List all clubs with stats. Optionally include windowed comparison stats."""
    query = db.query(Club).options(joinedload(Club.stats))
    if not retired:
        query = query.filter(Club.retired == False)
    clubs = query.order_by(Club.sort_order, Club.club_type).all()

    windowed: dict[int, dict] = {}
    if window_type and window_value:
        windowed = compute_windowed_club_stats(db, window_type, window_value)

    return [_build_club_response(c, windowed) for c in clubs]


@router.post("/", response_model=ClubResponse)
def create_club(body: ClubCreate, db: Session = Depends(get_db)):
    """Create a new club manually."""
    # Use player_id=1 as default (single-user app)
    from app.models.player import Player
    player = db.query(Player).first()
    player_id = player.id if player else None

    club = Club(
        club_type=body.club_type,
        name=body.name,
        model=body.model,
        shaft_length_in=body.shaft_length_in,
        flex=body.flex,
        loft_deg=body.loft_deg,
        lie_deg=body.lie_deg,
        player_id=player_id,
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    return _build_club_response(club)


@router.put("/{club_id}", response_model=ClubResponse)
def update_club(club_id: int, body: ClubUpdate, db: Session = Depends(get_db)):
    """Edit a club's details."""
    club = db.query(Club).options(joinedload(Club.stats)).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(club, field, value)

    db.commit()
    db.refresh(club)
    return _build_club_response(club)


@router.delete("/{club_id}")
def delete_club(club_id: int, db: Session = Depends(get_db)):
    """Delete a club. Nullifies shot links, deletes ClubStats."""
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    # Nullify range shot links (MLM2PRO + Trackman)
    db.query(RangeShot).filter(RangeShot.club_id == club_id).update(
        {"club_id": None}, synchronize_session="fetch"
    )
    db.query(TrackmanShot).filter(TrackmanShot.club_id == club_id).update(
        {"club_id": None}, synchronize_session="fetch"
    )
    # Nullify on-course shot links (via garmin_id)
    if club.garmin_id is not None:
        db.query(Shot).filter(Shot.club_garmin_id == club.garmin_id).update(
            {"club_garmin_id": None}, synchronize_session="fetch"
        )
    # Delete stats
    db.query(ClubStats).filter(ClubStats.club_id == club_id).delete()
    db.delete(club)
    db.commit()

    return {"status": "deleted", "club_id": club_id}


@router.post("/stats/recompute")
def recompute_club_stats(db: Session = Depends(get_db)):
    """Recompute distance stats for all clubs from shot data."""
    result = compute_club_stats(db)
    return result


@router.post("/{target_id}/merge/{source_id}")
def merge_clubs(target_id: int, source_id: int, db: Session = Depends(get_db)):
    """
    Merge source club into target club.
    Re-points all shots (range + on-course), then deletes source club.
    """
    target = db.query(Club).filter(Club.id == target_id).first()
    source = db.query(Club).filter(Club.id == source_id).first()

    if not target:
        raise HTTPException(status_code=404, detail="Target club not found")
    if not source:
        raise HTTPException(status_code=404, detail="Source club not found")
    if target_id == source_id:
        raise HTTPException(status_code=400, detail="Cannot merge a club into itself")

    # Re-point range shots (MLM2PRO)
    range_moved = db.query(RangeShot).filter(
        RangeShot.club_id == source_id
    ).update({"club_id": target_id}, synchronize_session="fetch")

    # Re-point Trackman shots
    tm_moved = db.query(TrackmanShot).filter(
        TrackmanShot.club_id == source_id
    ).update({"club_id": target_id}, synchronize_session="fetch")
    range_moved += tm_moved

    # Re-point on-course shots (via garmin_id)
    course_moved = 0
    if source.garmin_id is not None:
        if target.garmin_id is not None:
            course_moved = db.query(Shot).filter(
                Shot.club_garmin_id == source.garmin_id
            ).update({
                "club_garmin_id": target.garmin_id,
                "club": target.club_type,
            }, synchronize_session="fetch")
        else:
            # Target has no garmin_id — can't link on-course shots
            # Assign the source garmin_id to the target
            target.garmin_id = source.garmin_id
            target.club_type_id = source.club_type_id
            course_moved = db.query(Shot).filter(
                Shot.club_garmin_id == source.garmin_id
            ).count()

    # Delete source club stats and club
    db.query(ClubStats).filter(ClubStats.club_id == source_id).delete()
    db.delete(source)
    db.commit()

    # Recompute stats
    compute_club_stats(db)

    return {
        "status": "merged",
        "target_id": target_id,
        "source_id": source_id,
        "range_shots_moved": range_moved,
        "course_shots_moved": course_moved,
    }


@router.post("/reassign-shot")
def reassign_shot(body: ReassignShotRequest, db: Session = Depends(get_db)):
    """
    Move a shot (range or on-course) to a different club, or create a new club for it.
    """
    target_club_id = body.target_club_id

    # Create new club if requested
    if body.new_club and target_club_id is None:
        from app.models.player import Player
        player = db.query(Player).first()
        new_club = Club(
            club_type=body.new_club.club_type,
            name=body.new_club.name,
            model=body.new_club.model,
            shaft_length_in=body.new_club.shaft_length_in,
            flex=body.new_club.flex,
            loft_deg=body.new_club.loft_deg,
            lie_deg=body.new_club.lie_deg,
            player_id=player.id if player else None,
        )
        db.add(new_club)
        db.flush()
        target_club_id = new_club.id

    if target_club_id is None:
        raise HTTPException(status_code=400, detail="Must provide target_club_id or new_club")

    target = db.query(Club).filter(Club.id == target_club_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target club not found")

    if body.shot_type == "range":
        shot = db.query(RangeShot).filter(RangeShot.id == body.shot_id).first()
        if not shot:
            raise HTTPException(status_code=404, detail="Range shot not found")
        old_club_id = shot.club_id
        shot.club_id = target_club_id
    elif body.shot_type == "trackman":
        shot = db.query(TrackmanShot).filter(TrackmanShot.id == body.shot_id).first()
        if not shot:
            raise HTTPException(status_code=404, detail="Trackman shot not found")
        old_club_id = shot.club_id
        shot.club_id = target_club_id
    elif body.shot_type == "course":
        shot = db.query(Shot).filter(Shot.id == body.shot_id).first()
        if not shot:
            raise HTTPException(status_code=404, detail="Course shot not found")
        old_club_id = shot.club_garmin_id
        shot.club_garmin_id = target.garmin_id
        shot.club = target.club_type
    else:
        raise HTTPException(status_code=400, detail="shot_type must be 'range' or 'course'")

    db.commit()
    compute_club_stats(db)

    return {
        "status": "reassigned",
        "shot_type": body.shot_type,
        "shot_id": body.shot_id,
        "old_club_id": old_club_id,
        "new_club_id": target_club_id,
    }


class DeleteShotRequest(BaseModel):
    shot_type: str  # "range", "trackman", or "course"
    shot_id: int


@router.post("/delete-shot")
def delete_shot(body: DeleteShotRequest, db: Session = Depends(get_db)):
    """Delete a shot (range, trackman, or on-course)."""
    if body.shot_type == "range":
        shot = db.query(RangeShot).filter(RangeShot.id == body.shot_id).first()
    elif body.shot_type == "trackman":
        shot = db.query(TrackmanShot).filter(TrackmanShot.id == body.shot_id).first()
    elif body.shot_type == "course":
        shot = db.query(Shot).filter(Shot.id == body.shot_id).first()
    else:
        raise HTTPException(status_code=400, detail="shot_type must be 'range', 'trackman', or 'course'")

    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    db.delete(shot)
    db.commit()
    compute_club_stats(db)

    return {"status": "deleted", "shot_type": body.shot_type, "shot_id": body.shot_id}


# ── Club Detail (all shots for a club) ──

class ClubShotResponse(BaseModel):
    id: str
    raw_id: int
    source: str
    date: Optional[str] = None
    shot_number: int = 0
    # Distance
    carry_yards: Optional[float] = None
    total_yards: Optional[float] = None
    distance_yards: Optional[float] = None
    # Speed
    ball_speed_mph: Optional[float] = None
    club_speed_mph: Optional[float] = None
    smash_factor: Optional[float] = None
    # Angles
    launch_angle_deg: Optional[float] = None
    launch_direction_deg: Optional[float] = None
    attack_angle_deg: Optional[float] = None
    club_path_deg: Optional[float] = None
    face_angle_deg: Optional[float] = None
    face_to_path_deg: Optional[float] = None
    dynamic_loft_deg: Optional[float] = None
    spin_loft_deg: Optional[float] = None
    swing_plane_deg: Optional[float] = None
    swing_direction_deg: Optional[float] = None
    dynamic_lie_deg: Optional[float] = None
    landing_angle_deg: Optional[float] = None
    descent_angle_deg: Optional[float] = None
    # Spin
    spin_rate_rpm: Optional[float] = None
    spin_axis_deg: Optional[float] = None
    # Flight
    apex_yards: Optional[float] = None
    side_carry_yards: Optional[float] = None
    side_total_yards: Optional[float] = None
    curve_yards: Optional[float] = None
    hang_time_sec: Optional[float] = None
    # Impact
    impact_offset_in: Optional[float] = None
    impact_height_in: Optional[float] = None
    low_point_distance_in: Optional[float] = None
    # Course-only
    shot_type: Optional[str] = None
    start_lie: Optional[str] = None
    end_lie: Optional[str] = None
    pin_distance_yards: Optional[float] = None
    fairway_side: Optional[str] = None
    fairway_side_yards: Optional[float] = None
    fairway_progress_yards: Optional[float] = None
    green_distance_yards: Optional[float] = None
    on_green: Optional[bool] = None
    sg_pga: Optional[float] = None
    sg_personal: Optional[float] = None
    nearest_hazard_type: Optional[str] = None
    nearest_hazard_name: Optional[str] = None
    nearest_hazard_yards: Optional[float] = None
    # Context
    round_id: Optional[int] = None
    hole_number: Optional[int] = None
    course_name: Optional[str] = None
    session_name: Optional[str] = None


class ClubDetailResponse(BaseModel):
    club: ClubResponse
    shots: list[ClubShotResponse]
    source_counts: dict[str, int]
    avg_ball_speed: Optional[float] = None
    avg_club_speed: Optional[float] = None
    avg_smash_factor: Optional[float] = None
    avg_launch_angle: Optional[float] = None
    avg_attack_angle: Optional[float] = None
    avg_spin_rate: Optional[float] = None
    avg_club_path: Optional[float] = None


def _avg(values: list) -> Optional[float]:
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else None


@router.get("/{club_id}/shots", response_model=ClubDetailResponse)
def get_club_shots(club_id: int, db: Session = Depends(get_db)):
    """Get all shots for a club across all sources (course, range, trackman)."""
    club = db.query(Club).options(joinedload(Club.stats)).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    shots: list[ClubShotResponse] = []

    # ── Course shots (via garmin_id) ──
    if club.garmin_id is not None:
        course_shots = (
            db.query(Shot, Round, RoundHole)
            .join(Round, Shot.round_id == Round.id)
            .join(RoundHole, Shot.round_hole_id == RoundHole.id)
            .filter(Shot.club_garmin_id == club.garmin_id)
            .filter(Shot.shot_type.notin_(["PUTT", "PENALTY"]))
            .filter(Round.exclude_from_stats != True)
            .order_by(Round.date.desc(), Shot.shot_number)
            .all()
        )
        for s, r, rh in course_shots:
            shots.append(ClubShotResponse(
                id=f"course_{s.id}",
                raw_id=s.id,
                source="course",
                date=r.date.isoformat() if r.date else None,
                shot_number=s.shot_number,
                distance_yards=s.distance_yards,
                total_yards=s.distance_yards,
                shot_type=s.shot_type,
                start_lie=s.start_lie,
                end_lie=s.end_lie,
                pin_distance_yards=s.pin_distance_yards,
                fairway_side=s.fairway_side,
                fairway_side_yards=s.fairway_side_yards,
                fairway_progress_yards=s.fairway_progress_yards,
                green_distance_yards=s.green_distance_yards,
                on_green=s.on_green,
                sg_pga=s.sg_pga,
                sg_personal=s.sg_personal,
                nearest_hazard_type=s.nearest_hazard_type,
                nearest_hazard_name=s.nearest_hazard_name,
                nearest_hazard_yards=s.nearest_hazard_yards,
                round_id=r.id,
                hole_number=rh.hole_number,
                course_name=r.course.name if r.course else None,
            ))

    # ── Range shots (MLM2PRO) ──
    range_shots = (
        db.query(RangeShot, RangeSession)
        .join(RangeSession, RangeShot.session_id == RangeSession.id)
        .filter(RangeShot.club_id == club_id)
        .order_by(RangeSession.session_date.desc(), RangeShot.shot_number)
        .all()
    )
    for s, sess in range_shots:
        shots.append(ClubShotResponse(
            id=f"mlm_{s.id}",
            raw_id=s.id,
            source="rapsodo_mlm2pro",
            date=sess.session_date.strftime("%Y-%m-%d") if sess.session_date else None,
            shot_number=s.shot_number,
            carry_yards=s.carry_yards,
            total_yards=s.total_yards,
            ball_speed_mph=s.ball_speed_mph,
            club_speed_mph=s.club_speed_mph,
            smash_factor=s.smash_factor,
            launch_angle_deg=s.launch_angle_deg,
            launch_direction_deg=s.launch_direction_deg,
            attack_angle_deg=s.attack_angle_deg,
            club_path_deg=s.club_path_deg,
            spin_rate_rpm=s.spin_rate_rpm,
            spin_axis_deg=s.spin_axis_deg,
            apex_yards=s.apex_yards,
            side_carry_yards=s.side_carry_yards,
            descent_angle_deg=s.descent_angle_deg,
            session_name=sess.title,
        ))

    # ── Trackman shots ──
    tm_shots = (
        db.query(TrackmanShot, RangeSession)
        .join(RangeSession, TrackmanShot.session_id == RangeSession.id)
        .filter(TrackmanShot.club_id == club_id)
        .order_by(RangeSession.session_date.desc(), TrackmanShot.shot_number)
        .all()
    )
    for s, sess in tm_shots:
        shots.append(ClubShotResponse(
            id=f"tm_{s.id}",
            raw_id=s.id,
            source="trackman",
            date=sess.session_date.strftime("%Y-%m-%d") if sess.session_date else None,
            shot_number=s.shot_number,
            carry_yards=s.carry_yards,
            total_yards=s.total_yards,
            ball_speed_mph=s.ball_speed_mph,
            club_speed_mph=s.club_speed_mph,
            smash_factor=s.smash_factor,
            launch_angle_deg=s.launch_angle_deg,
            launch_direction_deg=s.launch_direction_deg,
            attack_angle_deg=s.attack_angle_deg,
            club_path_deg=s.club_path_deg,
            face_angle_deg=s.face_angle_deg,
            face_to_path_deg=s.face_to_path_deg,
            dynamic_loft_deg=s.dynamic_loft_deg,
            spin_loft_deg=s.spin_loft_deg,
            swing_plane_deg=s.swing_plane_deg,
            swing_direction_deg=s.swing_direction_deg,
            dynamic_lie_deg=s.dynamic_lie_deg,
            landing_angle_deg=s.landing_angle_deg,
            spin_rate_rpm=s.spin_rate_rpm,
            spin_axis_deg=s.spin_axis_deg,
            apex_yards=s.apex_ft / 3.0 if s.apex_ft else None,
            side_carry_yards=s.side_carry_yards,
            side_total_yards=s.side_total_yards,
            curve_yards=s.curve_yards,
            hang_time_sec=s.hang_time_sec,
            impact_offset_in=s.impact_offset_in,
            impact_height_in=s.impact_height_in,
            low_point_distance_in=s.low_point_distance_in,
            session_name=sess.title,
        ))

    # Sort all by date desc
    shots.sort(key=lambda s: s.date or "", reverse=True)

    # Source counts
    source_counts = {"course": 0, "range": 0, "trackman": 0}
    for s in shots:
        if s.source == "course":
            source_counts["course"] += 1
        elif s.source == "rapsodo_mlm2pro":
            source_counts["range"] += 1
        elif s.source == "trackman":
            source_counts["trackman"] += 1

    # Aggregate speed/angle stats from range + trackman shots
    range_tm = [s for s in shots if s.source != "course"]

    return ClubDetailResponse(
        club=_build_club_response(club),
        shots=shots,
        source_counts=source_counts,
        avg_ball_speed=_avg([s.ball_speed_mph for s in range_tm]),
        avg_club_speed=_avg([s.club_speed_mph for s in range_tm]),
        avg_smash_factor=_avg([s.smash_factor for s in range_tm]),
        avg_launch_angle=_avg([s.launch_angle_deg for s in range_tm]),
        avg_attack_angle=_avg([s.attack_angle_deg for s in range_tm]),
        avg_spin_rate=_avg([s.spin_rate_rpm for s in range_tm]),
        avg_club_path=_avg([s.club_path_deg for s in range_tm]),
    )
