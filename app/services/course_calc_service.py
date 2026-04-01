"""
Course spatial computation service.

Pure geometry functions that compute spatial metrics for course shots
using GPS coordinates and hole geometry (fairway path, flag, green, hazards).
All functions return None for missing inputs — no exceptions.
"""

import json
import math
from typing import Optional

from sqlalchemy.orm import Session

from app.models.course import CourseHole, CourseHazard, CourseTee, Course
from app.models.round import Shot, RoundHole, Round
from app.services.strokes_gained import strokes_gained as sg_calc, expected_strokes


# ---------------------------------------------------------------------------
# Geometry helpers — mirror the JS functions in app.js
# ---------------------------------------------------------------------------

def haversine_yards(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in yards."""
    R = 6371000  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    return R * c * 1.09361  # meters to yards


def _calc_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Bearing from point 1 to point 2 in degrees (0-360)."""
    dlng = math.radians(lng2 - lng1)
    y = math.sin(dlng) * math.cos(math.radians(lat2))
    x = (math.cos(math.radians(lat1)) * math.sin(math.radians(lat2))
         - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlng))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _point_to_segment_proj(p_lat, p_lng, a_lat, a_lng, b_lat, b_lng):
    """
    Project point P onto line segment AB using cos(lat) flat-earth approx.
    Returns (proj_lat, proj_lng, t, distance_yards).
    t is the parameterized position along AB (0=A, 1=B).
    """
    cos_lat = math.cos(math.radians(p_lat))
    ax, ay = a_lng * cos_lat, a_lat
    bx, by = b_lng * cos_lat, b_lat
    px, py = p_lng * cos_lat, p_lat
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return a_lat, a_lng, 0.0, haversine_yards(p_lat, p_lng, a_lat, a_lng)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_lat = a_lat + t * (b_lat - a_lat)
    proj_lng = a_lng + t * (b_lng - a_lng)
    dist = haversine_yards(p_lat, p_lng, proj_lat, proj_lng)
    return proj_lat, proj_lng, t, dist


def _point_to_segment_dist(p_lat, p_lng, a_lat, a_lng, b_lat, b_lng) -> float:
    """Distance from point P to line segment AB in yards."""
    _, _, _, dist = _point_to_segment_proj(p_lat, p_lng, a_lat, a_lng, b_lat, b_lng)
    return dist


def _parse_path(json_str) -> list[list[float]]:
    """Parse a JSON path string into [[lat, lng], ...]. Returns [] on failure."""
    if not json_str:
        return []
    try:
        if isinstance(json_str, str):
            return json.loads(json_str)
        return list(json_str)
    except (json.JSONDecodeError, TypeError):
        return []


