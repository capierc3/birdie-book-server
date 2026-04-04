"""
Query OpenStreetMap for golf course features via the Overpass API.

Returns bunkers, greens, tees, fairways, water hazards, and pin positions
as GPS polygons/points that can be imported into the course model.
"""

import json
import logging
import time
import urllib.request
import urllib.parse
import math
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


@dataclass
class OSMFeature:
    osm_id: int
    feature_type: str  # bunker, green, tee, fairway, water, pin
    name: str | None
    boundary: list[list[float]]  # [[lat, lng], ...] for polygons
    center_lat: float | None = None
    center_lng: float | None = None
    hole_number: int | None = None  # inferred from name or proximity


@dataclass
class OSMHoleLine:
    """A hole centerline from OSM — has par, hole number, tee and green positions."""
    osm_id: int
    hole_number: int
    par: int | None
    tee_lat: float
    tee_lng: float
    green_lat: float
    green_lng: float
    waypoints: list[list[float]]  # [[lat, lng], ...] the full centerline


@dataclass
class OSMCourseData:
    bunkers: list[OSMFeature] = field(default_factory=list)
    greens: list[OSMFeature] = field(default_factory=list)
    tees: list[OSMFeature] = field(default_factory=list)
    fairways: list[OSMFeature] = field(default_factory=list)
    water: list[OSMFeature] = field(default_factory=list)
    pins: list[OSMFeature] = field(default_factory=list)
    holes: list[OSMHoleLine] = field(default_factory=list)

    @property
    def total_count(self) -> int:
        return len(self.bunkers) + len(self.greens) + len(self.tees) + len(self.fairways) + len(self.water) + len(self.pins) + len(self.holes)

    def summary(self) -> dict:
        return {
            "bunkers": len(self.bunkers),
            "greens": len(self.greens),
            "tees": len(self.tees),
            "fairways": len(self.fairways),
            "water": len(self.water),
            "pins": len(self.pins),
            "holes": len(self.holes),
            "total": self.total_count,
        }


def _compute_bbox(lat: float, lng: float, radius_km: float = 1.5) -> tuple[float, float, float, float]:
    """Compute a bounding box around a point. Returns (south, west, north, east)."""
    # ~111km per degree latitude, ~111*cos(lat) per degree longitude
    lat_delta = radius_km / 111.0
    lng_delta = radius_km / (111.0 * math.cos(math.radians(lat)))
    return (lat - lat_delta, lng - lng_delta, lat + lat_delta, lng + lng_delta)


def _extract_hole_number(name: str | None) -> int | None:
    """Try to extract a hole number from an OSM feature name."""
    if not name:
        return None
    import re
    # Common patterns: "Hole 1", "1st Hole", "#1", "Hole 1 Tee", "1"
    m = re.search(r'(?:hole\s*#?\s*(\d+)|#(\d+)|^(\d+)(?:st|nd|rd|th)?$)', name, re.I)
    if m:
        return int(m.group(1) or m.group(2) or m.group(3))
    return None


def _geom_to_boundary(geometry: list[dict]) -> list[list[float]]:
    """Convert Overpass geometry [{lat, lon}, ...] to [[lat, lng], ...]."""
    return [[p["lat"], p["lon"]] for p in geometry]


def _geom_center(geometry: list[dict]) -> tuple[float, float]:
    """Compute centroid of a geometry."""
    if not geometry:
        return (0, 0)
    lats = [p["lat"] for p in geometry]
    lngs = [p["lon"] for p in geometry]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))


def _relation_to_geometry(element: dict) -> list[dict]:
    """Extract geometry points from a relation's members."""
    points = []
    for member in element.get("members", []):
        if member.get("type") == "way" and "geometry" in member:
            points.extend(member["geometry"])
    return points


