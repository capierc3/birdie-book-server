"""
Garmin FIT file parser for golf scorecard data.

FIT Message Types (golf-specific):
  190 = Round summary (course name, tee, rating, slope, etc.)
  191 = Player summary (name, total strokes)
  192 = Scorecard per hole (strokes, handicap strokes, putts, fairway)
  193 = Hole data (par, yardage, handicap index, flag GPS)
  194 = Shot data (start/end GPS, hole number, timestamp)
"""

import math
from datetime import datetime, timezone
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from garmin_fit_sdk import Decoder, Stream


# Garmin FIT stores GPS as semicircles — convert to degrees
def _sc_to_deg(semicircles: int) -> float:
    return semicircles * (180.0 / 2**31)


# Haversine distance in yards
def _haversine_yards(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    meters = R * c
    return meters * 1.09361


# Garmin FIT epoch offset (Dec 31, 1989 00:00:00 UTC)
_GARMIN_EPOCH = datetime(1989, 12, 31, tzinfo=timezone.utc)


def _garmin_ts_to_datetime(ts: int) -> datetime:
    return datetime.fromtimestamp(
        ts + int(_GARMIN_EPOCH.timestamp()), tz=timezone.utc
    )


@dataclass
class ParsedShot:
    hole_number: int
    shot_number: int
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    distance_yards: float
    timestamp: datetime


@dataclass
class ParsedHoleScore:
    hole_number: int
    strokes: int
    handicap_strokes: Optional[int]
    putts: Optional[int]
    fairway: Optional[str]  # HIT, LEFT, RIGHT, or None


@dataclass
class ParsedHoleData:
    hole_number: int
    par: int
    yardage_yards: int
    handicap: int
    flag_lat: float
    flag_lng: float


@dataclass
class ParsedRound:
    garmin_id: int
    course_name: str
    tee_box: Optional[str]
    date: datetime
    holes_completed: int
    total_strokes: int
    handicapped_strokes: int
    player_handicap: float
    course_rating: float
    slope_rating: int
    par: int
    front_nine_strokes: int
    back_nine_strokes: int
    player_name: str
    shots_tracked: int
    holes: list[ParsedHoleData] = field(default_factory=list)
    scores: list[ParsedHoleScore] = field(default_factory=list)
    shots: list[ParsedShot] = field(default_factory=list)


# Fairway mapping from FIT field values
# field6 in MSG 192: 0=HIT, 1=RIGHT, 2=LEFT, 3=not tracked / par 3
_FAIRWAY_MAP = {0: "HIT", 1: "RIGHT", 2: "LEFT"}


def parse_fit_file(file_path: str | Path) -> ParsedRound:
    """Parse a Garmin golf FIT file and return structured data."""
    stream = Stream.from_file(str(file_path))
    decoder = Decoder(stream)
    messages, errors = decoder.read()

    if errors:
        raise ValueError(f"FIT decode errors: {errors}")

    # --- MSG 190: Round summary ---
    summary = messages.get("190", [{}])[0]
    garmin_id = summary.get(0, 0)
    course_name = summary.get(1, "Unknown Course")
    par = summary.get(10, 72)
    tee_box = summary.get(11)
    slope = summary.get(12, 113)
    course_rating = summary.get(21, 0.0)
    round_start_ts = summary.get(3, 0)
    round_date = _garmin_ts_to_datetime(round_start_ts) if round_start_ts else datetime.now(timezone.utc)

    # --- MSG 191: Player summary ---
    player = messages.get("191", [{}])[0]
    player_name = player.get(0, "Player1")
    front_nine = player.get(2, 0)
    back_nine = player.get(3, 0)
    total_strokes = front_nine + back_nine

    # --- MSG 193: Hole data (par, yardage, flag position) ---
    hole_data_list: list[ParsedHoleData] = []
    for hd in messages.get("193", []):
        hole_data_list.append(ParsedHoleData(
            hole_number=hd[0],
            par=hd[2],
            yardage_yards=round(hd[1] / 100),  # centimeters -> yards
            handicap=hd[3],
            flag_lat=_sc_to_deg(hd[4]),
            flag_lng=_sc_to_deg(hd[5]),
        ))

    holes_completed = len(hole_data_list)

    # --- MSG 192: Scorecard per hole ---
    scores_list: list[ParsedHoleScore] = []
    for sc in messages.get("192", []):
        hole_num = sc[1]
        strokes = sc[2]
        h_strokes = sc[3]
        putts_raw = sc.get(5, -1)
        fairway_raw = sc.get(6, 3)

        scores_list.append(ParsedHoleScore(
            hole_number=hole_num,
            strokes=strokes,
            handicap_strokes=h_strokes if h_strokes != strokes else None,
            putts=putts_raw if putts_raw >= 0 else None,
            fairway=_FAIRWAY_MAP.get(fairway_raw),
        ))

    # --- MSG 194: Shot GPS data ---
    shot_records = messages.get("194", [])
    shots_list: list[ParsedShot] = []

    # Group shots by hole — shots are sequential, we match by hole number field
    # Field 0 = player index, Field 1 = hole number (1-indexed)
    shot_counters: dict[int, int] = {}
    for s in shot_records:
        hole_num = s[1]
        ts = s[253]
        start_lat = _sc_to_deg(s[2])
        start_lng = _sc_to_deg(s[3])
        end_lat = _sc_to_deg(s[4])
        end_lng = _sc_to_deg(s[5])
        distance = _haversine_yards(start_lat, start_lng, end_lat, end_lng)

        shot_counters[hole_num] = shot_counters.get(hole_num, 0) + 1

        shots_list.append(ParsedShot(
            hole_number=hole_num,
            shot_number=shot_counters[hole_num],
            start_lat=start_lat,
            start_lng=start_lng,
            end_lat=end_lat,
            end_lng=end_lng,
            distance_yards=round(distance, 1),
            timestamp=_garmin_ts_to_datetime(ts),
        ))

    handicapped_total = sum(s.handicap_strokes or s.strokes for s in scores_list)

    return ParsedRound(
        garmin_id=garmin_id,
        course_name=course_name,
        tee_box=tee_box,
        date=round_date,
        holes_completed=holes_completed,
        total_strokes=total_strokes,
        handicapped_strokes=handicapped_total,
        player_handicap=0,
        course_rating=course_rating,
        slope_rating=slope,
        par=par,
        front_nine_strokes=front_nine,
        back_nine_strokes=back_nine,
        player_name=player_name,
        shots_tracked=len(shots_list),
        holes=hole_data_list,
        scores=scores_list,
        shots=shots_list,
    )
