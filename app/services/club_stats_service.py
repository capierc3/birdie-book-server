"""Compute aggregated distance stats for each club from shot data."""

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.club import Club, ClubStats
from app.models.round import Round, Shot
from app.models.range_session import RangeShot
from app.models.trackman_shot import TrackmanShot

# Clubs where distance stats are meaningless
EXCLUDED_CLUB_TYPES = {"putter"}


def _percentile(sorted_vals: list[float], p: float) -> float:
    """Simple percentile calculation on a pre-sorted list."""
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c >= len(sorted_vals):
        return sorted_vals[f]
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


def _remove_outliers(distances: list[float]) -> list[float]:
    """IQR-based outlier removal to filter GPS glitches."""
    if len(distances) < 4:
        return distances
    sorted_d = sorted(distances)
    q1 = _percentile(sorted_d, 25)
    q3 = _percentile(sorted_d, 75)
    iqr = q3 - q1
    fence = 1.5 * iqr
    lower = q1 - fence
    upper = q3 + fence
    return [d for d in sorted_d if lower <= d <= upper]


def _compute_stats_from_distances(distances: list[float], min_samples: int = 2) -> Optional[dict]:
    """
    Compute stats from a list of distances after outlier removal.
    Returns None if insufficient data after cleaning.
    """
    cleaned = _remove_outliers(distances)
    if len(cleaned) < min_samples:
        return None

    n = len(cleaned)
    sorted_d = sorted(cleaned)

    return {
        "avg_yards": round(statistics.mean(sorted_d), 1),
        "median_yards": round(statistics.median(sorted_d), 1),
        "std_dev": round(statistics.stdev(sorted_d), 1) if n >= 2 else 0.0,
        "min_yards": round(sorted_d[0], 1),
        "max_yards": round(sorted_d[-1], 1),
        "p10": round(_percentile(sorted_d, 10), 1),
        "p90": round(_percentile(sorted_d, 90), 1),
        "sample_count": n,
    }


def _base_shot_query(db: Session):
    """Base query for valid distance shots (excludes putts, penalties, mishits)."""
    return (
        db.query(Shot.club_garmin_id, Shot.distance_yards)
        .filter(
            Shot.club_garmin_id.isnot(None),
            Shot.distance_yards.isnot(None),
            Shot.distance_yards > 5,
            Shot.shot_type.notin_(["PUTT", "PENALTY"]),
        )
    )


def _get_eligible_clubs(db: Session) -> tuple[list, dict[int, "Club"]]:
    """Get all clubs and build garmin_id -> club map (excluding putters)."""
    clubs = db.query(Club).all()
    garmin_to_club = {
        c.garmin_id: c for c in clubs
        if c.garmin_id is not None and c.club_type.lower() not in EXCLUDED_CLUB_TYPES
    }
    return clubs, garmin_to_club


def _group_shots_by_club(shots, garmin_to_club: dict) -> dict[int, list[float]]:
    """Group shot distances by club garmin_id."""
    club_distances: dict[int, list[float]] = defaultdict(list)
    for garmin_id, yards in shots:
        if garmin_id in garmin_to_club:
            club_distances[garmin_id].append(yards)
    return dict(club_distances)


def _get_range_distances_by_club(db: Session) -> dict[int, list[float]]:
    """Query range shot distances grouped by club_id (MLM2PRO + Trackman)."""
    result: dict[int, list[float]] = defaultdict(list)

    # MLM2PRO shots
    mlm_rows = (
        db.query(RangeShot.club_id, RangeShot.total_yards)
        .filter(
            RangeShot.club_id.isnot(None),
            RangeShot.total_yards.isnot(None),
            RangeShot.total_yards > 5,
        )
        .all()
    )
    for club_id, yards in mlm_rows:
        result[club_id].append(yards)

    # Trackman shots
    tm_rows = (
        db.query(TrackmanShot.club_id, TrackmanShot.total_yards)
        .filter(
            TrackmanShot.club_id.isnot(None),
            TrackmanShot.total_yards.isnot(None),
            TrackmanShot.total_yards > 5,
        )
        .all()
    )
    for club_id, yards in tm_rows:
        result[club_id].append(yards)

    return dict(result)


