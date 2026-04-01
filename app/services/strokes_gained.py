"""
Strokes Gained baseline lookup from PGA Tour data.

Uses static CSV baselines (shot + putt) loaded once at import time.
Provides expected_strokes() for any distance/lie combination
and strokes_gained() to compute SG per shot.
"""

import csv
import math
import os
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
