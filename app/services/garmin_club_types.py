"""
Standard Garmin golf club type ID → name mapping.

These IDs are consistent across all Garmin golf devices and exports.
The Golf-CLUB_TYPES.json in a Garmin export provides the authoritative
mapping, but this hardcoded fallback covers all known types.
"""

GARMIN_CLUB_TYPE_NAMES: dict[int, str] = {
    1: "Driver",
    2: "3 Wood",
    3: "4 Wood",
    4: "5 Wood",
    5: "7 Wood",
    6: "3 Hybrid",
    7: "4 Hybrid",
    8: "5 Hybrid",
    9: "6 Hybrid",
    10: "1 Iron",
    11: "2 Iron",
    12: "3 Iron",
    13: "4 Iron",
    14: "5 Iron",
    15: "6 Iron",
    16: "7 Iron",
    17: "8 Iron",
    18: "9 Iron",
    19: "Pitching Wedge",
    20: "Gap Wedge",
    21: "Sand Wedge",
    22: "Lob Wedge",
    23: "Putter",
    24: "2 Wood",
    25: "9 Wood",
    26: "7 Wood",  # Duplicate — Garmin uses both 5 and 26 for 7 Wood in some firmware
}


def get_standard_club_type(club_type_id: int, fallback: str = "Unknown") -> str:
    """Look up the standard club type name for a Garmin club type ID."""
    return GARMIN_CLUB_TYPE_NAMES.get(club_type_id, fallback)
