"""Import parsed Rapsodo MLM2PRO data into the database."""

import hashlib
import logging

from sqlalchemy.orm import Session

from app.models.club import Club
from app.models.player import Player
from app.models.range_session import RangeSession, RangeShot
from app.services.rapsodo_csv_parser import ParsedRangeSession
from app.services.rapsodo_club_types import resolve_club, relink_orphaned_range_shots

logger = logging.getLogger(__name__)


def import_rapsodo_session(db: Session, parsed: ParsedRangeSession, csv_content: str) -> dict:
    """
    Import a parsed MLM2PRO session into the database.

    Returns a summary dict with status, session_id, shot_count, etc.
    """
    # Dedup via SHA-256 fingerprint of raw CSV content
    fingerprint = hashlib.sha256(csv_content.encode("utf-8")).hexdigest()

    existing = db.query(RangeSession).filter(
        RangeSession.import_fingerprint == fingerprint
    ).first()
    if existing:
        return {
            "status": "duplicate",
            "session_id": existing.id,
            "message": f"This file was already imported on {existing.created_at}",
        }

    # Resolve or create player
    player = db.query(Player).filter(Player.name == parsed.player_name).first()
    if not player:
        player = Player(name=parsed.player_name)
        db.add(player)
        db.flush()

    # Snapshot existing club types for this player to detect newly created clubs
    existing_club_types = set(
        row[0] for row in
        db.query(Club.club_type).filter(Club.player_id == player.id).all()
    )

    # Create session
    title = f"MLM2PRO — {parsed.session_date.strftime('%b %d, %Y %I:%M %p')}"
    session = RangeSession(
        player_id=player.id,
        source="rapsodo",
        session_date=parsed.session_date,
        title=title,
        import_fingerprint=fingerprint,
    )
    db.add(session)
    db.flush()

    # Import shots — create_if_missing=True auto-creates clubs as needed
    clubs_matched = 0
    clubs_created_types = set()

    for i, shot in enumerate(parsed.shots, start=1):
        club_id = resolve_club(
            db, shot.club_type_raw, player.id,
            create_if_missing=True, source="rapsodo",
            brand=shot.club_brand, model=shot.club_model,
        )

        # Track whether this was a pre-existing club or newly created
        from app.services.rapsodo_club_types import get_standard_club_type, UNKNOWN_CLUB_TYPE
        standard = get_standard_club_type(shot.club_type_raw)
        resolved_type = standard or UNKNOWN_CLUB_TYPE
        if resolved_type not in existing_club_types:
            clubs_created_types.add(resolved_type)
            existing_club_types.add(resolved_type)  # Don't count again

        clubs_matched += 1

        db.add(RangeShot(
            session_id=session.id,
            club_id=club_id,
            club_type_raw=shot.club_type_raw,
            club_brand=shot.club_brand,
            club_model=shot.club_model,
            shot_number=i,
            carry_yards=shot.carry_yards,
            total_yards=shot.total_yards,
            ball_speed_mph=shot.ball_speed_mph,
            launch_angle_deg=shot.launch_angle_deg,
            launch_direction_deg=shot.launch_direction_deg,
            apex_yards=shot.apex_yards,
            side_carry_yards=shot.side_carry_yards,
            club_speed_mph=shot.club_speed_mph,
            smash_factor=shot.smash_factor,
            descent_angle_deg=shot.descent_angle_deg,
            attack_angle_deg=shot.attack_angle_deg,
            club_path_deg=shot.club_path_deg,
            club_data_est_type=shot.club_data_est_type,
            spin_rate_rpm=shot.spin_rate_rpm,
            spin_axis_deg=shot.spin_axis_deg,
        ))

    session.shot_count = len(parsed.shots)
    db.commit()

    # Re-link any previously orphaned shots now that clubs may exist
    relinked = relink_orphaned_range_shots(db, player.id)

    return {
        "status": "imported",
        "session_id": session.id,
        "shot_count": len(parsed.shots),
        "clubs_matched": clubs_matched,
        "clubs_created": len(clubs_created_types),
        "clubs_created_types": sorted(clubs_created_types),
        "relinked": relinked,
    }
