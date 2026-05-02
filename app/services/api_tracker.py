"""
Simple API call tracker — file-based for dev, DB table for production.
Tracks daily call counts per API service with automatic daily reset.
"""

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

TRACKER_FILE = Path("data/api_usage.json")

# Known API services and their daily limits
API_LIMITS = {
    "golf_course_api": {"limit": 300, "resets": "TBD — check 7pm EST (midnight UTC)"},
    "google_places": {"limit": 5000, "resets": "midnight UTC"},
    "google_maps_static": {"limit": 28000, "resets": "midnight UTC"},
}


def _load() -> dict:
    """Load tracker data from file."""
    if TRACKER_FILE.exists():
        try:
            data = json.loads(TRACKER_FILE.read_text())
            # Reset if it's a new day
            if data.get("date") != str(date.today()):
                return _new_day()
            return data
        except (json.JSONDecodeError, KeyError):
            return _new_day()
    return _new_day()


def _new_day() -> dict:
    """Create a fresh day's tracking data."""
    data = {
        "date": str(date.today()),
        "services": {name: {"calls": 0, "last_call": None} for name in API_LIMITS},
    }
    _save(data)
    return data


def _save(data: dict):
    """Persist tracker data to file."""
    try:
        TRACKER_FILE.parent.mkdir(parents=True, exist_ok=True)
        TRACKER_FILE.write_text(json.dumps(data, indent=2))
    except Exception as e:
        log.warning("Failed to save API tracker: %s", e)


def track_call(service: str, endpoint: str = ""):
    """Record an API call for a service."""
    data = _load()
    if service not in data["services"]:
        data["services"][service] = {"calls": 0, "last_call": None}
    data["services"][service]["calls"] += 1
    data["services"][service]["last_call"] = datetime.now().isoformat()
    if endpoint:
        data["services"][service]["last_endpoint"] = endpoint
    _save(data)

    # Log warning if approaching limit
    limit_info = API_LIMITS.get(service, {})
    limit = limit_info.get("limit", 0)
    calls = data["services"][service]["calls"]
    if limit and calls >= limit * 0.8:
        log.warning(
            "API %s: %d/%d calls today (%.0f%%)",
            service, calls, limit, (calls / limit) * 100,
        )


def check_limit(service: str) -> bool:
    """Check if we're under the daily limit for a service. Returns True if OK to call."""
    data = _load()
    limit_info = API_LIMITS.get(service, {})
    limit = limit_info.get("limit", 0)
    if not limit:
        return True  # No limit configured
    svc_data = data["services"].get(service, {"calls": 0})
    if svc_data["calls"] >= limit:
        log.warning("API %s: daily limit reached (%d/%d). Blocking call.", service, svc_data["calls"], limit)
        return False
    return True


def get_usage() -> dict:
    """Get current usage for all tracked APIs."""
    data = _load()
    result = {}
    for service, info in API_LIMITS.items():
        svc_data = data["services"].get(service, {"calls": 0, "last_call": None})
        result[service] = {
            "calls_today": svc_data["calls"],
            "daily_limit": info["limit"],
            "remaining": max(0, info["limit"] - svc_data["calls"]),
            "resets": info["resets"],
            "last_call": svc_data.get("last_call"),
        }
    return {"date": data["date"], "services": result}
