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


# ── Scoring Trends & Key Stats ──────────────────────────────────────

class ScoringDistribution(BaseModel):
    birdie_or_better: int = 0
    par: int = 0
    bogey: int = 0
    double: int = 0
    triple_plus: int = 0


class ParBreakdown(BaseModel):
    par: int
    count: int = 0
    avg_score: float = 0.0
    avg_vs_par: float = 0.0
    birdie_pct: float = 0.0
    par_pct: float = 0.0
    bogey_pct: float = 0.0
    double_plus_pct: float = 0.0


class ScoringRound(BaseModel):
    round_id: int
    date: date
    course_name: str
    holes_played: int
    score: int
    score_vs_par: int
    gir_pct: Optional[float] = None
    fw_pct: Optional[float] = None
    putts: Optional[int] = None
    putts_per_hole: Optional[float] = None
    three_putts: int = 0
    birdie_or_better: int = 0
    pars: int = 0
    bogeys: int = 0
    doubles: int = 0
    triple_plus: int = 0


class ScoringResponse(BaseModel):
    gir_pct: Optional[float] = None
    fairway_pct: Optional[float] = None
    avg_putts_per_hole: Optional[float] = None
    putts_per_gir: Optional[float] = None
    scramble_pct: Optional[float] = None
    three_putt_pct: Optional[float] = None
    scoring_distribution: ScoringDistribution
    par_breakdown: list[ParBreakdown]
    per_round: list[ScoringRound]


