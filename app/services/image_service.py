"""
Service to fetch and cache satellite images of course holes from Google Maps Static API.
Images are stored on disk and referenced in the hole_images table.
"""

import math
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import CourseHole, HoleImage, Shot, RoundHole, Round


def _calculate_zoom(min_lat: float, max_lat: float, min_lng: float, max_lng: float,
                    img_w: int = 640, img_h: int = 640) -> int:
    """Calculate the best Google Maps zoom level to fit a bounding box in the image.
    Uses actual image dimensions per axis so wide/narrow images zoom correctly."""
    lat_span = max_lat - min_lat
    lng_span = max_lng - min_lng

    if lat_span == 0 and lng_span == 0:
        return 19

    # Calculate zoom per axis using actual pixel dimensions
    lat_zoom = math.log2(img_h * 360 / (lat_span * 256)) if lat_span > 0 else 20
    lng_zoom = math.log2(img_w * 360 / (lng_span * 256)) if lng_span > 0 else 20

    # Floor so we always show the full requested area (never clip)
    zoom = math.floor(min(lat_zoom, lng_zoom))
    return max(15, min(20, zoom))


def _get_hole_bounds(db: Session, hole: CourseHole) -> tuple[float, float, float, float]:
    """Get the bounding box for a hole.
    Prefers user-placed tee/green anchors if available, falls back to shot data."""
    # If user has placed both tee and green markers, use those as primary bounds
    if hole.tee_lat and hole.tee_lng and hole.flag_lat and hole.flag_lng:
        lats = [hole.tee_lat, hole.flag_lat]
        lngs = [hole.tee_lng, hole.flag_lng]

        # Also include fairway waypoints if they exist
        if hole.fairway_path:
            import json
            try:
                waypoints = json.loads(hole.fairway_path)
                for wp in waypoints:
                    lats.append(wp[0])
                    lngs.append(wp[1])
            except (json.JSONDecodeError, IndexError):
                pass

        # 40% padding around tee-to-green for nice framing
        lat_pad = max((max(lats) - min(lats)) * 0.4, 0.0010)
        lng_pad = max((max(lngs) - min(lngs)) * 0.4, 0.0010)

        return (min(lats) - lat_pad, max(lats) + lat_pad,
                min(lngs) - lng_pad, max(lngs) + lng_pad)

    # Fallback: use shot data
    course_id = hole.tee.course_id

    shots = (db.query(Shot)
             .join(RoundHole)
             .join(Round)
             .filter(
                 Round.course_id == course_id,
                 RoundHole.hole_number == hole.hole_number,
             )
             .all())

    lats = []
    lngs = []
    if hole.flag_lat:
        lats.append(hole.flag_lat)
        lngs.append(hole.flag_lng)
    if hole.tee_lat:
        lats.append(hole.tee_lat)
        lngs.append(hole.tee_lng)

    for s in shots:
        if s.start_lat and s.start_lng:
            lats.append(s.start_lat)
            lngs.append(s.start_lng)
        if s.end_lat and s.end_lng:
            lats.append(s.end_lat)
            lngs.append(s.end_lng)

    if not lats:
        return 0, 0, 0, 0

    # 50% padding for shot-based bounds
    lat_pad = max((max(lats) - min(lats)) * 0.5, 0.0012)
    lng_pad = max((max(lngs) - min(lngs)) * 0.5, 0.0012)

    return (min(lats) - lat_pad, max(lats) + lat_pad,
            min(lngs) - lng_pad, max(lngs) + lng_pad)


