"""Client for golfcourseapi.com — enriches courses with tee/hole data."""

import logging
import math
import time
from typing import Optional

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.config import settings
from app.models.course import GolfClub, Course, CourseTee, CourseHole
from app.models.round import Round, Shot
from app.services.places_service import lookup_club, apply_places_result

log = logging.getLogger(__name__)

BASE_URL = "https://api.golfcourseapi.com"


def _headers() -> dict:
    return {"Authorization": f"Key {settings.golf_course_api_key}"}


def _api_configured() -> bool:
    return bool(settings.golf_course_api_key)


def search_courses(query: str) -> list[dict]:
    """Search for courses by name. Returns list of course dicts."""
    if not _api_configured():
        return []
    from app.services.api_tracker import track_call, check_limit
    if not check_limit("golf_course_api"):
        raise httpx.HTTPStatusError("Daily API limit reached", request=None, response=type('R', (), {'status_code': 429})())
    track_call("golf_course_api", f"search: {query}")
    resp = httpx.get(
        f"{BASE_URL}/v1/search",
        params={"search_query": query},
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("courses", [])


def get_course_detail(api_id: int) -> Optional[dict]:
    """Get full course detail including tees and holes."""
    if not _api_configured():
        return None
    from app.services.api_tracker import track_call, check_limit
    if not check_limit("golf_course_api"):
        raise httpx.HTTPStatusError("Daily API limit reached", request=None, response=type('R', (), {'status_code': 429})())
    track_call("golf_course_api", f"detail: {api_id}")
    resp = httpx.get(
        f"{BASE_URL}/v1/courses/{api_id}",
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points in miles."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _derive_club_location(db: Session, club: GolfClub) -> tuple[Optional[float], Optional[float]]:
    """Derive a golf club's lat/lng from the first shot of any round played at its courses."""
    if club.lat and club.lng:
        return club.lat, club.lng

    # Find the first shot with GPS data for any round at any course in this club
    shot = (
        db.query(Shot.start_lat, Shot.start_lng)
        .join(Round, Shot.round_id == Round.id)
        .join(Course, Round.course_id == Course.id)
        .filter(
            Course.golf_club_id == club.id,
            Shot.start_lat.isnot(None),
            Shot.start_lng.isnot(None),
        )
        .first()
    )
    if shot and shot.start_lat and shot.start_lng:
        club.lat = shot.start_lat
        club.lng = shot.start_lng
        db.flush()
        log.info("Derived location for %s: %.4f, %.4f", club.name, club.lat, club.lng)
        return club.lat, club.lng

    return None, None


def _build_search_queries(course_name: str) -> list[str]:
    """
    Build a list of search queries, shortest first to minimize API calls.
    Caller should stop searching once good local matches are found.
    """
    queries = []
    parts = course_name.split("~")
    base_name = parts[0].strip()

    # 1. Try abbreviated form first (fewest API calls, broadest results)
    STRIP_SUFFIXES = [
        "golf course", "country club", "golf club", "golf & country club",
        "golf and country club", "golf links", "resort",
    ]
    abbreviated = base_name.lower()
    for suffix in sorted(STRIP_SUFFIXES, key=len, reverse=True):
        if abbreviated.endswith(suffix):
            abbreviated = abbreviated[: -len(suffix)].strip()
            break
    if abbreviated and abbreviated != base_name.lower():
        queries.append(abbreviated)

    # 2. Fall back to the full name if abbreviated didn't match
    queries.append(base_name)

    return queries


def _score_result(
    r: dict,
    club_name: str,
    our_lat: Optional[float] = None,
    our_lng: Optional[float] = None,
    target_course_name: Optional[str] = None,
) -> tuple[int, Optional[float]]:
    """Score a single search result. Returns (score, distance_miles).

    Args:
        club_name: The golf club name to match against API club_name
        target_course_name: The specific course name (e.g., "Pines", "Eagle") to boost matches
    """
    base_name = club_name.lower().strip()

    api_club = (r.get("club_name") or "").lower()
    api_course = (r.get("course_name") or "").lower()
    combined = f"{api_club} {api_course}".strip()

    score = 0
    if base_name == api_club:
        score = 100
    elif base_name in api_club or api_club in base_name:
        score = 70
    elif base_name == combined or base_name in combined:
        score = 60
    else:
        filler = {"golf", "course", "country", "club", "the", "&", "and", "inn", "links", "at"}
        name_words = set(base_name.split()) - filler
        club_words = set(api_club.split()) | set(api_course.split())
        club_words -= filler
        overlap = name_words & club_words
        if len(name_words) > 0 and overlap:
            ratio = len(overlap) / len(name_words)
            score = int(ratio * 80)

    # Bonus for course name match (e.g., "Pines" matches API course "Pines")
    if target_course_name and score >= 30:
        suffix = target_course_name.lower().strip()
        if suffix == api_course or suffix in api_course or api_course in suffix:
            score += 25

    # Location scoring — heavily weight GPS when available
    dist = None
    if our_lat and our_lng and score >= 10:
        loc = r.get("location") or {}
        api_lat = loc.get("latitude")
        api_lng = loc.get("longitude")
        if api_lat and api_lng:
            dist = _haversine_miles(our_lat, our_lng, api_lat, api_lng)
            if dist < 5:
                score += 60   # very strong — same area
            elif dist < 25:
                score += 30   # nearby
            elif dist < 50:
                score += 10
            elif dist > 200:
                score -= 80   # clearly wrong state/region
            elif dist > 100:
                score -= 50   # likely wrong

    log.debug(
        "Score %s / %s (target=%s): final=%d dist=%s",
        r.get("club_name"), r.get("course_name"),
        target_course_name or "none",
        score,
        f"{dist:.0f}mi" if dist else "N/A",
    )
    return score, dist


def _pick_best_match(
    course_name: str,
    results: list[dict],
    our_lat: Optional[float] = None,
    our_lng: Optional[float] = None,
) -> Optional[dict]:
    """Pick the best match from search results by comparing names and location."""
    if not results:
        return None

    best = None
    best_score = -1
    for r in results:
        score, dist = _score_result(r, course_name, our_lat, our_lng)
        if score > best_score:
            best_score = score
            best = r

    if best_score >= 30:
        return best
    return None


def _infer_tees_from_rounds(db: Session, course: Course) -> dict:
    """
    Infer tee and hole data from rounds played at this course.
    Creates CourseTee + CourseHole records using round/shot GPS data.
    """
    from collections import Counter
    from app.models.round import RoundHole

    rounds = (
        db.query(Round)
        .filter(
            Round.course_id == course.id,
            Round.course_rating.isnot(None),
        )
        .all()
    )

    if not rounds:
        return {"tees_created": 0, "holes_created": 0}

    # Group rounds by tee (rating + slope key)
    tee_groups = {}
    for r in rounds:
        tee_key = f"{r.course_rating}_{r.slope_rating}"
        if tee_key not in tee_groups:
            tee_groups[tee_key] = {
                "rating": r.course_rating,
                "slope": r.slope_rating,
                "pars": [],
                "holes_list": [],
                "round_ids": [],
            }
        if r.total_strokes and r.score_vs_par is not None:
            par = r.total_strokes - r.score_vs_par
            tee_groups[tee_key]["pars"].append(par)
        tee_groups[tee_key]["holes_list"].append(r.holes_completed or 18)
        tee_groups[tee_key]["round_ids"].append(r.id)

    tees_created = 0
    holes_created = 0
    first_par = None

    for idx, (key, data) in enumerate(tee_groups.items()):
        # Determine par with sanity check
        par = None
        if data["pars"]:
            candidate_par = Counter(data["pars"]).most_common(1)[0][0]
            holes_count = Counter(data["holes_list"]).most_common(1)[0][0] if data["holes_list"] else 18
            if holes_count <= 9:
                par = candidate_par if 27 <= candidate_par <= 40 else None
            else:
                par = candidate_par if 54 <= candidate_par <= 80 else None

        holes_count = 18
        if data["holes_list"]:
            holes_count = Counter(data["holes_list"]).most_common(1)[0][0]

        tee_name = f"Tee {idx + 1} (inferred)"

        tee = CourseTee(
            course_id=course.id,
            tee_name=tee_name,
            course_rating=data["rating"],
            slope_rating=data["slope"],
            par_total=par,
            number_of_holes=holes_count,
            inferred=True,
        )
        db.add(tee)
        db.flush()
        tees_created += 1

        if first_par is None and par:
            first_par = par

        # Create CourseHole records from round hole data
        # Collect best available data across all rounds at this tee
        hole_data = {}  # hole_number -> {flag_lat, flag_lng}
        for round_id in data["round_ids"]:
            round_holes = (
                db.query(RoundHole)
                .filter(RoundHole.round_id == round_id)
                .order_by(RoundHole.hole_number)
                .all()
            )
            for rh in round_holes:
                if rh.hole_number not in hole_data:
                    hole_data[rh.hole_number] = {"flag_lat": None, "flag_lng": None}

                # Get flag position from the last shot's end position on this hole
                last_shot = (
                    db.query(Shot)
                    .filter(
                        Shot.round_hole_id == rh.id,
                        Shot.end_lat.isnot(None),
                    )
                    .order_by(Shot.shot_number.desc())
                    .first()
                )
                if last_shot and not hole_data[rh.hole_number]["flag_lat"]:
                    hole_data[rh.hole_number]["flag_lat"] = last_shot.end_lat
                    hole_data[rh.hole_number]["flag_lng"] = last_shot.end_lng

        # Create CourseHole for each hole number found
        for hole_num in sorted(hole_data.keys()):
            hd = hole_data[hole_num]
            hole = CourseHole(
                tee_id=tee.id,
                hole_number=hole_num,
                par=4,  # Default — user can update manually
                flag_lat=hd["flag_lat"],
                flag_lng=hd["flag_lng"],
            )
            db.add(hole)
            holes_created += 1

    if first_par and not course.par:
        course.par = first_par

    db.commit()
    log.info(
        "Inferred %d tee(s), %d hole(s) for %s from round data",
        tees_created, holes_created, course.display_name,
    )
    return {"tees_created": tees_created, "holes_created": holes_created}


def search_course_candidates(db: Session, course: Course) -> dict:
    """
    Search for matching courses from golfcourseapi.com and return scored candidates
    for the user to choose from. Does NOT apply any data.
    Uses the GolfClub for location and name lookups.
    """
    if not _api_configured():
        return {"candidates": [], "error": "Golf course API key not configured"}

    club = course.club

    # Derive location from shot GPS data → store on GolfClub
    our_lat, our_lng = _derive_club_location(db, club)

    # Ask Google Places for the official name (GPS-biased)
    places_name = None
    try:
        places_result = lookup_club(club)
        if places_result and places_result.display_name:
            places_name = places_result.display_name
            log.info("Places identified '%s' as '%s'", club.name, places_name)
            # Store Places data (photo, address, place_id) on GolfClub
            apply_places_result(db, club, places_result)
            if not our_lat and places_result.lat:
                our_lat = places_result.lat
                our_lng = places_result.lng
    except Exception as e:
        log.warning("Places lookup failed for %s: %s", club.name, e)

    # Build search queries — shortest first to save API calls
    # Deduplicate across Places and Garmin queries
    queries = []
    seen_q = set()
    for src_queries in [_build_search_queries(club.name)] + ([_build_search_queries(places_name)] if places_name else []):
        for q in src_queries:
            if q.lower() not in seen_q:
                queries.append(q)
                seen_q.add(q.lower())

    # Search with each query, stop early if we find good local matches
    all_results = []
    seen_ids = set()
    rate_limited = False
    api_error = None
    for query in queries:
        try:
            time.sleep(1)
            results = search_courses(query)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                rate_limited = True
                log.warning("Golf course API rate limited on query: %s", query)
            else:
                api_error = str(e)
                log.warning("Golf course API search failed for %s: %s", query, e)
            continue
        except (httpx.ConnectError, httpx.TimeoutException, OSError) as e:
            api_error = "Golf course API is unreachable (connection/SSL timeout). Check your network or try again later."
            log.warning("Golf course API connection error for %s: %s", query, e)
            break  # Don't retry other queries if the API is down
        except httpx.HTTPError as e:
            api_error = str(e)
            log.warning("Golf course API search failed for %s: %s", query, e)
            continue
        for r in results:
            if r["id"] not in seen_ids:
                all_results.append(r)
                seen_ids.add(r["id"])

        # Early exit: if we have nearby matches (<5mi), skip remaining queries
        if our_lat and our_lng and all_results:
            nearby = sum(
                1 for r in all_results
                if r.get("location", {}).get("latitude")
                and _haversine_miles(our_lat, our_lng, r["location"]["latitude"], r["location"]["longitude"]) < 5
            )
            if nearby >= 1:
                log.info("Found %d nearby match(es) on query '%s', skipping remaining queries", nearby, query)
                break

    # Score all results — always use club.name for scoring (not Places name,
    # which can reference a specific course like "Royal" and bias results)
    candidates = []
    for r in all_results:
        score, dist = _score_result(r, club.name, our_lat, our_lng, target_course_name=course.name)
        loc = r.get("location") or {}
        candidates.append({
            "api_id": r["id"],
            "club_name": r.get("club_name", ""),
            "course_name": r.get("course_name", ""),
            "address": loc.get("address", ""),
            "city": loc.get("city", ""),
            "state": loc.get("state", ""),
            "distance_miles": round(dist, 1) if dist is not None else None,
            "score": score,
        })

    # Sort by score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    # Detect if this club has multiple courses or combo courses in results
    # (courses within 5 miles of our location that share similar club names)
    nearby = [c for c in candidates if c["distance_miles"] is not None and c["distance_miles"] < 5]
    has_combos = any("/" in c["course_name"] for c in nearby)
    multi_course_club = len(nearby) > 1

    result = {
        "candidates": candidates[:5],
        "places_name": places_name,
        "our_location": {"lat": our_lat, "lng": our_lng} if our_lat else None,
        "club_sync_available": has_combos or multi_course_club,
        "nearby_course_count": len(nearby),
        "has_combo_courses": has_combos,
        "golf_club_id": club.id,
        "golf_club_name": club.name,
    }
    if rate_limited:
        result["rate_limited"] = True
        result["error"] = "Golf course API daily limit reached (429). Try again tomorrow."
    elif api_error and not all_results:
        result["error"] = f"Golf course API error: {api_error}"
    return result


def apply_golf_course_data(db: Session, course: Course, api_id: int) -> dict:
    """
    Apply tee/hole data from a specific golf course API course to our course.
    Location/address goes on the GolfClub, tees go on Course.
    Called after the user selects a candidate from search_course_candidates.
    """
    try:
        time.sleep(1)
        detail = get_course_detail(api_id)
    except httpx.HTTPError as e:
        log.warning("Golf course API detail failed for id=%s: %s", api_id, e)
        return {"status": "error", "reason": str(e)}

    if not detail:
        return {"status": "error", "reason": "empty response"}

    course_data = detail.get("course", detail)
    club = course.club

    # Update GolfClub-level fields (location, address)
    location = course_data.get("location") or {}
    if not club.address and location.get("address"):
        club.address = location["address"]
    if not club.lat and location.get("latitude"):
        club.lat = location["latitude"]
    if not club.lng and location.get("longitude"):
        club.lng = location["longitude"]

    # Remove existing tees (both inferred and API) before inserting fresh data
    existing_tees = db.query(CourseTee).filter(CourseTee.course_id == course.id).all()
    for t in existing_tees:
        db.query(CourseHole).filter(CourseHole.tee_id == t.id).delete()
        db.delete(t)
    db.flush()

    # Process tees (male + female)
    tees_data = course_data.get("tees") or {}
    tees_created = 0
    holes_created = 0
    first_par = None

    for gender, tee_list in tees_data.items():
        if not isinstance(tee_list, list):
            continue
        for tee_info in tee_list:
            tee_name = tee_info.get("tee_name", "Unknown")
            if gender == "female":
                tee_name = f"{tee_name} (W)"

            tee = CourseTee(
                course_id=course.id,
                tee_name=tee_name,
                course_rating=tee_info.get("course_rating"),
                slope_rating=tee_info.get("slope_rating"),
                par_total=tee_info.get("par_total"),
                number_of_holes=tee_info.get("number_of_holes", 18),
                total_yards=tee_info.get("total_yards"),
                inferred=False,
            )
            db.add(tee)
            db.flush()
            tees_created += 1

            if first_par is None and gender == "male" and tee_info.get("par_total"):
                first_par = tee_info["par_total"]

            api_holes = tee_info.get("holes") or []
            for idx, hole_data in enumerate(api_holes):
                hole = CourseHole(
                    tee_id=tee.id,
                    hole_number=idx + 1,
                    par=hole_data.get("par", 4),
                    yardage=hole_data.get("yardage"),
                    handicap=hole_data.get("handicap"),
                )
                db.add(hole)
                holes_created += 1

    # Set course-level par from API data
    if first_par:
        course.par = first_par

    # Set holes count from first tee
    if tees_created > 0:
        first_tee = tees_data.get("male", tees_data.get("female", []))
        if first_tee and isinstance(first_tee, list) and first_tee:
            num = first_tee[0].get("number_of_holes")
            if num:
                course.holes = num

    db.commit()

    matched_name = f"{course_data.get('club_name', '')} - {course_data.get('course_name', '')}".strip(" -")
    return {
        "status": "enriched",
        "matched": matched_name,
        "api_id": api_id,
        "tees_created": tees_created,
        "holes_created": holes_created,
    }


# ========== Club-Level Sync ==========


def _find_or_create_course_by_name(db: Session, club: GolfClub, course_name: str) -> Course:
    """Find a course by name under a club, or create it."""
    course = (
        db.query(Course)
        .filter(Course.golf_club_id == club.id, Course.name == course_name)
        .first()
    )
    if not course:
        course = Course(golf_club_id=club.id, name=course_name, holes=9)
        db.add(course)
        db.flush()
        log.info("Created new course '%s' under club '%s'", course_name, club.name)
    return course


def _clear_non_inferred_tees(db: Session, course: Course):
    """Remove inferred tees from a course (to replace with API data)."""
    from app.models import Round
    tees = db.query(CourseTee).filter(
        CourseTee.course_id == course.id, CourseTee.inferred == True
    ).all()
    for t in tees:
        # Nullify any round references to this tee before deleting
        db.query(Round).filter(Round.tee_id == t.id).update(
            {"tee_id": None}, synchronize_session="fetch"
        )
        db.query(CourseHole).filter(CourseHole.tee_id == t.id).delete()
        db.delete(t)
    db.flush()


def _apply_tees_to_course(
    db: Session, course: Course, tees_data: dict, is_combo: bool = False
) -> tuple[int, int]:
    """Apply full tee/hole data from the API to a course. Returns (tees_created, holes_created)."""
    # Clear existing inferred tees
    _clear_non_inferred_tees(db, course)

    # Check if course already has non-inferred tees
    has_api_tees = db.query(CourseTee).filter(
        CourseTee.course_id == course.id, CourseTee.inferred == False
    ).count() > 0
    if has_api_tees:
        return 0, 0

    tees_created = 0
    holes_created = 0
    first_par = None

    for gender, tee_list in tees_data.items():
        if not isinstance(tee_list, list):
            continue
        for tee_info in tee_list:
            tee_name = tee_info.get("tee_name", "Unknown")
            if gender == "female":
                tee_name = f"{tee_name} (W)"

            tee = CourseTee(
                course_id=course.id,
                tee_name=tee_name,
                course_rating=tee_info.get("course_rating"),
                slope_rating=tee_info.get("slope_rating"),
                par_total=tee_info.get("par_total"),
                number_of_holes=tee_info.get("number_of_holes", 18),
                total_yards=tee_info.get("total_yards"),
                inferred=False,
            )
            db.add(tee)
            db.flush()
            tees_created += 1

            if first_par is None and gender == "male" and tee_info.get("par_total"):
                first_par = tee_info["par_total"]

            for idx, hole_data in enumerate(tee_info.get("holes") or []):
                db.add(CourseHole(
                    tee_id=tee.id,
                    hole_number=idx + 1,
                    par=hole_data.get("par", 4),
                    yardage=hole_data.get("yardage"),
                    handicap=hole_data.get("handicap"),
                ))
                holes_created += 1

    if first_par:
        course.par = first_par
    if tees_created > 0:
        first_tee = tees_data.get("male", tees_data.get("female", []))
        if first_tee and isinstance(first_tee, list) and first_tee:
            num = first_tee[0].get("number_of_holes")
            if num:
                course.holes = num

    return tees_created, holes_created


def _split_combo_tees_to_standalone(
    db: Session, club: GolfClub, combo_course_name: str, tees_data: dict
) -> dict:
    """
    Split an 18-hole combo course's tee data into two 9-hole standalone courses.
    e.g., "Falcon/Eagle" → front 9 → Falcon, back 9 → Eagle.
    Uses front_*/back_* rating fields and holes[0:9]/holes[9:18].
    """
    parts = combo_course_name.split("/", 1)
    if len(parts) != 2:
        return {"split": False, "reason": "not a combo name"}

    front_name = parts[0].strip()
    back_name = parts[1].strip()

    front_course = _find_or_create_course_by_name(db, club, front_name)
    back_course = _find_or_create_course_by_name(db, club, back_name)

    # Skip if standalone courses already have non-inferred tees
    front_has_api = db.query(CourseTee).filter(
        CourseTee.course_id == front_course.id, CourseTee.inferred == False
    ).count() > 0
    back_has_api = db.query(CourseTee).filter(
        CourseTee.course_id == back_course.id, CourseTee.inferred == False
    ).count() > 0

    if front_has_api and back_has_api:
        return {"split": False, "reason": "both already have API tees"}

    front_tees = 0
    back_tees = 0

    for gender, tee_list in tees_data.items():
        if not isinstance(tee_list, list):
            continue
        for tee_info in tee_list:
            tee_name = tee_info.get("tee_name", "Unknown")
            if gender == "female":
                tee_name = f"{tee_name} (W)"

            all_holes = tee_info.get("holes") or []
            if len(all_holes) < 18:
                continue

            # Front 9 → first named course
            if not front_has_api:
                _clear_non_inferred_tees(db, front_course)
                front_holes = all_holes[:9]
                front_tee = CourseTee(
                    course_id=front_course.id,
                    tee_name=tee_name,
                    course_rating=tee_info.get("front_course_rating"),
                    slope_rating=tee_info.get("front_slope_rating"),
                    par_total=sum(h.get("par", 4) for h in front_holes),
                    total_yards=sum(h.get("yardage", 0) for h in front_holes),
                    number_of_holes=9,
                    inferred=False,
                )
                db.add(front_tee)
                db.flush()
                front_tees += 1
                for idx, h in enumerate(front_holes):
                    db.add(CourseHole(
                        tee_id=front_tee.id,
                        hole_number=idx + 1,
                        par=h.get("par", 4),
                        yardage=h.get("yardage"),
                        handicap=h.get("handicap"),
                    ))

            # Back 9 → second named course (renumber 1-9)
            if not back_has_api:
                _clear_non_inferred_tees(db, back_course)
                back_holes = all_holes[9:18]
                back_tee = CourseTee(
                    course_id=back_course.id,
                    tee_name=tee_name,
                    course_rating=tee_info.get("back_course_rating"),
                    slope_rating=tee_info.get("back_slope_rating"),
                    par_total=sum(h.get("par", 4) for h in back_holes),
                    total_yards=sum(h.get("yardage", 0) for h in back_holes),
                    number_of_holes=9,
                    inferred=False,
                )
                db.add(back_tee)
                db.flush()
                back_tees += 1
                for idx, h in enumerate(back_holes):
                    db.add(CourseHole(
                        tee_id=back_tee.id,
                        hole_number=idx + 1,
                        par=h.get("par", 4),
                        yardage=h.get("yardage"),
                        handicap=h.get("handicap"),
                    ))

    # Update standalone course metadata
    if front_tees > 0:
        front_course.holes = 9
        if not front_course.par:
            first_tee = (tees_data.get("male") or tees_data.get("female") or [{}])[0]
            front_course.par = sum(h.get("par", 4) for h in (first_tee.get("holes") or [])[:9])
    if back_tees > 0:
        back_course.holes = 9
        if not back_course.par:
            first_tee = (tees_data.get("male") or tees_data.get("female") or [{}])[0]
            back_course.par = sum(h.get("par", 4) for h in (first_tee.get("holes") or [])[9:18])

    return {
        "split": True,
        "front": {"course": front_name, "tees_created": front_tees},
        "back": {"course": back_name, "tees_created": back_tees},
    }


def sync_club_courses(db: Session, club: GolfClub) -> dict:
    """
    Sync all courses for a golf club from the golf course API.
    Handles combo courses (e.g., Falcon/Eagle) by splitting tee data
    into standalone 9-hole courses.
    """
    if not _api_configured():
        return {"status": "error", "reason": "Golf course API key not configured"}

    # 1. Derive location + Places lookup
    our_lat, our_lng = _derive_club_location(db, club)

    try:
        from app.services.places_service import lookup_club as _lookup, apply_places_result as _apply
        result = _lookup(club)
        if result:
            _apply(db, club, result)
            if not our_lat and result.lat:
                our_lat, our_lng = result.lat, result.lng
    except Exception as e:
        log.warning("Places lookup failed for %s: %s", club.name, e)

    # 2. Search for all courses at this club (shortest query first, early exit)
    queries = _build_search_queries(club.name)
    all_results = []
    seen_ids = set()
    for query in queries:
        try:
            time.sleep(1)
            results = search_courses(query)
        except httpx.HTTPError as e:
            log.warning("Search failed for %s: %s", query, e)
            continue
        for r in results:
            if r["id"] not in seen_ids:
                all_results.append(r)
                seen_ids.add(r["id"])
        # Early exit if we found nearby matches
        if our_lat and our_lng and all_results:
            nearby = sum(
                1 for r in all_results
                if r.get("location", {}).get("latitude")
                and _haversine_miles(our_lat, our_lng, r["location"]["latitude"], r["location"]["longitude"]) < 5
            )
            if nearby >= 1:
                log.info("Found %d nearby match(es) on query '%s', skipping remaining", nearby, query)
                break

    # 3. Filter to courses at the same club (within 5 miles of our location)
    club_courses = []
    for r in all_results:
        loc = r.get("location") or {}
        api_lat, api_lng = loc.get("latitude"), loc.get("longitude")
        if our_lat and api_lat:
            dist = _haversine_miles(our_lat, our_lng, api_lat, api_lng)
            if dist > 5:
                continue
        club_courses.append(r)

    if not club_courses:
        return {"status": "not_found", "reason": f"No courses found for '{club.name}'"}

    # Update club address from first result
    first_loc = club_courses[0].get("location") or {}
    if not club.address and first_loc.get("address"):
        club.address = first_loc["address"]
    if not club.lat and first_loc.get("latitude"):
        club.lat = first_loc["latitude"]
        club.lng = first_loc["longitude"]

    # 4. Process each API course
    details = []
    combo_courses = []
    standalone_courses = []

    for api_course in club_courses:
        cname = api_course.get("course_name", "")
        if "/" in cname:
            combo_courses.append(api_course)
        else:
            standalone_courses.append(api_course)

    # Process standalone courses first
    for api_course in standalone_courses:
        cname = api_course.get("course_name", "").strip()
        if not cname:
            continue

        course = _find_or_create_course_by_name(db, club, cname)

        # Fetch detail and apply tees
        try:
            time.sleep(1)
            detail = get_course_detail(api_course["id"])
        except httpx.HTTPError as e:
            details.append({"course": cname, "status": "error", "reason": str(e)})
            continue

        if not detail:
            details.append({"course": cname, "status": "error", "reason": "empty response"})
            continue

        course_data = detail.get("course", detail)
        tees_data = course_data.get("tees") or {}
        has_tees = any(isinstance(v, list) and len(v) > 0 for v in tees_data.values())

        if has_tees:
            tc, hc = _apply_tees_to_course(db, course, tees_data)
            details.append({"course": cname, "status": "synced", "tees": tc, "holes": hc})
        else:
            details.append({"course": cname, "status": "no_tee_data"})

    # Process combo courses — apply 18-hole data AND split to standalone 9-hole courses
    for api_course in combo_courses:
        cname = api_course.get("course_name", "").strip()
        if not cname:
            continue

        combo_course = _find_or_create_course_by_name(db, club, cname)

        try:
            time.sleep(1)
            detail = get_course_detail(api_course["id"])
        except httpx.HTTPError as e:
            details.append({"course": cname, "status": "error", "reason": str(e)})
            continue

        if not detail:
            details.append({"course": cname, "status": "error", "reason": "empty response"})
            continue

        course_data = detail.get("course", detail)
        tees_data = course_data.get("tees") or {}
        has_tees = any(isinstance(v, list) and len(v) > 0 for v in tees_data.values())

        if has_tees:
            # Apply full 18-hole tees to the combo course
            combo_course.holes = 18
            tc, hc = _apply_tees_to_course(db, combo_course, tees_data, is_combo=True)

            # Split into standalone 9-hole courses
            split_result = _split_combo_tees_to_standalone(db, club, cname, tees_data)

            details.append({
                "course": cname,
                "status": "synced_combo",
                "tees": tc,
                "holes": hc,
                "split": split_result,
            })
        else:
            details.append({"course": cname, "status": "no_tee_data"})

    db.commit()

    total_synced = sum(1 for d in details if "synced" in d.get("status", ""))
    total_created = sum(1 for d in details if d.get("status") == "synced_combo")

    return {
        "status": "ok",
        "club": club.name,
        "api_courses_found": len(club_courses),
        "courses_synced": total_synced,
        "details": details,
    }


def match_rounds_to_tees(db: Session, course_id: int) -> int:
    """
    After a course sync, match rounds with tee_id=None to synced tees
    by closest course_rating + slope_rating.
    Returns count of rounds matched.
    """
    from app.models import Round, CourseTee

    # Get rounds without a tee
    rounds = db.query(Round).filter(
        Round.course_id == course_id,
        Round.tee_id.is_(None),
        Round.course_rating.isnot(None),
    ).all()

    if not rounds:
        return 0

    # Get synced tees
    tees = db.query(CourseTee).filter(
        CourseTee.course_id == course_id,
        CourseTee.course_rating.isnot(None),
    ).all()

    if not tees:
        return 0

    matched = 0
    for r in rounds:
        # Find closest tee by combined rating+slope distance
        best_tee = None
        best_dist = float('inf')
        for t in tees:
            if t.course_rating is None or t.slope_rating is None:
                continue
            # Normalize: rating diff + slope diff / 10 (slope is on a larger scale)
            dist = abs((r.course_rating or 0) - t.course_rating) + abs((r.slope_rating or 0) - t.slope_rating) / 10
            if dist < best_dist:
                best_dist = dist
                best_tee = t

        if best_tee and best_dist < 3.0:  # Reasonable threshold
            r.tee_id = best_tee.id
            matched += 1
            log.info("Matched round %d to tee '%s' (dist=%.2f)", r.id, best_tee.tee_name, best_dist)

    if matched:
        db.commit()

    return matched
