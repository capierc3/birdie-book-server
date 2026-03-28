"""
Rapsodo MLM2PRO club type abbreviation → standard club type name mapping.

Standard names match those used in garmin_club_types.py so clubs can be
linked across data sources.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.club import Club
from app.models.range_session import RangeShot, RangeSession

logger = logging.getLogger(__name__)

UNKNOWN_CLUB_TYPE = "Unknown"

# MLM2PRO abbreviation → standard club type name (all keys lowercase)
# "ot" is the Rapsodo default/unassigned club — routes to the Unknown club
RAPSODO_CLUB_TYPE_MAP: dict[str, str | None] = {
    "ot": None,         # Default / unassigned → Unknown club
    "d": "Driver",
    "2w": "2 Wood",
    "3w": "3 Wood",
    "4w": "4 Wood",
    "5w": "5 Wood",
    "7w": "7 Wood",
    "9w": "9 Wood",
    "2h": "2 Hybrid",
    "3h": "3 Hybrid",
    "4h": "4 Hybrid",
    "5h": "5 Hybrid",
    "6h": "6 Hybrid",
    "1i": "1 Iron",
    "2i": "2 Iron",
    "3i": "3 Iron",
    "4i": "4 Iron",
    "5i": "5 Iron",
    "6i": "6 Iron",
    "7i": "7 Iron",
    "8i": "8 Iron",
    "9i": "9 Iron",
    "pw": "Pitching Wedge",
    "gw": "Gap Wedge",
    "sw": "Sand Wedge",
    "lw": "Lob Wedge",
}


def get_standard_club_type(raw: str) -> str | None:
    """Map a Rapsodo abbreviation to a standard club type name, or None if unassigned."""
    return RAPSODO_CLUB_TYPE_MAP.get(raw.lower())


def get_or_create_unknown_club(db: Session, player_id: int) -> Club:
    """Get or create the Unknown club for a player."""
    club = db.query(Club).filter(
        Club.club_type == UNKNOWN_CLUB_TYPE,
        Club.player_id == player_id,
    ).first()
    if not club:
        from app.api.clubs import _default_club_color
        club = Club(
            club_type=UNKNOWN_CLUB_TYPE,
            player_id=player_id,
            sort_order=999,
            color=_default_club_color(UNKNOWN_CLUB_TYPE),
        )
        db.add(club)
        db.flush()
    return club


def resolve_club(
    db: Session,
    club_type_raw: str,
    player_id: int | None,
    create_if_missing: bool = False,
    source: str = "manual",
    brand: str | None = None,
    model: str | None = None,
) -> int | None:
    """
    Look up a Club record by matching the Rapsodo abbreviation to the
    standard club_type name.  Returns Club.id or None.

    If create_if_missing=True and no match found:
    - For valid club types: creates a new Club with that type, source, brand, model
    - For "ot" / unassigned: returns the Unknown club
    """
    standard = get_standard_club_type(club_type_raw)

    if standard is None:
        # Unassigned type ("ot") — route to Unknown club
        if create_if_missing and player_id is not None:
            return get_or_create_unknown_club(db, player_id).id
        return None

    query = db.query(Club).filter(Club.club_type == standard)
    if player_id is not None:
        query = query.filter(Club.player_id == player_id)

    existing = query.first()
    if existing:
        # Update brand/model if the club doesn't have them yet
        if brand and not existing.model:
            existing.model = f"{brand} {model}".strip() if model else brand
            db.flush()
        return existing.id

    if create_if_missing and player_id is not None:
        from app.api.clubs import _default_club_color
        club_model = f"{brand} {model}".strip() if brand and model else (brand or model or None)
        club = Club(
            club_type=standard,
            player_id=player_id,
            source=source,
            model=club_model,
            color=_default_club_color(standard),
        )
        db.add(club)
        db.flush()
        logger.info("Auto-created club '%s' %s (source=%s) for player %d",
                     standard, f"({club_model})" if club_model else "", source, player_id)
        return club.id

    return None


def relink_orphaned_range_shots(db: Session, player_id: int) -> int:
    """
    Find RangeShots with club_id=NULL and link them to matching clubs.
    Returns count of newly linked shots.
    """
    # Build a map of standard_club_type -> club_id for this player
    clubs = db.query(Club.id, Club.club_type).filter(Club.player_id == player_id).all()
    type_to_clubs: dict[str, list[int]] = defaultdict(list)
    for club_id, club_type in clubs:
        type_to_clubs[club_type].append(club_id)

    # Get Unknown club for unassigned types
    unknown_club = get_or_create_unknown_club(db, player_id)

    # Find orphaned shots for this player
    orphaned = (
        db.query(RangeShot)
        .join(RangeSession)
        .filter(
            RangeShot.club_id.is_(None),
            RangeSession.player_id == player_id,
        )
        .all()
    )

    linked = 0
    for shot in orphaned:
        standard = get_standard_club_type(shot.club_type_raw)
        if standard is None:
            # Unassigned → Unknown club
            shot.club_id = unknown_club.id
            linked += 1
        elif standard in type_to_clubs:
            club_ids = type_to_clubs[standard]
            if len(club_ids) == 1:
                shot.club_id = club_ids[0]
                linked += 1
            # If multiple clubs of same type, skip (ambiguous)

    if linked > 0:
        db.commit()
        logger.info("Re-linked %d orphaned range shots for player %d", linked, player_id)

    return linked