def _parse_elements(elements: list[dict]) -> OSMCourseData:
    """Parse Overpass API elements into structured golf feature data."""
    data = OSMCourseData()

    for e in elements:
        tags = e.get("tags", {})
        golf_tag = tags.get("golf", "")
        natural_tag = tags.get("natural", "")
        name = tags.get("name") or tags.get("ref")

        # Get geometry — ways have it directly, relations need member extraction
        if e["type"] == "relation":
            geometry = _relation_to_geometry(e)
        else:
            geometry = e.get("geometry", [])

        # Node (point feature like tee or pin)
        if e["type"] == "node":
            feature = OSMFeature(
                osm_id=e["id"],
                feature_type=golf_tag,
                name=name,
                boundary=[],
                center_lat=e.get("lat"),
                center_lng=e.get("lon"),
                hole_number=_extract_hole_number(name),
            )
            if golf_tag == "tee":
                data.tees.append(feature)
            elif golf_tag == "pin":
                data.pins.append(feature)
            continue

        # Hole centerlines (way with golf=hole, has par and ref tags)
        if golf_tag == "hole" and geometry and len(geometry) >= 2:
            ref = tags.get("ref")
            par_str = tags.get("par")
            hole_num = int(ref) if ref and ref.isdigit() else _extract_hole_number(name)
            par_val = int(par_str) if par_str and par_str.isdigit() else None
            if hole_num:
                waypoints = _geom_to_boundary(geometry)
                data.holes.append(OSMHoleLine(
                    osm_id=e["id"],
                    hole_number=hole_num,
                    par=par_val,
                    tee_lat=geometry[0]["lat"],
                    tee_lng=geometry[0]["lon"],
                    green_lat=geometry[-1]["lat"],
                    green_lng=geometry[-1]["lon"],
                    waypoints=waypoints,
                ))
            continue

        # Way (polygon feature)
        if not geometry or len(geometry) < 3:
            continue

        boundary = _geom_to_boundary(geometry)
        center = _geom_center(geometry)

        feature = OSMFeature(
            osm_id=e["id"],
            feature_type=golf_tag or natural_tag,
            name=name,
            boundary=boundary,
            center_lat=center[0],
            center_lng=center[1],
            hole_number=_extract_hole_number(name),
        )

        if golf_tag == "bunker":
            data.bunkers.append(feature)
        elif golf_tag == "green":
            data.greens.append(feature)
        elif golf_tag == "tee":
            data.tees.append(feature)
        elif golf_tag == "fairway":
            data.fairways.append(feature)
        elif golf_tag in ("water_hazard", "lateral_water_hazard") or natural_tag == "water":
            feature.feature_type = "water"
            data.water.append(feature)
        elif golf_tag == "pin":
            data.pins.append(feature)
        # Skip cartpaths, paths, rough, clubhouse, etc.

    return data


@dataclass
class OSMSearchResult:
    """A golf course found via Nominatim search."""
    osm_id: int
    osm_type: str  # "relation", "way", "node"
    name: str
    display_name: str
    lat: float
    lng: float
    distance_miles: float | None = None  # from reference point


