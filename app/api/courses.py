from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Course, CourseTee, CourseHole, HoleImage
from app.services.image_service import fetch_all_hole_images

router = APIRouter(prefix="/api/courses", tags=["courses"])


# --- Pydantic schemas ---

class HoleImageResponse(BaseModel):
    filename: str
    zoom_level: int
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None

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
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    holes: Optional[int] = None
    par: Optional[int] = None
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None
    user_rating: Optional[float] = None
    user_notes: Optional[str] = None

    class Config:
        from_attributes = True


class CourseDetailResponse(CourseResponse):
    tees: list[CourseTeeResponse] = []

    class Config:
        from_attributes = True


class CourseCreateRequest(BaseModel):
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    google_place_id: Optional[str] = None
    holes: int = 18
    par: Optional[int] = None
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None


# --- Endpoints ---

@router.get("/", response_model=list[CourseResponse])
def list_courses(db: Session = Depends(get_db)):
    return db.query(Course).order_by(Course.name).all()


@router.get("/{course_id}", response_model=CourseDetailResponse)
def get_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
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
            hole_responses.append(CourseHoleResponse(
                id=h.id,
                hole_number=h.hole_number,
                par=h.par,
                yardage=h.yardage,
                handicap=h.handicap,
                flag_lat=h.flag_lat,
                flag_lng=h.flag_lng,
                image=HoleImageResponse.model_validate(img) if img else None,
            ))
        tee_responses.append(CourseTeeResponse(
            id=tee.id,
            tee_name=tee.tee_name,
            course_rating=tee.course_rating,
            slope_rating=tee.slope_rating,
            par_total=tee.par_total,
            total_yards=tee.total_yards,
            holes=hole_responses,
        ))

    return CourseDetailResponse(
        id=course.id,
        name=course.name,
        address=course.address,
        lat=course.lat,
        lng=course.lng,
        holes=course.holes,
        par=course.par,
        slope_rating=course.slope_rating,
        course_rating=course.course_rating,
        user_rating=course.user_rating,
        user_notes=course.user_notes,
        tees=tee_responses,
    )


@router.post("/", response_model=CourseResponse, status_code=201)
def create_course(req: CourseCreateRequest, db: Session = Depends(get_db)):
    course = Course(**req.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.post("/{course_id}/tees/{tee_id}/fetch-images")
def fetch_images(course_id: int, tee_id: int, db: Session = Depends(get_db)):
    """Fetch and cache satellite images for all holes of a tee."""
    images = fetch_all_hole_images(db, course_id, tee_id)
    return {"fetched": len(images)}
