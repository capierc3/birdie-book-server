"""
Import service for Garmin JSON data exports.
Uses upsert logic: insert new records, update existing by garmin_id.
Respects locally_modified flag to protect user edits.
"""

from sqlalchemy.orm import Session

from app.models import GolfClub, Course, CourseTee, CourseHole, Round, RoundHole, Shot, Club, ClubStats, Player
from app.models.range_session import RangeShot
from app.models.trackman_shot import TrackmanShot
from app.services.golf_course_api import _infer_tees_from_rounds
from app.services.garmin_json_parser import (
    ParsedClub, ParsedCourseRef, ParsedScorecard, ParsedShot,
    ParsedShotLoc,
)
from app.services.rapsodo_club_types import relink_orphaned_range_shots


METERS_TO_YARDS = 1.09361


def _find_or_create_player(db: Session, name: str) -> Player:
    player = db.query(Player).filter(Player.name == name).first()
    if not player:
        player = Player(name=name)
        db.add(player)
        db.flush()
    return player


def import_clubs(db: Session, clubs: list[ParsedClub], player_name: str = "Chase Pierce") -> dict:
    """Upsert clubs by garmin_id."""
    player = _find_or_create_player(db, player_name)
    created, updated, skipped = 0, 0, 0

    for c in clubs:
        if c.deleted:
            skipped += 1
            continue

        existing = db.query(Club).filter(Club.garmin_id == c.garmin_id).first()
        if existing:
            # Update if garmin data is newer
            if c.last_modified and existing.garmin_last_modified and c.last_modified <= existing.garmin_last_modified:
                skipped += 1
                continue
            existing.club_type = c.club_type
            existing.club_type_id = c.club_type_id
            existing.name = c.name
            existing.model = c.model
            existing.shaft_length_in = c.shaft_length_in
            existing.flex = c.flex
            existing.loft_deg = c.loft_deg
            existing.lie_deg = c.lie_deg
            existing.retired = c.retired
            existing.garmin_last_modified = c.last_modified
            updated += 1
        else:
            club = Club(
                garmin_id=c.garmin_id,
                player_id=player.id,
                club_type=c.club_type,
                club_type_id=c.club_type_id,
                name=c.name,
                model=c.model,
                shaft_length_in=c.shaft_length_in,
                flex=c.flex,
                loft_deg=c.loft_deg,
                lie_deg=c.lie_deg,
                retired=c.retired,
                source="garmin",
                garmin_last_modified=c.last_modified,
            )
            db.add(club)
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


def _merge_range_clubs(db: Session, player_id: int) -> dict:
    """
    After Garmin club import, merge range-created clubs (garmin_id IS NULL)
    into Garmin clubs with matching club_type. Re-points RangeShots.
    """
    import logging
    log = logging.getLogger(__name__)

    garmin_clubs = db.query(Club).filter(
        Club.garmin_id.isnot(None),
        Club.player_id == player_id,
    ).all()

    merged = 0
    ambiguous = 0

    for gc in garmin_clubs:
        # Find range-created clubs with same type
        range_clubs = db.query(Club).filter(
            Club.garmin_id.is_(None),
            Club.player_id == player_id,
            Club.club_type == gc.club_type,
        ).all()

        if len(range_clubs) == 1:
            rc = range_clubs[0]
            # Re-point range shots (MLM2PRO)
            db.query(RangeShot).filter(
                RangeShot.club_id == rc.id
            ).update({"club_id": gc.id}, synchronize_session="fetch")
            # Re-point Trackman shots
            db.query(TrackmanShot).filter(
                TrackmanShot.club_id == rc.id
            ).update({"club_id": gc.id}, synchronize_session="fetch")
            # Delete range club stats
            db.query(ClubStats).filter(ClubStats.club_id == rc.id).delete()
            # Delete range club
            db.delete(rc)
            merged += 1
            log.info("Merged range club '%s' (id=%d) into Garmin club (id=%d)", gc.club_type, rc.id, gc.id)
        elif len(range_clubs) > 1:
            ambiguous += 1
            log.info("Ambiguous: %d range clubs for type '%s' — skipping auto-merge", len(range_clubs), gc.club_type)

    if merged > 0:
        db.commit()

    return {"merged": merged, "ambiguous": ambiguous}


def _find_or_create_golf_club(db: Session, club_name: str) -> GolfClub:
    """Find an existing GolfClub by name or create a new one."""
    golf_club = db.query(GolfClub).filter(GolfClub.name == club_name).first()
    if not golf_club:
        golf_club = GolfClub(name=club_name)
        db.add(golf_club)
        db.flush()
    return golf_club


