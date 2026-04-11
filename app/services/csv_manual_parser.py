"""Parse manually-entered CSV data for range session import."""

import csv
import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Column name aliases → canonical field name
# Each canonical field maps to a list of case-insensitive aliases
COLUMN_ALIASES: dict[str, list[str]] = {
    "club": ["club", "club_type", "club type", "club name"],
    "carry_yards": ["carry", "carry yds", "carry_yards", "carry yards", "carry (yds)"],
    "total_yards": ["total", "total yds", "total_yards", "total yards", "total (yds)"],
    "ball_speed_mph": ["ball speed", "ball_speed", "ball_speed_mph", "ball speed (mph)", "ball speed mph"],
    "height_ft": ["height", "height ft", "height_ft", "height (ft)", "apex", "apex ft", "apex_ft"],
    "launch_angle_deg": ["launch angle", "launch_angle", "launch ang", "launch ang.", "launch_angle_deg", "launch angle (deg)"],
    "launch_direction_deg": ["launch direction", "launch_direction", "launch dir", "launch dir.", "launch_direction_deg", "launch direction (deg)"],
    "carry_side_ft": ["carry side", "carry_side", "carry side ft", "carry_side_ft", "carry side (ft)", "side"],
    "from_pin_yds": ["from pin", "from_pin", "from pin yds", "from_pin_yds", "from pin (yds)", "pin distance"],
    "spin_rate_rpm": ["spin rate", "spin_rate", "spin_rate_rpm", "spin rate (rpm)", "spin"],
    "club_speed_mph": ["club speed", "club_speed", "club_speed_mph", "club speed (mph)"],
    "smash_factor": ["smash factor", "smash_factor", "smash"],
    "attack_angle_deg": ["attack angle", "attack_angle", "attack_angle_deg", "attack angle (deg)"],
    "club_path_deg": ["club path", "club_path", "club_path_deg", "club path (deg)"],
    "spin_axis_deg": ["spin axis", "spin_axis", "spin_axis_deg", "spin axis (deg)"],
}

# Build reverse lookup: lowercase alias → canonical name
_ALIAS_MAP: dict[str, str] = {}
for canonical, aliases in COLUMN_ALIASES.items():
    for alias in aliases:
        _ALIAS_MAP[alias.lower().strip()] = canonical


def _resolve_column(header: str) -> Optional[str]:
    """Map a CSV header to its canonical field name."""
    return _ALIAS_MAP.get(header.lower().strip())


def _parse_numeric(val: str) -> Optional[float]:
    """Parse a numeric string, handling direction suffixes like '6.3R', '4.0L', '1\\'L'."""
    if not val or not val.strip():
        return None
    s = val.strip()
    # Handle direction suffixes (R/L) — may appear before or after foot marks
    sign = 1.0
    if s and s[-1].upper() in ("R", "L"):
        if s[-1].upper() == "L":
            sign = -1.0
        s = s[:-1]
    # Remove trailing foot/inch marks
    s = s.rstrip("'\"")
    # Check again for direction suffix (e.g. "1'L" → after stripping L we have "1'")
    # Already handled above since we strip L first, then foot marks
    if s and s[-1].upper() in ("R", "L"):
        if s[-1].upper() == "L":
            sign = -1.0
        elif s[-1].upper() == "R":
            sign = 1.0
        s = s[:-1]
        s = s.rstrip("'\"")
    try:
        return round(float(s) * sign, 2)
    except (ValueError, TypeError):
        return None


def parse_manual_csv(text: str) -> list[dict]:
    """
    Parse CSV text into a list of shot dictionaries.

    Returns list of dicts with canonical field names.
    Raises ValueError if required columns are missing or no valid rows found.
    """
    reader = csv.reader(io.StringIO(text.strip()))

    # Read header row
    try:
        raw_headers = next(reader)
    except StopIteration:
        raise ValueError("CSV is empty — no header row found")

    # Map headers to canonical names
    column_map: dict[int, str] = {}
    for i, header in enumerate(raw_headers):
        canonical = _resolve_column(header)
        if canonical:
            column_map[i] = canonical

    # Check required columns
    mapped_fields = set(column_map.values())
    if "club" not in mapped_fields:
        raise ValueError("CSV must have a 'Club' column")
    if "carry_yards" not in mapped_fields and "total_yards" not in mapped_fields:
        raise ValueError("CSV must have at least a 'Carry' or 'Total' column")

    # Parse rows
    shots = []
    for row_num, row in enumerate(reader, start=2):
        if not any(cell.strip() for cell in row):
            continue  # skip empty rows

        shot: dict = {}
        for col_idx, canonical in column_map.items():
            if col_idx >= len(row):
                continue
            val = row[col_idx].strip()
            if canonical == "club":
                shot["club"] = val
            else:
                shot[canonical] = _parse_numeric(val)

        # Skip rows without a club name
        if not shot.get("club"):
            continue

        # Skip rows with no distance data at all
        if shot.get("carry_yards") is None and shot.get("total_yards") is None:
            continue

        shots.append(shot)

    if not shots:
        raise ValueError("No valid shot rows found in CSV")

    logger.info("Parsed %d shots from manual CSV (%d columns mapped: %s)",
                len(shots), len(column_map), list(mapped_fields))
    return shots