@router.get("/scoring", response_model=ScoringResponse)
def get_scoring_stats(db: Session = Depends(get_db)):
    from sqlalchemy import func as sqlfunc

    # Query all played holes with course par data
    rows = (
        db.query(RoundHole, Round, CourseHole, Course, GolfClub)
        .join(Round, RoundHole.round_id == Round.id)
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
            RoundHole.strokes > 0,
        )
        .all()
    )

    # Aggregate stats
    total_holes = 0
    gir_holes = 0
    gir_eligible = 0  # holes with putt data (needed for GIR calc)
    fw_hit = 0
    fw_eligible = 0
    total_putts = 0
    putt_holes = 0
    gir_putts = 0
    gir_putt_holes = 0
    non_gir_par_or_better = 0
    non_gir_total = 0
    three_putts = 0

    # Scoring distribution
    dist = {"birdie_or_better": 0, "par": 0, "bogey": 0, "double": 0, "triple_plus": 0}

    # Par breakdown
    par_data: dict[int, dict] = {}  # par -> {scores: [], diffs: []}

    # Per-round aggregation
    round_agg: dict[int, dict] = {}

    for rh, rnd, ch, course, club in rows:
        total_holes += 1
        vs_par = rh.strokes - ch.par

        # Scoring distribution
        if vs_par <= -1:
            dist["birdie_or_better"] += 1
        elif vs_par == 0:
            dist["par"] += 1
        elif vs_par == 1:
            dist["bogey"] += 1
        elif vs_par == 2:
            dist["double"] += 1
        else:
            dist["triple_plus"] += 1

        # Par breakdown
        if ch.par not in par_data:
            par_data[ch.par] = {"scores": [], "diffs": []}
        par_data[ch.par]["scores"].append(rh.strokes)
        par_data[ch.par]["diffs"].append(vs_par)

        # Fairway (only for par 4+ where fairway is tracked)
        if rh.fairway is not None:
            fw_eligible += 1
            if rh.fairway == "HIT":
                fw_hit += 1

        # Putts
        if rh.putts is not None:
            total_putts += rh.putts
            putt_holes += 1
            if rh.putts >= 3:
                three_putts += 1

            # GIR: reached green in (par - 2) strokes or fewer
            approach_strokes = rh.strokes - rh.putts
            gir_eligible += 1
            is_gir = approach_strokes <= ch.par - 2
            if is_gir:
                gir_holes += 1
                gir_putts += rh.putts
                gir_putt_holes += 1
            else:
                non_gir_total += 1
                if rh.strokes <= ch.par:
                    non_gir_par_or_better += 1

        # Per-round
        rid = rnd.id
        if rid not in round_agg:
            if course.name:
                display_name = f"{club.name} — {course.name}"
            else:
                display_name = club.name
            round_agg[rid] = {
                "round_id": rid,
                "date": rnd.date,
                "course_name": display_name,
                "holes": 0,
                "score": 0,
                "par_total": 0,
                "gir": 0,
                "gir_eligible": 0,
                "fw_hit": 0,
                "fw_eligible": 0,
                "putts": 0,
                "putt_holes": 0,
                "three_putts": 0,
                "birdie_or_better": 0,
                "pars": 0,
                "bogeys": 0,
                "doubles": 0,
                "triple_plus": 0,
            }
        ra = round_agg[rid]
        ra["holes"] += 1
        ra["score"] += rh.strokes
        ra["par_total"] += ch.par
        # Per-round scoring distribution
        if vs_par <= -1:
            ra["birdie_or_better"] += 1
        elif vs_par == 0:
            ra["pars"] += 1
        elif vs_par == 1:
            ra["bogeys"] += 1
        elif vs_par == 2:
            ra["doubles"] += 1
        else:
            ra["triple_plus"] += 1
        if rh.fairway is not None:
            ra["fw_eligible"] += 1
            if rh.fairway == "HIT":
                ra["fw_hit"] += 1
        if rh.putts is not None:
            ra["putts"] += rh.putts
            ra["putt_holes"] += 1
            ra["gir_eligible"] += 1
            if rh.strokes - rh.putts <= ch.par - 2:
                ra["gir"] += 1
            if rh.putts >= 3:
                ra["three_putts"] += 1

    # Build par breakdown
    par_breakdown = []
    for p in sorted(par_data.keys()):
        scores = par_data[p]["scores"]
        diffs = par_data[p]["diffs"]
        n = len(scores)
        par_breakdown.append(ParBreakdown(
            par=p,
            count=n,
            avg_score=round(sum(scores) / n, 2),
            avg_vs_par=round(sum(diffs) / n, 2),
            birdie_pct=round(sum(1 for d in diffs if d <= -1) / n * 100, 1),
            par_pct=round(sum(1 for d in diffs if d == 0) / n * 100, 1),
            bogey_pct=round(sum(1 for d in diffs if d == 1) / n * 100, 1),
            double_plus_pct=round(sum(1 for d in diffs if d >= 2) / n * 100, 1),
        ))

    # Build per-round list
    per_round = []
    for ra in sorted(round_agg.values(), key=lambda x: x["date"]):
        per_round.append(ScoringRound(
            round_id=ra["round_id"],
            date=ra["date"],
            course_name=ra["course_name"],
            holes_played=ra["holes"],
            score=ra["score"],
            score_vs_par=ra["score"] - ra["par_total"],
            gir_pct=round(ra["gir"] / ra["gir_eligible"] * 100, 1) if ra["gir_eligible"] else None,
            fw_pct=round(ra["fw_hit"] / ra["fw_eligible"] * 100, 1) if ra["fw_eligible"] else None,
            putts=ra["putts"] if ra["putt_holes"] else None,
            putts_per_hole=round(ra["putts"] / ra["putt_holes"], 2) if ra["putt_holes"] else None,
            three_putts=ra["three_putts"],
            birdie_or_better=ra["birdie_or_better"],
            pars=ra["pars"],
            bogeys=ra["bogeys"],
            doubles=ra["doubles"],
            triple_plus=ra["triple_plus"],
        ))

    return ScoringResponse(
        gir_pct=round(gir_holes / gir_eligible * 100, 1) if gir_eligible else None,
        fairway_pct=round(fw_hit / fw_eligible * 100, 1) if fw_eligible else None,
        avg_putts_per_hole=round(total_putts / putt_holes, 2) if putt_holes else None,
        putts_per_gir=round(gir_putts / gir_putt_holes, 2) if gir_putt_holes else None,
        scramble_pct=round(non_gir_par_or_better / non_gir_total * 100, 1) if non_gir_total else None,
        three_putt_pct=round(three_putts / putt_holes * 100, 1) if putt_holes else None,
        scoring_distribution=ScoringDistribution(**dist),
        par_breakdown=par_breakdown,
        per_round=per_round,
    )


# ── Handicap Tracking ───────────────────────────────────────────────

# USGA: how many of the lowest differentials to use based on count available
_USGA_DIFF_TABLE = {
    3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2,
    9: 3, 10: 3, 11: 4, 12: 4, 13: 5, 14: 5,
    15: 6, 16: 6, 17: 7, 18: 7, 19: 8, 20: 8,
}


class HandicapDifferential(BaseModel):
    round_ids: list[int]
    date: date
    course_name: str
    score: int
    rating: float
    slope: float
    differential: float
    used: bool = False
    is_combined: bool = False


class HandicapTrendPoint(BaseModel):
    date: date
    handicap_index: Optional[float] = None
    differential: float
    differentials_available: int