def import_courses(db: Session, courses: list[ParsedCourseRef]) -> dict:
    """Upsert courses by garmin_snapshot_id, creating GolfClub parents as needed."""
    created, updated, skipped = 0, 0, 0

    for c in courses:
        existing = db.query(Course).filter(Course.garmin_snapshot_id == c.garmin_snapshot_id).first()
        if existing:
            skipped += 1
            continue

        # Find or create the parent GolfClub
        golf_club = _find_or_create_golf_club(db, c.club_name)

        course = Course(
            golf_club_id=golf_club.id,
            garmin_snapshot_id=c.garmin_snapshot_id,
            name=c.course_name,  # None for single-course clubs
        )
        db.add(course)
        created += 1

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


def import_scorecards(
    db: Session,
    scorecards: list[ParsedScorecard],
    shots_by_scorecard: dict[int, list[ParsedShot]],
    club_map: dict[int, str],
) -> dict:
    """
    Upsert scorecards (rounds) by garmin_id.
    Also imports holes and shots for each scorecard.
    """
    created, updated, skipped = 0, 0, 0

    for sc in scorecards:
        existing = db.query(Round).filter(Round.garmin_id == sc.garmin_id).first()

        if existing:
            # Skip if locally modified or garmin data hasn't changed
            if existing.locally_modified:
                skipped += 1
                continue
            if (sc.last_modified and existing.garmin_last_modified
                    and sc.last_modified <= existing.garmin_last_modified):
                skipped += 1
                continue

            # Update the round — delete old holes/shots and recreate
            db.query(Shot).filter(Shot.round_id == existing.id).delete()
            db.query(RoundHole).filter(RoundHole.round_id == existing.id).delete()
            _update_round_fields(existing, sc, db)
            round_obj = existing
            updated += 1
        else:
            round_obj = _create_round(sc, db)
            created += 1

        # Create holes
        hole_map: dict[int, RoundHole] = {}
        for h in sc.holes:
            rh = RoundHole(
                round_id=round_obj.id,
                hole_number=h.hole_number,
                strokes=h.strokes,
                handicap_strokes=h.handicap_score,
                putts=h.putts,
                fairway=h.fairway,
            )
            db.add(rh)
            db.flush()
            hole_map[h.hole_number] = rh

        # Create shots for this scorecard
        scorecard_shots = shots_by_scorecard.get(sc.garmin_id, [])
        for shot in scorecard_shots:
            rh = hole_map.get(shot.hole_number)
            if not rh:
                continue

            s = Shot(
                garmin_id=shot.garmin_id,
                round_hole_id=rh.id,
                round_id=round_obj.id,
                shot_number=shot.shot_order,
                club=shot.club_name or club_map.get(shot.club_id),
                club_garmin_id=shot.club_id if shot.club_id else None,
                start_lat=shot.start_loc.lat if shot.start_loc else None,
                start_lng=shot.start_loc.lng if shot.start_loc else None,
                start_lie=shot.start_loc.lie if shot.start_loc else None,
                end_lat=shot.end_loc.lat if shot.end_loc else None,
                end_lng=shot.end_loc.lng if shot.end_loc else None,
                end_lie=shot.end_loc.lie if shot.end_loc else None,
                distance_yards=round(shot.distance_meters * METERS_TO_YARDS, 1) if shot.distance_meters else None,
                shot_type=shot.shot_type,
                auto_shot_type=shot.auto_shot_type,
                timestamp=shot.shot_time,
            )
            db.add(s)

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


def _create_round(sc: ParsedScorecard, db: Session) -> Round:
    """Create a new Round from a parsed scorecard."""
    player = _find_or_create_player(db, sc.player_name)

    # Find course by garmin_snapshot_id
    course = db.query(Course).filter(Course.garmin_snapshot_id == sc.course_snapshot_id).first()

    # Find tee
    tee = None
    if course and sc.tee_box:
        tee = (db.query(CourseTee)
               .filter(CourseTee.course_id == course.id, CourseTee.tee_name == sc.tee_box)
               .first())

    round_obj = Round(
        garmin_id=sc.garmin_id,
        player_id=player.id,
        course_id=course.id if course else None,
        tee_id=tee.id if tee else None,
        date=sc.date.date() if sc.date else None,
        holes_completed=sc.holes_completed,
        total_strokes=sc.total_strokes,
        handicapped_strokes=sc.handicapped_strokes,
        score_vs_par=sc.score_vs_par,
        player_handicap=sc.player_handicap,
        course_rating=sc.tee_box_rating,
        slope_rating=sc.tee_box_slope,
        shots_tracked=0,
        exclude_from_stats=sc.exclude_from_stats,
        game_format=sc.score_type,
        distance_walked_m=sc.distance_walked_m,
        steps_taken=sc.steps_taken,
        garmin_last_modified=sc.last_modified,
        source="garmin",
    )
    db.add(round_obj)
    db.flush()
    return round_obj


