import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqlfunc
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models import GolfClub, Course, CourseTee, CourseHole, CourseHazard, OSMHole, Round, RoundHole, Shot
from app.services.golf_course_api import search_course_candidates, apply_golf_course_data, sync_club_courses, match_rounds_to_tees
from app.services.places_service import fetch_club_photo, get_all_photo_resources, download_photo_thumbnail, _download_photo, _do_places_nearby, _do_places_text_search_all, _do_places_autocomplete, _haversine_miles
from app.services.osm_golf_service import search_golf_courses, fetch_features_by_osm_id, fetch_osm_boundary
from app.services.course_calc_service import recalc_hole_shots, recalc_course_shots
from app.services.strokes_gained import expected_strokes, personal_expected_strokes

router = APIRouter(prefix="/api/courses", tags=["courses"])


# --- Pydantic schemas ---

class CourseHazardResponse(BaseModel):
    id: int
    hazard_type: str
    name: Optional[str] = None
    boundary: str  # JSON [[lat, lng], ...]
    data_source: Optional[str] = None

    class Config:
        from_attributes = True


class CourseHoleResponse(BaseModel):
    id: int
    hole_number: int
    par: int
    yardage: Optional[int] = None
    handicap: Optional[int] = None
    flag_lat: Optional[float] = None
    flag_lng: Optional[float] = None
    tee_lat: Optional[float] = None
    tee_lng: Optional[float] = None
    fairway_path: Optional[str] = None
    fairway_boundary: Optional[str] = None
    green_boundary: Optional[str] = None
    osm_hole_id: Optional[int] = None
    data_source: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class OSMHoleResponse(BaseModel):
    id: int
    osm_id: Optional[int] = None
    hole_number: Optional[int] = None
    par: Optional[int] = None
    tee_lat: Optional[float] = None
    tee_lng: Optional[float] = None
    green_lat: Optional[float] = None
    green_lng: Optional[float] = None
    waypoints: Optional[str] = None  # JSON [[lat, lng], ...] centerline
    green_boundary: Optional[str] = None  # JSON [[lat, lng], ...] polygon

    class Config:
        from_attributes = True


class CourseTeeResponse(BaseModel):
    id: int
    tee_name: str
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None
    par_total: Optional[int] = None
    total_yards: Optional[int] = None
    inferred: bool = False
    holes: list[CourseHoleResponse] = []

    class Config:
        from_attributes = True


class TeeUpdateRequest(BaseModel):
    tee_name: Optional[str] = None
    par_total: Optional[int] = None
    total_yards: Optional[int] = None
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None


class CourseResponse(BaseModel):
    id: int
    display_name: str
    club_name: str
    course_name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    holes: Optional[int] = None
    par: Optional[int] = None
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None
    user_rating: Optional[float] = None
    user_notes: Optional[str] = None
    photo_url: Optional[str] = None
    slope_min: Optional[float] = None
    slope_max: Optional[float] = None
    tee_count: int = 0
    golf_club_id: int = 0
    osm_id: Optional[int] = None
    osm_boundary: Optional[str] = None  # JSON boundary polygon if available

    class Config:
        from_attributes = True


class CourseDetailResponse(CourseResponse):
    tees: list[CourseTeeResponse] = []
    hazards: list[CourseHazardResponse] = []
    osm_holes: list[OSMHoleResponse] = []

    class Config:
        from_attributes = True


# --- Helpers ---

def _build_course_response(db: Session, course: Course) -> CourseResponse:
    """Build a CourseResponse dict with computed tee stats and GolfClub data."""
    tee_stats = (
        db.query(
            sqlfunc.count(CourseTee.id),
            sqlfunc.min(CourseTee.slope_rating),
            sqlfunc.max(CourseTee.slope_rating),
        )
        .filter(CourseTee.course_id == course.id)
        .first()
    )
    tee_count, slope_min, slope_max = tee_stats or (0, None, None)
    club = course.club

    return CourseResponse(
        id=course.id,
        display_name=course.display_name,
        club_name=club.name if club else "",
        course_name=course.name,
        address=club.address if club else None,
        lat=club.lat if club else None,
        lng=club.lng if club else None,
        holes=course.holes,
        par=course.par,
        slope_rating=course.slope_rating,
        course_rating=course.course_rating,
        user_rating=club.user_rating if club else None,
        user_notes=club.user_notes if club else None,
        photo_url=club.photo_url if club else None,
        slope_min=slope_min,
        slope_max=slope_max,
        tee_count=tee_count,
        golf_club_id=club.id if club else 0,
        osm_id=course.osm_id,
        osm_boundary=course.osm_boundary,
    )


# --- Endpoints ---

class ClubCourseSummary(BaseModel):
    id: int
    name: Optional[str] = None
    holes: Optional[int] = None
    par: Optional[int] = None
    tee_count: int = 0
    slope_min: Optional[float] = None
    slope_max: Optional[float] = None
    rounds_played: int = 0