def _gps_to_pixel(lat: float, lng: float, center_lat: float, center_lng: float,
                   zoom: int, img_w: int, img_h: int) -> tuple[int, int]:
    """Convert GPS coords to pixel position in a Google Static Maps image.
    img_w/img_h are the actual pixel dimensions (after scale=2)."""
    scale = 2 ** zoom * 256
    # Mercator projection
    def to_merc_x(ln):
        return (ln + 180) / 360 * scale
    def to_merc_y(lt):
        sin_lat = math.sin(lt * math.pi / 180)
        return (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * scale

    cx = to_merc_x(center_lng)
    cy = to_merc_y(center_lat)
    px = to_merc_x(lng)
    py = to_merc_y(lat)

    # Pixel offset from center (scale=2 means actual pixels = 2x base)
    x = int((px - cx) * 2 + img_w / 2)
    y = int((py - cy) * 2 + img_h / 2)
    return x, y


def fetch_hole_image(db: Session, hole: CourseHole, force: bool = False) -> HoleImage | None:
    """Fetch a satellite image for a course hole and save to disk.
    If custom_bounds are set, fetches a large image then Pillow-crops to exact bounds."""
    if not settings.google_maps_api_key:
        return None

    # Check if already cached
    existing = db.query(HoleImage).filter(HoleImage.hole_id == hole.id).first()
    if existing and not force:
        return existing

    # Check for pixel-ratio crop bounds
    crop_ratios = None
    if hole.custom_bounds:
        import json
        try:
            cb = json.loads(hole.custom_bounds)
            # New format: pixel ratios (left, top, right, bottom as 0.0-1.0)
            if "left" in cb:
                crop_ratios = cb
        except (json.JSONDecodeError, KeyError):
            pass

    # Always use shot-based bounds for the initial fetch
    min_lat, max_lat, min_lng, max_lng = _get_hole_bounds(db, hole)
    if min_lat == 0:
        return None

    center_lat = (min_lat + max_lat) / 2
    center_lng = (min_lng + max_lng) / 2

    # Match aspect ratio to hole shape (used for both auto and crop modes)
    lat_span = max_lat - min_lat
    lng_span = max_lng - min_lng
    lat_m = lat_span * 111000
    lng_m = lng_span * 85000

    if lng_m >= lat_m:
        fetch_w = 640
        fetch_h = max(200, min(640, round(640 * lat_m / lng_m))) if lng_m > 0 else 480
    else:
        fetch_h = 640
        fetch_w = max(200, min(640, round(640 * lng_m / lat_m))) if lat_m > 0 else 480

    zoom = _calculate_zoom(min_lat, max_lat, min_lng, max_lng, img_w=fetch_w, img_h=fetch_h)

    # User override for zoom
    if hole.custom_zoom:
        zoom = hole.custom_zoom

    url = (
        f"https://maps.googleapis.com/maps/api/staticmap"
        f"?center={center_lat},{center_lng}"
        f"&zoom={zoom}&size={fetch_w}x{fetch_h}&maptype=satellite&scale=2"
        f"&key={settings.google_maps_api_key}"
    )

    from app.services.api_tracker import track_call, check_limit
    if not check_limit("google_maps_static"):
        return None
    track_call("google_maps_static", "staticmap")
    response = httpx.get(url, timeout=30)
    response.raise_for_status()

    # Actual pixel dimensions (scale=2)
    actual_w = fetch_w * 2
    actual_h = fetch_h * 2

    # Prepare output path
    course_dir = settings.image_dir / str(hole.tee.course_id) / str(hole.tee_id)
    course_dir.mkdir(parents=True, exist_ok=True)
    filename = f"hole_{hole.hole_number}.jpg"
    filepath = course_dir / filename

    final_w, final_h = actual_w, actual_h
    final_center_lat, final_center_lng = center_lat, center_lng

    # If crop ratios set, crop the image by pixel ratios
    if crop_ratios:
        try:
            from PIL import Image
            import io

            img = Image.open(io.BytesIO(response.content))
            if img.mode != "RGB":
                img = img.convert("RGB")
            iw, ih = img.size  # actual pixel dimensions (1280x1280 for 640x640 scale=2)

            # Apply ratios to actual pixel dimensions
            left = int(crop_ratios["left"] * iw)
            top = int(crop_ratios["top"] * ih)
            right = int(crop_ratios["right"] * iw)
            bottom = int(crop_ratios["bottom"] * ih)

            # Clamp
            left = max(0, min(left, iw - 1))
            right = max(left + 10, min(right, iw))
            top = max(0, min(top, ih - 1))
            bottom = max(top + 10, min(bottom, ih))

            cropped = img.crop((left, top, right, bottom))
            cropped.save(filepath, "JPEG", quality=92)

            final_w = cropped.width
            final_h = cropped.height

            # Compute new center GPS for the cropped region
            # At scale=2, each base pixel covers (360 / (2^zoom * 256)) degrees of longitude
            # The actual image has 2x pixels, so each actual pixel = half that
            deg_per_px_lng = 360 / (2 ** zoom * 256 * 2)  # per actual pixel
            deg_per_px_lat = deg_per_px_lng / math.cos(math.radians(center_lat))

            # Crop center offset from image center (in pixels)
            crop_center_x = (left + right) / 2
            crop_center_y = (top + bottom) / 2
            img_center_x = iw / 2
            img_center_y = ih / 2

            # GPS offset: x moves longitude, y moves latitude (y-up in GPS, y-down in pixels)
            final_center_lng = center_lng + (crop_center_x - img_center_x) * deg_per_px_lng
            final_center_lat = center_lat - (crop_center_y - img_center_y) * deg_per_px_lat

        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Pillow crop failed: %s — saving uncropped", e)
            filepath.write_bytes(response.content)
    else:
        # No crop — save raw response
        filepath.write_bytes(response.content)

    # Save or update DB reference
    rel_path = f"{hole.tee.course_id}/{hole.tee_id}/{filename}"
    if existing:
        existing.filename = rel_path
        existing.zoom_level = zoom
        existing.center_lat = final_center_lat
        existing.center_lng = final_center_lng
        existing.width_px = final_w
        existing.height_px = final_h
    else:
        existing = HoleImage(
            hole_id=hole.id,
            filename=rel_path,
            zoom_level=zoom,
            center_lat=final_center_lat,
            center_lng=final_center_lng,
            width_px=final_w,
            height_px=final_h,
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
