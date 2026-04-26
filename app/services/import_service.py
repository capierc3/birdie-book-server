"""
Service to import parsed FIT data into the database.
Handles upserts for courses (match by name) and creates rounds/shots.
"""

from sqlalchemy.orm import Session

from app.models import GolfClub, Course, CourseTee, CourseHole, Round, RoundHole, Shot, Player
from app.services.active_user import get_active_player
from app.services.fit_parser import ParsedRound
from app.services.garmin_json_parser import _split_course_name


def find_or_create_player(db: Session, name: str) -> Player:
    """FIT imports always belong to the active app user."""
    return get_active_player(db, fallback_name=name)


def find_or_create_course(db: Session, parsed: ParsedRound) -> tuple[Course, CourseTee | None]:
    """Find existing course by name or create a new one with tee/hole data."""
    club_name, course_name = _split_course_name(parsed.course_name)

    # Try to find existing club + course combo
    golf_club = db.query(GolfClub).filter(GolfClub.name == club_name).first()
    course = None
    if golf_club:
        course = (db.query(Course)
                  .filter(Course.golf_club_id == golf_club.id, Course.name == course_name)
                  .first())

    if not course:
        if not golf_club:
            golf_club = GolfClub(name=club_name)
            db.add(golf_club)
            db.flush()
        course = Course(
            golf_club_id=golf_club.id,
            name=course_name,
            holes=parsed.holes_completed,
            par=parsed.par,
            slope_rating=parsed.slope_rating,
            course_rating=parsed.course_rating,
        )
        db.add(course)
        db.flush()

    # Find or create the tee box
    tee = None
    if parsed.tee_box:
        tee = (db.query(CourseTee)
               .filter(CourseTee.course_id == course.id, CourseTee.tee_name == parsed.tee_box)
               .first())
        if not tee:
            total_yards = sum(h.yardage_yards for h in parsed.holes)
            tee = CourseTee(
                course_id=course.id,
                tee_name=parsed.tee_box,
                course_rating=parsed.course_rating,
                slope_rating=parsed.slope_rating,
                par_total=parsed.par,
                number_of_holes=parsed.holes_completed,
                total_yards=total_yards,
            )
            db.add(tee)
            db.flush()

            # Add hole data for this tee
            for hd in parsed.holes:
                hole = CourseHole(
                    tee_id=tee.id,
                    hole_number=hd.hole_number,
                    par=hd.par,
                    yardage=hd.yardage_yards,
                    handicap=hd.handicap,
                    flag_lat=hd.flag_lat,
                    flag_lng=hd.flag_lng,
                )
                db.add(hole)

    return course, tee


def import_parsed_round(db: Session, parsed: ParsedRound) -> Round:
    """
    Import a parsed FIT round into the database.
    Skips if a round with the same garmin_id already exists.
    Returns the Round object.
    """
    # Check for duplicate
    existing = db.query(Round).filter(Round.garmin_id == parsed.garmin_id).first()
    if existing:
        return existing

    player = find_or_create_player(db, parsed.player_name)
    course, tee = find_or_create_course(db, parsed)

    # Create the round
    round_obj = Round(
        garmin_id=parsed.garmin_id,
        player_id=player.id,
        course_id=course.id,
        tee_id=tee.id if tee else None,
        date=parsed.date.date(),
        holes_completed=parsed.holes_completed,
        total_strokes=parsed.total_strokes,
        handicapped_strokes=parsed.handicapped_strokes,
        score_vs_par=parsed.total_strokes - parsed.par,
        player_handicap=parsed.player_handicap,
        course_rating=parsed.course_rating,
        slope_rating=parsed.slope_rating,
        shots_tracked=parsed.shots_tracked,
        source="garmin",
    )
    db.add(round_obj)
    db.flush()

    # Create hole scores
    hole_map: dict[int, RoundHole] = {}
    for sc in parsed.scores:
        rh = RoundHole(
            round_id=round_obj.id,
            hole_number=sc.hole_number,
            strokes=sc.strokes,
            handicap_strokes=sc.handicap_strokes,
            putts=sc.putts,
            fairway=sc.fairway,
        )
        db.add(rh)
        db.flush()
        hole_map[sc.hole_number] = rh

    # Create shots
    for shot in parsed.shots:
        rh = hole_map.get(shot.hole_number)
        if rh:
            s = Shot(
                round_hole_id=rh.id,
                round_id=round_obj.id,
                shot_number=shot.shot_number,
                start_lat=shot.start_lat,
                start_lng=shot.start_lng,
                end_lat=shot.end_lat,
                end_lng=shot.end_lng,
                distance_yards=shot.distance_yards,
                timestamp=shot.timestamp,
            )
            db.add(s)

    db.commit()
    return round_obj