class ClubSummary(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    photo_url: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    course_count: int = 0
    total_rounds: int = 0
    courses: list[ClubCourseSummary] = []


@router.get("/clubs", response_model=list[ClubSummary])
def list_clubs(db: Session = Depends(get_db)):
    """List all golf clubs with their courses grouped."""
    clubs = (
        db.query(GolfClub)
        .options(joinedload(GolfClub.courses))
        .order_by(GolfClub.name)
        .all()
    )
    result = []
    for club in clubs:
        courses_data = []
        total_rounds = 0
        for c in sorted(club.courses, key=lambda x: (x.holes or 18, x.name or "")):
            # Get tee count and slope range
            tee_stats = (
                db.query(
                    sqlfunc.count(CourseTee.id),
                    sqlfunc.min(CourseTee.slope_rating),
                    sqlfunc.max(CourseTee.slope_rating),
                )
                .filter(CourseTee.course_id == c.id)
                .first()
            )
            tee_count, slope_min, slope_max = tee_stats or (0, None, None)
            rounds_count = db.query(Round).filter(Round.course_id == c.id).count()
            total_rounds += rounds_count

            courses_data.append(ClubCourseSummary(
                id=c.id,
                name=c.name,
                holes=c.holes,
                par=c.par,
                tee_count=tee_count,
                slope_min=slope_min,
                slope_max=slope_max,
                rounds_played=rounds_count,
            ))

        result.append(ClubSummary(
            id=club.id,
            name=club.name,
            address=club.address,
            photo_url=club.photo_url,
            lat=club.lat,
            lng=club.lng,
            course_count=len(club.courses),
            total_rounds=total_rounds,
            courses=courses_data,
        ))
    return result


# --- Places Search (discovery) ---

class PlaceCandidate(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    photo_url: Optional[str] = None
    distance_miles: Optional[float] = None


class PlaceCandidatesResponse(BaseModel):
    candidates: list[PlaceCandidate]


# Module-level cache for nearby results. Keyed by rounded (lat, lng) ~1km grid.
import time as _time
_NEARBY_CACHE: dict[tuple, tuple[float, list[PlaceCandidate]]] = {}
_NEARBY_TTL_SECONDS = 600  # 10 minutes


def _nearby_cache_get(lat: float, lng: float) -> Optional[list[PlaceCandidate]]:
    key = (round(lat, 2), round(lng, 2))
    entry = _NEARBY_CACHE.get(key)
    if not entry:
        return None
    cached_at, value = entry
    if _time.time() - cached_at > _NEARBY_TTL_SECONDS:
        _NEARBY_CACHE.pop(key, None)
        return None
    return value


def _nearby_cache_set(lat: float, lng: float, value: list[PlaceCandidate]) -> None:
    key = (round(lat, 2), round(lng, 2))
    _NEARBY_CACHE[key] = (_time.time(), value)


def _places_results_to_candidates(results, user_lat, user_lng, saved_place_ids: set) -> list[PlaceCandidate]:
    out: list[PlaceCandidate] = []
    for r in results:
        if not r.place_id or not r.display_name or r.lat is None or r.lng is None:
            continue
        if r.place_id in saved_place_ids:
            continue  # dedup against DB
        dist = None
        if user_lat is not None and user_lng is not None:
            dist = _haversine_miles(user_lat, user_lng, r.lat, r.lng)
        out.append(PlaceCandidate(
            place_id=r.place_id,
            name=r.display_name,
            address=r.address,
            lat=r.lat,
            lng=r.lng,
            photo_url=r.photo_url,
            distance_miles=dist,
        ))
    return out


@router.get("/places/nearby", response_model=PlaceCandidatesResponse)
def places_nearby(lat: float, lng: float, radius_m: float = 16093.0, db: Session = Depends(get_db)):
    """Return nearby golf course candidates from Google Places, dedup'd against saved clubs."""
    cached = _nearby_cache_get(lat, lng)
    saved_place_ids = {pid for (pid,) in db.query(GolfClub.google_place_id).filter(GolfClub.google_place_id.isnot(None)).all()}

    if cached is not None:
        # Re-filter cached results against current saved set (user may have added clubs since cache)
        filtered = [c for c in cached if c.place_id not in saved_place_ids]
        return PlaceCandidatesResponse(candidates=filtered)

    results = _do_places_nearby(lat, lng, radius_m=radius_m)
    candidates = _places_results_to_candidates(results, lat, lng, saved_place_ids=set())  # cache the full list
    _nearby_cache_set(lat, lng, candidates)
    # Then filter for this response
    filtered = [c for c in candidates if c.place_id not in saved_place_ids]
    return PlaceCandidatesResponse(candidates=filtered)


@router.get("/places/search", response_model=PlaceCandidatesResponse)
def places_search(q: str, lat: Optional[float] = None, lng: Optional[float] = None, db: Session = Depends(get_db)):
    """Read-only text search for golf courses via Google Places, dedup'd against saved clubs."""
    query = q.strip()
    if len(query) < 3:
        return PlaceCandidatesResponse(candidates=[])

    saved_place_ids = {pid for (pid,) in db.query(GolfClub.google_place_id).filter(GolfClub.google_place_id.isnot(None)).all()}
    results = _do_places_text_search_all(query, lat=lat, lng=lng, max_results=10)
    candidates = _places_results_to_candidates(results, lat, lng, saved_place_ids)
    return PlaceCandidatesResponse(candidates=candidates)


class PlaceSuggestionResponse(BaseModel):
    place_id: str
    name: str
    secondary_text: Optional[str] = None


class PlaceSuggestionsResponse(BaseModel):
    suggestions: list[PlaceSuggestionResponse]


@router.get("/places/autocomplete", response_model=PlaceSuggestionsResponse)
def places_autocomplete(q: str, lat: Optional[float] = None, lng: Optional[float] = None, db: Session = Depends(get_db)):
    """Type-ahead suggestions backed by Google Places Autocomplete (prefix-ranked)."""
    query = q.strip()
    if len(query) < 3:
        return PlaceSuggestionsResponse(suggestions=[])

    saved_place_ids = {pid for (pid,) in db.query(GolfClub.google_place_id).filter(GolfClub.google_place_id.isnot(None)).all()}
    raw = _do_places_autocomplete(query, lat=lat, lng=lng, max_results=8)
    out: list[PlaceSuggestionResponse] = []
    for s in raw:
        if s.place_id in saved_place_ids:
            continue
        out.append(PlaceSuggestionResponse(place_id=s.place_id, name=s.name, secondary_text=s.secondary_text))
    return PlaceSuggestionsResponse(suggestions=out)


# --- Course Search & Create ---

class CourseSearchCreateRequest(BaseModel):
    name: str
    google_place_id: Optional[str] = None


@router.post("/search-create")
def search_create_course(req: CourseSearchCreateRequest, db: Session = Depends(get_db)):
    """
    Search for a course via Google Places, create GolfClub + Course records,
    and auto-sync tee/hole data from the Golf Course API.
    Returns existing club if a match is found.
    """
    from app.services.places_service import _do_places_search, _do_places_get_by_id, apply_places_result, _download_photo

    # 1. Check for existing club by google_place_id
    if req.google_place_id:
        existing = db.query(GolfClub).filter(GolfClub.google_place_id == req.google_place_id).first()
        if existing:
            courses = db.query(Course).filter(Course.golf_club_id == existing.id).all()
            return {
                "status": "existing",
                "golf_club_id": existing.id,
                "course_id": courses[0].id if courses else None,
                "club_name": existing.name,
                "courses": [{"id": c.id, "name": c.display_name, "holes": c.holes} for c in courses],
                "photo_url": existing.photo_url,
            }

    # 2. Resolve place details. If we already know the place_id (from the
    # autocomplete dropdown), fetch by id directly — text search is unreliable
    # for ambiguous names (e.g. "Marquette Golf Club" returning Marquette Park
    # in Chicago).
    if req.google_place_id:
        places_result = _do_places_get_by_id(req.google_place_id)
    else:
        search_text = req.name
        if "golf" not in search_text.lower():
            search_text += " golf course"
        places_result = _do_places_search(search_text)

    # 3. Check for existing club by place_id from search result
    if places_result and places_result.place_id:
        existing = db.query(GolfClub).filter(GolfClub.google_place_id == places_result.place_id).first()
        if existing:
            courses = db.query(Course).filter(Course.golf_club_id == existing.id).all()
            return {
                "status": "existing",
                "golf_club_id": existing.id,
                "course_id": courses[0].id if courses else None,
                "club_name": existing.name,
                "courses": [{"id": c.id, "name": c.display_name, "holes": c.holes} for c in courses],
                "photo_url": existing.photo_url,
            }

    # 4. Create new GolfClub
    club = GolfClub(name=req.name)
    if places_result:
        club.name = places_result.display_name or req.name
        club.address = places_result.address
        club.lat = places_result.lat
        club.lng = places_result.lng
        club.google_place_id = places_result.place_id
    db.add(club)
    db.flush()  # get club.id for photo download

    # Download photo
    if places_result and places_result.photo_url:
        local_url = _download_photo(places_result.photo_url, club.id)
        if local_url:
            club.photo_url = local_url

    # 5. Create a default Course
    course = Course(golf_club_id=club.id, holes=18)
    db.add(course)
    db.flush()

    db.commit()

    # 6. Auto-sync from Golf Course API (tees, holes, par, yardage)
    sync_result = {"status": "skipped"}
    try:
        sync_result = sync_club_courses(db, club)
    except Exception as e:
        logger.warning("Golf course API sync failed for '%s': %s", club.name, e)
        sync_result = {"status": "error", "reason": str(e)}

    # Refresh to get any courses created by sync (combo courses may create additional ones)
    db.refresh(club)
    courses = db.query(Course).filter(Course.golf_club_id == club.id).all()

    # Count what was populated
    tee_count = db.query(CourseTee).filter(
        CourseTee.course_id.in_([c.id for c in courses])
    ).count()
    hole_count = db.query(CourseHole).join(CourseTee).filter(
        CourseTee.course_id.in_([c.id for c in courses])
    ).count()

    return {
        "status": "created",
        "golf_club_id": club.id,
        "course_id": courses[0].id if courses else course.id,
        "club_name": club.name,
        "address": club.address,
        "courses": [{"id": c.id, "name": c.display_name, "holes": c.holes} for c in courses],
        "tees_synced": tee_count,
        "holes_populated": hole_count,
        "photo_url": club.photo_url,
        "sync_result": sync_result.get("status", "unknown"),
    }


@router.get("/", response_model=list[CourseResponse])
def list_courses(db: Session = Depends(get_db)):
    courses = (
        db.query(Course)
        .options(joinedload(Course.club))
        .join(GolfClub)
        .order_by(GolfClub.name, Course.name)
        .all()
    )
    return [_build_course_response(db, c) for c in courses]


@router.get("/{course_id}/strategy")
def get_course_strategy(course_id: int, db: Session = Depends(get_db)):
    """
    Return player stats needed for course strategy insights in the editor.
    Includes club distances, scoring by par type, miss tendencies, and SG categories.
    """
    from app.models.club import Club, ClubStats

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # 1. Club distance stats (from pre-computed ClubStats)
    clubs_data = []
    all_clubs = (
        db.query(Club)
        .options(joinedload(Club.stats))
        .filter(Club.retired == False)  # noqa: E712
        .order_by(Club.sort_order)
        .all()
    )
    for club in all_clubs:
        s = club.stats
        if not s:
            continue
        # Use combined stats (course + range) for best data
        avg = s.combined_avg_yards or s.avg_yards
        if not avg:
            continue
        from app.api.clubs import _default_club_color
        clubs_data.append({
            "id": club.id,
            "club_type": club.club_type,
            "name": club.name,
            "color": club.color or _default_club_color(club.club_type),
            "avg_yards": avg,
            "median_yards": s.combined_median_yards or s.median_yards,
            "std_dev": s.combined_std_dev or s.std_dev,
            "p10": s.combined_p10 or s.p10,
            "p90": s.combined_p90 or s.p90,
            "sample_count": s.combined_sample_count or s.sample_count,
        })

    # 2. Scoring by par type — join RoundHole with CourseHole to get par
    scoring = {"par3_avg": None, "par4_avg": None, "par5_avg": None, "gir_pct": None, "fw_pct": None}
    par_scores = {}  # {par: [scores]}
    gir_total, gir_hit = 0, 0
    fw_total, fw_hit = 0, 0

    round_holes = db.query(RoundHole).filter(RoundHole.strokes.isnot(None)).all()
    # Build a map of hole_number -> par from any tee of any course (for this player's rounds)
    # Simple approach: query all CourseHoles with par data
    hole_pars = {}  # {(course_id, hole_number): par}
    for tee in db.query(CourseTee).all():
        for ch in db.query(CourseHole).filter(CourseHole.tee_id == tee.id).all():
            if ch.par:
                hole_pars[(tee.course_id, ch.hole_number)] = ch.par

    for rh in round_holes:
        rnd = db.query(Round).filter(Round.id == rh.round_id).first()
        if not rnd or not rnd.course_id:
            continue
        par = hole_pars.get((rnd.course_id, rh.hole_number))
        if par and rh.strokes:
            par_scores.setdefault(par, []).append(rh.strokes)
        if rh.gir is not None:
            gir_total += 1
            if rh.gir:
                gir_hit += 1
        if rh.fairway is not None:
            fw_total += 1
            if rh.fairway == 'HIT':
                fw_hit += 1

    for p in [3, 4, 5]:
        if par_scores.get(p):
            scoring[f"par{p}_avg"] = round(sum(par_scores[p]) / len(par_scores[p]), 2)
    if gir_total:
        scoring["gir_pct"] = round(gir_hit / gir_total * 100, 1)
    if fw_total:
        scoring["fw_pct"] = round(fw_hit / fw_total * 100, 1)

    # 3. Miss tendencies per club (from on-course shot data)
    # Shot.club is a string like "Driver", "7 Iron" — group by that
    miss_tendencies = {}
    miss_query = (
        db.query(Shot.club, Shot.fairway_side, sqlfunc.count())
        .filter(
            Shot.fairway_side.isnot(None),
            Shot.club.isnot(None),
            Shot.shot_number == 1,  # Tee shots only for miss tendency
        )
        .group_by(Shot.club, Shot.fairway_side)
        .all()
    )
    club_miss_counts = {}  # {club_name: {side: count}}
    for club_name, side, count in miss_query:
        club_miss_counts.setdefault(club_name, {}).setdefault(side, 0)
        club_miss_counts[club_name][side] += count

    for club_name, sides in club_miss_counts.items():
        total = sum(sides.values())
        if total < 5:
            continue
        miss_tendencies[club_name] = {
            "left_pct": round(sides.get("L", 0) / total * 100, 1),
            "right_pct": round(sides.get("R", 0) / total * 100, 1),
            "center_pct": round(sides.get("CENTER", 0) / total * 100, 1),
            "total_shots": total,
        }

    # 4. SG categories (simple overall averages)
    sg_categories = {}
    sg_query = (
        db.query(
            Shot.shot_type,
            sqlfunc.avg(Shot.sg_pga),
            sqlfunc.count(),
        )
        .filter(Shot.sg_pga.isnot(None))
        .group_by(Shot.shot_type)
        .all()
    )
    for shot_type, avg_sg, count in sg_query:
        if shot_type and count >= 5:
            sg_categories[shot_type] = {
                "avg_sg_pga": round(avg_sg, 3),
                "shot_count": count,
            }

    # 5. Lateral dispersion per club (from raw shot data)
    from app.models.range_session import RangeShot
    from app.models.trackman_shot import TrackmanShot
    import statistics

    lateral_dispersion = {}

    # Collect lateral values per club_type from all sources
    club_lateral = {}  # {club_type: [lateral_yards, ...]}

    # On-course: fairway_side_yards
    course_lateral = (
        db.query(Shot.club, Shot.fairway_side_yards)
        .filter(Shot.fairway_side_yards.isnot(None), Shot.club.isnot(None))
        .all()
    )
    for club_name, lat_yards in course_lateral:
        club_lateral.setdefault(club_name, []).append(float(lat_yards))

    # Range (MLM2PRO): side_carry_yards
    range_lateral = (
        db.query(RangeShot.club_type_raw, RangeShot.side_carry_yards)
        .filter(RangeShot.side_carry_yards.isnot(None), RangeShot.club_type_raw.isnot(None))
        .all()
    )
    for club_name, lat_yards in range_lateral:
        club_lateral.setdefault(club_name, []).append(float(lat_yards))

    # Trackman: side_carry_yards
    trackman_lateral = (
        db.query(TrackmanShot.club_type_raw, TrackmanShot.side_carry_yards)
        .filter(TrackmanShot.side_carry_yards.isnot(None), TrackmanShot.club_type_raw.isnot(None))
        .all()
    )
    for club_name, lat_yards in trackman_lateral:
        club_lateral.setdefault(club_name, []).append(float(lat_yards))

    for club_name, values in club_lateral.items():
        if len(values) >= 3:
            lateral_dispersion[club_name] = {
                "lateral_std_dev": round(statistics.stdev(values), 1),
                "lateral_mean": round(statistics.mean(values), 1),
                "sample_count": len(values),
            }

    return {
        "player": {
            "clubs": clubs_data,
            "scoring": scoring,
            "miss_tendencies": miss_tendencies,
            "sg_categories": sg_categories,
            "lateral_dispersion": lateral_dispersion,
        }
    }


@router.get("/{course_id}", response_model=CourseDetailResponse)
def get_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).options(joinedload(Course.club)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    tees = db.query(CourseTee).filter(CourseTee.course_id == course_id).all()
    tee_responses = []
    for tee in tees:
        holes = (db.query(CourseHole)
                 .filter(CourseHole.tee_id == tee.id)
                 .order_by(CourseHole.hole_number)
                 .all())
        hole_responses = []
        for h in holes:
            hole_resp = CourseHoleResponse.model_validate(h)
            hole_responses.append(hole_resp)
        tee_responses.append(CourseTeeResponse(
            id=tee.id,
            tee_name=tee.tee_name,
            course_rating=tee.course_rating,
            slope_rating=tee.slope_rating,
            par_total=tee.par_total,
            total_yards=tee.total_yards,
            holes=hole_responses,
        ))

    # Club-level hazards (shared across all courses at this club, filtered by viewport on frontend)
    hazards = db.query(CourseHazard).filter(CourseHazard.golf_club_id == course.golf_club_id).all()
    hazard_responses = [CourseHazardResponse.model_validate(h) for h in hazards]

    # OSM holes at club level (for linking UI)
    osm_holes = db.query(OSMHole).filter(OSMHole.golf_club_id == course.golf_club_id).order_by(OSMHole.hole_number).all()
    osm_responses = [OSMHoleResponse.model_validate(oh) for oh in osm_holes]

    base = _build_course_response(db, course)
    return CourseDetailResponse(
        **base.model_dump(),
        tees=tee_responses,
        hazards=hazard_responses,
        osm_holes=osm_responses,
    )


# --- Course Stats ---

class CourseHoleStatsItem(BaseModel):
    hole_number: int
    par: int
    yardage: Optional[int] = None
    handicap: Optional[int] = None
    avg_score: float
    avg_vs_par: float
    birdie_pct: float = 0.0
    par_pct: float = 0.0
    bogey_pct: float = 0.0
    double_plus_pct: float = 0.0
    times_played: int = 0


class CourseStatsRound(BaseModel):
    round_id: int
    date: str
    tee_name: Optional[str] = None
    holes_played: int
    score: int
    score_vs_par: int
    vs_par_per_hole: float
    gir_pct: Optional[float] = None
    fw_pct: Optional[float] = None
    putts: Optional[int] = None
    putts_per_hole: Optional[float] = None


class CourseStatsResponse(BaseModel):
    course_id: int
    course_name: Optional[str] = None
    club_name: str
    club_id: int
    par: Optional[int] = None
    holes: Optional[int] = None
    # Summary stats
    rounds_played: int = 0
    avg_score: Optional[float] = None
    best_score: Optional[int] = None
    worst_score: Optional[int] = None
    avg_vs_par: Optional[float] = None
    gir_pct: Optional[float] = None
    fairway_pct: Optional[float] = None
    avg_putts_per_hole: Optional[float] = None
    scramble_pct: Optional[float] = None
    three_putt_pct: Optional[float] = None
    scoring_distribution: dict = {}
    hole_stats: list[CourseHoleStatsItem] = []
    rounds: list[CourseStatsRound] = []
    # SG category breakdown
    sg_categories: dict = {}  # {off_the_tee, approach, short_game, putting} -> {per_round, total, shots}
    # Handicap differentials
    avg_differential: Optional[float] = None
    best_differential: Optional[float] = None
    differentials: list[dict] = []  # [{round_id, date, differential, score, rating, slope}]
    excluded_rounds: int = 0  # count of rounds excluded from stats


@router.get("/{course_id}/stats", response_model=CourseStatsResponse)
def get_course_stats(course_id: int, db: Session = Depends(get_db)):
    """Per-course scoring stats, hole difficulty, and round history."""
    course = db.query(Course).options(joinedload(Course.club)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Count excluded rounds at this course
    excluded_count = (
        db.query(Round.id)
        .filter(
            Round.course_id == course_id,
            Round.exclude_from_stats == True,
        )
        .count()
    )

    # Query all played holes at this course (same pattern as stats.py scoring)
    rows = (
        db.query(RoundHole, Round, CourseHole)
        .join(Round, RoundHole.round_id == Round.id)
        .join(
            CourseHole,
            (CourseHole.tee_id == Round.tee_id)
            & (CourseHole.hole_number == RoundHole.hole_number),
        )
        .filter(
            Round.course_id == course_id,
            Round.exclude_from_stats != True,
            Round.tee_id.isnot(None),
            RoundHole.strokes > 0,
        )
        .all()
    )

    # Aggregation accumulators
    total_holes = 0
    gir_holes = 0
    gir_eligible = 0
    fw_hit = 0
    fw_eligible = 0
    total_putts = 0
    putt_holes = 0
    non_gir_par_or_better = 0
    non_gir_total = 0
    three_putts = 0
    dist = {"birdie_or_better": 0, "par": 0, "bogey": 0, "double": 0, "triple_plus": 0}

    # Per-hole stats: hole_number -> {scores, diffs, par, yardage, handicap}
    hole_data: dict[int, dict] = {}
    # Per-round stats
    round_agg: dict[int, dict] = {}

    for rh, rnd, ch in rows:
        total_holes += 1
        vs_par = rh.strokes - ch.par

        # Scoring distribution
        if vs_par <= -1:
            dist["birdie_or_better"] += 1
        elif vs_par == 0:
            dist["par"] += 1
        elif vs_par == 1:
            dist["bogey"] += 1
        elif vs_par == 2:
            dist["double"] += 1
        else:
            dist["triple_plus"] += 1

        # Per-hole accumulation
        hn = rh.hole_number
        if hn not in hole_data:
            hole_data[hn] = {
                "scores": [], "diffs": [],
                "par": ch.par, "yardage": ch.yardage, "handicap": ch.handicap,
            }
        hole_data[hn]["scores"].append(rh.strokes)
        hole_data[hn]["diffs"].append(vs_par)
        # Keep most recent yardage/par/handicap
        hole_data[hn]["par"] = ch.par
        if ch.yardage:
            hole_data[hn]["yardage"] = ch.yardage
        if ch.handicap:
            hole_data[hn]["handicap"] = ch.handicap

        # Fairway
        if rh.fairway is not None:
            fw_eligible += 1
            if rh.fairway == "HIT":
                fw_hit += 1

        # Putts & GIR
        if rh.putts is not None:
            total_putts += rh.putts
            putt_holes += 1
            if rh.putts >= 3:
                three_putts += 1
            gir_eligible += 1
            is_gir = (rh.strokes - rh.putts) <= ch.par - 2
            if is_gir:
                gir_holes += 1
            else:
                non_gir_total += 1
                if rh.strokes <= ch.par:
                    non_gir_par_or_better += 1

        # Per-round accumulation
        rid = rnd.id
        if rid not in round_agg:
            round_agg[rid] = {
                "round_id": rid,
                "date": str(rnd.date),
                "tee_name": rnd.tee.tee_name if rnd.tee_id and rnd.tee else None,
                "holes": 0, "score": 0, "par_total": 0,
                "gir": 0, "gir_eligible": 0,
                "fw_hit": 0, "fw_eligible": 0,
                "putts": 0, "putt_holes": 0,
            }
        ra = round_agg[rid]
        ra["holes"] += 1
        ra["score"] += rh.strokes
        ra["par_total"] += ch.par
        if rh.fairway is not None:
            ra["fw_eligible"] += 1
            if rh.fairway == "HIT":
                ra["fw_hit"] += 1
        if rh.putts is not None:
            ra["putts"] += rh.putts
            ra["putt_holes"] += 1
            ra["gir_eligible"] += 1
            if (rh.strokes - rh.putts) <= ch.par - 2:
                ra["gir"] += 1

    # Build hole stats list
    hole_stats = []
    for hn in sorted(hole_data.keys()):
        hd = hole_data[hn]
        n = len(hd["scores"])
        avg_vs = sum(hd["diffs"]) / n
        hole_stats.append(CourseHoleStatsItem(
            hole_number=hn,
            par=hd["par"],
            yardage=hd["yardage"],
            handicap=hd["handicap"],
            avg_score=round(sum(hd["scores"]) / n, 2),
            avg_vs_par=round(avg_vs, 2),
            birdie_pct=round(sum(1 for d in hd["diffs"] if d <= -1) / n * 100, 1),
            par_pct=round(sum(1 for d in hd["diffs"] if d == 0) / n * 100, 1),
            bogey_pct=round(sum(1 for d in hd["diffs"] if d == 1) / n * 100, 1),
            double_plus_pct=round(sum(1 for d in hd["diffs"] if d >= 2) / n * 100, 1),
            times_played=n,
        ))

    # Build per-round list
    rounds_list = []
    for ra in sorted(round_agg.values(), key=lambda x: x["date"]):
        rounds_list.append(CourseStatsRound(
            round_id=ra["round_id"],
            date=ra["date"],
            tee_name=ra["tee_name"],
            holes_played=ra["holes"],
            score=ra["score"],
            score_vs_par=ra["score"] - ra["par_total"],
            vs_par_per_hole=round((ra["score"] - ra["par_total"]) / ra["holes"], 2) if ra["holes"] else 0,
            gir_pct=round(ra["gir"] / ra["gir_eligible"] * 100, 1) if ra["gir_eligible"] else None,
            fw_pct=round(ra["fw_hit"] / ra["fw_eligible"] * 100, 1) if ra["fw_eligible"] else None,
            putts=ra["putts"] if ra["putt_holes"] else None,
            putts_per_hole=round(ra["putts"] / ra["putt_holes"], 2) if ra["putt_holes"] else None,
        ))

    # ── SG category breakdown ──
    # Reuse the classification logic from stats.py
    from app.api.stats import _classify_sg_category

    sg_cat_agg: dict[str, dict] = {}  # category -> {sg_pga, sg_personal, count, rounds}
    for cat in ["off_the_tee", "approach", "short_game", "putting"]:
        sg_cat_agg[cat] = {"sg_pga": 0.0, "sg_personal": 0.0, "count": 0, "personal_count": 0, "rounds": set()}

    # Shot-level SG (non-putt categories)
    if round_agg:
        sg_shots = (
            db.query(Shot, RoundHole, Round, CourseHole)
            .join(RoundHole, Shot.round_hole_id == RoundHole.id)
            .join(Round, Shot.round_id == Round.id)
            .join(
                CourseHole,
                (CourseHole.tee_id == Round.tee_id)
                & (CourseHole.hole_number == RoundHole.hole_number),
            )
            .filter(
                Round.course_id == course_id,
                Round.exclude_from_stats != True,
                Round.tee_id.isnot(None),
                Shot.sg_pga.isnot(None),
            )
            .all()
        )
        for shot, rh, rnd, ch in sg_shots:
            cat = _classify_sg_category(shot, ch.par)
            if cat and cat in sg_cat_agg:
                sg_cat_agg[cat]["sg_pga"] += shot.sg_pga or 0.0
                if shot.sg_personal is not None:
                    sg_cat_agg[cat]["sg_personal"] += shot.sg_personal
                    sg_cat_agg[cat]["personal_count"] += 1
                sg_cat_agg[cat]["count"] += 1
                sg_cat_agg[cat]["rounds"].add(rnd.id)

        # Putting SG from hole-level putt counts (same approach as stats.py)
        _PUTT_EST_YARDS = {1: 2.0, 2: 7.3, 3: 13.3}
        putt_rows = (
            db.query(RoundHole, Round)
            .join(Round, RoundHole.round_id == Round.id)
            .filter(
                Round.id.in_(list(round_agg.keys())),
                RoundHole.putts.isnot(None),
                RoundHole.putts >= 1,
            )
            .all()
        )
        for rh, rnd in putt_rows:
            est_yards = _PUTT_EST_YARDS.get(rh.putts, 13.3)
            exp_pga = expected_strokes(est_yards, "Green")
            exp_personal = personal_expected_strokes(est_yards, "Green")
            if exp_pga is not None:
                sg_pga = round(exp_pga - rh.putts, 2)
                sg_cat_agg["putting"]["sg_pga"] += sg_pga
                sg_cat_agg["putting"]["count"] += 1
                sg_cat_agg["putting"]["rounds"].add(rnd.id)
                if exp_personal is not None:
                    sg_pers = round(exp_personal - rh.putts, 2)
                    sg_cat_agg["putting"]["sg_personal"] += sg_pers
                    sg_cat_agg["putting"]["personal_count"] += 1

    sg_categories = {}
    for cat in ["off_the_tee", "approach", "short_game", "putting"]:
        d = sg_cat_agg[cat]
        rc = len(d["rounds"])
        sg_categories[cat] = {
            "per_round": round(d["sg_pga"] / rc, 2) if rc else 0.0,
            "total": round(d["sg_pga"], 2),
            "personal_per_round": round(d["sg_personal"] / rc, 2) if rc and d["personal_count"] else None,
            "personal_total": round(d["sg_personal"], 2) if d["personal_count"] else None,
            "shots": d["count"],
            "round_count": rc,
        }

    # ── Handicap differentials (18-hole rounds only, 14+ holes to handle tracker cutoffs) ──
    differentials = []
    for ra in sorted(round_agg.values(), key=lambda x: x["date"]):
        if ra["holes"] < 14:
            continue  # Skip 9-hole and short rounds — can't compare to 18-hole rating
        rid = ra["round_id"]
        rnd = db.query(Round).filter(Round.id == rid).first()
        if not rnd or not rnd.tee_id or not rnd.tee:
            continue
        tee = rnd.tee
        if tee.slope_rating and tee.course_rating and ra["score"]:
            diff = (113 / tee.slope_rating) * (ra["score"] - tee.course_rating)
            differentials.append({
                "round_id": rid,
                "date": ra["date"],
                "differential": round(diff, 1),
                "score": ra["score"],
                "holes_played": ra["holes"],
                "rating": tee.course_rating,
                "slope": tee.slope_rating,
            })

    avg_diff = round(sum(d["differential"] for d in differentials) / len(differentials), 1) if differentials else None
    best_diff = min(d["differential"] for d in differentials) if differentials else None

    # Summary stats from round aggregates
    scores = [ra["score"] for ra in round_agg.values()]
    vs_pars = [ra["score"] - ra["par_total"] for ra in round_agg.values()]

    return CourseStatsResponse(
        course_id=course.id,
        course_name=course.name,
        club_name=course.club.name,
        club_id=course.golf_club_id,
        par=course.par,
        holes=course.holes,
        rounds_played=len(round_agg),
        avg_score=round(sum(scores) / len(scores), 1) if scores else None,
        best_score=min(scores) if scores else None,
        worst_score=max(scores) if scores else None,
        avg_vs_par=round(sum(vs_pars) / len(vs_pars), 1) if vs_pars else None,
        gir_pct=round(gir_holes / gir_eligible * 100, 1) if gir_eligible else None,
        fairway_pct=round(fw_hit / fw_eligible * 100, 1) if fw_eligible else None,
        avg_putts_per_hole=round(total_putts / putt_holes, 2) if putt_holes else None,
        scramble_pct=round(non_gir_par_or_better / non_gir_total * 100, 1) if non_gir_total else None,
        three_putt_pct=round(three_putts / putt_holes * 100, 1) if putt_holes else None,
        scoring_distribution=dist,
        hole_stats=hole_stats,
        rounds=rounds_list,
        sg_categories=sg_categories,
        avg_differential=avg_diff,
        best_differential=best_diff,
        differentials=differentials,
        excluded_rounds=excluded_count,
    )


class ApplyMatchRequest(BaseModel):
    api_id: int


@router.post("/club/{golf_club_id}/sync")
def sync_club(golf_club_id: int, db: Session = Depends(get_db)):
    """Sync all courses for a golf club from the golf course API, including combo course splitting."""
    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")
    return sync_club_courses(db, club)



@router.post("/{course_id}/search-matches")
def search_matches(course_id: int, db: Session = Depends(get_db)):
    """Search for matching courses and return scored candidates for user selection."""
    course = db.query(Course).options(joinedload(Course.club)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return search_course_candidates(db, course)


@router.post("/{course_id}/apply-match")
def apply_match(course_id: int, req: ApplyMatchRequest, db: Session = Depends(get_db)):
    """Apply tee/hole data from a user-selected golf course API match."""
    course = db.query(Course).options(joinedload(Course.club)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    result = apply_golf_course_data(db, course, req.api_id)
    # After syncing tee data, try to match unlinked rounds to tees
    matched = match_rounds_to_tees(db, course_id)
    if matched:
        result["rounds_matched_to_tees"] = matched
    return result


@router.post("/{course_id}/fetch-photo")
def fetch_photo(course_id: int, force: bool = False, db: Session = Depends(get_db)):
    """Fetch a photo from Google Places for this course's club."""
    course = db.query(Course).options(joinedload(Course.club)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    club = course.club
    if not club:
        raise HTTPException(status_code=400, detail="Course has no associated club")
    photo_url = fetch_club_photo(db, club, force=force)
    if photo_url:
        return {"status": "ok", "photo_url": photo_url}
    return {"status": "not_found", "reason": "No photo found via Google Places"}


@router.get("/club/{golf_club_id}/photos")
def list_club_photos(golf_club_id: int, db: Session = Depends(get_db)):
    """List all available Google Places photos for a golf club."""
    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")

    resources = get_all_photo_resources(club)
    return {
        "photos": [{"index": i, "resource": r} for i, r in enumerate(resources)],
        "count": len(resources),
    }


@router.get("/club/{golf_club_id}/photo-thumbnail")
def get_photo_thumbnail(golf_club_id: int, resource: str, db: Session = Depends(get_db)):
    """Proxy a Google Places photo thumbnail (keeps API key server-side).

    Pass the photo resource name as a query param, e.g.:
    ?resource=places/ChIJ.../photos/AU_...
    """
    from fastapi.responses import Response

    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")

    if not resource.startswith("places/"):
        raise HTTPException(status_code=400, detail="Invalid photo resource")

    image_bytes = download_photo_thumbnail(resource)
    if not image_bytes:
        raise HTTPException(status_code=502, detail="Failed to download photo")

    return Response(content=image_bytes, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


@router.post("/club/{golf_club_id}/set-photo-places")
def set_club_photo_places(golf_club_id: int, body: dict, db: Session = Depends(get_db)):
    """Set club photo from a Google Places photo resource name."""
    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")

    photo_resource = body.get("photo_resource")
    if not photo_resource:
        raise HTTPException(status_code=400, detail="photo_resource is required")

    local_url = _download_photo(photo_resource, club.id)
    if not local_url:
        raise HTTPException(status_code=502, detail="Failed to download photo from Google Places")

    club.photo_url = local_url
    db.commit()
    return {"status": "ok", "photo_url": local_url}


@router.post("/club/{golf_club_id}/set-photo-upload")
async def set_club_photo_upload(golf_club_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Set club photo from an uploaded JPG/PNG file."""
    from pathlib import Path

    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")

    if file.content_type not in ("image/jpeg", "image/png"):
        raise HTTPException(status_code=400, detail="Only JPG and PNG files are allowed")

    img_dir = Path("app/static/images/clubs")
    img_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    filepath = img_dir / f"{club.id}.jpg"
    filepath.write_bytes(content)

    local_url = f"/static/images/clubs/{club.id}.jpg"
    club.photo_url = local_url
    db.commit()

    return {"status": "ok", "photo_url": local_url}



class TeeCreateRequest(BaseModel):
    tee_name: str
    par_total: Optional[int] = None
    total_yards: Optional[int] = None
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None


@router.post("/{course_id}/tees")
def create_tee(course_id: int, req: TeeCreateRequest, db: Session = Depends(get_db)):
    """Create a new tee box with empty holes."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    tee = CourseTee(
        course_id=course_id,
        tee_name=req.tee_name,
        par_total=req.par_total,
        total_yards=req.total_yards,
        course_rating=req.course_rating,
        slope_rating=req.slope_rating,
        inferred=False,
    )
    db.add(tee)
    db.flush()

    # Create empty holes
    num_holes = course.holes or 18
    for i in range(1, num_holes + 1):
        db.add(CourseHole(tee_id=tee.id, hole_number=i))

    db.commit()
    return {"status": "ok", "tee_id": tee.id}


@router.put("/{course_id}/tees/{tee_id}")
def update_tee(course_id: int, tee_id: int, req: TeeUpdateRequest, db: Session = Depends(get_db)):
    """Update tee data (name, par, yards, rating, slope)."""
    tee = db.query(CourseTee).filter(CourseTee.id == tee_id).first()
    if not tee:
        raise HTTPException(status_code=404, detail="Tee not found")
    if tee.course_id != course_id:
        raise HTTPException(status_code=400, detail="Tee does not belong to this course")

    if req.tee_name is not None:
        tee.tee_name = req.tee_name
    if req.par_total is not None:
        tee.par_total = req.par_total
    if req.total_yards is not None:
        tee.total_yards = req.total_yards
    if req.course_rating is not None:
        tee.course_rating = req.course_rating
    if req.slope_rating is not None:
        tee.slope_rating = req.slope_rating

    # Clear inferred flag since user manually edited
    tee.inferred = False

    db.commit()
    db.refresh(tee)
    return {"status": "ok", "tee_id": tee.id}


@router.delete("/{course_id}/tees/{tee_id}")
def delete_tee(course_id: int, tee_id: int, db: Session = Depends(get_db)):
    """Delete a tee and all its associated holes."""
    tee = db.query(CourseTee).filter(CourseTee.id == tee_id).first()
    if not tee:
        raise HTTPException(status_code=404, detail="Tee not found")
    if tee.course_id != course_id:
        raise HTTPException(status_code=400, detail="Tee does not belong to this course")

    # Check for linked rounds
    linked_rounds = db.query(Round).filter(Round.tee_id == tee_id).all()
    if linked_rounds:
        # Return round info and available tees for reassignment
        other_tees = db.query(CourseTee).filter(
            CourseTee.course_id == course_id,
            CourseTee.id != tee_id
        ).all()
        raise HTTPException(status_code=409, detail={
            "message": "Tee has linked rounds that must be reassigned first.",
            "rounds": [
                {"id": r.id, "date": str(r.date), "total_strokes": r.total_strokes}
                for r in linked_rounds
            ],
            "available_tees": [
                {"id": t.id, "tee_name": t.tee_name}
                for t in other_tees
            ],
        })

    db.delete(tee)
    db.commit()
    return {"status": "ok"}


# --- Club / Course deletion ---

class ClubDeletePreview(BaseModel):
    club_id: int
    club_name: Optional[str] = None
    course_count: int
    round_count: int


class CourseDeletePreview(BaseModel):
    course_id: int
    course_name: Optional[str] = None
    round_count: int


@router.get("/club/{club_id}/delete-preview", response_model=ClubDeletePreview)
def club_delete_preview(club_id: int, db: Session = Depends(get_db)):
    club = db.query(GolfClub).filter(GolfClub.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    course_ids = [c.id for c in club.courses]
    round_count = 0
    if course_ids:
        round_count = db.query(Round).filter(Round.course_id.in_(course_ids)).count()
    return ClubDeletePreview(
        club_id=club.id,
        club_name=club.name,
        course_count=len(course_ids),
        round_count=round_count,
    )


@router.delete("/club/{club_id}")
def delete_club(club_id: int, db: Session = Depends(get_db)):
    """Delete a golf club and all its courses/rounds/shots."""
    club = db.query(GolfClub).filter(GolfClub.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    course_ids = [c.id for c in club.courses]
    round_count = 0
    if course_ids:
        rounds = db.query(Round).filter(Round.course_id.in_(course_ids)).all()
        round_count = len(rounds)
        for r in rounds:
            db.delete(r)
    db.delete(club)
    db.commit()
    logger.info("Deleted club id=%d (%d courses, %d rounds)", club_id, len(course_ids), round_count)
    return {
        "status": "deleted",
        "club_id": club_id,
        "course_count": len(course_ids),
        "round_count": round_count,
    }


@router.get("/{course_id}/delete-preview", response_model=CourseDeletePreview)
def course_delete_preview(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    round_count = db.query(Round).filter(Round.course_id == course_id).count()
    return CourseDeletePreview(
        course_id=course.id,
        course_name=course.name,
        round_count=round_count,
    )


@router.delete("/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)):
    """Delete a course and all its rounds/shots/tees/holes."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    rounds = db.query(Round).filter(Round.course_id == course_id).all()
    round_count = len(rounds)
    for r in rounds:
        db.delete(r)
    db.delete(course)
    db.commit()
    logger.info("Deleted course id=%d (%d rounds)", course_id, round_count)
    return {
        "status": "deleted",
        "course_id": course_id,
        "round_count": round_count,
    }


class RoundReassignRequest(BaseModel):
    """Map of round_id -> new tee_id."""
    assignments: dict[int, int]  # {round_id: new_tee_id}


@router.post("/{course_id}/tees/{tee_id}/reassign-rounds")
def reassign_rounds(course_id: int, tee_id: int, req: RoundReassignRequest, db: Session = Depends(get_db)):
    """Reassign rounds from one tee to other tees, then delete the original tee."""
    tee = db.query(CourseTee).filter(CourseTee.id == tee_id).first()
    if not tee:
        raise HTTPException(status_code=404, detail="Tee not found")
    if tee.course_id != course_id:
        raise HTTPException(status_code=400, detail="Tee does not belong to this course")

    # Reassign each round
    for round_id, new_tee_id in req.assignments.items():
        rnd = db.query(Round).filter(Round.id == round_id, Round.tee_id == tee_id).first()
        if not rnd:
            raise HTTPException(status_code=404, detail=f"Round {round_id} not found on this tee")
        new_tee = db.query(CourseTee).filter(CourseTee.id == new_tee_id, CourseTee.course_id == course_id).first()
        if not new_tee:
            raise HTTPException(status_code=404, detail=f"Target tee {new_tee_id} not found")
        rnd.tee_id = new_tee_id

    # Now safe to delete the tee
    db.delete(tee)
    db.commit()
    return {"status": "ok", "reassigned": len(req.assignments)}


class HoleUpdateRequest(BaseModel):
    par: Optional[int] = None
    yardage: Optional[int] = None
    handicap: Optional[int] = None
    tee_lat: Optional[float] = None
    tee_lng: Optional[float] = None
    flag_lat: Optional[float] = None
    flag_lng: Optional[float] = None
    fairway_path: Optional[str] = None  # JSON string of [[lat, lng], ...] centerline
    fairway_boundary: Optional[str] = None  # JSON string of [[lat, lng], ...] polygon (fairway edges)
    green_boundary: Optional[str] = None  # JSON string of [[lat, lng], ...] polygon
    notes: Optional[str] = None  # Personal strategy notes


@router.put("/{course_id}/holes/{hole_id}")
def update_hole(course_id: int, hole_id: int, req: HoleUpdateRequest, db: Session = Depends(get_db)):
    """Update hole data (par, yardage, handicap, tee/green GPS, fairway path)."""
    hole = db.query(CourseHole).filter(CourseHole.id == hole_id).first()
    if not hole:
        raise HTTPException(status_code=404, detail="Hole not found")
    if hole.tee.course_id != course_id:
        raise HTTPException(status_code=400, detail="Hole does not belong to this course")

    if req.par is not None:
        hole.par = req.par
    if req.yardage is not None:
        hole.yardage = req.yardage
    if req.handicap is not None:
        hole.handicap = req.handicap
    if req.tee_lat is not None:
        hole.tee_lat = req.tee_lat
        hole.tee_lng = req.tee_lng
    if req.flag_lat is not None:
        hole.flag_lat = req.flag_lat
        hole.flag_lng = req.flag_lng
    if req.fairway_path is not None:
        hole.fairway_path = req.fairway_path or None  # empty string → clear
    if req.fairway_boundary is not None:
        hole.fairway_boundary = req.fairway_boundary or None
    if req.green_boundary is not None:
        hole.green_boundary = req.green_boundary or None
    if req.notes is not None:
        hole.notes = req.notes.strip() if req.notes.strip() else None

    hole.data_source = 'manual'

    db.commit()
    db.refresh(hole)

    # Recalculate computed metrics for all shots on this hole
    hazards = db.query(CourseHazard).filter(
        CourseHazard.golf_club_id == hole.tee.course.golf_club_id
    ).all()
    recalc_hole_shots(db, hole, hazards)

    return {"status": "ok", "hole_id": hole.id}


class LinkOSMHoleRequest(BaseModel):
    osm_hole_id: Optional[int] = None  # None = unlink
    apply_gps: bool = True  # Populate tee/green/fairway from OSM data


@router.post("/{course_id}/holes/{hole_id}/link-osm")
def link_osm_hole(
    course_id: int, hole_id: int, req: LinkOSMHoleRequest, db: Session = Depends(get_db),
):
    """Link or unlink an OSM hole to a CourseHole. Optionally apply GPS data."""
    hole = db.query(CourseHole).filter(CourseHole.id == hole_id).first()
    if not hole:
        raise HTTPException(status_code=404, detail="Hole not found")

    # Verify hole belongs to this course
    tee = db.query(CourseTee).filter(CourseTee.id == hole.tee_id).first()
    if not tee or tee.course_id != course_id:
        raise HTTPException(status_code=400, detail="Hole does not belong to this course")

    if req.osm_hole_id is None:
        # Unlink
        hole.osm_hole_id = None
        db.commit()
        return {"status": "unlinked", "hole_id": hole.id}

    osm_hole = db.query(OSMHole).filter(OSMHole.id == req.osm_hole_id).first()
    if not osm_hole:
        raise HTTPException(status_code=404, detail="OSM hole not found")

    # Link this hole
    hole.osm_hole_id = osm_hole.id

    # Apply GPS data from OSM if requested
    if req.apply_gps:
        hole.tee_lat = osm_hole.tee_lat
        hole.tee_lng = osm_hole.tee_lng
        hole.flag_lat = osm_hole.green_lat
        hole.flag_lng = osm_hole.green_lng
        if osm_hole.green_boundary and not hole.green_boundary:
            hole.green_boundary = osm_hole.green_boundary
        if osm_hole.waypoints and not hole.fairway_path:
            hole.fairway_path = osm_hole.waypoints

    # Also apply to all other tees for this hole number at this course
    all_tees = db.query(CourseTee).filter(CourseTee.course_id == course_id).all()
    for t in all_tees:
        if t.id == hole.tee_id:
            continue
        sibling = db.query(CourseHole).filter(
            CourseHole.tee_id == t.id,
            CourseHole.hole_number == hole.hole_number,
        ).first()
        if sibling:
            sibling.osm_hole_id = osm_hole.id
            if req.apply_gps:
                if not sibling.tee_lat:
                    sibling.tee_lat = osm_hole.tee_lat
                    sibling.tee_lng = osm_hole.tee_lng
                if not sibling.flag_lat:
                    sibling.flag_lat = osm_hole.green_lat
                    sibling.flag_lng = osm_hole.green_lng

    db.commit()

    # Recalculate computed metrics for shots on this hole (and siblings)
    if req.apply_gps:
        course = db.query(Course).filter(Course.id == course_id).first()
        if course:
            hazards = db.query(CourseHazard).filter(
                CourseHazard.golf_club_id == course.golf_club_id
            ).all()
            recalc_hole_shots(db, hole, hazards)

    return {"status": "linked", "hole_id": hole.id, "osm_hole_id": osm_hole.id}


@router.post("/{course_id}/match-osm-holes")
def match_osm_holes(course_id: int, db: Session = Depends(get_db)):
    """
    Run the unified OSM-to-CourseHole matcher for this course.
    Useful when OSM holes were already imported (e.g. at club level) but the course
    has no shot GPS yet — re-runs the ref-tag fallback to link as many holes as possible.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return _match_osm_holes_to_course(db, course)


# ── OSM Auto-Detect ──

@router.post("/{course_id}/detect-features")
def detect_features(course_id: int, db: Session = Depends(get_db)):
    """
    Query OpenStreetMap for golf course features (bunkers, greens, tees, water).
    Returns detected features for preview — does NOT auto-import.
    """
    from app.services.osm_golf_service import fetch_golf_features

    course = db.query(Course).options(joinedload(Course.club)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Get course center GPS from club or from hole data
    lat, lng = None, None
    if course.club and course.club.lat and course.club.lng:
        lat, lng = course.club.lat, course.club.lng
    else:
        # Try to get from first hole with GPS data
        hole = db.query(CourseHole).join(CourseTee).filter(
            CourseTee.course_id == course_id,
            CourseHole.tee_lat.isnot(None),
        ).first()
        if hole:
            lat, lng = hole.tee_lat, hole.tee_lng

    if not lat or not lng:
        raise HTTPException(status_code=400, detail="Course has no GPS coordinates. Sync course data first.")

    try:
        data = fetch_golf_features(lat, lng)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "summary": data.summary(),
        "bunkers": [{"osm_id": f.osm_id, "name": f.name, "boundary": f.boundary, "holes": f.holes, "hole": f.hole_number} for f in data.bunkers],
        "greens": [{"osm_id": f.osm_id, "name": f.name, "boundary": f.boundary, "center": [f.center_lat, f.center_lng], "hole": f.hole_number} for f in data.greens],
        "tees": [{"osm_id": f.osm_id, "name": f.name, "center": [f.center_lat, f.center_lng] if f.center_lat else f.boundary[0] if f.boundary else None, "boundary": f.boundary, "hole": f.hole_number} for f in data.tees],
        "fairways": [{"osm_id": f.osm_id, "name": f.name, "boundary": f.boundary, "hole": f.hole_number} for f in data.fairways],
        "water": [{"osm_id": f.osm_id, "name": f.name, "boundary": f.boundary, "holes": f.holes} for f in data.water],
        "pins": [{"osm_id": f.osm_id, "name": f.name, "center": [f.center_lat, f.center_lng], "hole": f.hole_number} for f in data.pins],
        "holes": [{"osm_id": h.osm_id, "hole_number": h.hole_number, "par": h.par,
                   "tee": [h.tee_lat, h.tee_lng], "green": [h.green_lat, h.green_lng],
                   "waypoints": h.waypoints} for h in data.holes],
    }


class ImportFeaturesRequest(BaseModel):
    bunkers: list[dict] = []
    water: list[dict] = []
    greens: list[dict] = []
    holes: list[dict] = []


@router.post("/{course_id}/import-features")
def import_features(course_id: int, features: ImportFeaturesRequest, db: Session = Depends(get_db)):
    """
    Import selected OSM features into the course.
    Imports hazards, and uses hole centerlines to populate tee/green/fairway on course holes.
    """
    import json as jsonlib
    import math

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    imported = {"bunkers": 0, "water": 0, "holes_enriched": 0, "greens_set": 0}

    # Import bunkers and water as club-level hazards (shared across all courses at this club)
    golf_club_id = course.golf_club_id

    # Clear existing hazards for this club to avoid duplicates on re-import
    if features.bunkers or features.water:
        existing_count = db.query(CourseHazard).filter(CourseHazard.golf_club_id == golf_club_id).count()
        if existing_count > 0:
            db.query(CourseHazard).filter(CourseHazard.golf_club_id == golf_club_id).delete()
            db.flush()

    for b in features.bunkers:
        if b.get("boundary") and len(b["boundary"]) >= 3:
            hazard = CourseHazard(
                golf_club_id=golf_club_id,
                hazard_type="bunker",
                name=b.get("name"),
                boundary=jsonlib.dumps([b["boundary"], *(b.get("holes") or [])]),
                data_source='osm',
            )
            db.add(hazard)
            imported["bunkers"] += 1

    # Import water hazards
    for w in features.water:
        if w.get("boundary") and len(w["boundary"]) >= 3:
            hazard = CourseHazard(
                golf_club_id=golf_club_id,
                hazard_type="water",
                name=w.get("name"),
                boundary=jsonlib.dumps([w["boundary"], *(w.get("holes") or [])]),
                data_source='osm',
            )
            db.add(hazard)
            imported["water"] += 1

    # Persist OSM holes at club level (idempotent — dedupe by osm_id), then run the
    # unified matcher to link them to CourseHoles. One code path for all OSM imports.
    if features.holes:
        for h in features.holes:
            osm_id = h.get("osm_id")
            if osm_id and db.query(OSMHole).filter(
                OSMHole.golf_club_id == golf_club_id,
                OSMHole.osm_id == osm_id,
            ).first():
                continue
            tee_pos = h.get("tee") or [None, None]
            green_pos = h.get("green") or [None, None]
            waypoints = h.get("waypoints") or []
            db.add(OSMHole(
                golf_club_id=golf_club_id,
                osm_id=osm_id,
                hole_number=h.get("hole_number"),
                par=h.get("par"),
                tee_lat=tee_pos[0],
                tee_lng=tee_pos[1],
                green_lat=green_pos[0],
                green_lng=green_pos[1],
                waypoints=jsonlib.dumps(waypoints) if waypoints else None,
            ))
        db.commit()

        match_result = _match_osm_holes_to_course(db, course)
        imported["holes_enriched"] = match_result["matched"]
        imported["match_strategy"] = match_result["by_strategy"]
        imported["unlinked"] = match_result["unlinked"]

    # Match green boundaries to holes by proximity to flag position
    if features.greens:
        tees = db.query(CourseTee).filter(CourseTee.course_id == course_id).all()
        for tee in tees:
            holes = db.query(CourseHole).filter(CourseHole.tee_id == tee.id).all()
            for hole in holes:
                if hole.green_boundary or not hole.flag_lat:
                    continue

                # Find the green closest to this hole's flag position
                best_green = None
                best_dist = float("inf")
                for g in features.greens:
                    center = g.get("center", [0, 0])
                    if not center or len(center) < 2:
                        continue
                    d = math.sqrt((center[0] - hole.flag_lat) ** 2 + (center[1] - hole.flag_lng) ** 2)
                    if d < best_dist and d < 0.001:  # ~100m max distance
                        best_dist = d
                        best_green = g

                if best_green and best_green.get("boundary"):
                    hole.green_boundary = jsonlib.dumps(best_green["boundary"])
                    imported["greens_set"] += 1

    db.commit()

    # Recalculate computed metrics for all shots on this course
    recalc_course_shots(db, course_id)

    return {"status": "imported", **imported}


# ── Hazard Endpoints ──

@router.post("/club/{golf_club_id}/detect-features")
def detect_features_club(golf_club_id: int, db: Session = Depends(get_db)):
    """Detect OSM features for all courses at a golf club."""
    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")

    # Get the club's GPS center from any source
    lat, lng = club.lat, club.lng
    if not lat or not lng:
        # Try to get from shot data across all courses
        courses = db.query(Course).filter(Course.golf_club_id == golf_club_id).all()
        for c in courses:
            round_ids = [r.id for r in db.query(Round).filter(Round.course_id == c.id).all()]
            if round_ids:
                shot_center = (
                    db.query(sqlfunc.avg(Shot.start_lat), sqlfunc.avg(Shot.start_lng))
                    .filter(Shot.round_id.in_(round_ids), Shot.start_lat.isnot(None))
                    .first()
                )
                if shot_center[0]:
                    lat, lng = shot_center[0], shot_center[1]
                    break

    if not lat or not lng:
        raise HTTPException(status_code=400, detail="No GPS data available for this club. Play a round or set club coordinates first.")

    from app.services.osm_golf_service import fetch_golf_features
    try:
        features = fetch_golf_features(lat, lng)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"OSM detection failed: {e}")

    # Return with summary for the frontend
    summary = features.summary()
    summary["total"] = features.total_count
    return {
        "summary": summary,
        "bunkers": [{"osm_id": b.osm_id, "boundary": b.boundary, "name": b.name} for b in features.bunkers],
        "water": [{"osm_id": w.osm_id, "boundary": w.boundary, "name": w.name} for w in features.water],
        "greens": [{"osm_id": g.osm_id, "boundary": g.boundary, "center": [g.center_lat, g.center_lng]} for g in features.greens],
        "holes": [{"hole_number": h.hole_number, "par": h.par, "tee": [h.tee_lat, h.tee_lng], "green": [h.green_lat, h.green_lng], "waypoints": h.waypoints} for h in features.holes],
    }


class ClubImportFeaturesRequest(BaseModel):
    import_hazards: bool = True
    import_holes: bool = True


@router.post("/club/{golf_club_id}/import-features")
def import_features_club(golf_club_id: int, req: ClubImportFeaturesRequest, db: Session = Depends(get_db)):
    """Import OSM features for all courses at a golf club — hazards go to club, holes matched to courses."""
    import math
    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Golf club not found")

    # Get GPS center
    lat, lng = club.lat, club.lng
    if not lat or not lng:
        courses = db.query(Course).filter(Course.golf_club_id == golf_club_id).all()
        for c in courses:
            round_ids = [r.id for r in db.query(Round).filter(Round.course_id == c.id).all()]
            if round_ids:
                shot_center = (
                    db.query(sqlfunc.avg(Shot.start_lat), sqlfunc.avg(Shot.start_lng))
                    .filter(Shot.round_id.in_(round_ids), Shot.start_lat.isnot(None))
                    .first()
                )
                if shot_center[0]:
                    lat, lng = shot_center[0], shot_center[1]
                    break

    if not lat or not lng:
        raise HTTPException(status_code=400, detail="No GPS data available")

    from app.services.osm_golf_service import fetch_golf_features

    # Check if courses are spread out (>1km apart) — if so, query per-course
    courses_all = db.query(Course).filter(Course.golf_club_id == golf_club_id).all()
    course_centers: dict[int, tuple[float, float]] = {}
    for c in courses_all:
        round_ids = [r.id for r in db.query(Round).filter(Round.course_id == c.id).all()]
        if round_ids:
            shot_center = (
                db.query(sqlfunc.avg(Shot.start_lat), sqlfunc.avg(Shot.start_lng))
                .filter(Shot.round_id.in_(round_ids), Shot.start_lat.isnot(None))
                .first()
            )
            if shot_center[0]:
                course_centers[c.id] = (shot_center[0], shot_center[1])

    # Determine if spread out
    is_spread = False
    if len(course_centers) >= 2:
        centers = list(course_centers.values())
        for i in range(len(centers)):
            for j in range(i + 1, len(centers)):
                import math as _math
                dlat = centers[i][0] - centers[j][0]
                dlng = centers[i][1] - centers[j][1]
                approx_km = _math.sqrt(dlat**2 + dlng**2) * 111  # rough km
                if approx_km > 1.0:
                    is_spread = True
                    break

    # Fetch OSM features — single query for clustered, per-course for spread
    if is_spread and course_centers:
        import logging as _logging
        _logging.getLogger(__name__).info(
            "Club '%s' has spread-out courses (>1km apart), querying OSM per-course", club.name)
        # Merge features from per-course queries
        from app.services.osm_golf_service import OSMCourseData
        features = OSMCourseData()
        seen_osm_ids = set()
        import time as _time
        for i, (cid, (clat, clng)) in enumerate(course_centers.items()):
            if i > 0:
                _time.sleep(2)  # Rate limit: 2s between Overpass requests
            try:
                cf = fetch_golf_features(clat, clng, radius_km=1.0)
                # Merge, deduplicating by OSM ID
                for b in cf.bunkers:
                    if b.osm_id not in seen_osm_ids:
                        features.bunkers.append(b)
                        seen_osm_ids.add(b.osm_id)
                for w in cf.water:
                    if w.osm_id not in seen_osm_ids:
                        features.water.append(w)
                        seen_osm_ids.add(w.osm_id)
                for h in cf.holes:
                    if h.osm_id not in seen_osm_ids:
                        features.holes.append(h)
                        seen_osm_ids.add(h.osm_id)
                for g in cf.greens:
                    if g.osm_id not in seen_osm_ids:
                        features.greens.append(g)
                        seen_osm_ids.add(g.osm_id)
                for t in cf.tees:
                    if t.osm_id not in seen_osm_ids:
                        features.tees.append(t)
                        seen_osm_ids.add(t.osm_id)
                for f in cf.fairways:
                    if f.osm_id not in seen_osm_ids:
                        features.fairways.append(f)
                        seen_osm_ids.add(f.osm_id)
                for p in cf.pins:
                    if p.osm_id not in seen_osm_ids:
                        features.pins.append(p)
                        seen_osm_ids.add(p.osm_id)
            except Exception as e:
                _logging.getLogger(__name__).warning(
                    "OSM query failed for course %d at (%s,%s): %s", cid, clat, clng, e)
    else:
        features = fetch_golf_features(lat, lng)

    result = {"bunkers": 0, "water": 0, "holes_enriched": 0, "greens_set": 0, "osm_holes_saved": 0}

    def _haversine_yards(lat1, lng1, lat2, lng2):
        R = 6371000
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a)) * 1.09361

    # Import hazards at club level (if requested)
    if req.import_hazards:
        import json as _json
        for b in features.bunkers:
            boundary_json = _json.dumps(b.boundary)
            # Deduplicate by osm_id
            if b.osm_id and db.query(CourseHazard).filter(
                CourseHazard.golf_club_id == golf_club_id,
                CourseHazard.osm_id == b.osm_id,
            ).first():
                continue
            db.add(CourseHazard(
                golf_club_id=golf_club_id,
                osm_id=b.osm_id,
                hazard_type="bunker",
                name=b.name,
                boundary=boundary_json,
            ))
            result["bunkers"] += 1

        for w in features.water:
            boundary_json = _json.dumps(w.boundary)
            if w.osm_id and db.query(CourseHazard).filter(
                CourseHazard.golf_club_id == golf_club_id,
                CourseHazard.osm_id == w.osm_id,
            ).first():
                continue
            db.add(CourseHazard(
                golf_club_id=golf_club_id,
                osm_id=w.osm_id,
                hazard_type="water",
                name=w.name,
                boundary=boundary_json,
            ))
            result["water"] += 1

    # ── Save raw OSM holes to OSMHole table (club-level, no matching needed) ──
    if features.holes:
        import json as _json2
        osm_holes_saved = 0
        for osm_h in features.holes:
            # Dedup by osm_id at this club
            existing_osm = db.query(OSMHole).filter(
                OSMHole.golf_club_id == golf_club_id,
                OSMHole.osm_id == osm_h.osm_id,
            ).first()
            if not existing_osm:
                # Find matching green boundary from features.greens
                green_boundary_json = None
                for g in features.greens:
                    if g.center_lat and g.center_lng:
                        dist_to_green = _haversine_yards(g.center_lat, g.center_lng, osm_h.green_lat, osm_h.green_lng)
                        if dist_to_green < 30:
                            green_boundary_json = _json2.dumps(g.boundary)
                            break

                db.add(OSMHole(
                    golf_club_id=golf_club_id,
                    osm_id=osm_h.osm_id,
                    hole_number=osm_h.hole_number,
                    par=osm_h.par,
                    tee_lat=osm_h.tee_lat,
                    tee_lng=osm_h.tee_lng,
                    green_lat=osm_h.green_lat,
                    green_lng=osm_h.green_lng,
                    waypoints=_json2.dumps(osm_h.waypoints) if osm_h.waypoints else None,
                    green_boundary=green_boundary_json,
                ))
                osm_holes_saved += 1
        db.flush()
        result["osm_holes_saved"] = osm_holes_saved

    # ── Auto-match OSM holes to CourseHoles ──
    if req.import_holes:
        courses = courses_all

        # Get all unlinked OSM holes for this club
        all_osm_holes = db.query(OSMHole).filter(OSMHole.golf_club_id == golf_club_id).all()
        # Track which OSM holes have been assigned
        assigned_osm_ids = set()

        for course in courses:
            tees = db.query(CourseTee).filter(CourseTee.course_id == course.id).all()
            if not tees:
                continue

            round_ids = [r.id for r in db.query(Round).filter(Round.course_id == course.id).all()]

            ref_tee = None
            for t in tees:
                if not getattr(t, 'inferred', False):
                    ref_tee = t
                    break
            if not ref_tee:
                ref_tee = tees[0]

            ref_holes = db.query(CourseHole).filter(CourseHole.tee_id == ref_tee.id).order_by(CourseHole.hole_number).all()
            if not ref_holes:
                continue

            remaining_osm = [oh for oh in all_osm_holes if oh.id not in assigned_osm_ids]

            for hole in ref_holes:
                if hole.osm_hole_id:
                    # Already linked
                    assigned_osm_ids.add(hole.osm_hole_id)
                    continue

                # Try to match: 1) Garmin tee shot GPS, 2) hole number, 3) yardage
                best_osm = None
                best_score = float('inf')

                # Get Garmin tee shot GPS
                garmin_tee_lat, garmin_tee_lng = None, None
                if round_ids:
                    tee_shot = (
                        db.query(Shot)
                        .join(RoundHole)
                        .filter(
                            Shot.round_id.in_(round_ids),
                            RoundHole.hole_number == hole.hole_number,
                            Shot.shot_number == 1,
                            Shot.start_lat.isnot(None),
                        )
                        .first()
                    )
                    if tee_shot:
                        garmin_tee_lat = tee_shot.start_lat
                        garmin_tee_lng = tee_shot.start_lng

                for osm_h in remaining_osm:
                    if osm_h.id in assigned_osm_ids:
                        continue

                    score = 0

                    if garmin_tee_lat:
                        # GPS proximity (best signal)
                        dist = _haversine_yards(garmin_tee_lat, garmin_tee_lng, osm_h.tee_lat, osm_h.tee_lng)
                        if dist > 200:
                            continue  # Too far
                        score = dist
                    elif hole.yardage and osm_h.tee_lat and osm_h.green_lat:
                        # Yardage matching (fallback)
                        osm_dist = _haversine_yards(osm_h.tee_lat, osm_h.tee_lng, osm_h.green_lat, osm_h.green_lng)
                        yard_diff = abs(osm_dist - hole.yardage)
                        par_penalty = 0 if osm_h.par == hole.par else 50
                        score = yard_diff + par_penalty
                        if score > 60:
                            continue
                    elif osm_h.hole_number == hole.hole_number:
                        # Hole number match (last resort)
                        score = 0
                    else:
                        continue

                    if score < best_score:
                        best_score = score
                        best_osm = osm_h

                if best_osm:
                    assigned_osm_ids.add(best_osm.id)
                    # Link all tees' holes to this OSM hole and populate GPS
                    for t in tees:
                        h = db.query(CourseHole).filter(
                            CourseHole.tee_id == t.id,
                            CourseHole.hole_number == hole.hole_number,
                        ).first()
                        if h:
                            h.osm_hole_id = best_osm.id
                            if not h.tee_lat:
                                h.tee_lat = best_osm.tee_lat
                                h.tee_lng = best_osm.tee_lng
                            if not h.flag_lat:
                                h.flag_lat = best_osm.green_lat
                                h.flag_lng = best_osm.green_lng
                            if best_osm.green_boundary and not h.green_boundary:
                                h.green_boundary = best_osm.green_boundary
                            if best_osm.waypoints and not h.fairway_path:
                                h.fairway_path = best_osm.waypoints

                    result["holes_enriched"] += 1

    db.commit()

    # Recalculate computed metrics for all courses at this club
    for c in courses_all:
        recalc_course_shots(db, c.id)

    return result


class HazardCreateRequest(BaseModel):
    hazard_type: str  # bunker, water, out_of_bounds, trees, waste_area
    name: Optional[str] = None
    boundary: str  # JSON [[lat, lng], ...]


class HazardUpdateRequest(BaseModel):
    hazard_type: Optional[str] = None
    name: Optional[str] = None
    boundary: Optional[str] = None


@router.post("/{course_id}/hazards")
def create_hazard(course_id: int, req: HazardCreateRequest, db: Session = Depends(get_db)):
    """Add a hazard to this course's club (shared across all courses at the club)."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    hazard = CourseHazard(
        golf_club_id=course.golf_club_id,
        hazard_type=req.hazard_type,
        name=req.name,
        boundary=req.boundary,
    )
    db.add(hazard)
    db.commit()
    db.refresh(hazard)
    return CourseHazardResponse.model_validate(hazard)


@router.put("/{course_id}/hazards/{hazard_id}")
def update_hazard(course_id: int, hazard_id: int, req: HazardUpdateRequest, db: Session = Depends(get_db)):
    """Update a hazard."""
    hazard = db.query(CourseHazard).filter(CourseHazard.id == hazard_id).first()
    if not hazard:
        raise HTTPException(status_code=404, detail="Hazard not found")

    if req.hazard_type is not None:
        hazard.hazard_type = req.hazard_type
    if req.name is not None:
        hazard.name = req.name
    if req.boundary is not None:
        hazard.boundary = req.boundary

    db.commit()
    db.refresh(hazard)
    return CourseHazardResponse.model_validate(hazard)


@router.delete("/{course_id}/hazards/{hazard_id}")
def delete_hazard(course_id: int, hazard_id: int, db: Session = Depends(get_db)):
    """Delete a hazard."""
    hazard = db.query(CourseHazard).filter(CourseHazard.id == hazard_id).first()
    if not hazard:
        raise HTTPException(status_code=404, detail="Hazard not found")

    db.delete(hazard)
    db.commit()
    return {"status": "deleted", "hazard_id": hazard_id}


# ── OSM Search & Link Endpoints ──

class OSMSearchRequest(BaseModel):
    query: str
    near_lat: Optional[float] = None
    near_lng: Optional[float] = None


class OSMSearchResultResponse(BaseModel):
    osm_id: int
    osm_type: str
    name: str
    display_name: str
    lat: float
    lng: float
    distance_miles: Optional[float] = None


class OSMPreviewResponse(BaseModel):
    osm_id: int
    name: str
    bunkers: int = 0
    water: int = 0
    holes: int = 0
    greens: int = 0
    tees: int = 0
    fairways: int = 0
    total: int = 0


class OSMLinkRequest(BaseModel):
    osm_id: int
    osm_type: str = "relation"
    import_features: bool = True


@router.post("/osm/search", response_model=list[OSMSearchResultResponse])
def osm_search(body: OSMSearchRequest):
    """Search OSM for golf courses by name."""
    try:
        results = search_golf_courses(
            body.query,
            near_lat=body.near_lat,
            near_lng=body.near_lng,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return [
        OSMSearchResultResponse(
            osm_id=r.osm_id,
            osm_type=r.osm_type,
            name=r.name,
            display_name=r.display_name,
            lat=r.lat,
            lng=r.lng,
            distance_miles=r.distance_miles,
        )
        for r in results
    ]


@router.post("/osm/preview/{osm_id}")
def osm_preview(osm_id: int, osm_type: str = "relation"):
    """Preview what features are available for an OSM course without importing."""
    try:
        data = fetch_features_by_osm_id(osm_id, osm_type)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return OSMPreviewResponse(
        osm_id=osm_id,
        name="",
        **data.summary(),
    )


@router.post("/{course_id}/osm/link")
def link_course_to_osm(course_id: int, body: OSMLinkRequest, db: Session = Depends(get_db)):
    """Link a course to a specific OSM course and optionally import features."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Save the OSM link
    course.osm_id = body.osm_id

    # Fetch and save boundary polygon
    import json as jsonlib
    try:
        boundary = fetch_osm_boundary(body.osm_id, body.osm_type)
        if boundary:
            course.osm_boundary = jsonlib.dumps(boundary)
    except Exception as e:
        logger.warning("Failed to fetch boundary for OSM %d: %s", body.osm_id, e)

    db.commit()

    result = {"status": "linked", "course_id": course_id, "osm_id": body.osm_id, "boundary_saved": course.osm_boundary is not None}

    if body.import_features:
        try:
            features = fetch_features_by_osm_id(body.osm_id, body.osm_type)
            import_result = _import_osm_features_to_course(db, course, features)
            result.update(import_result)
        except ValueError as e:
            result["import_error"] = str(e)

    return result


@router.post("/club/{golf_club_id}/osm/link")
def link_club_to_osm(golf_club_id: int, body: OSMLinkRequest, db: Session = Depends(get_db)):
    """Link a whole club to an OSM course and import features for all courses."""
    club = db.query(GolfClub).filter(GolfClub.id == golf_club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    club.osm_id = body.osm_id
    db.commit()

    result = {"status": "linked", "golf_club_id": golf_club_id, "osm_id": body.osm_id}

    if body.import_features:
        try:
            features = fetch_features_by_osm_id(body.osm_id, body.osm_type)
            import_result = _import_osm_features_to_club(db, club, features)
            result.update(import_result)
        except ValueError as e:
            result["import_error"] = str(e)

    return result


def _import_osm_features_to_course(db: Session, course: Course, features) -> dict:
    """Import OSM features into a specific course."""
    import json as jsonlib
    import math

    golf_club_id = course.golf_club_id
    result = {"bunkers": 0, "water": 0, "holes_enriched": 0, "greens_set": 0, "osm_holes_saved": 0}

    # Import hazards at club level (deduplicate by osm_id)
    for bunker in features.bunkers:
        if bunker.osm_id and db.query(CourseHazard).filter(
            CourseHazard.golf_club_id == golf_club_id,
            CourseHazard.osm_id == bunker.osm_id,
        ).first():
            continue
        db.add(CourseHazard(
            golf_club_id=golf_club_id,
            osm_id=bunker.osm_id,
            hazard_type="bunker",
            name=bunker.name,
            boundary=jsonlib.dumps([bunker.boundary, *bunker.holes]),
        ))
        result["bunkers"] += 1

    for water in features.water:
        if water.osm_id and db.query(CourseHazard).filter(
            CourseHazard.golf_club_id == golf_club_id,
            CourseHazard.osm_id == water.osm_id,
        ).first():
            continue
        db.add(CourseHazard(
            golf_club_id=golf_club_id,
            osm_id=water.osm_id,
            hazard_type="water",
            name=water.name,
            boundary=jsonlib.dumps([water.boundary, *water.holes]),
        ))
        result["water"] += 1

    # Save OSM holes at club level
    for h in features.holes:
        existing = db.query(OSMHole).filter(
            OSMHole.golf_club_id == golf_club_id,
            OSMHole.osm_id == h.osm_id,
        ).first()
        if not existing:
            db.add(OSMHole(
                golf_club_id=golf_club_id,
                osm_id=h.osm_id,
                hole_number=h.hole_number,
                par=h.par,
                tee_lat=h.tee_lat,
                tee_lng=h.tee_lng,
                green_lat=h.green_lat,
                green_lng=h.green_lng,
                waypoints=jsonlib.dumps(h.waypoints),
            ))
            result["osm_holes_saved"] += 1

    db.commit()

    # Auto-match OSM holes to course holes
    _match_osm_holes_to_course(db, course)

    return result


def _import_osm_features_to_club(db: Session, club: GolfClub, features) -> dict:
    """Import OSM features at club level, auto-match holes to all courses."""
    import json as jsonlib

    result = {"bunkers": 0, "water": 0, "osm_holes_saved": 0, "courses_matched": 0}

    # Import hazards (deduplicate by osm_id)
    for bunker in features.bunkers:
        if bunker.osm_id and db.query(CourseHazard).filter(
            CourseHazard.golf_club_id == club.id,
            CourseHazard.osm_id == bunker.osm_id,
        ).first():
            continue
        db.add(CourseHazard(
            golf_club_id=club.id,
            osm_id=bunker.osm_id,
            hazard_type="bunker",
            name=bunker.name,
            boundary=jsonlib.dumps([bunker.boundary, *bunker.holes]),
        ))
        result["bunkers"] += 1

    for water in features.water:
        if water.osm_id and db.query(CourseHazard).filter(
            CourseHazard.golf_club_id == club.id,
            CourseHazard.osm_id == water.osm_id,
        ).first():
            continue
        db.add(CourseHazard(
            golf_club_id=club.id,
            osm_id=water.osm_id,
            hazard_type="water",
            name=water.name,
            boundary=jsonlib.dumps([water.boundary, *water.holes]),
        ))
        result["water"] += 1

    # Save OSM holes
    for h in features.holes:
        existing = db.query(OSMHole).filter(
            OSMHole.golf_club_id == club.id,
            OSMHole.osm_id == h.osm_id,
        ).first()
        if not existing:
            db.add(OSMHole(
                golf_club_id=club.id,
                osm_id=h.osm_id,
                hole_number=h.hole_number,
                par=h.par,
                tee_lat=h.tee_lat,
                tee_lng=h.tee_lng,
                green_lat=h.green_lat,
                green_lng=h.green_lng,
                waypoints=jsonlib.dumps(h.waypoints),
            ))
            result["osm_holes_saved"] += 1

    db.commit()

    # Auto-match holes to each course at the club
    courses = db.query(Course).filter(Course.golf_club_id == club.id).all()
    for course in courses:
        match_result = _match_osm_holes_to_course(db, course)
        if match_result["matched"] > 0:
            result["courses_matched"] += 1

    return result


def _match_osm_holes_to_course(db: Session, course: Course) -> dict:
    """
    Unified matcher: link persisted OSMHole records to this course's CourseHoles.

    Per-hole priority (first hit wins):
      1. Garmin shot GPS  — first-shot lat/lng within 50y of an OSM tee
      2. OSM ref tag      — OSMHole.hole_number == hole.hole_number (with +9/+18 offset
                            for back-nine OSM data on 9-hole courses); par tie-break
                            when multiple candidates remain
      3. Unlinked         — left for manual assignment via Drawing Tools

    Multi-course facilities (e.g. Pine Knob): OSM holes are stored at club level. Before
    matching, candidates are pre-filtered to those near this course's centroid (derived
    from shot GPS, then existing hole positions, then club GPS).

    Sets osm_hole_id FK and applies tee/green/fairway GPS when missing. Idempotent —
    skips holes already linked. Returns per-strategy counts for telemetry.
    """
    osm_holes = db.query(OSMHole).filter(
        OSMHole.golf_club_id == course.golf_club_id
    ).all()
    if not osm_holes:
        return {"matched": 0, "by_strategy": {"gps": 0, "ref": 0}, "unlinked": 0}

    tees = db.query(CourseTee).filter(CourseTee.course_id == course.id).all()
    if not tees:
        return {"matched": 0, "by_strategy": {"gps": 0, "ref": 0}, "unlinked": 0}

    # ── First-shot GPS per hole_number (strategy 1 signal) ──
    round_ids = [r.id for r in db.query(Round).filter(Round.course_id == course.id).all()]
    shot_tee_positions: dict[int, tuple[float, float]] = {}
    if round_ids:
        for rh in db.query(RoundHole).filter(RoundHole.round_id.in_(round_ids)).all():
            if rh.hole_number in shot_tee_positions:
                continue
            s1 = db.query(Shot).filter(
                Shot.round_hole_id == rh.id,
                Shot.shot_number == 1,
                Shot.start_lat.isnot(None),
            ).first()
            if s1:
                shot_tee_positions[rh.hole_number] = (s1.start_lat, s1.start_lng)

    # ── Course centroid (used to pre-filter OSM candidates at multi-course facilities) ──
    course_lat, course_lng = None, None
    if shot_tee_positions:
        course_lat = sum(p[0] for p in shot_tee_positions.values()) / len(shot_tee_positions)
        course_lng = sum(p[1] for p in shot_tee_positions.values()) / len(shot_tee_positions)
    else:
        existing_lats, existing_lngs = [], []
        for t in tees:
            for h in db.query(CourseHole).filter(CourseHole.tee_id == t.id).all():
                if h.tee_lat:
                    existing_lats.append(h.tee_lat)
                    existing_lngs.append(h.tee_lng)
        if existing_lats:
            course_lat = sum(existing_lats) / len(existing_lats)
            course_lng = sum(existing_lngs) / len(existing_lngs)
        elif course.club and course.club.lat and course.club.lng:
            course_lat, course_lng = course.club.lat, course.club.lng

    # Narrow candidates only when the club has clearly more OSM holes than this course needs
    # (i.e. multi-course facility). Tight 500m radius, widen to 1km if too few.
    num_course_holes = course.holes or 18
    candidate_osm = osm_holes
    if course_lat and len(osm_holes) > num_course_holes:
        with_pos = [oh for oh in osm_holes if oh.tee_lat]
        TIGHT_YDS, WIDE_YDS = 547, 1094  # ~500m, ~1km
        close = [oh for oh in with_pos
                 if _haversine_yards_simple(course_lat, course_lng, oh.tee_lat, oh.tee_lng) < TIGHT_YDS]
        if len(close) >= num_course_holes:
            candidate_osm = close
        else:
            wide = [oh for oh in with_pos
                    if _haversine_yards_simple(course_lat, course_lng, oh.tee_lat, oh.tee_lng) < WIDE_YDS]
            candidate_osm = wide if wide else osm_holes

    GPS_MAX_YARDS = 50
    by_strategy = {"gps": 0, "ref": 0}
    matched_total = 0
    unlinked = 0

    for tee_obj in tees:
        holes = db.query(CourseHole).filter(CourseHole.tee_id == tee_obj.id).all()
        for hole in holes:
            if hole.osm_hole_id:
                continue

            best_osm = None
            strategy = None

            # ── Strategy 1: Garmin shot GPS (highest confidence) ──
            shot_pos = shot_tee_positions.get(hole.hole_number)
            if shot_pos:
                best_dist = GPS_MAX_YARDS + 1
                for oh in candidate_osm:
                    if not oh.tee_lat:
                        continue
                    d = _haversine_yards_simple(shot_pos[0], shot_pos[1], oh.tee_lat, oh.tee_lng)
                    if d > GPS_MAX_YARDS:
                        continue
                    if hole.par and oh.par and hole.par != oh.par:
                        d += 10  # par tie-break
                    if d < best_dist:
                        best_dist = d
                        best_osm = oh
                if best_osm:
                    strategy = "gps"

            # ── Strategy 2: OSM ref tag (works without played rounds) ──
            if not best_osm:
                for offset in (0, 9, 18):
                    target_num = hole.hole_number + offset
                    matches = [oh for oh in candidate_osm if oh.hole_number == target_num]
                    if not matches:
                        continue
                    if len(matches) > 1 and hole.par:
                        par_matches = [oh for oh in matches if oh.par == hole.par]
                        if par_matches:
                            matches = par_matches
                    # Final tie-break: closest to course centroid
                    if len(matches) > 1 and course_lat:
                        matches.sort(key=lambda oh: _haversine_yards_simple(
                            course_lat, course_lng, oh.tee_lat or course_lat, oh.tee_lng or course_lng,
                        ))
                    best_osm = matches[0]
                    strategy = "ref"
                    break

            if best_osm:
                hole.osm_hole_id = best_osm.id
                if best_osm.tee_lat and not hole.tee_lat:
                    hole.tee_lat = best_osm.tee_lat
                    hole.tee_lng = best_osm.tee_lng
                if best_osm.green_lat and not hole.flag_lat:
                    hole.flag_lat = best_osm.green_lat
                    hole.flag_lng = best_osm.green_lng
                if best_osm.waypoints and not hole.fairway_path:
                    hole.fairway_path = best_osm.waypoints
                if best_osm.green_boundary and not hole.green_boundary:
                    hole.green_boundary = best_osm.green_boundary
                if not hole.data_source or hole.data_source == 'api':
                    hole.data_source = 'osm'
                by_strategy[strategy] += 1
                matched_total += 1
            else:
                unlinked += 1

    db.commit()
    return {"matched": matched_total, "by_strategy": by_strategy, "unlinked": unlinked}


@router.get("/{target_id}/merge-preview/{source_id}")
def merge_preview(target_id: int, source_id: int, db: Session = Depends(get_db)):
    """Preview a merge: detect conflicting fields between source and target."""
    if target_id == source_id:
        raise HTTPException(status_code=400, detail="Cannot merge a course into itself")

    target = db.query(Course).filter(Course.id == target_id).first()
    source = db.query(Course).filter(Course.id == source_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target course not found")
    if not source:
        raise HTTPException(status_code=404, detail="Source course not found")
    if target.golf_club_id != source.golf_club_id:
        raise HTTPException(status_code=400, detail="Courses must belong to the same club")

    conflicts = []
    if source.holes and target.holes and source.holes != target.holes:
        conflicts.append({
            "field": "holes",
            "label": "Number of holes",
            "target_value": target.holes,
            "source_value": source.holes,
        })
    if source.par and target.par and source.par != target.par:
        conflicts.append({
            "field": "par",
            "label": "Par",
            "target_value": target.par,
            "source_value": source.par,
        })

    return {
        "target_id": target_id,
        "source_id": source_id,
        "target_name": target.display_name,
        "source_name": source.display_name,
        "conflicts": conflicts,
        "rounds_to_move": db.query(Round).filter(Round.course_id == source_id).count(),
        "tees_to_move": db.query(CourseTee).filter(CourseTee.course_id == source_id).count(),
    }


@router.post("/{target_id}/merge/{source_id}")
def merge_courses(
    target_id: int,
    source_id: int,
    resolve_holes: Optional[int] = None,
    resolve_par: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Merge source course into target: moves rounds & tees, then deletes source.

    When conflicts exist, pass resolve_holes / resolve_par query params
    to specify which value to keep. Returns 409 if conflicts exist but
    no resolution is provided.
    """
    if target_id == source_id:
        raise HTTPException(status_code=400, detail="Cannot merge a course into itself")

    target = db.query(Course).filter(Course.id == target_id).first()
    source = db.query(Course).filter(Course.id == source_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target course not found")
    if not source:
        raise HTTPException(status_code=404, detail="Source course not found")
    if target.golf_club_id != source.golf_club_id:
        raise HTTPException(status_code=400, detail="Courses must belong to the same club")

    # Check for unresolved conflicts
    unresolved = []
    if source.holes and target.holes and source.holes != target.holes and resolve_holes is None:
        unresolved.append("holes")
    if source.par and target.par and source.par != target.par and resolve_par is None:
        unresolved.append("par")
    if unresolved:
        raise HTTPException(
            status_code=409,
            detail=f"Conflicts on {', '.join(unresolved)}. Use merge-preview and provide resolutions.",
        )

    # Move rounds from source to target
    rounds_moved = db.query(Round).filter(Round.course_id == source_id).update(
        {Round.course_id: target_id}, synchronize_session="fetch"
    )

    # Move tees from source to target (re-parent them)
    tees_moved = db.query(CourseTee).filter(CourseTee.course_id == source_id).update(
        {CourseTee.course_id: target_id}, synchronize_session="fetch"
    )

    # Resolve holes: use explicit resolution, or fill in missing values
    if resolve_holes is not None:
        target.holes = resolve_holes
    elif source.holes and not target.holes:
        target.holes = source.holes

    # Resolve par: use explicit resolution, or fill in missing values
    if resolve_par is not None:
        target.par = resolve_par
    elif source.par and not target.par:
        target.par = source.par

    # Delete the now-empty source course
    db.delete(source)
    db.commit()

    logger.info(f"Merged course {source_id} into {target_id}: {rounds_moved} rounds, {tees_moved} tees moved")
    return {
        "status": "merged",
        "target_id": target_id,
        "source_id": source_id,
        "rounds_moved": rounds_moved,
        "tees_moved": tees_moved,
    }


def _haversine_yards_simple(lat1, lng1, lat2, lng2):
    """Quick haversine distance in yards."""
    import math
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)) * 1.09361
