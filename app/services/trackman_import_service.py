"""Import Trackman report data into the database."""

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.player import Player
from app.models.club import Club
from app.models.range_session import RangeSession
from app.models.trackman_shot import TrackmanShot
from app.services.trackman_api import fetch_trackman_report, extract_trackman_id
from app.services.rapsodo_club_types import get_or_create_unknown_club

logger = logging.getLogger(__name__)

# Conversion factors
M_TO_YDS = 1.09361
MS_TO_MPH = 2.23694
M_TO_FT = 3.28084
M_TO_IN = 39.3701

# Trackman club names → standard club type names
TRACKMAN_CLUB_MAP: dict[str, str] = {
    "Driver": "Driver",
    "2Wood": "2 Wood",
    "3Wood": "3 Wood",
    "4Wood": "4 Wood",
    "5Wood": "5 Wood",
    "7Wood": "7 Wood",
    "9Wood": "9 Wood",
    "2Hybrid": "2 Hybrid",
    "3Hybrid": "3 Hybrid",
    "4Hybrid": "4 Hybrid",
    "5Hybrid": "5 Hybrid",
    "6Hybrid": "6 Hybrid",
    "1Iron": "1 Iron",
    "2Iron": "2 Iron",
    "3Iron": "3 Iron",
    "4Iron": "4 Iron",
    "5Iron": "5 Iron",
    "6Iron": "6 Iron",
    "7Iron": "7 Iron",
    "8Iron": "8 Iron",
    "9Iron": "9 Iron",
    "PitchingWedge": "Pitching Wedge",
    "GapWedge": "Gap Wedge",
    "SandWedge": "Sand Wedge",
    "LobWedge": "Lob Wedge",
    "Putter": "Putter",
}


def _standard_club_name(raw: str) -> str:
    """Map Trackman club name to standard name."""
    return TRACKMAN_CLUB_MAP.get(raw, raw)


def _resolve_club(db: Session, raw_club: str, player_id: int) -> int:
    """Find or create a club for the given Trackman club name."""
    standard = _standard_club_name(raw_club)

    # Look for existing club
    club = db.query(Club).filter(
        Club.club_type == standard,
        Club.player_id == player_id,
    ).first()

    if club:
        return club.id

    # Create new club
    from app.api.clubs import _default_club_color
    club = Club(
        club_type=standard,
        player_id=player_id,
        source="trackman",
        color=_default_club_color(standard),
    )
    db.add(club)
    db.flush()
    logger.info("Auto-created club '%s' (source=trackman) for player %d", standard, player_id)
    return club.id