def _point_in_polygon(lat: float, lng: float, polygon: list[list[float]]) -> bool:
    """Ray-casting algorithm for point-in-polygon test."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


# ---------------------------------------------------------------------------
# Metric computations
# ---------------------------------------------------------------------------

def pin_distance_remaining(
    end_lat: float, end_lng: float,
    flag_lat: float, flag_lng: float,
) -> Optional[float]:
    """Haversine from shot end to flag in yards."""
    if None in (end_lat, end_lng, flag_lat, flag_lng):
        return None
    return round(haversine_yards(end_lat, end_lng, flag_lat, flag_lng), 1)


def pin_distance_from_start(
    start_lat: float, start_lng: float,
    flag_lat: float, flag_lng: float,
) -> Optional[float]:
    """Haversine from shot start to flag in yards."""
    if None in (start_lat, start_lng, flag_lat, flag_lng):
        return None
    return round(haversine_yards(start_lat, start_lng, flag_lat, flag_lng), 1)


def side_from_fairway(
    end_lat: float, end_lng: float,
    fairway_path: list[list[float]],
    tee_lat: float, tee_lng: float,
    flag_lat: float, flag_lng: float,
) -> Optional[dict]:
    """
    Perpendicular distance from shot end to fairway centerline.

    Returns {'distance_yards': float, 'side': 'L'|'R'|'CENTER',
             'signed_yards': float} or None.
    signed_yards: positive = right, negative = left (relative to tee→flag).
    """
    if not fairway_path or len(fairway_path) < 2:
        return None
    if None in (end_lat, end_lng):
        return None

    # Find closest point on fairway polyline
    best_dist = float("inf")
    best_proj_lat = best_proj_lng = 0.0
    best_seg = 0

    for i in range(len(fairway_path) - 1):
        a = fairway_path[i]
        b = fairway_path[i + 1]
        proj_lat, proj_lng, t, dist = _point_to_segment_proj(
            end_lat, end_lng, a[0], a[1], b[0], b[1]
        )
        if dist < best_dist:
            best_dist = dist
            best_proj_lat = proj_lat
            best_proj_lng = proj_lng
            best_seg = i

    distance_yards = round(best_dist, 1)

    if distance_yards < 3:
        return {"distance_yards": distance_yards, "side": "CENTER", "signed_yards": 0.0}

    # Determine left/right using cross product relative to play direction
    # Play direction at the closest segment
    seg_a = fairway_path[best_seg]
    seg_b = fairway_path[min(best_seg + 1, len(fairway_path) - 1)]

    # Vector along fairway segment (play direction)
    cos_lat = math.cos(math.radians(best_proj_lat))
    fwd_x = (seg_b[1] - seg_a[1]) * cos_lat  # lng direction
    fwd_y = seg_b[0] - seg_a[0]               # lat direction

    # Vector from projection point to shot landing
    to_shot_x = (end_lng - best_proj_lng) * cos_lat
    to_shot_y = end_lat - best_proj_lat

    # Cross product: positive = right of play direction, negative = left
    cross = fwd_x * to_shot_y - fwd_y * to_shot_x
    side = "R" if cross < 0 else "L"
    signed = distance_yards if side == "R" else -distance_yards

    return {"distance_yards": distance_yards, "side": side, "signed_yards": round(signed, 1)}


def distance_along_fairway(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float,
    fairway_path: list[list[float]],
) -> Optional[dict]:
    """
    Project shot start and end onto fairway path, measure progress.

    Returns {'start_along': float, 'end_along': float,
             'progress_yards': float, 'total_length': float} or None.
    """
    if not fairway_path or len(fairway_path) < 2:
        return None
    if None in (start_lat, start_lng, end_lat, end_lng):
        return None

    # Compute cumulative arc lengths for each segment
    seg_lengths = []
    cum_lengths = [0.0]
    for i in range(len(fairway_path) - 1):
        a, b = fairway_path[i], fairway_path[i + 1]
        seg_len = haversine_yards(a[0], a[1], b[0], b[1])
        seg_lengths.append(seg_len)
        cum_lengths.append(cum_lengths[-1] + seg_len)

    total_length = cum_lengths[-1]

    def project_along(lat, lng):
        best_dist = float("inf")
        best_along = 0.0
        for i in range(len(fairway_path) - 1):
            a, b = fairway_path[i], fairway_path[i + 1]
            _, _, t, dist = _point_to_segment_proj(lat, lng, a[0], a[1], b[0], b[1])
            if dist < best_dist:
                best_dist = dist
                best_along = cum_lengths[i] + t * seg_lengths[i]
        return round(best_along, 1)

    start_along = project_along(start_lat, start_lng)
    end_along = project_along(end_lat, end_lng)

    return {
        "start_along": start_along,
        "end_along": end_along,
        "progress_yards": round(end_along - start_along, 1),
        "total_length": round(total_length, 1),
    }


def hazard_proximity(
    end_lat: float, end_lng: float,
    hazards: list[CourseHazard],
) -> Optional[dict]:
    """
    Distance from shot end to nearest hazard polygon edge.

    Returns {'distance_yards': float, 'hazard_type': str,
             'hazard_name': str|None} or None.
    """
    if None in (end_lat, end_lng) or not hazards:
        return None

    best = None
    for h in hazards:
        boundary = _parse_path(h.boundary)
        if len(boundary) < 3:
            continue

        # Check if point is inside the hazard
        if _point_in_polygon(end_lat, end_lng, boundary):
            dist = 0.0
        else:
            # Find min distance to any edge of the polygon
            dist = float("inf")
            for i in range(len(boundary)):
                j = (i + 1) % len(boundary)
                d = _point_to_segment_dist(
                    end_lat, end_lng,
                    boundary[i][0], boundary[i][1],
                    boundary[j][0], boundary[j][1],
                )
                dist = min(dist, d)

        if best is None or dist < best["distance_yards"]:
            best = {
                "distance_yards": round(dist, 1),
                "hazard_type": h.hazard_type,
                "hazard_name": h.name,
            }

    return best


def green_proximity(
    end_lat: float, end_lng: float,
    green_boundary: list[list[float]],
    flag_lat: float = None, flag_lng: float = None,
) -> Optional[dict]:
    """
    Distance to green and whether the shot is on the green.

    Returns {'distance_yards': float, 'on_green': bool} or None.
    """
    if None in (end_lat, end_lng):
        return None

    if green_boundary and len(green_boundary) >= 3:
        on_green = _point_in_polygon(end_lat, end_lng, green_boundary)
        if on_green:
            return {"distance_yards": 0.0, "on_green": True}

        # Distance to nearest edge
        dist = float("inf")
        for i in range(len(green_boundary)):
            j = (i + 1) % len(green_boundary)
            d = _point_to_segment_dist(
                end_lat, end_lng,
                green_boundary[i][0], green_boundary[i][1],
                green_boundary[j][0], green_boundary[j][1],
            )
            dist = min(dist, d)
        return {"distance_yards": round(dist, 1), "on_green": False}

    # No green boundary — fall back to flag distance if available
    if flag_lat is not None and flag_lng is not None:
        dist = haversine_yards(end_lat, end_lng, flag_lat, flag_lng)
        # Rough heuristic: within 15 yards of flag likely on green
        return {"distance_yards": round(dist, 1), "on_green": dist < 15}

    return None


# ---------------------------------------------------------------------------
# Composite computation
# ---------------------------------------------------------------------------

def compute_shot_metrics(
    shot: Shot,
    course_hole: Optional[CourseHole],
    hazards: list[CourseHazard],
) -> dict:
    """
    Compute all spatial metrics for a single shot.

    Returns flat dict with keys matching Shot model computed columns.
    All values may be None if required inputs are missing.
    """
    result = {
        "pin_distance_yards": None,
        "fairway_side": None,
        "fairway_side_yards": None,
        "fairway_progress_yards": None,
        "nearest_hazard_type": None,
        "nearest_hazard_name": None,
        "nearest_hazard_yards": None,
        "green_distance_yards": None,
        "on_green": None,
        "sg_pga": None,
    }

    if not course_hole:
        return result

    flag_lat = course_hole.flag_lat
    flag_lng = course_hole.flag_lng
    tee_lat = course_hole.tee_lat
    tee_lng = course_hole.tee_lng
    fairway_path = _parse_path(course_hole.fairway_path)
    green_boundary = _parse_path(course_hole.green_boundary)

    # Pin distance remaining (from shot end)
    try:
        result["pin_distance_yards"] = pin_distance_remaining(
            shot.end_lat, shot.end_lng, flag_lat, flag_lng
        )
    except Exception:
        pass

    # Pin distance from start (for SG calculation)
    pin_before = None
    try:
        pin_before = pin_distance_from_start(
            shot.start_lat, shot.start_lng, flag_lat, flag_lng
        )
    except Exception:
        pass

    # Side from fairway
    try:
        fw = side_from_fairway(
            shot.end_lat, shot.end_lng,
            fairway_path, tee_lat, tee_lng, flag_lat, flag_lng,
        )
        if fw:
            result["fairway_side"] = fw["side"]
            result["fairway_side_yards"] = fw["signed_yards"]
    except Exception:
        pass

    # Distance along fairway
    try:
        af = distance_along_fairway(
            shot.start_lat, shot.start_lng,
            shot.end_lat, shot.end_lng,
            fairway_path,
        )
        if af:
            result["fairway_progress_yards"] = af["progress_yards"]
    except Exception:
        pass

    # Hazard proximity
    try:
        hp = hazard_proximity(shot.end_lat, shot.end_lng, hazards)
        if hp:
            result["nearest_hazard_type"] = hp["hazard_type"]
            result["nearest_hazard_name"] = hp["hazard_name"]
            result["nearest_hazard_yards"] = hp["distance_yards"]
    except Exception:
        pass

    # Green proximity
    try:
        gp = green_proximity(
            shot.end_lat, shot.end_lng, green_boundary, flag_lat, flag_lng,
        )
        if gp:
            result["green_distance_yards"] = gp["distance_yards"]
            result["on_green"] = gp["on_green"]
    except Exception:
        pass

    # Strokes gained (PGA baseline)
    try:
        if pin_before is not None and result["pin_distance_yards"] is not None:
            start_lie = shot.start_lie or ""
            end_lie = shot.end_lie or ""
            # For the last shot (holed out), expected_after = 0
            pin_after = result["pin_distance_yards"]
            if pin_after < 1 and end_lie == "":
                # Holed out — SG = expected_before - 0 - 1 = expected_before - 1
                exp_before = expected_strokes(pin_before, start_lie)
                if exp_before is not None:
                    result["sg_pga"] = round(exp_before - 1, 2)
            else:
                sg = sg_calc(pin_before, start_lie, pin_after, end_lie)
                result["sg_pga"] = sg
    except Exception:
        pass

    return result


# ---------------------------------------------------------------------------
# Recalculation functions (take a DB session)
# ---------------------------------------------------------------------------

def recalc_hole_shots(
    db: Session,
    course_hole: CourseHole,
    hazards: list[CourseHazard],
) -> int:
    """
    Recalculate computed metrics for all shots on this hole across all rounds.

    Returns the number of shots updated.
    """
    # Find the course for this hole's tee
    tee = db.query(CourseTee).filter(CourseTee.id == course_hole.tee_id).first()
    if not tee:
        return 0

    # Find all rounds on this course + tee
    rounds = (
        db.query(Round)
        .filter(Round.course_id == tee.course_id, Round.tee_id == tee.id)
        .all()
    )
    if not rounds:
        return 0

    round_ids = [r.id for r in rounds]

    # Get all RoundHoles for this hole number in these rounds
    round_holes = (
        db.query(RoundHole)
        .filter(
            RoundHole.round_id.in_(round_ids),
            RoundHole.hole_number == course_hole.hole_number,
        )
        .all()
    )
    if not round_holes:
        return 0

    rh_ids = [rh.id for rh in round_holes]
    shots = db.query(Shot).filter(Shot.round_hole_id.in_(rh_ids)).all()

    count = 0
    for shot in shots:
        metrics = compute_shot_metrics(shot, course_hole, hazards)
        for key, val in metrics.items():
            setattr(shot, key, val)
        count += 1

    if count:
        db.commit()

    return count


def recalc_course_shots(db: Session, course_id: int) -> int:
    """
    Recalculate computed metrics for all shots across all holes of a course.

    Returns total number of shots updated.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        return 0

    tees = db.query(CourseTee).filter(CourseTee.course_id == course_id).all()
    if not tees:
        return 0

    hazards = (
        db.query(CourseHazard)
        .filter(CourseHazard.golf_club_id == course.golf_club_id)
        .all()
    )

    total = 0
    for tee in tees:
        holes = db.query(CourseHole).filter(CourseHole.tee_id == tee.id).all()
        for hole in holes:
            total += recalc_hole_shots(db, hole, hazards)

    return total


def recalc_round_shots(db: Session, round_id: int) -> int:
    """
    Recalculate computed metrics for all shots in a specific round.

    Returns number of shots updated.
    """
    rnd = db.query(Round).filter(Round.id == round_id).first()
    if not rnd or not rnd.course_id or not rnd.tee_id:
        return 0

    course = db.query(Course).filter(Course.id == rnd.course_id).first()
    if not course:
        return 0

    hazards = (
        db.query(CourseHazard)
        .filter(CourseHazard.golf_club_id == course.golf_club_id)
        .all()
    )

    holes_map = {}
    course_holes = db.query(CourseHole).filter(CourseHole.tee_id == rnd.tee_id).all()
    for ch in course_holes:
        holes_map[ch.hole_number] = ch

    round_holes = db.query(RoundHole).filter(RoundHole.round_id == round_id).all()

    count = 0
    for rh in round_holes:
        course_hole = holes_map.get(rh.hole_number)
        shots = db.query(Shot).filter(Shot.round_hole_id == rh.id).all()
        for shot in shots:
            metrics = compute_shot_metrics(shot, course_hole, hazards)
            for key, val in metrics.items():
                setattr(shot, key, val)
            count += 1

    if count:
        db.commit()

    return count