class HandicapProjection(BaseModel):
    milestone: float
    rounds_away: Optional[int] = None  # None = not on current trajectory
    label: str


class HandicapResponse(BaseModel):
    handicap_index: Optional[float] = None
    differentials_used: int = 0
    differentials_available: int = 0
    low_index: Optional[float] = None
    improvement_per_round: Optional[float] = None  # negative = improving
    projections: list[HandicapProjection] = []
    trend: list[HandicapTrendPoint]
    differentials: list[HandicapDifferential]


def _compute_handicap_index(diffs: list[float]) -> Optional[float]:
    """Compute USGA handicap index from a list of differentials."""
    n = len(diffs)
    if n < 3:
        return None
    use_count = _USGA_DIFF_TABLE.get(n, 8)
    best = sorted(diffs)[:use_count]
    return round(sum(best) / len(best) * 0.96, 1)


def _build_differentials(db: Session) -> list[HandicapDifferential]:
    """Build handicap differentials from rounds, pairing 9-hole rounds."""
    from app.models.course import GolfClub as GolfClubModel

    rounds = (
        db.query(Round, Course, GolfClubModel)
        .join(Course, Round.course_id == Course.id)
        .join(GolfClubModel, Course.golf_club_id == GolfClubModel.id)
        .filter(
            Round.exclude_from_stats != True,
            Round.course_rating.isnot(None),
            Round.slope_rating.isnot(None),
            Round.total_strokes.isnot(None),
        )
        .order_by(Round.date)
        .all()
    )

    differentials = []
    nine_hole_pool = []  # (round, course, club) tuples awaiting pairing

    for rnd, course, club in rounds:
        # Determine actual holes played
        played = rnd.holes_completed or 0
        if played < 9:
            continue

        if course.name:
            display_name = f"{club.name} — {course.name}"
        else:
            display_name = club.name

        is_full = played >= 18
        course_holes = course.holes or 18

        # Get 9-hole rating for sub-18 rounds
        # If a 9-hole round has a rating > 50, it's an 18-hole rating that needs halving
        nine_rating = rnd.course_rating
        nine_slope = rnd.slope_rating
        if not is_full and rnd.course_rating and rnd.course_rating > 50:
            nine_rating = round(rnd.course_rating / 2, 1)

        if is_full:
            # 18-hole round — direct differential
            diff = round((113 / rnd.slope_rating) * (rnd.total_strokes - rnd.course_rating), 1)
            differentials.append(HandicapDifferential(
                round_ids=[rnd.id],
                date=rnd.date,
                course_name=display_name,
                score=rnd.total_strokes,
                rating=rnd.course_rating,
                slope=rnd.slope_rating,
                differential=diff,
            ))
        else:
            # 9-hole (or partial) — add to pool for pairing
            # Store both original and adjusted ratings
            nine_hole_pool.append((rnd, course, club, display_name, nine_rating, nine_slope, rnd.course_rating, rnd.slope_rating))

    # Pair 9-hole rounds: same club first, then by date
    paired = set()
    nine_diffs = []

    def _make_pair(i, j):
        r1, c1, _, n1, rat1, sl1, orig_rat1, orig_sl1 = nine_hole_pool[i]
        r2, c2, _, n2, rat2, sl2, orig_rat2, orig_sl2 = nine_hole_pool[j]
        return _combine_nine_holes(r1, c1, n1, rat1, sl1, orig_rat1, orig_sl1,
                                   r2, c2, n2, rat2, sl2, orig_rat2, orig_sl2)

    # Pass 1: same club, same date
    for i in range(len(nine_hole_pool)):
        if i in paired:
            continue
        _, _, cl1, _, _, _, _, _ = nine_hole_pool[i]
        r1 = nine_hole_pool[i][0]
        for j in range(i + 1, len(nine_hole_pool)):
            if j in paired:
                continue
            _, _, cl2, _, _, _, _, _ = nine_hole_pool[j]
            r2 = nine_hole_pool[j][0]
            if cl1.id == cl2.id and r1.date == r2.date:
                nine_diffs.append(_make_pair(i, j))
                paired.add(i)
                paired.add(j)
                break

    # Pass 2: same club, different dates
    for i in range(len(nine_hole_pool)):
        if i in paired:
            continue
        _, _, cl1, _, _, _, _, _ = nine_hole_pool[i]
        for j in range(i + 1, len(nine_hole_pool)):
            if j in paired:
                continue
            _, _, cl2, _, _, _, _, _ = nine_hole_pool[j]
            if cl1.id == cl2.id:
                nine_diffs.append(_make_pair(i, j))
                paired.add(i)
                paired.add(j)
                break

    # Pass 3: any remaining unpaired, closest dates
    unpaired = [i for i in range(len(nine_hole_pool)) if i not in paired]
    while len(unpaired) >= 2:
        i, j = unpaired[0], unpaired[1]
        nine_diffs.append(_make_pair(i, j))
        unpaired = unpaired[2:]

    differentials.extend(nine_diffs)
    differentials.sort(key=lambda d: d.date)
    return differentials