def compute_club_stats(db: Session) -> dict:
    """
    Aggregate shot distances per club and upsert into club_stats.
    Computes on-course, range, and combined stats.
    Returns a summary dict with counts of clubs updated.
    """
    clubs, garmin_to_club = _get_eligible_clubs(db)

    # Remove stale stats for excluded clubs (e.g. putter)
    excluded_club_ids = [
        c.id for c in clubs if c.club_type.lower() in EXCLUDED_CLUB_TYPES
    ]
    if excluded_club_ids:
        db.query(ClubStats).filter(
            ClubStats.club_id.in_(excluded_club_ids)
        ).delete(synchronize_session="fetch")

    # Build a set of all non-excluded club IDs for range data lookup
    all_club_ids = {
        c.id: c for c in clubs
        if c.club_type.lower() not in EXCLUDED_CLUB_TYPES
    }

    if not garmin_to_club and not all_club_ids:
        return {"clubs_updated": 0, "clubs_skipped": 0, "detail": "No clubs found"}

    # On-course distances (keyed by garmin_id)
    shots = _base_shot_query(db).all()
    garmin_club_distances = _group_shots_by_club(shots, garmin_to_club)

    # Convert to club.id keyed dict for merging
    course_distances_by_id: dict[int, list[float]] = {}
    for garmin_id, distances in garmin_club_distances.items():
        club = garmin_to_club[garmin_id]
        course_distances_by_id[club.id] = distances

    # Range distances (already keyed by club_id)
    range_distances_by_id = _get_range_distances_by_club(db)

    # Union of all club IDs that have any data
    all_data_club_ids = set(course_distances_by_id.keys()) | set(range_distances_by_id.keys())

    updated = 0
    skipped = 0
    outliers_removed = 0
    now = datetime.now(timezone.utc)

    for club_id in all_data_club_ids:
        course_dists = course_distances_by_id.get(club_id, [])
        range_dists = range_distances_by_id.get(club_id, [])

        # On-course stats
        course_stats = _compute_stats_from_distances(course_dists) if course_dists else None

        # Range stats
        range_stats = _compute_stats_from_distances(range_dists) if range_dists else None

        # Combined stats
        combined_dists = course_dists + range_dists
        combined_stats = _compute_stats_from_distances(combined_dists) if combined_dists else None

        if not course_stats and not range_stats:
            skipped += 1
            continue

        if course_stats:
            outliers_removed += len(course_dists) - course_stats["sample_count"]

        # Upsert
        existing = db.query(ClubStats).filter(ClubStats.club_id == club_id).first()
        if not existing:
            existing = ClubStats(club_id=club_id)
            db.add(existing)

        # On-course fields
        if course_stats:
            for key, val in course_stats.items():
                setattr(existing, key, val)
        else:
            # Clear on-course stats if no course data
            for key in ("avg_yards", "median_yards", "std_dev", "min_yards", "max_yards", "p10", "p90", "sample_count"):
                setattr(existing, key, None)

        # Range fields
        if range_stats:
            for key, val in range_stats.items():
                setattr(existing, f"range_{key}", val)
        else:
            for key in ("avg_yards", "median_yards", "std_dev", "min_yards", "max_yards", "p10", "p90", "sample_count"):
                setattr(existing, f"range_{key}", None)

        # Combined fields
        if combined_stats:
            for key, val in combined_stats.items():
                setattr(existing, f"combined_{key}", val)
        else:
            for key in ("avg_yards", "median_yards", "std_dev", "min_yards", "max_yards", "p10", "p90", "sample_count"):
                setattr(existing, f"combined_{key}", None)

        existing.last_computed = now
        updated += 1

    db.commit()

    return {
        "clubs_updated": updated,
        "clubs_skipped": skipped,
        "outliers_removed": outliers_removed,
        "total_shots_analyzed": len(shots),
    }


def compute_windowed_club_stats(
    db: Session,
    window_type: str,
    window_value: int,
) -> dict[int, dict]:
    """
    Compute club stats for a recent window.

    Args:
        window_type: "rounds" (last N rounds), "sessions" (last N range sessions),
                     or "months" (last N months)
        window_value: number of rounds/sessions/months

    Returns:
        dict mapping club.id -> {avg_yards, median_yards, max_yards, sample_count}
    """
    from app.models.range_session import RangeSession as RS

    result: dict[int, dict] = {}

    if window_type == "sessions":
        # Range sessions windowing
        session_ids = [
            r[0] for r in
            db.query(RS.id)
            .order_by(RS.session_date.desc())
            .limit(window_value)
            .all()
        ]
        if not session_ids:
            return {}

        # MLM2PRO shots from those sessions
        mlm_rows = (
            db.query(RangeShot.club_id, RangeShot.total_yards)
            .filter(
                RangeShot.session_id.in_(session_ids),
                RangeShot.club_id.isnot(None),
                RangeShot.total_yards.isnot(None),
                RangeShot.total_yards > 5,
            )
            .all()
        )
        # Trackman shots from those sessions
        tm_rows = (
            db.query(TrackmanShot.club_id, TrackmanShot.total_yards)
            .filter(
                TrackmanShot.session_id.in_(session_ids),
                TrackmanShot.club_id.isnot(None),
                TrackmanShot.total_yards.isnot(None),
                TrackmanShot.total_yards > 5,
            )
            .all()
        )
        club_dists: dict[int, list[float]] = defaultdict(list)
        for club_id, yards in mlm_rows:
            club_dists[club_id].append(yards)
        for club_id, yards in tm_rows:
            club_dists[club_id].append(yards)

        for club_id, distances in club_dists.items():
            stats = _compute_stats_from_distances(distances, min_samples=1)
            if stats:
                result[club_id] = stats  # Full stats dict: avg, median, std_dev, min, max, p10, p90, sample_count
        return result

    # On-course windowing
    _, garmin_to_club = _get_eligible_clubs(db)
    if not garmin_to_club:
        return {}

    if window_type == "rounds":
        round_ids = [
            r[0] for r in
            db.query(Round.id)
            .order_by(Round.date.desc())
            .limit(window_value)
            .all()
        ]
    elif window_type == "months":
        cutoff = date.today() - timedelta(days=window_value * 30)
        round_ids = [
            r[0] for r in
            db.query(Round.id)
            .filter(Round.date >= cutoff)
            .all()
        ]
    else:
        return {}

    if not round_ids:
        return {}

    shots = (
        _base_shot_query(db)
        .filter(Shot.round_id.in_(round_ids))
        .all()
    )

    club_distances = _group_shots_by_club(shots, garmin_to_club)

    for garmin_id, distances in club_distances.items():
        club = garmin_to_club[garmin_id]
        stats = _compute_stats_from_distances(distances, min_samples=1)
        if stats:
            result[club.id] = stats  # Full stats dict

    return result
