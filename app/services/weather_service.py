"""Open-Meteo client for capturing weather samples during play sessions.

See ROADMAP Feature 6d. No API key needed; free for non-commercial use.
https://open-meteo.com/en/docs
"""

import logging
from typing import Optional

import httpx

log = logging.getLogger(__name__)

BASE_URL = "https://api.open-meteo.com/v1/forecast"

# Fields we ask for in the `current` query. Order matters for readability only.
CURRENT_FIELDS = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
]

# Condensed WMO weather-code → human label mapping.
# https://open-meteo.com/en/docs (see weather_code table)
_WMO_CODES = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Light snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm w/ hail",
    99: "Thunderstorm w/ heavy hail",
}

_CARDINAL_16 = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


def describe_weather_code(code: Optional[int]) -> Optional[str]:
    if code is None:
        return None
    return _WMO_CODES.get(int(code), f"Code {code}")


def degrees_to_cardinal(deg: Optional[float]) -> Optional[str]:
    if deg is None:
        return None
    idx = int((float(deg) % 360) / 22.5 + 0.5) % 16
    return _CARDINAL_16[idx]


class WeatherFetchError(Exception):
    """Raised when Open-Meteo can't be reached or returns malformed data."""


def fetch_current_weather(lat: float, lng: float, timeout: float = 6.0) -> dict:
    """Fetch current conditions for a lat/lng. Returns a dict with fields
    shaped to match `PlaySessionWeatherSample` columns (no DB insert here).

    Raises WeatherFetchError on any HTTP, parse, or shape failure.
    """
    params = {
        "latitude": lat,
        "longitude": lng,
        "current": ",".join(CURRENT_FIELDS),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "auto",
    }
    try:
        resp = httpx.get(BASE_URL, params=params, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as e:
        log.warning("open-meteo request failed: %s", e)
        raise WeatherFetchError(f"Open-Meteo request failed: {e}") from e
    except ValueError as e:
        raise WeatherFetchError(f"Open-Meteo returned invalid JSON: {e}") from e

    current = data.get("current") or {}
    if not current:
        raise WeatherFetchError("Open-Meteo response missing 'current' block")

    code = current.get("weather_code")
    wind_dir = current.get("wind_direction_10m")

    return {
        "temp_f": current.get("temperature_2m"),
        "wind_speed_mph": current.get("wind_speed_10m"),
        "wind_gust_mph": current.get("wind_gusts_10m"),
        "wind_dir_deg": int(wind_dir) if wind_dir is not None else None,
        "wind_dir_cardinal": degrees_to_cardinal(wind_dir),
        "precipitation_in": current.get("precipitation"),
        "weather_code": int(code) if code is not None else None,
        "weather_desc": describe_weather_code(code),
        "humidity_pct": current.get("relative_humidity_2m"),
        "pressure_mb": current.get("pressure_msl"),
    }
