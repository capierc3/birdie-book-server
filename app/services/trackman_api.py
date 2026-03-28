"""HTTP client for the Trackman dynamic reports API."""

import re
import logging
import urllib.request
import urllib.error
import json

logger = logging.getLogger(__name__)

TRACKMAN_API_URL = "https://golf-player-activities.trackmangolf.com/api/reports/getreport"

# Pattern to extract report ID from various Trackman URL formats
REPORT_ID_PATTERN = re.compile(r"[?&]r=([0-9a-f-]{36})", re.IGNORECASE)


def extract_report_id(url_or_id: str) -> str | None:
    """Extract the report UUID from a Trackman URL or raw ID string."""
    url_or_id = url_or_id.strip()

    # Already a bare UUID?
    if re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", url_or_id, re.I):
        return url_or_id.lower()

    # Extract from URL
    m = REPORT_ID_PATTERN.search(url_or_id)
    if m:
        return m.group(1).lower()

    return None


def fetch_trackman_report(report_id: str) -> dict:
    """
    Call the Trackman API and return the raw JSON response.
    Raises ValueError on failure.
    """
    payload = json.dumps({"ReportId": report_id}).encode("utf-8")

    req = urllib.request.Request(
        TRACKMAN_API_URL,
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