def search_golf_courses(query: str, near_lat: float | None = None, near_lng: float | None = None, limit: int = 10) -> list[OSMSearchResult]:
    """
    Search OSM for golf courses by name using Nominatim.
    Optionally filter/sort by proximity to a GPS point.
    """
    import time

    params = {
        "q": query,
        "format": "json",
        "limit": str(limit * 3),  # over-fetch then filter
        "extratags": "1",
    }

    # Add viewbox bias if we have GPS
    if near_lat and near_lng:
        # Bias search toward this area (but don't restrict)
        delta = 0.5  # ~35 miles
        params["viewbox"] = f"{near_lng - delta},{near_lat - delta},{near_lng + delta},{near_lat + delta}"
        params["bounded"] = "0"

    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "BirdieBook/0.2.0 (golf tracking app)")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.warning("Nominatim search failed: %s", e)
        raise ValueError(f"OSM search failed: {e}")

    # Filter to golf courses only
    golf_results = []
    for r in results:
        rtype = r.get("type", "")
        rclass = r.get("class", "")
        name = r.get("display_name", "")

        # Accept golf courses or anything with golf in the name
        is_golf = (
            rclass == "leisure" and rtype == "golf_course"
            or "golf" in name.lower()
        )
        if not is_golf:
            continue

        rlat = float(r.get("lat", 0))
        rlng = float(r.get("lon", 0))

        # Compute distance if reference point provided
        dist = None
        if near_lat and near_lng:
            dist = _haversine_miles(near_lat, near_lng, rlat, rlng)

        golf_results.append(OSMSearchResult(
            osm_id=int(r.get("osm_id", 0)),
            osm_type=r.get("osm_type", ""),
            name=r.get("name", r.get("display_name", "").split(",")[0]),
            display_name=r.get("display_name", ""),
            lat=rlat,
            lng=rlng,
            distance_miles=round(dist, 1) if dist is not None else None,
        ))

    # Sort by distance if available
    if near_lat and near_lng:
        golf_results.sort(key=lambda r: r.distance_miles or 9999)

    return golf_results[:limit]


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Compute distance in miles between two GPS points."""
    R = 3959  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


OSM_DIRECT_API = "https://api.openstreetmap.org/api/0.6"


def _fetch_osm_direct_bbox(osm_id: int, osm_type: str = "way") -> tuple[float, float, float, float] | None:
    """
    Fetch the bounding box of an OSM element using the OSM Direct API (reliable, no Overpass).
    Returns (min_lat, min_lng, max_lat, max_lng) or None.
    """
    url = f"{OSM_DIRECT_API}/{osm_type}/{osm_id}/full.json"
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "BirdieBook/0.2.0")
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        nodes = [e for e in result.get("elements", []) if e["type"] == "node"]
        if not nodes:
            return None

        lats = [n["lat"] for n in nodes]
        lngs = [n["lon"] for n in nodes]
        bbox = (min(lats), min(lngs), max(lats), max(lngs))
        logger.info("OSM Direct API: %s/%d bbox = (%.4f,%.4f)-(%.4f,%.4f) from %d nodes",
                     osm_type, osm_id, *bbox, len(nodes))
        return bbox
    except Exception as e:
        logger.warning("OSM Direct API failed for %s/%d: %s", osm_type, osm_id, e)
        return None


def _fetch_osm_direct_boundary(osm_id: int, osm_type: str = "way") -> list[list[float]] | None:
    """
    Fetch the boundary polygon using OSM Direct API.
    Returns [[lat, lng], ...] or None.
    """
    url = f"{OSM_DIRECT_API}/{osm_type}/{osm_id}/full.json"
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "BirdieBook/0.2.0")
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        elements = result.get("elements", [])
        nodes_by_id = {e["id"]: e for e in elements if e["type"] == "node"}

        # For a way, get node references in order
        way = next((e for e in elements if e["type"] == osm_type and e["id"] == osm_id), None)
        if not way:
            return None

        if osm_type == "way":
            node_ids = way.get("nodes", [])
            boundary = []
            for nid in node_ids:
                n = nodes_by_id.get(nid)
                if n:
                    boundary.append([n["lat"], n["lon"]])
            return boundary if len(boundary) >= 3 else None

        elif osm_type == "relation":
            # Get outer members
            for member in way.get("members", []):
                if member.get("role") == "outer" and member.get("type") == "way":
                    member_way = next((e for e in elements if e["type"] == "way" and e["id"] == member["ref"]), None)
                    if member_way:
                        boundary = []
                        for nid in member_way.get("nodes", []):
                            n = nodes_by_id.get(nid)
                            if n:
                                boundary.append([n["lat"], n["lon"]])
                        if len(boundary) >= 3:
                            return boundary
            return None

    except Exception as e:
        logger.warning("OSM Direct boundary fetch failed for %s/%d: %s", osm_type, osm_id, e)
        return None


def _overpass_query_single(query: str, timeout: int = 15) -> list[dict]:
    """Run a single Overpass query, trying multiple servers. Returns elements list."""
    for base_url in OVERPASS_URLS:
        try:
            data = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(base_url, data=data, method="POST")
            req.add_header("User-Agent", "BirdieBook/0.2.0")

            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            return result.get("elements", [])

        except Exception as e:
            logger.warning("Overpass query failed on %s: %s", base_url, e)
    return []


def fetch_features_by_osm_id(
    osm_id: int,
    osm_type: str = "relation",
    progress_callback=None,
) -> OSMCourseData:
    """
    Fetch all golf features INSIDE a specific OSM course polygon.

    Hybrid approach:
    1. OSM Direct API to get the course boundary/bbox (reliable, no rate limits)
    2. Single combined Overpass query for all feature types (one request, not six)
    3. Fallback: split into two queries if the combined one times out
    """
    def _progress(msg):
        if progress_callback:
            progress_callback(msg)
        logger.info(msg)

    # Step 1: Get bbox from OSM Direct API (reliable)
    _progress("Fetching course boundary from OSM...")
    bbox_tuple = _fetch_osm_direct_bbox(osm_id, osm_type)

    if not bbox_tuple:
        raise ValueError(f"Could not fetch boundary for {osm_type}/{osm_id} from OSM Direct API")

    bbox = f"{bbox_tuple[0]},{bbox_tuple[1]},{bbox_tuple[2]},{bbox_tuple[3]}"
    _progress("Course boundary found. Querying features...")

    # Step 2: Single combined Overpass query for ALL golf features
    combined_query = f"""[out:json][timeout:30];
