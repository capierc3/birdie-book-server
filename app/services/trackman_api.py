"""HTTP client for the Trackman dynamic reports API and Range API."""

import base64
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


# ---------------------------------------------------------------------------
# Trackman Range API (authenticated)
# ---------------------------------------------------------------------------

TRACKMAN_ACTIVITIES_URL = "https://golf-player-activities.trackmangolf.com/api/activities"
TRACKMAN_RANGE_API_URL = "https://api.trackmanrange.com/api"


def _strip_bearer(token: str) -> str:
    """Strip 'Bearer ' prefix if present."""
    token = token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def _decode_jwt_sub(token: str) -> str:
    """Extract the 'sub' (user ID) from a JWT without verifying the signature."""
    token = _strip_bearer(token)
    parts = token.split(".")
    if len(parts) < 2:
        raise ValueError("Invalid token format — expected a JWT (three dot-separated segments)")
    payload = parts[1]
    # Add padding for base64
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += "=" * padding
    try:
        data = json.loads(base64.urlsafe_b64decode(payload))
    except Exception as exc:
        logger.error("JWT decode error: %s (payload length=%d)", exc, len(parts[1]))
        raise ValueError("Could not decode token — ensure you copied the full accessToken value")
    sub = data.get("sub")
    if not sub:
        raise ValueError("Token does not contain a user ID")
    return sub


def fetch_trackman_activities(bearer_token: str, page: int = 1, page_size: int = 50) -> dict:
    """Fetch paginated list of Trackman activities for the authenticated user."""
    bearer_token = _strip_bearer(bearer_token)
    user_id = _decode_jwt_sub(bearer_token)
    url = (
        f"{TRACKMAN_ACTIVITIES_URL}"
        f"?userId={user_id}&pageSize={page_size}&page={page}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ValueError("Token expired or invalid — please get a fresh token from mytrackman.com")
        logger.error("Trackman activities API HTTP %d: %s", e.code, e.reason)
        raise ValueError(f"Trackman API returned HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        logger.error("Trackman activities API connection error: %s", e.reason)
        raise ValueError(f"Could not connect to Trackman API: {e.reason}")


def fetch_trackman_range_strokes(
    activity_id: str, bearer_token: str, page_size: int = 100
) -> list[dict]:
    """Fetch all strokes for a Trackman Range activity, handling pagination."""
    bearer_token = _strip_bearer(bearer_token)
    all_strokes: list[dict] = []
    page = 1
    while True:
        url = (
            f"{TRACKMAN_RANGE_API_URL}/activities/{activity_id}"
            f"/strokes?pageSize={page_size}&page={page}"
        )
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {bearer_token}",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise ValueError("Token expired or invalid — please get a fresh token from mytrackman.com")
            logger.error("Trackman Range strokes API HTTP %d: %s", e.code, e.reason)
            raise ValueError(f"Trackman Range API returned HTTP {e.code}: {e.reason}")
        except urllib.error.URLError as e:
            logger.error("Trackman Range strokes API connection error: %s", e.reason)
            raise ValueError(f"Could not connect to Trackman Range API: {e.reason}")

        all_strokes.extend(data.get("items", []))
        if page >= data.get("pageCount", 1):
            break
        page += 1

    return all_strokes
