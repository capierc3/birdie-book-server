"""
Parsers for Garmin Connect JSON data export files.

Garmin data exports include 5 JSON files:
  Golf-CLUB.json        — Player's bag (clubs with garmin IDs)
  Golf-CLUB_TYPES.json  — Reference table mapping clubTypeId to name/specs
  Golf-COURSE.json      — Course ID → name mapping
  Golf-SCORECARD.json   — Rounds with per-hole scoring (putts, fairway, etc.)
  Golf-SHOT.json        — Individual shot GPS data with club, lie, distance

All records have unique Garmin IDs for upsert-based import.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


# --- Club Types reference (clubTypeId → name) ---

CLUB_TYPE_MAP: dict[int, dict] = {}


def load_club_types(data: list[dict]) -> dict[int, dict]:
    """Load CLUB_TYPES reference data. Returns {clubTypeId: {name, loft, lie, shaft}}."""
    global CLUB_TYPE_MAP
    CLUB_TYPE_MAP = {
        ct["value"]: {
            "name": ct["name"],
            "loft_deg": ct.get("loftAngle", 0),
            "lie_deg": ct.get("lieAngle", 0),
            "shaft_length_in": ct.get("shaftLength", 0),
        }
        for ct in data
        if ct.get("valid", False)
    }
    return CLUB_TYPE_MAP


# --- Parsed dataclasses ---

@dataclass
class ParsedClub:
    garmin_id: int
    club_type: str  # Standard type: "Driver", "7 Iron", etc. (from club_type_id)
    club_type_id: int
    name: Optional[str] = None  # Custom user name if different from club_type
    model: Optional[str] = None
    shaft_length_in: float = 0
    flex: str = "REGULAR"
    loft_deg: float = 0
    lie_deg: float = 0
    retired: bool = False
    deleted: bool = False
    last_modified: Optional[datetime] = None


@dataclass
class ParsedCourseRef:
    garmin_snapshot_id: int
    name: str  # Original full name from Garmin
    club_name: str = ""  # Left of ~ (or full name if no ~)
    course_name: Optional[str] = None  # Right of ~ (None for single-course clubs)


@dataclass
class ParsedHoleScore:
    hole_number: int
    strokes: int
    handicap_score: Optional[int] = None
    putts: Optional[int] = None
    fairway: Optional[str] = None  # HIT, LEFT, RIGHT, SHORT_LEFT, SHORT_RIGHT, etc.
    pin_lat: Optional[float] = None
    pin_lng: Optional[float] = None


@dataclass
class ParsedScorecard:
    garmin_id: int
    player_name: str
    course_snapshot_id: int
    course_name: Optional[str] = None
    score_type: str = "STROKE_PLAY"
    date: Optional[datetime] = None
    end_time: Optional[datetime] = None
    holes_completed: int = 0
    total_strokes: int = 0
    handicapped_strokes: int = 0
    score_vs_par: int = 0
    player_handicap: float = 0
    tee_box: Optional[str] = None
    tee_box_rating: Optional[float] = None
    tee_box_slope: Optional[int] = None
    exclude_from_stats: bool = False
    distance_walked_m: int = 0
    steps_taken: int = 0
    last_modified: Optional[datetime] = None
    holes: list[ParsedHoleScore] = field(default_factory=list)


@dataclass
class ParsedShotLoc:
    lat: float  # semicircles
    lng: float  # semicircles
    lie: Optional[str] = None  # Fairway, Rough, Green, Tee Box, etc.
    lie_source: Optional[str] = None


@dataclass
class ParsedShot:
    garmin_id: int
    scorecard_id: int
    hole_number: int
    shot_order: int
    club_id: int  # maps to Club.garmin_id (0 = unknown)
    club_name: Optional[str] = None
    start_loc: Optional[ParsedShotLoc] = None
    end_loc: Optional[ParsedShotLoc] = None
    distance_meters: float = 0
    shot_type: Optional[str] = None  # TEE, APPROACH, CHIP, PUTT, etc.
    auto_shot_type: Optional[str] = None  # USED, PENALTY, etc.
    shot_source: Optional[str] = None  # DEVICE_AUTO, MANUAL, etc.
    shot_time: Optional[datetime] = None
    last_modified: Optional[datetime] = None


# --- GPS conversion (Garmin semicircles → degrees) ---

def _sc_to_deg(semicircles: int) -> float:
    return semicircles * (180.0 / 2**31)


def _parse_iso_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _parse_epoch_ms(ms: Optional[int]) -> Optional[datetime]:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


# --- Parsers ---

def parse_clubs(data: list[dict], club_types: dict[int, dict] | None = None) -> list[ParsedClub]:
    """Parse Golf-CLUB.json data array."""
    from app.services.garmin_club_types import get_standard_club_type

    types = club_types or CLUB_TYPE_MAP
    results = []
    for c in data:
        type_id = c.get("clubTypeId", 0)
        type_info = types.get(type_id, {})

        # Standard type from CLUB_TYPES.json or hardcoded fallback
        standard_type = type_info.get("name") or get_standard_club_type(type_id, "Unknown")

        # User-given name — only store if it differs from the standard type
        user_name = (c.get("name") or "").strip()
        custom_name = user_name if user_name and user_name != standard_type else None

        results.append(ParsedClub(
            garmin_id=c["id"],
            club_type=standard_type,
            club_type_id=type_id,
            name=custom_name,
            model=c.get("model", "").strip() or None,
            shaft_length_in=c.get("shaftLength", type_info.get("shaft_length_in", 0)),
            flex=c.get("flexTypeId", "REGULAR"),
            loft_deg=type_info.get("loft_deg", 0),
            lie_deg=type_info.get("lie_deg", 0),
            retired=c.get("retired", False),
            deleted=c.get("deleted", False),
            last_modified=_parse_iso_dt(c.get("lastModifiedTime")),
        ))
    return results


def _split_course_name(full_name: str) -> tuple[str, Optional[str]]:
    """Split 'Club Name ~ Course Name' into (club_name, course_name).
    Returns (full_name, None) if no ~ separator found."""
    if "~" in full_name:
        parts = full_name.split("~", 1)
        return parts[0].strip(), parts[1].strip()
    return full_name.strip(), None


def parse_courses(data: list[dict]) -> list[ParsedCourseRef]:
    """Parse Golf-COURSE.json data array."""
    results = []
    for entry in data:
        for snapshot_id, name in entry.items():
            club_name, course_name = _split_course_name(name)
            results.append(ParsedCourseRef(
                garmin_snapshot_id=int(snapshot_id),
                name=name,
                club_name=club_name,
                course_name=course_name,
            ))
    return results


def parse_scorecards(data: list[dict], course_map: dict[int, str] | None = None) -> list[ParsedScorecard]:
    """Parse Golf-SCORECARD.json data array."""
    results = []
    for sc in data:
        holes = []
        for h in sc.get("holes", []):
            pin_lat = h.get("pinPositionLat")
            pin_lng = h.get("pinPositionLon")
            holes.append(ParsedHoleScore(
                hole_number=h["number"],
                strokes=h.get("strokes", 0),
                handicap_score=h.get("handicapScore"),
                putts=h.get("putts"),
                fairway=h.get("fairwayShotOutcome"),
                pin_lat=_sc_to_deg(pin_lat) if pin_lat else None,
                pin_lng=_sc_to_deg(pin_lng) if pin_lng else None,
            ))

        course_id = sc.get("courseSnapshotId", 0)
        course_name = (course_map or {}).get(course_id)

        results.append(ParsedScorecard(
            garmin_id=sc["id"],
            player_name=sc.get("roundPlayerName", "Unknown"),
            course_snapshot_id=course_id,
            course_name=course_name,
            score_type=sc.get("scoreType", "STROKE_PLAY"),
            date=_parse_iso_dt(sc.get("startTime")),
            end_time=_parse_iso_dt(sc.get("endTime")),
            holes_completed=sc.get("holesCompleted", 0),
            total_strokes=sc.get("strokes", 0),
            handicapped_strokes=sc.get("handicappedStrokes", 0),
            score_vs_par=sc.get("score", 0),
            player_handicap=sc.get("playerHandicap", 0),
            tee_box=sc.get("teeBox"),
            tee_box_rating=sc.get("teeBoxRating"),
            tee_box_slope=sc.get("teeBoxSlope"),
            exclude_from_stats=sc.get("excludeFromStats", False),
            distance_walked_m=sc.get("distanceWalked", 0),
            steps_taken=sc.get("stepsTaken", 0),
            last_modified=_parse_iso_dt(sc.get("lastModifiedDt")),
            holes=holes,
        ))
    return results


def parse_shots(data: list[dict], club_map: dict[int, str] | None = None) -> list[ParsedShot]:
    """Parse Golf-SHOT.json data array."""
    results = []
    for s in data:
        start = s.get("startLoc")
        end = s.get("endLoc")

        start_loc = ParsedShotLoc(
            lat=_sc_to_deg(start["lat"]),
            lng=_sc_to_deg(start["lon"]),
            lie=start.get("lie"),
            lie_source=start.get("lieSource"),
        ) if start else None

        end_loc = ParsedShotLoc(
            lat=_sc_to_deg(end["lat"]),
            lng=_sc_to_deg(end["lon"]),
            lie=end.get("lie"),
            lie_source=end.get("lieSource"),
        ) if end else None

        club_id = s.get("clubId", 0)
        club_name = (club_map or {}).get(club_id) if club_id else None

        results.append(ParsedShot(
            garmin_id=s["id"],
            scorecard_id=s["scorecardId"],
            hole_number=s.get("holeNumber", 0),
            shot_order=s.get("shotOrder", 0),
            club_id=club_id,
            club_name=club_name,
            start_loc=start_loc,
            end_loc=end_loc,
            distance_meters=s.get("meters", 0),
            shot_type=s.get("shotType"),
            auto_shot_type=s.get("autoShotType"),
            shot_source=s.get("shotSource"),
            shot_time=_parse_epoch_ms(s.get("shotTime")),
            last_modified=_parse_iso_dt(s.get("lastModifiedTime")),
        ))
    return results


def parse_full_export(files: dict[str, dict]) -> dict:
    """
    Parse a complete Garmin data export.

    Args:
        files: dict with keys 'club_types', 'clubs', 'courses', 'scorecards', 'shots'
               each containing the parsed JSON data.

    Returns:
        dict with parsed dataclass lists for each type.
    """
    # Load club types first (reference table)
    club_types = load_club_types(files.get("club_types", {}).get("data", []))

    # Build club ID → name map for shot enrichment
    clubs = parse_clubs(files.get("clubs", {}).get("data", []), club_types)
    club_map = {c.garmin_id: c.club_type for c in clubs}

    # Build course snapshot ID → name map
    courses = parse_courses(files.get("courses", {}).get("data", []))
    course_map = {c.garmin_snapshot_id: c.name for c in courses}

    # Parse scorecards with course name resolution
    scorecards = parse_scorecards(files.get("scorecards", {}).get("data", []), course_map)

    # Parse shots with club name resolution
    shots = parse_shots(files.get("shots", {}).get("data", []), club_map)

    return {
        "clubs": clubs,
        "courses": courses,
        "scorecards": scorecards,
        "shots": shots,
        "club_types": club_types,
    }
