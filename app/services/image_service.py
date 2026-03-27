"""
Service to fetch and cache satellite images of course holes from Google Maps Static API.
Images are stored on disk and referenced in the hole_images table.
"""

import math
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import CourseHole, HoleImage, Shot, RoundHole


def _calculate_zoom(min_lat: float, max_lat: float, min_lng: float, max_lng: float,
                    img_size: int = 640) -> int:
    """Calculate the best Google Maps zoom level to fit a bounding box."""
    lat_span = max_lat - min_lat
    lng_span = max_lng - min_lng

    if lat_span == 0 and lng_span == 0:
        return 18

    # World size at zoom 0 is 256px; each zoom doubles it
    lat_zoom = math.floor(math.log2(img_size * 360 / (lat_span * 256))) if lat_span > 0 else 20
    lng_zoom = math.floor(math.log2(img_size * 360 / (lng_span * 256))) if lng_span > 0 else 20

    return max(14, min(19, min(lat_zoom, lng_zoom) - 1))


def _get_hole_bounds(db: Session, hole: CourseHole) -> tuple[float, float, float, float]:
    """Get the bounding box for a hole from shot data + flag position."""
    # Get all shots for this hole at this course
    shots = (db.query(Shot)
             .join(RoundHole)
             .filter(RoundHole.hole_number == hole.hole_number)
             .all())

    lats = [hole.flag_lat] if hole.flag_lat else []
    lngs = [hole.flag_lng] if hole.flag_lng else []

    for s in shots:
        if s.start_lat and s.start_lng:
            lats.append(s.start_lat)
            lngs.append(s.start_lng)
        if s.end_lat and s.end_lng:
            lats.append(s.end_lat)
            lngs.append(s.end_lng)

    if not lats:
        return 0, 0, 0, 0

    # Add 10% padding
    lat_pad = (max(lats) - min(lats)) * 0.1 or 0.0005
    lng_pad = (max(lngs) - min(lngs)) * 0.1 or 0.0005

    return (min(lats) - lat_pad, max(lats) + lat_pad,
            min(lngs) - lng_pad, max(lngs) + lng_pad)


def fetch_hole_image(db: Session, hole: CourseHole, force: bool = False) -> HoleImage | None:
    """Fetch a satellite image for a course hole and save to disk."""
    if not settings.google_maps_api_key:
        return None

    # Check if already cached
    existing = db.query(HoleImage).filter(HoleImage.hole_id == hole.id).first()
    if existing and not force:
        return existing

    min_lat, max_lat, min_lng, max_lng = _get_hole_bounds(db, hole)
    if min_lat == 0:
        return None

    center_lat = (min_lat + max_lat) / 2
    center_lng = (min_lng + max_lng) / 2
    zoom = _calculate_zoom(min_lat, max_lat, min_lng, max_lng)

    url = (
        f"https://maps.googleapis.com/maps/api/staticmap"
        f"?center={center_lat},{center_lng}"
        f"&zoom={zoom}&size=640x640&maptype=satellite&scale=2"
        f"&key={settings.google_maps_api_key}"
    )

    response = httpx.get(url, timeout=30)
    response.raise_for_status()

    # Save to disk: images/holes/{course_id}/{tee_id}/hole_{n}.jpg
    course_dir = settings.image_dir / str(hole.tee.course_id) / str(hole.tee_id)
    course_dir.mkdir(parents=True, exist_ok=True)
    filename = f"hole_{hole.hole_number}.jpg"
    filepath = course_dir / filename
    filepath.write_bytes(response.content)

    # Save or update DB reference
    rel_path = f"{hole.tee.course_id}/{hole.tee_id}/{filename}"
    if existing:
        existing.filename = rel_path
        existing.zoom_level = zoom
        existing.center_lat = center_lat
        existing.center_lng = center_lng
    else:
        existing = HoleImage(
            hole_id=hole.id,
            filename=rel_path,
            zoom_level=zoom,
            center_lat=center_lat,
            center_lng=center_lng,
        )
        db.add(existing)

    db.commit()
    return existing


def fetch_all_hole_images(db: Session, course_id: int, tee_id: int) -> list[HoleImage]:
    """Fetch satellite images for all holes of a course tee."""
    holes = db.query(CourseHole).filter(CourseHole.tee_id == tee_id).all()
    results = []
    for hole in holes:
        img = fetch_hole_image(db, hole)
        if img:
            results.append(img)
    return results
