from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqlfunc
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import GolfClub, Course, CourseTee, CourseHole, CourseHazard, HoleImage
from app.services.image_service import fetch_all_hole_images
from app.services.golf_course_api import search_course_candidates, apply_golf_course_data, sync_club_courses, match_rounds_to_tees
from app.services.places_service import fetch_club_photo

router = APIRouter(prefix="/api/courses", tags=["courses"])


# --- Pydantic schemas ---

class HoleImageResponse(BaseModel):
    filename: str
    zoom_level: int
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    width_px: Optional[int] = None
    height_px: Optional[int] = None

    class Config:
        from_attributes = True


class CourseHazardResponse(BaseModel):
    id: int
    hazard_type: str
    name: Optional[str] = None
    boundary: str  # JSON [[lat, lng], ...]

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
    green_boundary: Optional[str] = None
    rotation_deg: int = 0
    custom_zoom: Optional[int] = None
    custom_bounds: Optional[str] = None
    shot_offset_x: Optional[float] = None
    shot_offset_y: Optional[float] = None
    image: Optional[HoleImageResponse] = None

    class Config:
        from_attributes = True


class CourseTeeResponse(BaseModel):
    id: int
    tee_name: str
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None
    par_total: Optional[int] = None
    total_yards: Optional[int] = None
    holes: list[CourseHoleResponse] = []

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


class CourseDetailResponse(CourseResponse):
    tees: list[CourseTeeResponse] = []
    hazards: list[CourseHazardResponse] = []

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
    )


# --- Endpoints ---

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
            img = db.query(HoleImage).filter(HoleImage.hole_id == h.id).first()
            hole_resp = CourseHoleResponse.model_validate(h)
            hole_resp.image = HoleImageResponse.model_validate(img) if img else None
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

    # Course-level hazards
    hazards = db.query(CourseHazard).filter(CourseHazard.course_id == course_id).all()
    hazard_responses = [CourseHazardResponse.model_validate(h) for h in hazards]

    base = _build_course_response(db, course)
    return CourseDetailResponse(
        **base.model_dump(),
        tees=tee_responses,
        hazards=hazard_responses,
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


@router.post("/{course_id}/tees/{tee_id}/fetch-images")
def fetch_images(course_id: int, tee_id: int, db: Session = Depends(get_db)):
    """Fetch and cache satellite images for all holes of a tee."""
    images = fetch_all_hole_images(db, course_id, tee_id)
    return {"fetched": len(images)}


@router.post("/{course_id}/holes/{hole_id}/fetch-image")
def fetch_single_hole_image(course_id: int, hole_id: int, db: Session = Depends(get_db)):
    """Fetch and cache a satellite image for a single hole."""
    from app.services.image_service import fetch_hole_image
    hole = db.query(CourseHole).filter(CourseHole.id == hole_id).first()
    if not hole:
        raise HTTPException(status_code=404, detail="Hole not found")
    result = fetch_hole_image(db, hole)
    if result:
        return {
            "status": "ok",
            "filename": result.filename,
            "center_lat": result.center_lat,
            "center_lng": result.center_lng,
            "zoom_level": result.zoom_level,
        }
    return {"status": "error", "reason": "Failed to fetch image (check API limits)"}


class HoleUpdateRequest(BaseModel):
    par: Optional[int] = None
    yardage: Optional[int] = None
    handicap: Optional[int] = None
    tee_lat: Optional[float] = None
    tee_lng: Optional[float] = None
    flag_lat: Optional[float] = None
    flag_lng: Optional[float] = None
    fairway_path: Optional[str] = None  # JSON string of [[lat, lng], ...]
    green_boundary: Optional[str] = None  # JSON string of [[lat, lng], ...] polygon
    rotation_deg: Optional[int] = None
    custom_zoom: Optional[int] = None
    custom_bounds: Optional[str] = None  # JSON: {"min_lat":..,"max_lat":..,"min_lng":..,"max_lng":..}
    shot_offset_x: Optional[float] = None  # Pixel offset for aligning shots after crop
    shot_offset_y: Optional[float] = None


@router.put("/{course_id}/holes/{hole_id}")
def update_hole(course_id: int, hole_id: int, req: HoleUpdateRequest, db: Session = Depends(get_db)):
    """Update hole data (par, yardage, handicap, tee/green GPS, fairway path)."""
    hole = db.query(CourseHole).filter(CourseHole.id == hole_id).first()
    if not hole:
        raise HTTPException(status_code=404, detail="Hole not found")
    if hole.tee.course_id != course_id:
        raise HTTPException(status_code=400, detail="Hole does not belong to this course")

    # Track if tee/green positions changed (need image re-fetch)
    positions_changed = False

    if req.par is not None:
        hole.par = req.par
    if req.yardage is not None:
        hole.yardage = req.yardage
    if req.handicap is not None:
        hole.handicap = req.handicap
    if req.tee_lat is not None:
        hole.tee_lat = req.tee_lat
        hole.tee_lng = req.tee_lng
        positions_changed = True
    if req.flag_lat is not None:
        hole.flag_lat = req.flag_lat
        hole.flag_lng = req.flag_lng
        positions_changed = True
    if req.fairway_path is not None:
        hole.fairway_path = req.fairway_path
    if req.green_boundary is not None:
        hole.green_boundary = req.green_boundary
    if req.rotation_deg is not None:
        hole.rotation_deg = req.rotation_deg
    if req.custom_zoom is not None:
        hole.custom_zoom = req.custom_zoom if req.custom_zoom else None
        positions_changed = True
    if req.custom_bounds is not None:
        hole.custom_bounds = req.custom_bounds if req.custom_bounds else None
        positions_changed = True
    if req.shot_offset_x is not None:
        hole.shot_offset_x = req.shot_offset_x
    if req.shot_offset_y is not None:
        hole.shot_offset_y = req.shot_offset_y

    # If positions changed, delete cached image so it re-fetches with new bounds
    if positions_changed:
        existing_img = db.query(HoleImage).filter(HoleImage.hole_id == hole.id).first()
        if existing_img:
            # Delete image file
            from pathlib import Path
            img_path = Path("app/static/images/holes") / existing_img.filename
            if img_path.exists():
                img_path.unlink()
            db.delete(existing_img)

    db.commit()
    db.refresh(hole)
    return {"status": "ok", "hole_id": hole.id, "positions_changed": positions_changed}


# ── Hazard Endpoints ──

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
    """Add a hazard to a course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    hazard = CourseHazard(
        course_id=course_id,
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