def _safe_float(val) -> float | None:
    """Safely convert a value to float, returning None for missing/invalid."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _convert_measurement(m: dict) -> dict:
    """Convert a Trackman measurement dict from metric to imperial."""
    def _dist(key):
        v = _safe_float(m.get(key))
        return round(v * M_TO_YDS, 1) if v is not None else None

    def _speed(key):
        v = _safe_float(m.get(key))
        return round(v * MS_TO_MPH, 1) if v is not None else None

    def _height(key):
        v = _safe_float(m.get(key))
        return round(v * M_TO_FT, 1) if v is not None else None

    def _inches(key):
        v = _safe_float(m.get(key))
        return round(v * M_TO_IN, 2) if v is not None else None

    def _deg(key):
        return _safe_float(m.get(key))

    return {
        "carry_yards": _dist("Carry"),
        "total_yards": _dist("Total"),
        "side_carry_yards": _dist("CarrySide"),
        "side_total_yards": _dist("TotalSide"),
        "apex_ft": _height("MaxHeight"),
        "curve_yards": _dist("Curve"),
        "club_speed_mph": _speed("ClubSpeed"),
        "ball_speed_mph": _speed("BallSpeed"),
        "ball_speed_diff_mph": _speed("BallSpeedDifference"),
        "launch_angle_deg": _deg("LaunchAngle"),
        "launch_direction_deg": _deg("LaunchDirection"),
        "attack_angle_deg": _deg("AttackAngle"),
        "club_path_deg": _deg("ClubPath"),
        "face_angle_deg": _deg("FaceAngle"),
        "face_to_path_deg": _deg("FaceToPath"),
        "dynamic_loft_deg": _deg("DynamicLoft"),
        "spin_loft_deg": _deg("SpinLoft"),
        "swing_plane_deg": _deg("SwingPlane"),
        "swing_direction_deg": _deg("SwingDirection"),
        "landing_angle_deg": _deg("LandingAngle"),
        "dynamic_lie_deg": _deg("DynamicLie"),
        "spin_rate_rpm": _safe_float(m.get("SpinRate")),
        "spin_axis_deg": _deg("SpinAxis"),
        "smash_factor": _safe_float(m.get("SmashFactor")),
        "smash_index": _safe_float(m.get("SmashIndex")),
        "hang_time_sec": _safe_float(m.get("HangTime")),
        "impact_offset_in": _inches("ImpactOffset"),
        "impact_height_in": _inches("ImpactHeight"),
        "low_point_distance_in": _inches("LowPointDistance"),
        "low_point_height_in": _inches("LowPointHeight"),
        "low_point_side_in": _inches("LowPointSide"),
    }


def import_trackman_report(db: Session, url_or_id: str) -> dict:
    """
    Import a Trackman report by URL or report ID.
    Returns a summary dict.
    """
    report_id, id_type = extract_trackman_id(url_or_id)

    # Check for duplicate
    existing = db.query(RangeSession).filter(
        RangeSession.report_id == report_id
    ).first()
    if existing:
        return {
            "status": "duplicate",
            "session_id": existing.id,
            "message": f"This report was already imported on {existing.created_at}",
        }

    # Fetch from Trackman API
    data = fetch_trackman_report(report_id, id_type)

    if data.get("Kind") != "multiGroupReport":
        raise ValueError(f"Unsupported report kind: {data.get('Kind')}")

    stroke_groups = data.get("StrokeGroups", [])
    if not stroke_groups:
        raise ValueError("Report contains no shot data")

    # Extract player info
    player_info = stroke_groups[0].get("Player", {})
    player_name = player_info.get("Name", "Unknown Player").title()
    session_date_str = stroke_groups[0].get("Date", "")

    # Resolve or create player
    player = db.query(Player).filter(Player.name == player_name).first()
    if not player:
        player = Player(name=player_name)
        db.add(player)
        db.flush()

    # Parse session date
    try:
        session_date = datetime.fromisoformat(session_date_str)
    except (ValueError, TypeError):
        session_date = datetime.now()

    # Create session
    title = f"Trackman — {session_date.strftime('%b %d, %Y')}"
    session = RangeSession(
        player_id=player.id,
        source="trackman",
        session_date=session_date,
        title=title,
        report_id=report_id,
        import_fingerprint=report_id,
    )
    db.add(session)
    db.flush()

    # Import shots
    shot_number = 0
    clubs_created = set()
    total_shots = 0

    for group in stroke_groups:
        raw_club = group.get("Club", "Unknown")

        for stroke in group.get("Strokes", []):
            measurement = stroke.get("Measurement", {})
            if not measurement:
                continue

            shot_number += 1
            total_shots += 1

            # Resolve club
            club_id = _resolve_club(db, raw_club, player.id)

            # Convert measurements
            converted = _convert_measurement(measurement)

            # Trajectory as JSON
            trajectory = measurement.get("BallTrajectory", [])
            trajectory_json = json.dumps(trajectory) if trajectory else None

            # Reduced accuracy
            reduced = measurement.get("ReducedAccuracy", [])
            reduced_json = json.dumps(reduced) if reduced else None

            # Parse timestamp
            ts = None
            time_str = measurement.get("Time") or stroke.get("Time")
            if time_str:
                try:
                    ts = datetime.fromisoformat(time_str.replace("+00:00", "+00:00"))
                except (ValueError, TypeError):
                    pass

            db.add(TrackmanShot(
                session_id=session.id,
                club_id=club_id,
                shot_number=shot_number,
                trackman_id=measurement.get("Id"),
                timestamp=ts,
                club_type_raw=raw_club,
                trajectory_json=trajectory_json,
                reduced_accuracy_json=reduced_json,
                **converted,
            ))

    session.shot_count = total_shots
    db.commit()

    return {
        "status": "imported",
        "session_id": session.id,
        "shot_count": total_shots,
        "clubs": [_standard_club_name(g["Club"]) for g in stroke_groups],
        "player": player_name,
        "date": session_date.isoformat(),
    }
