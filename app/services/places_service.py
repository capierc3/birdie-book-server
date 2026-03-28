"""Google Places API integration — identifies golf clubs and fetches photos."""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.course import GolfClub

log = logging.getLogger(__name__)

PLACES_BASE = "https://places.googleapis.com/v1/places"


@dataclass
class PlacesResult:
    """Structured result from a Google Places lookup."""
    display_name: Optional[str] = None
    address: Optional[str] = None
    place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    photo_url: Optional[str] = None
    maps_uri: Optional[str] = None


def _api_configured() -> bool:
    return bool(settings.google_maps_api_key)


def _do_places_search(search_text: str, lat: float = None, lng: float = None) -> Optional[PlacesResult]:
    """
    Search Google Places (New) Text Search API for a golf course.
    Returns structured result with name, location, and photo.
    """
    api_key = settings.google_maps_api_key

    body = {
        "textQuery": search_text,
        "includedType": "golf_course",
        "maxResultCount": 1,
    }

    if lat and lng:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 10000.0,
            }
        }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.location,places.photos,places.googleMapsUri"
        ),
    }

    from app.services.api_tracker import track_call, check_limit
    if not check_limit("google_places"):
        return None
    track_call("google_places", "searchText")
    resp = httpx.post(
        f"{PLACES_BASE}:searchText",
        json=body,
        headers=headers,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    places = data.get("places", [])
    if not places:
        return None

    place = places[0]
    result = PlacesResult()
    result.place_id = place.get("id")
    result.maps_uri = place.get("googleMapsUri")

    display = place.get("displayName") or {}
    result.display_name = display.get("text")

    result.address = place.get("formattedAddress")

    location = place.get("location") or {}
    result.lat = location.get("latitude")
    result.lng = location.get("longitude")

    # Store the photo resource name (not a full URL) for later download
    photos = place.get("photos", [])
    if photos:
        photo_name = photos[0].get("name")
        if photo_name:
            result.photo_url = photo_name  # e.g. "places/ChIJ.../photos/AU_..."

    return result


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points in miles."""
    import math
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def lookup_club(club: GolfClub) -> Optional[PlacesResult]:
    """
    Look up a golf club via Google Places using its name and GPS.
    Returns a PlacesResult with the official name, location, and photo.
    Does NOT modify the database — caller decides what to store.
    Rejects results that are more than 50 miles from our GPS data.
    """
    if not _api_configured():
        log.warning("Google Maps API key not configured")
        return None

    search_text = club.name
    if "golf" not in search_text.lower():
        search_text += " golf course"

    result = _do_places_search(search_text, club.lat, club.lng)
    if result:
        # Validate: reject if Places result is too far from our GPS
        if club.lat and club.lng and result.lat and result.lng:
            dist = _haversine_miles(club.lat, club.lng, result.lat, result.lng)
            if dist > 50:
                log.warning(
                    "Places result for '%s' rejected — '%s' at %s is %.0f miles away",
                    club.name, result.display_name, result.address, dist,
                )
                return None

        log.info(
            "Places lookup for '%s' → '%s' at %s",
            club.name, result.display_name, result.address,
        )
    else:
        log.info("No Places result for '%s'", club.name)

    return result


def _download_photo(photo_resource: str, club_id: int) -> Optional[str]:
    """
    Download a Places photo to local storage.
    Returns the local URL path (e.g. /static/images/clubs/8.jpg) or None.
    """
    api_key = settings.google_maps_api_key
    if not api_key or not photo_resource:
        return None

    url = (
        f"https://places.googleapis.com/v1/{photo_resource}/media"
        f"?maxWidthPx=1200&maxHeightPx=600&key={api_key}"
    )

    try:
        from app.services.api_tracker import track_call, check_limit
        if not check_limit("google_places"):
            return None
        track_call("google_places", "photo_media")
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()

        img_dir = Path("app/static/images/clubs")
        img_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{club_id}.jpg"
        filepath = img_dir / filename
        filepath.write_bytes(resp.content)

        local_url = f"/static/images/clubs/{filename}"
        log.info("Downloaded club photo → %s (%d bytes)", local_url, len(resp.content))
        return local_url
    except Exception as e:
        log.warning("Failed to download club photo: %s", e)
        return None


def apply_places_result(db: Session, club: GolfClub, result: PlacesResult) -> None:
    """Store Places data on the GolfClub model and download photo locally."""
    if result.place_id and not club.google_place_id:
        club.google_place_id = result.place_id
    if result.address and not club.address:
        club.address = result.address
    if result.lat and result.lng and not club.lat:
        club.lat = result.lat
        club.lng = result.lng

    # Download photo locally instead of storing the API URL
    if result.photo_url and not club.photo_url:
        local_url = _download_photo(result.photo_url, club.id)
        if local_url:
            club.photo_url = local_url

    db.commit()


def fetch_club_photo(db: Session, club: GolfClub, force: bool = False) -> Optional[str]:
    """
    Convenience: look up club via Places and store photo + metadata.
    Returns the local photo URL or None.
    """
    if club.photo_url and not force:
        return club.photo_url

    try:
        result = lookup_club(club)
        if result:
            apply_places_result(db, club, result)
            return club.photo_url
    except Exception as e:
        log.warning("Places API error for %s: %s", club.name, e)

    return None
