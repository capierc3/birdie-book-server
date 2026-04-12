"""HTTP client for the Trackman dynamic reports API."""

import re
import logging
import urllib.request
import urllib.error
import json

logger = logging.getLogger(__name__)

TRACKMAN_BASE_URL = "https://golf-player-activities.trackmangolf.com/api/reports"

# Patterns to extract IDs from Trackman URL query parameters
_REPORT_PATTERN = re.compile(r"[?&]r=([0-9a-f-]{36})", re.IGNORECASE)
_ACTIVITY_PATTERN = re.compile(r"[?&]a=([0-9a-f-]{36})", re.IGNORECASE)
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def extract_trackman_id(url_or_id: str) -> tuple[str, str]:
    """Extract UUID and its type ('activity' or 'report') from a URL or bare ID.

    Returns (uuid, id_type). Raises ValueError on failure.
    """
    url_or_id = url_or_id.strip()

    # Bare UUID — try activity endpoint first (newer format)
    if _UUID_RE.match(url_or_id):
        return url_or_id.lower(), "activity"

    # Check for activity URL (?a=...)
    m = _ACTIVITY_PATTERN.search(url_or_id)
    if m:
        return m.group(1).lower(), "activity"

    # Check for report URL (?r=...)
    m = _REPORT_PATTERN.search(url_or_id)
    if m:
        return m.group(1).lower(), "report"

    raise ValueError("Could not extract a valid report ID from the provided URL")


def fetch_trackman_report(trackman_id: str, id_type: str = "report") -> dict:
    """
    Call the Trackman API and return the raw JSON response.
    Raises ValueError on failure.
    """
    if id_type == "activity":
        url = f"{TRACKMAN_BASE_URL}/getactivityreport"
        payload = json.dumps({"ActivityId": trackman_id}).encode("utf-8")
    else:
        url = f"{TRACKMAN_BASE_URL}/getreport"
        payload = json.dumps({"ReportId": trackman_id}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "*/*",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        logger.error("Trackman API HTTP %d: %s", e.code, e.reason)
        raise ValueError(f"Trackman API returned HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        logger.error("Trackman API connection error: %s", e.reason)
        raise ValueError(f"Could not connect to Trackman API: {e.reason}")