(
  way["golf"]({bbox});
  node["golf"]({bbox});
  way["natural"="water"]({bbox});
  relation["natural"="water"]({bbox});
);
out geom;"""

    _progress("Querying all golf features in one request...")
    all_elements = _overpass_query_single(combined_query, timeout=35)

    if all_elements:
        _progress(f"Found {len(all_elements)} elements in single query")
        result = _parse_elements(all_elements)
        logger.info("Total OSM elements fetched for %s/%d: %d", osm_type, osm_id, len(all_elements))
        return result

    # Step 3: Fallback — split into two smaller queries if combined timed out
    _progress("Combined query failed, trying split queries...")

    all_elements = []

    # Query 1: holes, greens, tees (the important ones)
    q1 = f"""[out:json][timeout:25];
(
  way["golf"="hole"]({bbox});
  node["golf"="hole"]({bbox});
  way["golf"="green"]({bbox});
  node["golf"="green"]({bbox});
  way["golf"="tee"]({bbox});
  node["golf"="tee"]({bbox});
);
out geom;"""
    _progress("Querying holes, greens, tees...")
    elements = _overpass_query_single(q1, timeout=30)
    if elements:
        all_elements.extend(elements)
        _progress(f"Found {len(elements)} hole/green/tee elements")

    time.sleep(2)

    # Query 2: hazards (bunkers, water, fairways)
    q2 = f"""[out:json][timeout:25];
(
  way["golf"="bunker"]({bbox});
  way["golf"="fairway"]({bbox});
  way["natural"="water"]({bbox});
  relation["natural"="water"]({bbox});
  way["golf"="water_hazard"]({bbox});
);
out geom;"""
    _progress("Querying bunkers, fairways, water...")
    elements = _overpass_query_single(q2, timeout=30)
    if elements:
        all_elements.extend(elements)
        _progress(f"Found {len(elements)} hazard elements")

    logger.info("Total OSM elements fetched for %s/%d: %d (split queries)", osm_type, osm_id, len(all_elements))
    return _parse_elements(all_elements)


def fetch_osm_boundary(osm_id: int, osm_type: str = "way") -> list[list[float]] | None:
    """
    Fetch the boundary polygon for a specific OSM way or relation.
    Tries OSM Direct API first (reliable), falls back to Overpass.
    Returns [[lat, lng], ...] or None if not found.
    """
    # Try OSM Direct API first (reliable, no Overpass)
    boundary = _fetch_osm_direct_boundary(osm_id, osm_type)
    if boundary:
        logger.info("Boundary fetched via OSM Direct API for %s/%d (%d points)", osm_type, osm_id, len(boundary))
        return boundary

    # Fallback to Overpass
    logger.info("OSM Direct API failed for boundary, trying Overpass for %s/%d", osm_type, osm_id)
    if osm_type == "relation":
        query = f"""[out:json][timeout:10];
relation({osm_id});
out geom;"""
    else:
        query = f"""[out:json][timeout:10];
way({osm_id});
out geom;"""

    for base_url in OVERPASS_URLS:
        try:
            data = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(base_url, data=data, method="POST")
            req.add_header("User-Agent", "BirdieBook/0.2.0")

            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            elements = result.get("elements", [])
            if not elements:
                return None

            e = elements[0]
            if e["type"] == "relation":
                for member in e.get("members", []):
                    if member.get("role") == "outer" and "geometry" in member:
                        return [[p["lat"], p["lon"]] for p in member["geometry"]]
                geometry = _relation_to_geometry(e)
                if geometry:
                    return [[p["lat"], p["lon"]] for p in geometry]
            elif "geometry" in e:
                return [[p["lat"], p["lon"]] for p in e["geometry"]]

            return None

        except Exception as ex:
            logger.warning("Boundary fetch failed on %s: %s", base_url, ex)

    return None


def fetch_golf_features(lat: float, lng: float, radius_km: float = 1.5) -> OSMCourseData:
    """
    Query OSM for golf course features near a GPS point.

    Args:
        lat: Latitude of the course
        lng: Longitude of the course
        radius_km: Search radius (default 1.5km covers most courses)

    Returns:
        OSMCourseData with categorized features
    """
    south, west, north, east = _compute_bbox(lat, lng, radius_km)

    query = f"""[out:json][timeout:30];
(
  way["golf"]({south},{west},{north},{east});
  relation["golf"]({south},{west},{north},{east});
  node["golf"]({south},{west},{north},{east});
  way["natural"="water"]({south},{west},{north},{east});
  relation["natural"="water"]({south},{west},{north},{east});
);
out geom;"""

    elements = _overpass_query_single(query, timeout=35)
    if elements:
        logger.info("OSM query returned %d elements", len(elements))
        return _parse_elements(elements)

    raise ValueError("All Overpass API instances failed")
