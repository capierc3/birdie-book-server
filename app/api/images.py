from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import HoleImage

router = APIRouter(prefix="/api/images", tags=["images"])


@router.get("/holes/{image_id}")
def get_hole_image(image_id: int, db: Session = Depends(get_db)):
    """Serve a cached hole image by its database ID."""
    img = db.query(HoleImage).filter(HoleImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    filepath = settings.image_dir / img.filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image file missing from disk")

    return FileResponse(filepath, media_type="image/jpeg")


@router.get("/holes/by-path/{course_id}/{tee_id}/{filename}")
def get_hole_image_by_path(course_id: int, tee_id: int, filename: str):
    """Serve a hole image by its file path components."""
    filepath = settings.image_dir / str(course_id) / str(tee_id) / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(filepath, media_type="image/jpeg")
