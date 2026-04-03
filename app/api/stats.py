"""Strokes Gained category dashboard API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from typing import Optional
from collections import defaultdict

from app.database import get_db
from app.models import Round, RoundHole, Shot, CourseHole, Course, GolfClub
from app.services.strokes_gained import expected_strokes, personal_expected_strokes

router = APIRouter(prefix="/api/stats", tags=["stats"])


# ── SG category classification ──────────────────────────────────────

CATEGORIES = ["off_the_tee", "approach", "short_game", "putting"]
CATEGORY_LABELS = {
    "off_the_tee": "Off the Tee",
    "approach": "Approach",
    "short_game": "Short Game",
    "putting": "Putting",
}


def _classify_sg_category(shot: Shot, par: int) -> Optional[str]:
    """Classify a shot into one of the four SG categories."""
    if shot.shot_type == "PENALTY" or shot.auto_shot_type == "PENALTY":
        return None
    if shot.shot_type == "PUTT":
        return "putting"
    if shot.shot_type == "TEE" and par >= 4:
        return "off_the_tee"
    if shot.shot_type == "TEE" and par == 3:
        return "approach"
    if shot.shot_type == "APPROACH" or shot.shot_type == "LAYUP":
        return "approach"
    if shot.shot_type == "CHIP":
        return "short_game"
    # RECOVERY, UNKNOWN, or any other type — classify by distance to green
    if (shot.green_distance_yards is not None
            and shot.green_distance_yards <= 50
            and not shot.on_green):
        return "short_game"
    # Farther than 50 yards from green — treat as approach
    if shot.shot_type in ("RECOVERY", "UNKNOWN") or shot.green_distance_yards is not None:
        return "approach"
    return None


# ── Shared query helper ──────────────────────────────────────────────

def _fetch_classified_shots(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    last_n_rounds: Optional[int] = None,
):
    """
    Fetch all shots with par info, classify into SG categories.

    Returns list of dicts:
        {shot, round_id, par, round_date, course_name, category, club_name}
    """
    # If last_n_rounds, find the cutoff round IDs first
    round_id_filter = None
    if last_n_rounds:
        recent = (
            db.query(Round.id)
            .filter(Round.exclude_from_stats != True)
            .order_by(Round.date.desc())
            .limit(last_n_rounds)
            .all()
        )
        round_id_filter = [r.id for r in recent]

    # Main query: Shot joined to RoundHole, Round, CourseHole, Course, GolfClub
    q = (
        db.query(Shot, Round, CourseHole, Course, GolfClub)
        .join(RoundHole, Shot.round_hole_id == RoundHole.id)
        .join(Round, Shot.round_id == Round.id)
        .join(
            CourseHole,
            (CourseHole.tee_id == Round.tee_id)
            & (CourseHole.hole_number == RoundHole.hole_number),
        )
        .join(Course, Round.course_id == Course.id)
        .join(GolfClub, Course.golf_club_id == GolfClub.id)
        .filter(
            Round.exclude_from_stats != True,
            Round.tee_id.isnot(None),
            Shot.sg_pga.isnot(None),
        )
    )

    if start_date:
        q = q.filter(Round.date >= start_date)
    if end_date:
        q = q.filter(Round.date <= end_date)
    if round_id_filter is not None:
        q = q.filter(Round.id.in_(round_id_filter))

    rows = q.all()

    result = []
    # Track which rounds we've seen for the putting pass
    round_info: dict[int, dict] = {}

    for shot, rnd, ch, course, club in rows:
        cat = _classify_sg_category(shot, ch.par)
        if cat is None:
            continue
        # Build display name: "Club Name — Course Name" or just "Club Name"
        if course.name:
            display_name = f"{club.name} — {course.name}"
        else:
            display_name = club.name
        result.append({
            "round_id": rnd.id,
            "round_date": rnd.date,
            "course_name": display_name,
            "par": ch.par,
            "category": cat,
            "club_name": shot.club,
            "sg_pga_value": shot.sg_pga or 0.0,
            "sg_personal_value": shot.sg_personal,
            "has_personal": shot.sg_personal is not None,
        })
        if rnd.id not in round_info:
            round_info[rnd.id] = {"date": rnd.date, "course_name": display_name}

    # ── Putting SG from hole-level putt counts ──
    # Garmin doesn't record individual putt shots, but we have putt counts per hole.
    # Compute putting SG per hole: expected_putts(est_distance) - actual_putts
    _PUTT_EST_YARDS = {1: 2.0, 2: 7.3, 3: 13.3}  # feet/3: 6ft, 22ft, 40ft

    if round_info:
        putt_q = (
            db.query(RoundHole, Round, Course, GolfClub)
            .join(Round, RoundHole.round_id == Round.id)
            .join(Course, Round.course_id == Course.id)
            .join(GolfClub, Course.golf_club_id == GolfClub.id)
            .filter(
                Round.id.in_(list(round_info.keys())),
                RoundHole.putts.isnot(None),
                RoundHole.putts >= 1,
            )
        )
        for rh, rnd, course, club in putt_q.all():
            est_yards = _PUTT_EST_YARDS.get(rh.putts, 13.3)
            exp_pga = expected_strokes(est_yards, "Green")
            exp_personal = personal_expected_strokes(est_yards, "Green")

            sg_pga = round(exp_pga - rh.putts, 2) if exp_pga is not None else None
            sg_personal = round(exp_personal - rh.putts, 2) if exp_personal is not None else None

            if sg_pga is None:
                continue

            if course.name:
                display_name = f"{club.name} — {course.name}"
            else:
                display_name = club.name

            result.append({
                "round_id": rnd.id,
                "round_date": rnd.date,
                "course_name": display_name,
                "par": None,
                "category": "putting",
                "club_name": "Putter",
                "sg_pga_value": sg_pga,
                "sg_personal_value": sg_personal,
                "has_personal": sg_personal is not None,
            })

    return result


# ── Pydantic response models ────────────────────────────────────────

class SGCategoryValues(BaseModel):
    sg_pga_total: float = 0.0
    sg_pga_per_round: float = 0.0
    sg_pga_per_shot: float = 0.0
    sg_personal_total: float = 0.0
    sg_personal_per_round: float = 0.0
    sg_personal_per_shot: float = 0.0
    shot_count: int = 0
    round_count: int = 0


class SGRoundCategoryValues(BaseModel):
    sg_pga: float = 0.0
    sg_personal: float = 0.0
    shot_count: int = 0


class SGRoundBreakdown(BaseModel):
    round_id: int
    date: date
    course_name: Optional[str] = None
    off_the_tee: Optional[SGRoundCategoryValues] = None
    approach: Optional[SGRoundCategoryValues] = None
    short_game: Optional[SGRoundCategoryValues] = None
    putting: Optional[SGRoundCategoryValues] = None
    total_sg_pga: float = 0.0
    total_sg_personal: float = 0.0


class SGOverallResponse(BaseModel):
    overall: dict[str, SGCategoryValues]
    per_round: list[SGRoundBreakdown]
    round_count: int = 0
    biggest_opportunity_pga: Optional[str] = None
    biggest_opportunity_personal: Optional[str] = None


class SGTrendPoint(BaseModel):
    round_id: int
    date: date
    course_name: Optional[str] = None
    off_the_tee: Optional[float] = None
    approach: Optional[float] = None
    short_game: Optional[float] = None
    putting: Optional[float] = None
    total: Optional[float] = None
    # Personal baseline
    off_the_tee_personal: Optional[float] = None
    approach_personal: Optional[float] = None
    short_game_personal: Optional[float] = None
    putting_personal: Optional[float] = None
    total_personal: Optional[float] = None


class SGTrendResponse(BaseModel):
    raw: list[SGTrendPoint]
    rolling: dict[str, list[SGTrendPoint]]
    best_rounds: dict[str, SGTrendPoint]
    worst_rounds: dict[str, SGTrendPoint]


class SGClubBreakdown(BaseModel):
    club_name: str
    category: str
    sg_pga_per_shot: float = 0.0
    sg_pga_total: float = 0.0
    sg_personal_per_shot: Optional[float] = None
    sg_personal_total: Optional[float] = None
    shot_count: int = 0


class SGByClubResponse(BaseModel):
    clubs: list[SGClubBreakdown]
    worst_club: Optional[SGClubBreakdown] = None
    best_club: Optional[SGClubBreakdown] = None


# ── Endpoint 1: SG Category Rollup ──────────────────────────────────

@router.get("/strokes-gained", response_model=SGOverallResponse)
def get_strokes_gained(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    last_n_rounds: Optional[int] = Query(None, ge=1, le=200),
    db: Session = Depends(get_db),
):
    classified = _fetch_classified_shots(db, start_date, end_date, last_n_rounds)

    # Group by round, then by category
    rounds_data: dict[int, dict] = {}  # round_id -> {meta + categories}
    for row in classified:
        rid = row["round_id"]
        if rid not in rounds_data:
            rounds_data[rid] = {
                "round_id": rid,
                "date": row["round_date"],
                "course_name": row["course_name"],
                "categories": defaultdict(lambda: {"sg_pga": 0.0, "sg_personal": 0.0, "count": 0, "personal_count": 0}),
            }
        cat_data = rounds_data[rid]["categories"][row["category"]]
        cat_data["sg_pga"] += row["sg_pga_value"] or 0.0
        if row["has_personal"]:
            cat_data["sg_personal"] += row["sg_personal_value"]
            cat_data["personal_count"] += 1
        cat_data["count"] += 1

    round_count = len(rounds_data)

    # Build overall aggregates
    overall: dict[str, dict] = {}
    for cat in CATEGORIES:
        overall[cat] = {"sg_pga": 0.0, "sg_personal": 0.0, "shot_count": 0, "personal_count": 0, "rounds_with_data": set()}

    for rid, rd in rounds_data.items():
        for cat in CATEGORIES:
            if cat in rd["categories"]:
                cd = rd["categories"][cat]
                overall[cat]["sg_pga"] += cd["sg_pga"]
                overall[cat]["sg_personal"] += cd["sg_personal"]
                overall[cat]["shot_count"] += cd["count"]
                overall[cat]["personal_count"] += cd["personal_count"]
                overall[cat]["rounds_with_data"].add(rid)

    overall_response = {}
    for cat in CATEGORIES:
        o = overall[cat]
        rc = len(o["rounds_with_data"])
        sc = o["shot_count"]
        pc = o["personal_count"]
        overall_response[cat] = SGCategoryValues(
            sg_pga_total=round(o["sg_pga"], 2),
            sg_pga_per_round=round(o["sg_pga"] / rc, 2) if rc else 0.0,
            sg_pga_per_shot=round(o["sg_pga"] / sc, 3) if sc else 0.0,
            sg_personal_total=round(o["sg_personal"], 2),
            sg_personal_per_round=round(o["sg_personal"] / rc, 2) if rc else 0.0,
            sg_personal_per_shot=round(o["sg_personal"] / pc, 3) if pc else 0.0,
            shot_count=sc,
            round_count=rc,
        )

    # Build per-round breakdown
    per_round = []
    for rid in sorted(rounds_data, key=lambda r: rounds_data[r]["date"]):
        rd = rounds_data[rid]
        breakdown = SGRoundBreakdown(
            round_id=rid,
            date=rd["date"],
            course_name=rd["course_name"],
        )
        total_pga = 0.0
        total_personal = 0.0
        for cat in CATEGORIES:
            if cat in rd["categories"]:
                cd = rd["categories"][cat]
                vals = SGRoundCategoryValues(
                    sg_pga=round(cd["sg_pga"], 2),
                    sg_personal=round(cd["sg_personal"], 2),
                    shot_count=cd["count"],
                )
                setattr(breakdown, cat, vals)
                total_pga += cd["sg_pga"]
                total_personal += cd["sg_personal"]
        breakdown.total_sg_pga = round(total_pga, 2)
        breakdown.total_sg_personal = round(total_personal, 2)
        per_round.append(breakdown)

    # Find biggest opportunity (most negative per-round SG)
    biggest_pga = min(CATEGORIES, key=lambda c: overall_response[c].sg_pga_per_round) if round_count else None
    biggest_personal = min(CATEGORIES, key=lambda c: overall_response[c].sg_personal_per_round) if round_count else None

    return SGOverallResponse(
        overall=overall_response,
        per_round=per_round,
        round_count=round_count,
        biggest_opportunity_pga=biggest_pga,
        biggest_opportunity_personal=biggest_personal,
    )


# ── Endpoint 2: SG Trends Over Time ─────────────────────────────────

@router.get("/strokes-gained/trends", response_model=SGTrendResponse)
def get_strokes_gained_trends(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    last_n_rounds: Optional[int] = Query(None, ge=1, le=200),
    rolling_windows: str = Query("5,10"),
    db: Session = Depends(get_db),
):
    classified = _fetch_classified_shots(db, start_date, end_date, last_n_rounds)

    # Group by round
    rounds_data: dict[int, dict] = {}
    for row in classified:
        rid = row["round_id"]
        if rid not in rounds_data:
            rounds_data[rid] = {
                "round_id": rid,
                "date": row["round_date"],
                "course_name": row["course_name"],
                "pga": defaultdict(float),
                "personal": defaultdict(float),
            }
        rounds_data[rid]["pga"][row["category"]] += row["sg_pga_value"] or 0.0
        if row["has_personal"]:
            rounds_data[rid]["personal"][row["category"]] += row["sg_personal_value"]

    # Sort by date
    sorted_rounds = sorted(rounds_data.values(), key=lambda r: r["date"])

    # Build raw trend points
    raw = []
    for rd in sorted_rounds:
        pga = rd["pga"]
        pers = rd["personal"]
        total_pga = sum(pga.get(c, 0.0) for c in CATEGORIES)
        total_pers = sum(pers.get(c, 0.0) for c in CATEGORIES)
        raw.append(SGTrendPoint(
            round_id=rd["round_id"],
            date=rd["date"],
            course_name=rd["course_name"],
            off_the_tee=round(pga.get("off_the_tee", 0.0), 2),
            approach=round(pga.get("approach", 0.0), 2),
            short_game=round(pga.get("short_game", 0.0), 2),
            putting=round(pga.get("putting", 0.0), 2),
            total=round(total_pga, 2),
            off_the_tee_personal=round(pers.get("off_the_tee", 0.0), 2),
            approach_personal=round(pers.get("approach", 0.0), 2),
            short_game_personal=round(pers.get("short_game", 0.0), 2),
            putting_personal=round(pers.get("putting", 0.0), 2),
            total_personal=round(total_pers, 2),
        ))

    # Compute rolling averages
    windows = [int(w.strip()) for w in rolling_windows.split(",") if w.strip().isdigit()]
    rolling = {}
    for w in windows:
        series = []
        for i, pt in enumerate(raw):
            start = max(0, i - w + 1)
            window_pts = raw[start:i + 1]
            n = len(window_pts)
            series.append(SGTrendPoint(
                round_id=pt.round_id,
                date=pt.date,
                course_name=pt.course_name,
                off_the_tee=round(sum(p.off_the_tee or 0 for p in window_pts) / n, 2),
                approach=round(sum(p.approach or 0 for p in window_pts) / n, 2),
                short_game=round(sum(p.short_game or 0 for p in window_pts) / n, 2),
                putting=round(sum(p.putting or 0 for p in window_pts) / n, 2),
                total=round(sum(p.total or 0 for p in window_pts) / n, 2),
                off_the_tee_personal=round(sum(p.off_the_tee_personal or 0 for p in window_pts) / n, 2),
                approach_personal=round(sum(p.approach_personal or 0 for p in window_pts) / n, 2),
                short_game_personal=round(sum(p.short_game_personal or 0 for p in window_pts) / n, 2),
                putting_personal=round(sum(p.putting_personal or 0 for p in window_pts) / n, 2),
                total_personal=round(sum(p.total_personal or 0 for p in window_pts) / n, 2),
            ))
        rolling[str(w)] = series

    # Best/worst rounds per category
    best_rounds = {}
    worst_rounds = {}
    for cat in CATEGORIES:
        if not raw:
            continue
        valid = [p for p in raw if getattr(p, cat) is not None]
        if valid:
            best_rounds[cat] = max(valid, key=lambda p: getattr(p, cat))
            worst_rounds[cat] = min(valid, key=lambda p: getattr(p, cat))

    return SGTrendResponse(
        raw=raw,
        rolling=rolling,
        best_rounds=best_rounds,
        worst_rounds=worst_rounds,
    )


# ── Endpoint 3: SG Per-Club Breakdown ───────────────────────────────

@router.get("/strokes-gained/by-club", response_model=SGByClubResponse)
def get_strokes_gained_by_club(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    last_n_rounds: Optional[int] = Query(None, ge=1, le=200),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    classified = _fetch_classified_shots(db, start_date, end_date, last_n_rounds)

    if category:
        classified = [r for r in classified if r["category"] == category]

    # Group by (club_name, category), skip shots with no club
    club_data: dict[tuple, dict] = {}
    for row in classified:
        if not row["club_name"]:
            continue
        key = (row["club_name"], row["category"])
        if key not in club_data:
            club_data[key] = {"sg_pga": 0.0, "sg_personal": 0.0, "count": 0, "personal_count": 0}
        club_data[key]["sg_pga"] += row["sg_pga_value"] or 0.0
        if row["has_personal"]:
            club_data[key]["sg_personal"] += row["sg_personal_value"]
            club_data[key]["personal_count"] += 1
        club_data[key]["count"] += 1

    clubs = []
    for (club_name, cat), data in club_data.items():
        sc = data["count"]
        pc = data["personal_count"]
        clubs.append(SGClubBreakdown(
            club_name=club_name,
            category=cat,
            sg_pga_per_shot=round(data["sg_pga"] / sc, 3) if sc else 0.0,
            sg_pga_total=round(data["sg_pga"], 2),
            sg_personal_per_shot=round(data["sg_personal"] / pc, 3) if pc else None,
            sg_personal_total=round(data["sg_personal"], 2) if pc else None,
            shot_count=sc,
        ))

    # Sort by sg_pga_per_shot ascending (worst first)
    clubs.sort(key=lambda c: c.sg_pga_per_shot)

    worst = clubs[0] if clubs else None
    best = clubs[-1] if clubs else None

    return SGByClubResponse(clubs=clubs, worst_club=worst, best_club=best)