def _combine_nine_holes(r1, c1, name1, rat1, sl1, orig_rat1, orig_sl1,
                        r2, c2, name2, rat2, sl2, orig_rat2, orig_sl2) -> HandicapDifferential:
    """Combine two 9-hole rounds into one 18-hole differential."""
    combined_score = r1.total_strokes + r2.total_strokes

    # If same course and both have 18-hole ratings, use the original 18-hole rating
    same_course = (c1.id == c2.id)
    both_18_rated = (orig_rat1 and orig_rat1 > 50 and orig_rat2 and orig_rat2 > 50)

    if same_course and both_18_rated:
        # Front 9 + back 9 of same course — use the 18-hole rating
        combined_rating = orig_rat1  # same course, same rating
        avg_slope = orig_sl1
    else:
        # Different courses — add 9-hole ratings
        combined_rating = rat1 + rat2
        avg_slope = (sl1 + sl2) / 2

    diff = round((113 / avg_slope) * (combined_score - combined_rating), 1)
    later_date = max(r1.date, r2.date)
    return HandicapDifferential(
        round_ids=[r1.id, r2.id],
        date=later_date,
        course_name=f"{name1} + {name2}",
        score=combined_score,
        rating=round(combined_rating, 1),
        slope=round(avg_slope, 0),
        differential=diff,
        is_combined=True,
    )


@router.get("/handicap", response_model=HandicapResponse)
def get_handicap(db: Session = Depends(get_db)):
    diffs = _build_differentials(db)
    n = len(diffs)

    if n < 3:
        return HandicapResponse(
            differentials_available=n,
            trend=[],
            differentials=diffs,
        )

    # Current handicap: best N of last 20
    last_20 = diffs[-20:] if n > 20 else diffs
    use_count = _USGA_DIFF_TABLE.get(len(last_20), 8)
    sorted_diffs = sorted(last_20, key=lambda d: d.differential)
    for d in sorted_diffs[:use_count]:
        d.used = True

    current_index = _compute_handicap_index([d.differential for d in last_20])

    # Trend: compute handicap at each point in time
    trend = []
    low_index = None
    for i in range(len(diffs)):
        window = diffs[max(0, i - 19):i + 1]
        idx = _compute_handicap_index([d.differential for d in window])
        trend.append(HandicapTrendPoint(
            date=diffs[i].date,
            handicap_index=idx,
            differential=diffs[i].differential,
            differentials_available=len(window),
        ))
        if idx is not None:
            if low_index is None or idx < low_index:
                low_index = idx

    # Compute improvement rate via linear regression on handicap trend
    hcp_points = [(i, t.handicap_index) for i, t in enumerate(trend) if t.handicap_index is not None]
    improvement_per_round = None
    projections = []

    if len(hcp_points) >= 3:
        xs = [p[0] for p in hcp_points]
        ys = [p[1] for p in hcp_points]
        x_mean = sum(xs) / len(xs)
        y_mean = sum(ys) / len(ys)
        denom = sum((x - x_mean) ** 2 for x in xs)
        if denom > 0:
            slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denom
            improvement_per_round = round(slope, 2)

            # Project milestones
            if current_index is not None and slope < 0:
                milestones = [
                    (30, "Break 30"),
                    (25, "Break 25"),
                    (20, "Break 20"),
                    (18, "Break 18"),
                    (15, "Break 15"),
                    (10, "Single digits"),
                    (5, "Break 5"),
                    (0, "Scratch golfer"),
                ]
                last_idx = len(trend) - 1
                for target, label in milestones:
                    if current_index <= target:
                        continue  # already past this milestone
                    rounds_needed = int((target - current_index) / slope)
                    if rounds_needed > 0:
                        projections.append(HandicapProjection(
                            milestone=target,
                            rounds_away=rounds_needed,
                            label=label,
                        ))

    return HandicapResponse(
        handicap_index=current_index,
        differentials_used=use_count,
        differentials_available=len(last_20),
        low_index=low_index,
        improvement_per_round=improvement_per_round,
        projections=projections,
        trend=trend,
        differentials=diffs,
    )
