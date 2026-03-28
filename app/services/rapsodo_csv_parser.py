"""
Parser for Rapsodo MLM2PRO CSV shot export files.

CSV format:
  Line 1: "Rapsodo MLM2PRO: {player_name} - {MM/DD/YYYY HH:MM AM/PM}"
  Line 2: blank
  Then repeated per-club sections:
    - Header row (same 18 columns each time)
    - Shot data rows
    - "Average" summary row
    - "Std. Dev." summary row
    - Blank line separator
"""

import csv
import io
from datetime import datetime
from dataclasses import dataclass, field


@dataclass
class ParsedRangeShot:
    club_type_raw: str
    club_brand: str | None
    club_model: str | None
    carry_yards: float | None
    total_yards: float | None
    ball_speed_mph: float | None
    launch_angle_deg: float | None
    launch_direction_deg: float | None
    apex_yards: float | None
    side_carry_yards: float | None
    club_speed_mph: float | None
    smash_factor: float | None
    descent_angle_deg: float | None
    attack_angle_deg: float | None
    club_path_deg: float | None
    club_data_est_type: int | None
    spin_rate_rpm: float | None
    spin_axis_deg: float | None


@dataclass
class ParsedRangeSession:
    player_name: str
    session_date: datetime
    shots: list[ParsedRangeShot] = field(default_factory=list)


def _parse_float(val: str) -> float | None:
    if not val or val.strip() == "" or val.strip().lower() == "nan":
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _parse_int(val: str) -> int | None:
    if not val or val.strip() == "":
        return None
    try:
        return int(val)
    except ValueError:
        # Could be a float string like "8.0"
        try:
            return int(float(val))
        except ValueError:
            return None


def _parse_header_line(line: str) -> tuple[str, datetime]:
    """
    Parse the first line: 'Rapsodo MLM2PRO: Chase Pierce - 07/25/2025 10:21 PM'
    Returns (player_name, session_date).
    """
    # Remove surrounding quotes if present
    line = line.strip().strip('"')

    # Split on ": " to get past the device prefix
    if ": " not in line:
        raise ValueError(f"Cannot parse header line: {line}")

    after_prefix = line.split(": ", 1)[1]  # "Chase Pierce - 07/25/2025 10:21 PM"

    # Split on " - " to separate name from date
    if " - " not in after_prefix:
        raise ValueError(f"Cannot parse player/date from: {after_prefix}")

    parts = after_prefix.rsplit(" - ", 1)
    player_name = parts[0].strip()
    date_str = parts[1].strip()

    session_date = datetime.strptime(date_str, "%m/%d/%Y %I:%M %p")
    return player_name, session_date


def parse_mlm2pro_csv(content: str) -> ParsedRangeSession:
    """Parse an MLM2PRO CSV export and return structured data."""
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    if not rows:
        raise ValueError("Empty CSV file")

    # Line 1: header with player name and date
    header_text = rows[0][0] if rows[0] else ""
    player_name, session_date = _parse_header_line(header_text)

    shots: list[ParsedRangeShot] = []
    shot_number = 0

    i = 1  # Skip first line
    while i < len(rows):
        row = rows[i]

        # Skip blank lines
        if not row or all(cell.strip() == "" for cell in row):
            i += 1
            continue

        # Skip header rows (start with "Club Type")
        if row[0].strip().strip('"') == "Club Type":
            i += 1
            continue

        # Skip summary rows
        first_val = row[0].strip().strip('"')
        if first_val in ("Average", "Std. Dev."):
            i += 1
            continue

        # This is a shot data row
        if len(row) >= 18:
            shot_number += 1
            shot = ParsedRangeShot(
                club_type_raw=row[0].strip(),
                club_brand=row[1].strip() or None,
                club_model=row[2].strip() or None,
                carry_yards=_parse_float(row[3]),
                total_yards=_parse_float(row[4]),
                ball_speed_mph=_parse_float(row[5]),
                launch_angle_deg=_parse_float(row[6]),
                launch_direction_deg=_parse_float(row[7]),
                apex_yards=_parse_float(row[8]),
                side_carry_yards=_parse_float(row[9]),
                club_speed_mph=_parse_float(row[10]),
                smash_factor=_parse_float(row[11]),
                descent_angle_deg=_parse_float(row[12]),
                attack_angle_deg=_parse_float(row[13]),
                club_path_deg=_parse_float(row[14]),
                club_data_est_type=_parse_int(row[15]),
                spin_rate_rpm=_parse_float(row[16]),
                spin_axis_deg=_parse_float(row[17]),
            )
            shots.append(shot)

        i += 1

    return ParsedRangeSession(
        player_name=player_name,
        session_date=session_date,
        shots=shots,
    )
