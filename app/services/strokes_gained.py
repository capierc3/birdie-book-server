"""
Strokes Gained baseline lookup from PGA Tour data + personal baseline.

Uses static CSV baselines (shot + putt) loaded once at import time.
Provides expected_strokes() for any distance/lie combination
and strokes_gained() to compute SG per shot.

Personal baseline is rebuilt from course round data and stored as JSON.
"""

import csv
import json
import math
import os
from datetime import datetime
from typing import Optional

_BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# Loaded at import time: {distance_int: {lie_col: expected_strokes}}
_shot_baseline: dict[int, dict[str, float]] = {}
_putt_baseline: dict[int, float] = {}

# Map Garmin lie strings to CSV column names
_LIE_MAP = {
    # Garmin lies -> shot baseline columns
    "Tee Box": "Tee",
    "TeeBox": "Tee",
    "Fairway": "Fairway",
    "Primary Rough": "Rough",
    "Intermediate Rough": "Rough",
    "Rough": "Rough",
    "Bunker": "Sand",
    "Sand": "Sand",
    # Green uses putt baseline (separate table)
    "Green": "Green",
}


def _load_baselines():
    """Load both CSV files into memory."""
    global _shot_baseline, _putt_baseline

    shot_path = os.path.join(_BASE_DIR, "sg_shot_baseline.csv")
    with open(shot_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dist = int(row["Distance"])
            entry = {}
            for col in ("Tee", "Fairway", "Rough", "Sand"):
                val = row.get(col, "").strip()
                if val:
                    entry[col] = float(val)
            _shot_baseline[dist] = entry

    putt_path = os.path.join(_BASE_DIR, "sg_putt_baseline.csv")
    with open(putt_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dist = int(row["Distance"])
            _putt_baseline[dist] = float(row["Green"])


# Load on import
_load_baselines()


def _interpolate(table: dict[int, float], distance: float) -> float:
    """Linear interpolation between table data points."""
    keys = sorted(table.keys())
    if not keys:
        return 0.0

    if distance <= keys[0]:
        return table[keys[0]]
    if distance >= keys[-1]:
        return table[keys[-1]]

    # Find bracketing keys
    for i in range(len(keys) - 1):
        if keys[i] <= distance <= keys[i + 1]:
            lo, hi = keys[i], keys[i + 1]
            t = (distance - lo) / (hi - lo)
            return table[lo] + t * (table[hi] - table[lo])

    return table[keys[-1]]


def expected_strokes(distance_yards: float, lie: str) -> Optional[float]:
    """
    Look up expected strokes to hole out from a given distance and lie.

    Args:
        distance_yards: Distance to the pin in yards.
        lie: Garmin lie string (e.g. "Fairway", "Tee Box", "Green").

    Returns:
        Expected strokes, or None if lie is unknown.
    """
    sg_lie = _LIE_MAP.get(lie)
    if not sg_lie:
        return None

    if sg_lie == "Green":
        # Convert yards to feet for putt table
        distance_feet = distance_yards * 3
        return _interpolate(_putt_baseline, distance_feet)

    # Shot baseline: extract column for this lie
    col = sg_lie
    # Build a {distance: value} dict for this lie column
    lie_table = {}
    for dist, entry in _shot_baseline.items():
        if col in entry:
            lie_table[dist] = entry[col]

    if not lie_table:
        return None

    return _interpolate(lie_table, distance_yards)


def strokes_gained(
    pin_before_yards: float,
    lie_before: str,
    pin_after_yards: float,
    lie_after: str,
) -> Optional[float]:
    """
    Compute strokes gained for a single shot.

    SG = expected_strokes(before) - expected_strokes(after) - 1

    Positive = gained strokes on the field (good shot).
    Negative = lost strokes vs the field (bad shot).

    Returns None if either lookup fails.
    """
    exp_before = expected_strokes(pin_before_yards, lie_before)
    exp_after = expected_strokes(pin_after_yards, lie_after)

    if exp_before is None or exp_after is None:
        return None

    return round(exp_before - exp_after - 1, 2)


# ---------------------------------------------------------------------------
# Personal baseline
# ---------------------------------------------------------------------------

_PERSONAL_PATH = os.path.join(_BASE_DIR, "sg_personal_baseline.json")
_personal_baseline: dict[str, dict[int, float]] = {}  # lie -> {distance: expected}
_personal_loaded = False
_MIN_SAMPLES = 3


def _load_personal_baseline():
    """Load personal baseline from JSON file (if it exists)."""
    global _personal_baseline, _personal_loaded
    _personal_baseline = {}
    _personal_loaded = True

    if not os.path.exists(_PERSONAL_PATH):
        return

    try:
        with open(_PERSONAL_PATH, encoding="utf-8") as f:
            data = json.load(f)
        for lie, buckets in data.get("baselines", {}).items():
            _personal_baseline[lie] = {int(k): v for k, v in buckets.items()}
    except (json.JSONDecodeError, IOError):
        pass


def reload_personal_baseline():
    """Force reload of personal baseline (call after rebuild)."""
    _load_personal_baseline()


def personal_expected_strokes(distance_yards: float, lie: str) -> Optional[float]:
    """Look up expected strokes from personal baseline."""
    if not _personal_loaded:
        _load_personal_baseline()

    sg_lie = _LIE_MAP.get(lie)
    if not sg_lie or sg_lie not in _personal_baseline:
        return None

    if sg_lie == "Green":
        distance_feet = distance_yards * 3
        return _interpolate(_personal_baseline["Green"], distance_feet)

    return _interpolate(_personal_baseline[sg_lie], distance_yards)


def personal_strokes_gained(
    pin_before_yards: float,
    lie_before: str,
    pin_after_yards: float,
    lie_after: str,
) -> Optional[float]:
    """SG vs personal baseline. Same formula as PGA version."""
    exp_before = personal_expected_strokes(pin_before_yards, lie_before)
    exp_after = personal_expected_strokes(pin_after_yards, lie_after)

    if exp_before is None or exp_after is None:
        return None

    return round(exp_before - exp_after - 1, 2)


def rebuild_personal_baseline(db) -> dict:
    """
    Scan all course shots and build a personal expected-strokes baseline.

    Returns stats dict with shot_count, bucket_count.
    """
    from app.services.course_calc_service import haversine_yards
    from app.models.round import Shot, RoundHole, Round
    from app.models.course import CourseHole, CourseTee

    # Query shots with complete hole data
    rows = (
        db.query(Shot, RoundHole, CourseHole)
        .join(RoundHole, Shot.round_hole_id == RoundHole.id)
        .join(Round, RoundHole.round_id == Round.id)
        .join(CourseTee, Round.tee_id == CourseTee.id)
        .join(CourseHole, (CourseHole.tee_id == CourseTee.id) & (CourseHole.hole_number == RoundHole.hole_number))
        .filter(
            RoundHole.strokes.isnot(None),
            Shot.start_lie.isnot(None),
            Shot.start_lat.isnot(None),
            Shot.start_lng.isnot(None),
            Round.exclude_from_stats != True,  # noqa: E712
        )
        .all()
    )

    # Collect data points: {lie: {distance_bucket: [strokes_remaining, ...]}}
    buckets: dict[str, dict[int, list[float]]] = {}
    shot_count = 0

    for shot, rh, ch in rows:
        if not ch.flag_lat or not ch.flag_lng:
            continue
        if shot.auto_shot_type == "PENALTY":
            continue

        sg_lie = _LIE_MAP.get(shot.start_lie)
        if not sg_lie:
            continue

        dist = haversine_yards(shot.start_lat, shot.start_lng, ch.flag_lat, ch.flag_lng)
        strokes_remaining = rh.strokes - shot.shot_number + 1
        if strokes_remaining < 1:
            continue

        if sg_lie == "Green":
            # Bucket by 3-foot increments
            dist_feet = dist * 3
            bucket_key = max(1, round(dist_feet / 3) * 3)
        else:
            # Bucket by 10-yard increments
            bucket_key = max(10, round(dist / 10) * 10)

        buckets.setdefault(sg_lie, {}).setdefault(bucket_key, []).append(strokes_remaining)
        shot_count += 1

    # Build averages, filtering by min samples
    baselines: dict[str, dict[str, float]] = {}
    bucket_count = 0
    for lie, dist_buckets in buckets.items():
        lie_data = {}
        for dist, values in sorted(dist_buckets.items()):
            if len(values) >= _MIN_SAMPLES:
                lie_data[str(dist)] = round(sum(values) / len(values), 2)
                bucket_count += 1
        if lie_data:
            baselines[lie] = lie_data

    # Write JSON
    output = {
        "generated_at": datetime.now().isoformat(),
        "shot_count": shot_count,
        "bucket_count": bucket_count,
        "min_samples": _MIN_SAMPLES,
        "baselines": baselines,
    }
    os.makedirs(os.path.dirname(_PERSONAL_PATH), exist_ok=True)
    with open(_PERSONAL_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    # Reload into memory
    reload_personal_baseline()

    return {"shot_count": shot_count, "bucket_count": bucket_count}