def _update_round_fields(r: Round, sc: ParsedScorecard, db: Session):
    """Update an existing round with new Garmin data."""
    r.holes_completed = sc.holes_completed
    r.total_strokes = sc.total_strokes
    r.handicapped_strokes = sc.handicapped_strokes
    r.score_vs_par = sc.score_vs_par
    r.player_handicap = sc.player_handicap
    r.course_rating = sc.tee_box_rating
    r.slope_rating = sc.tee_box_slope
    r.exclude_from_stats = sc.exclude_from_stats
    r.game_format = sc.score_type
    r.distance_walked_m = sc.distance_walked_m
    r.steps_taken = sc.steps_taken
    r.garmin_last_modified = sc.last_modified
    db.flush()


def import_full_export(db: Session, parsed: dict, on_progress=None) -> dict:
    """
    Import a complete Garmin JSON export.
    Returns summary of created/updated/skipped per type.
    on_progress(step, detail) is called at each major step if provided.
    """
    import logging
    log = logging.getLogger(__name__)

    def progress(step, detail=""):
        if on_progress:
            on_progress(step, detail)

    results = {}

    # 1. Clubs
    progress("clubs", f"Importing {len(parsed['clubs'])} clubs...")
    results["clubs"] = import_clubs(db, parsed["clubs"])

    # 1b. Merge range-created clubs into Garmin clubs
    # Get player name from scorecards (clubs don't carry player_name)
    player_name = "Chase Pierce"
    if parsed.get("scorecards"):
        player_name = parsed["scorecards"][0].player_name or player_name
    player = _find_or_create_player(db, player_name)
    merge_result = _merge_range_clubs(db, player.id)
    if merge_result["merged"] > 0:
        progress("clubs", f"Auto-merged {merge_result['merged']} range club(s) into Garmin clubs")
    results["club_merges"] = merge_result

    # 1c. Re-link orphaned range shots
    relinked = relink_orphaned_range_shots(db, player.id)
    if relinked > 0:
        progress("clubs", f"Re-linked {relinked} orphaned range shot(s)")
    results["range_relinked"] = relinked

    # 2. Courses
    progress("courses", f"Importing {len(parsed['courses'])} courses...")
    results["courses"] = import_courses(db, parsed["courses"])

    # 3. Build club name map for shot enrichment
    club_map = {c.garmin_id: c.club_type for c in parsed["clubs"]}

    # 4. Group shots by scorecard ID
    shots_by_scorecard: dict[int, list[ParsedShot]] = {}
    for shot in parsed["shots"]:
        shots_by_scorecard.setdefault(shot.scorecard_id, []).append(shot)

    # 5. Scorecards + holes + shots
    total_sc = len(parsed["scorecards"])
    total_shots = len(parsed["shots"])
    progress("scorecards", f"Importing {total_sc} rounds with {total_shots} shots...")
    results["scorecards"] = import_scorecards(db, parsed["scorecards"], shots_by_scorecard, club_map)

    # 6. Infer tee data from round history (no API calls — fast and free)
    progress("tees", f"Inferring tee data for {len(parsed['courses'])} courses...")
    for c in parsed["courses"]:
        course = db.query(Course).filter(Course.garmin_snapshot_id == c.garmin_snapshot_id).first()
        if course:
            # Only infer if course has no tees yet (don't overwrite API data)
            existing = db.query(CourseTee).filter(CourseTee.course_id == course.id).count()
            if existing == 0:
                try:
                    result = _infer_tees_from_rounds(db, course)
                    if result["tees_created"] > 0:
                        log.info("Inferred %d tee(s) for '%s' from round data", result["tees_created"], course.display_name)
                except Exception as e:
                    log.warning("Failed to infer tees for '%s': %s", course.display_name, e)

    # 7. Update shot counts on rounds
    progress("finalizing", "Updating shot counts...")
    for sc in parsed["scorecards"]:
        r = db.query(Round).filter(Round.garmin_id == sc.garmin_id).first()
        if r:
            r.shots_tracked = db.query(Shot).filter(Shot.round_id == r.id).count()
    db.commit()

    progress("done", "Import complete!")
    return results
