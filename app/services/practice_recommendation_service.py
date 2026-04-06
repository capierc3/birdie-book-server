"""Smart Practice Recommendation Engine.

Analyzes SG data, club stats, miss patterns, and round plans to generate
structured practice plans with session-by-session drill recommendations.
"""

import json
import math
import random
from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from sqlalchemy import func as sql_func

from app.models import (
    Club, ClubStats, Round, RoundHole, Shot, CourseHole, Course, GolfClub,
    RoundPlan, RoundPlanHole, RoundPlanShot,
    RangeShot,
)
from app.models.trackman_shot import TrackmanShot
from app.models.drill import Drill
from app.api.stats import _fetch_classified_shots, _classify_sg_category

# ── Constants ──────────────────────────────────────────────────────────

CATEGORIES = ["off_the_tee", "approach", "short_game", "putting"]

CATEGORY_LABELS = {
    "off_the_tee": "Off the Tee",
    "approach": "Approach",
    "short_game": "Short Game",
    "putting": "Putting",
}

# What each session type can physically accommodate
SESSION_CAPABILITIES = {
    "trackman_range": {"off_the_tee", "approach", "short_game"},
    "outdoor_range": {"off_the_tee", "approach", "short_game"},
    "simulator": {"off_the_tee", "approach", "short_game"},
    "home_net": {"off_the_tee", "approach"},  # full swing only, no ball flight feedback
    "short_game_area": {"short_game"},
    "putting_green": {"putting"},
}

# Focus areas by SG category
CATEGORY_FOCUS_AREAS = {
    "off_the_tee": ["accuracy", "distance_control", "start_line", "tempo"],
    "approach": ["distance_control", "accuracy", "trajectory", "start_line"],
    "short_game": ["chipping", "distance_control", "bunker", "trajectory"],
    "putting": ["lag_putting", "short_putt", "speed_control", "start_line"],
}

MIN_BALLS_PER_ACTIVITY = 8
MIN_MINUTES_PER_ACTIVITY = 5
WARMUP_FRACTION = 0.10

# ── Tag system ─────────────────────────────────────────────────────────

CLUB_TAG_MAP = {
    "driver": ["Driver"],
    "fairway_woods": ["3 Wood", "5 Wood", "7 Wood"],
    "hybrid": ["Hybrid", "4 Hybrid", "5 Hybrid", "3 Hybrid"],
    "long_irons": ["3 Iron", "4 Iron", "5 Iron"],
    "mid_irons": ["6 Iron", "7 Iron", "8 Iron"],
    "short_irons": ["9 Iron", "Pitching Wedge"],
    "wedges": ["Gap Wedge", "Sand Wedge", "Lob Wedge"],
    "putter": ["Putter"],
}

SKILL_TAG_MAP = {
    "distance": "distance_control",
    "accuracy": "accuracy",
    "spread": "accuracy",
    "tempo": "tempo",
    "start_line": "start_line",
    "trajectory": "trajectory",
    "speed_control": "speed_control",
    "consistency": "tempo",
}

SITUATIONAL_TAGS = {
    "swing_change": {"reps_multiplier": 1.5, "max_clubs": 2},
    "new_club": {"boost": 4.0},
    "scoring_zones": {"force_categories": ["approach", "short_game"]},
    "trouble_shots": {"force_focus": ["bunker", "chipping", "trajectory"]},
}

# ── Drill template library ─────────────────────────────────────────────
# Each drill: name, description, focus criteria, compatible environments

DRILL_LIBRARY = {
    # Driver - Distance
    ("off_the_tee", "distance_control", "Driver"): [
        {"name": "Step-Through Speed Swing", "description": "Make full swings stepping your trail foot through toward the target on the downswing. Encourages full body rotation and maximum speed through impact.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Focus on the 'whoosh' sound past the ball, not at the ball."},
        {"name": "Tee Height Experiment", "description": "Hit 5 drives each at low tee (half ball above crown), normal, and high tee (full ball above crown). Find optimal launch conditions for your swing.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Identify tee height that maximizes carry distance."},
        {"name": "Overspeed Training", "description": "Swing a lighter club or training aid as fast as possible for sets of 3. Each mph of clubhead speed adds ~2.5-3 yards of distance.", "env": {"home_net", "trackman_range", "outdoor_range", "simulator"}, "target": "Train nervous system to fire faster — 15-20 min session."},
    ],
    # Driver - Accuracy
    ("off_the_tee", "accuracy", "Driver"): [
        {"name": "Fairway Corridor", "description": "Pick two targets 30-40 yards apart to define a 'fairway.' Hit 10 drivers with full pre-shot routine, track how many land in the corridor.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Goal: 7/10 in the corridor."},
        {"name": "Gate Drill", "description": "Place two alignment sticks creating a gate ~6 inches wider than your clubhead, angled slightly inside-to-out. Swing through without touching.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Start wide, narrow the gate as you improve."},
        {"name": "Alignment Stick Setup", "description": "One stick pointing at target, another parallel along your toe line. Hit drivers ensuring body is parallel-left and clubface aims at target stick.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Divots/swing direction matching the stick direction."},
    ],
    # Iron - Distance Control
    ("approach", "distance_control", None): [
        {"name": "Ladder Drill", "description": "With one iron, hit to 4 targets at increasing distances: 75%, 85%, 95%, 100% of full. Work up then back down the ladder.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Land within 5 yards of each target distance."},
        {"name": "Three-Quarter Swing", "description": "Hit 20 shots using only a 3/4 backswing (arms to 9 o'clock). Most players find similar distance with much tighter dispersion.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Tighter dispersion than full swings."},
        {"name": "Trajectory Variation", "description": "Same iron: hit 3 low punch shots (ball back, hands forward), 3 stock shots, and 3 high floaters (ball forward, full release). Cycle through all three.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Visible trajectory differences with same club."},
    ],
    # Iron - Accuracy
    ("approach", "accuracy", None): [
        {"name": "Stock Shot Repetition", "description": "One iron, one target. Hit 21 balls (3 sets of 7) to the same target with full pre-shot routine each time. Rest between sets.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "All shots missing to the same side — eliminate the two-way miss."},
        {"name": "9-Shot Grid", "description": "Hit 9 shots in sequence: low-draw, mid-draw, high-draw, low-straight, mid-straight, high-straight, low-fade, mid-fade, high-fade.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Produce visibly different shapes on demand."},
        {"name": "Shrinking Target", "description": "Pick a target, hit 5 balls, note your dispersion circle. Mentally shrink target to half and hit 5 more. Repeat.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Dispersion tightens over the session."},
    ],
    # Wedge - Distance Control
    ("approach", "distance_control", "wedge"): [
        {"name": "Clock System (Pelz)", "description": "For each wedge, hit 5 balls at 9 o'clock (arms parallel), 10:30, and full backswing. Record average carry for each. Builds a personal distance chart.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Carry distances within 5-yard window per position."},
        {"name": "Distance Ladder (Wedges)", "description": "Set targets at 40, 60, 80, and 100 yards. Land within 5 yards before moving to next. Miss = start over.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Complete full ladder without restarting."},
        {"name": "One-Arm Tempo", "description": "Grip wedge with only lead hand. Make smooth half-swings to 30-40 yard target. Trains rhythm, wrist control, prevents rushed transitions.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Consistent contact and landing with one arm."},
    ],
    # Short Game - Chipping
    ("short_game", "chipping", None): [
        {"name": "Landing Zone Ladder", "description": "Place 4 towels at 3-foot intervals on the green. Chip to land in each zone in sequence up and down the ladder.", "env": {"short_game_area"}, "target": "Land in correct zone 7/10 times."},
        {"name": "Up-and-Down Challenge", "description": "Drop balls in 9 spots around the green. Play each as par-2 (one chip + one putt). Keep score.", "env": {"short_game_area"}, "target": "Get up-and-down more than 50%."},
        {"name": "One-Club Challenge", "description": "Chip from 5 locations using only one club (e.g. 8-iron). Then repeat with a wedge. Teaches technique adjustment over club switching.", "env": {"short_game_area"}, "target": "All balls within 6-foot circle of hole."},
    ],
    # Short Game - Bunker
    ("short_game", "bunker", None): [
        {"name": "Line in the Sand", "description": "Draw a line in the sand (no ball). Practice striking the line. Once consistent, place ball 2 inches ahead and repeat.", "env": {"short_game_area"}, "target": "Sand divot starts at the line every time."},
        {"name": "One-Foot Balance Drill", "description": "Lift trail foot, all weight on lead foot. Hit bunker shots. Forces proper weight-forward impact.", "env": {"short_game_area"}, "target": "Ball pops out cleanly despite the stance."},
    ],
    # Putting - Lag
    ("putting", "lag_putting", None): [
        {"name": "Circle Drill", "description": "Place tees in a 3-foot circle around a hole. Putt from 25, 35, and 45 feet. Get 8/10 inside the circle at each distance.", "env": {"putting_green"}, "target": "All balls finish within tap-in range."},
        {"name": "Ladder Drill (Putting)", "description": "Putt to targets at 10, 20, 30, 40, 50 feet. Each must finish past the previous but short of the next. Short = start over.", "env": {"putting_green"}, "target": "Complete full ladder with proper spacing."},
        {"name": "Fringe Lag Drill", "description": "Putt from one fringe to opposite fringe. Stop within 3 feet of far edge. Trains max-distance feel without hole fixation.", "env": {"putting_green"}, "target": "Balls within putter-length of far fringe."},
    ],
    # Putting - Short
    ("putting", "short_putt", None): [
        {"name": "Gate Drill (Putting)", "description": "Two tees just wider than putter head, 4 feet from hole. Putt through the gate. Make 9 in a row; miss one = start over.", "env": {"putting_green"}, "target": "Consistent gate clearance and makes."},
        {"name": "Compass Drill", "description": "4 tees at 3 feet from hole (12, 3, 6, 9 o'clock). Make all 4, move to 4 feet, then 5, then 6. Miss = restart that distance.", "env": {"putting_green"}, "target": "Complete all 4 distances cleanly."},
    ],
    # Tempo
    ("off_the_tee", "tempo", None): [
        {"name": "Feet-Together Drill", "description": "Hit full shots with feet touching. Start with wedges, progress to mid-irons. Cannot sway or lunge without falling, forcing smooth tempo.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Solid contact and balanced finish without stumbling."},
        {"name": "Pause-at-Top Drill", "description": "Normal backswing, hold 1-second pause at top, then swing. Hit 10 paused, then 5 normal. Normal shots feel smoother.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Downswing initiated by lower body, not a lurch."},
        {"name": "Counting Tempo (1-2-3-4)", "description": "Count '1-2-3' during backswing and '4' at impact. Full-swing ideal ratio is 3:1. Hit 20 balls counting out loud.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Every swing takes the same amount of time."},
    ],
    ("approach", "tempo", None): [
        {"name": "Feet-Together Drill", "description": "Hit full shots with feet touching. Cannot sway or lunge, forcing smooth tempo naturally.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Solid contact and balanced finish."},
        {"name": "Counting Tempo (1-2-3-4)", "description": "Count '1-2-3' during backswing and '4' at impact. Hit 20 balls counting out loud.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Every swing takes the same amount of time."},
    ],
    # Start Line
    ("off_the_tee", "start_line", None): [
        {"name": "Train Track Alignment", "description": "Lay one stick at target, another along toe line parallel. Verify divot/swing matches stick direction. Rotate targets every 5 shots.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Divots consistently parallel to target-line stick."},
        {"name": "Intermediate Target", "description": "Pick a spot 3-4 feet ahead of ball on target line. Align clubface to that spot. Ball should start directly over it.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Ball starts within club-width of intermediate spot."},
    ],
    ("approach", "start_line", None): [
        {"name": "Train Track Alignment", "description": "Alignment sticks: one at target, one along toes. Hit shots verifying direction matches sticks.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Divots parallel to target-line stick."},
        {"name": "Vertical Stick Target", "description": "Push alignment stick vertically 8-10 feet ahead on target line. Hit shots at it. Vertical reference improves aim calibration.", "env": {"trackman_range", "outdoor_range", "simulator"}, "target": "Ball starts within club-width of stick."},
    ],
    # Swing Change (all categories)
    ("off_the_tee", "swing_change", None): [
        {"name": "Slow Motion Reps (4-and-4)", "description": "2-3 super-slow swings focusing on new position, then 4 balls at full speed. Repeat for 20+ balls. Ingrains new patterns before adding speed.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "New feel carries into full-speed swings."},
        {"name": "Exaggeration Drill", "description": "Exaggerate the change by 200%. Need more hip rotation? Feel like spinning completely open. Dramatic sensation overrides old patterns.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Video shows position closer to correct despite extreme feel."},
        {"name": "Mirror/Video Checkpoint", "description": "Phone camera or mirror. Stop at P2 (takeaway), P4 (top), P6 (impact). Compare to target positions. Hit balls only after passing checkpoints.", "env": {"home_net", "trackman_range", "outdoor_range", "simulator"}, "target": "Video positions match instructor's model."},
    ],
    ("approach", "swing_change", None): [
        {"name": "Slow Motion Reps (4-and-4)", "description": "2-3 slow-motion swings on the new feel, then 4 balls at speed. Repeat. Block practice for new changes.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "New feel transfers to full-speed swings."},
        {"name": "Exaggeration Drill", "description": "Exaggerate the change by 200%. Brain needs dramatically different sensation to override old patterns.", "env": {"trackman_range", "outdoor_range", "home_net", "simulator"}, "target": "Actual position closer to correct on video."},
    ],
    # Home net specific
    ("off_the_tee", "warm_up", "net"): [
        {"name": "Impact Position Hold", "description": "Hit into net and freeze at impact for 3 seconds. Check: weight on lead side, hands ahead, chest facing ball.", "env": {"home_net"}, "target": "Consistent frozen position every rep."},
        {"name": "Swing Path Gate (Net)", "description": "Two alignment sticks creating a gate just wider than clubhead, 6 inches ahead of ball. Swing through into net. Instant path feedback.", "env": {"home_net"}, "target": "Club passes through gate cleanly."},
    ],
}


def _decide_focus_area(
    category: str,
    worst_club: dict,
    gaps: list[dict],
    club_info: Optional[dict],
    scoring_patterns: dict,
) -> str:
    """Decision tree: pick the right focus area based on available data."""
    miss_data = worst_club.get("miss_data")
    swing_data = worst_club.get("swing_data")
    club_name = worst_club.get("club_name", "")

    # Swing data overrides (Trackman — highest fidelity)
    if swing_data:
        if "low_smash" in swing_data.get("flags", []):
            return "tempo"  # contact quality issue → tempo/impact work
        if "steep_attack_driver" in swing_data.get("flags", []):
            return "trajectory"  # attack angle issue
        if "toe_strikes" in swing_data.get("flags", []) or "heel_strikes" in swing_data.get("flags", []):
            return "start_line"  # alignment/setup issue

    # Miss direction (on-course data)
    if miss_data:
        course_miss = miss_data.get("course_miss")
        if course_miss and course_miss.get("dominant"):
            return "accuracy"  # directional miss → alignment drills
        if course_miss and course_miss.get("sample", 0) >= 10:
            avg_miss = course_miss.get("avg_miss_yards", 0)
            if avg_miss > 15:
                return "accuracy"  # wide dispersion

    # Range-course gap
    for gap in gaps:
        if gap.get("club_name") == (club_info["name"] if club_info else ""):
            if abs(gap.get("gap", 0)) >= 5:
                return "distance_control"

    # Scoring pattern checks
    if category == "putting":
        if scoring_patterns.get("three_putt_rate", 0) > 10:
            return "lag_putting"
        return "short_putt"

    if category == "short_game":
        if scoring_patterns.get("scramble_pct", 100) < 40:
            return "chipping"
        return "distance_control"

    # Default by category
    defaults = {
        "off_the_tee": "accuracy",
        "approach": "distance_control",
        "short_game": "chipping",
        "putting": "lag_putting",
    }
    return defaults.get(category, "distance_control")


def _find_drill(
    db: Session,
    sg_category: str,
    focus_area: str,
    club_name: Optional[str],
    session_type: str,
    miss_data: Optional[dict] = None,
    swing_data: Optional[dict] = None,
) -> Optional[dict]:
    """Smart drill selection from DB using decision tree + randomization."""
    import json as _json

    # Collect candidate focus areas based on analysis data
    focus_areas_to_search = []

    if miss_data:
        course_miss = miss_data.get("course_miss")
        if course_miss and course_miss.get("dominant"):
            focus_areas_to_search.extend(["accuracy", "start_line"])
        if miss_data.get("trackman_root_cause"):
            ftp = miss_data["trackman_root_cause"].get("avg_face_to_path")
            if ftp is not None and abs(ftp) > 3:
                focus_areas_to_search.append("accuracy")

    if swing_data:
        flags = swing_data.get("flags", [])
        if "low_smash" in flags:
            focus_areas_to_search.append("tempo")
        if "high_spin_variability" in flags:
            focus_areas_to_search.append("accuracy")

    focus_areas_to_search.append(focus_area)

    # Query DB for matching drills
    candidates = []
    seen_ids = set()

    for fa in focus_areas_to_search:
        drills = _query_drills_db(db, sg_category, fa, club_name, session_type)
        for d in drills:
            if d["id"] not in seen_ids:
                seen_ids.add(d["id"])
                candidates.append(d)

    if candidates:
        return random.choice(candidates)

    # Fallback: any drill in this category for this session type
    fallback = _query_drills_db(db, sg_category, None, None, session_type)
    if fallback:
        return random.choice(fallback)

    return None


def _query_drills_db(
    db: Session,
    sg_category: str,
    focus_area: Optional[str],
    club_name: Optional[str],
    session_type: str,
) -> list[dict]:
    """Query drills table for matching drills."""
    import json as _json

    q = db.query(Drill).filter(
        (Drill.sg_category == sg_category) | (Drill.sg_category.is_(None))
    )

    if focus_area:
        q = q.filter((Drill.focus_area == focus_area) | (Drill.focus_area.is_(None)))

    if club_name:
        # Match specific club, wedge group, or generic (NULL)
        club_filters = [Drill.club_type == club_name, Drill.club_type.is_(None)]
        if any(w in (club_name or "").lower() for w in ["gap", "sand", "lob"]):
            club_filters.append(Drill.club_type == "wedge")
        from sqlalchemy import or_
        q = q.filter(or_(*club_filters))
    else:
        q = q.filter(Drill.club_type.is_(None))

    drills = q.all()

    # Post-filter by session_type (stored as JSON)
    result = []
    for d in drills:
        if d.session_types:
            try:
                types = _json.loads(d.session_types)
                if session_type not in types:
                    continue
            except (ValueError, TypeError):
                pass
        result.append({
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "target": d.target,
        })

    return result


# ── Main entry point ──────────────────────────────────────────────────

def generate_practice_plan(
    db: Session,
    plan_type: str,
    sessions_spec: list[dict],
    round_plan_id: Optional[int] = None,
    focus_tags: Optional[list[str]] = None,
) -> dict:
    """
    Generate a recommended practice plan.

    Args:
        db: Database session
        plan_type: "round_prep" or "general"
        sessions_spec: List of {"session_type": str, "ball_count": int|None, "duration_minutes": int|None}
        round_plan_id: Optional RoundPlan ID for round-prep mode
        focus_tags: Optional list of focus tags to steer recommendations
    """
    # Handle "surprise me" — pick random focus areas
    if focus_tags and "surprise_me" in focus_tags:
        focus_tags = _generate_surprise_tags(db)

    # Step 1: Gather player profile
    profile = _build_player_profile(db)

    # Step 2: Build weakness profile
    weaknesses = _build_weakness_profile(profile)

    # Step 3: Course needs (round_prep only)
    course_needs = None
    if plan_type == "round_prep" and round_plan_id:
        course_needs = _build_course_needs(db, round_plan_id)

    # Step 4 & 5: Allocate and generate activities per session
    sessions = _allocate_sessions(
        db, sessions_spec, weaknesses, course_needs, plan_type, profile, focus_tags
    )

    # Build analysis summary for the UI
    analysis = _build_analysis_summary(db, profile, weaknesses, course_needs)
    if focus_tags:
        analysis["focus_tags"] = focus_tags

    return {
        "analysis": analysis,
        "sessions": sessions,
    }


# ── Step 1: Player profile ────────────────────────────────────────────

def _build_player_profile(db: Session) -> dict:
    """Gather all data needed for recommendations."""
    # Overall SG data
    all_shots = _fetch_classified_shots(db)
    recent_shots = _fetch_classified_shots(db, last_n_rounds=5)

    # Club stats (range vs course)
    clubs = (
        db.query(Club)
        .filter(Club.retired != True)
        .all()
    )
    club_stats = {}
    for c in clubs:
        cs = db.query(ClubStats).filter(ClubStats.club_id == c.id).first()
        if cs:
            club_stats[c.id] = {
                "club_id": c.id,
                "club_name": c.club_type,
                "display_name": c.name or c.club_type,
                "color": c.color,
                "course_avg": cs.avg_yards,
                "course_sample": cs.sample_count or 0,
                "range_avg": cs.range_avg_yards,
                "range_sample": cs.range_sample_count or 0,
                "combined_avg": cs.combined_avg_yards,
                "combined_p10": cs.combined_p10,
                "combined_p90": cs.combined_p90,
                "combined_std": cs.combined_std_dev,
            }

    # Count total rounds
    total_rounds = db.query(Round).filter(Round.exclude_from_stats != True).count()

    # Extended analyses
    miss_analysis = _build_miss_analysis(db)
    proximity_analysis = _build_proximity_analysis(db)
    scoring_patterns = _build_scoring_pattern_analysis(db)
    player_context = _build_player_context(db)
    swing_analysis = _build_range_swing_analysis(db)

    return {
        "all_shots": all_shots,
        "recent_shots": recent_shots,
        "club_stats": club_stats,
        "clubs": {c.id: c for c in clubs},
        "total_rounds": total_rounds,
        "miss_analysis": miss_analysis,
        "proximity_analysis": proximity_analysis,
        "scoring_patterns": scoring_patterns,
        "player_context": player_context,
        "swing_analysis": swing_analysis,
    }


# ── Extended analyses ──────────────────────────────────────────────────

def _build_miss_analysis(db: Session) -> dict:
    """Per-club miss direction from on-course fairway data and range lateral data."""
    result = {}

    # On-course: TEE shots on par 4+ with fairway_side data
    tee_shots = (
        db.query(Shot.club, Shot.fairway_side, Shot.fairway_side_yards)
        .join(RoundHole, Shot.round_hole_id == RoundHole.id)
        .join(Round, Shot.round_id == Round.id)
        .filter(
            Shot.shot_type == "TEE",
            Shot.fairway_side.isnot(None),
            Round.exclude_from_stats != True,
        )
        .all()
    )

    club_miss = defaultdict(lambda: {"L": 0, "R": 0, "CENTER": 0, "miss_yards": [], "total": 0})
    for club, side, yards in tee_shots:
        if not club:
            continue
        cm = club_miss[club]
        cm[side] += 1
        cm["total"] += 1
        if yards is not None:
            cm["miss_yards"].append(yards)

    for club, data in club_miss.items():
        if data["total"] < 5:
            continue
        total = data["total"]
        left_pct = round(data["L"] / total * 100)
        right_pct = round(data["R"] / total * 100)
        center_pct = round(data["CENTER"] / total * 100)

        dominant = None
        if left_pct > 55:
            dominant = "left"
        elif right_pct > 55:
            dominant = "right"

        avg_miss = round(sum(abs(y) for y in data["miss_yards"]) / len(data["miss_yards"]), 1) if data["miss_yards"] else 0

        result[club] = {
            "course_miss": {
                "left_pct": left_pct,
                "right_pct": right_pct,
                "center_pct": center_pct,
                "dominant": dominant,
                "avg_miss_yards": avg_miss,
                "sample": total,
            },
            "range_miss": None,
            "trackman_root_cause": None,
        }

    # Range lateral data (RangeShot + TrackmanShot)
    range_lateral = defaultdict(list)

    mlm_rows = (
        db.query(RangeShot.club_id, RangeShot.side_carry_yards)
        .filter(RangeShot.club_id.isnot(None), RangeShot.side_carry_yards.isnot(None))
        .all()
    )
    for club_id, lateral in mlm_rows:
        range_lateral[club_id].append(lateral)

    tm_rows = (
        db.query(TrackmanShot.club_id, TrackmanShot.side_carry_yards)
        .filter(TrackmanShot.club_id.isnot(None), TrackmanShot.side_carry_yards.isnot(None))
        .all()
    )
    for club_id, lateral in tm_rows:
        range_lateral[club_id].append(lateral)

    # Map club_id to club_type name for merging
    clubs = db.query(Club).all()
    club_id_to_name = {c.id: c.club_type for c in clubs}

    for club_id, laterals in range_lateral.items():
        if len(laterals) < 5:
            continue
        club_name = club_id_to_name.get(club_id)
        if not club_name:
            continue

        import statistics
        avg_lat = round(statistics.mean(laterals), 1)
        std_lat = round(statistics.stdev(laterals), 1) if len(laterals) >= 2 else 0
        left_count = sum(1 for l in laterals if l < -1)
        right_count = sum(1 for l in laterals if l > 1)
        total = len(laterals)

        range_data = {
            "avg_lateral": avg_lat,
            "lateral_std": std_lat,
            "left_pct": round(left_count / total * 100),
            "right_pct": round(right_count / total * 100),
            "sample": total,
        }

        if club_name in result:
            result[club_name]["range_miss"] = range_data
        else:
            result[club_name] = {"course_miss": None, "range_miss": range_data, "trackman_root_cause": None}

    # Trackman root cause data (face angle, path, face-to-path)
    tm_cause = (
        db.query(
            TrackmanShot.club_id,
            sql_func.avg(TrackmanShot.face_angle_deg),
            sql_func.avg(TrackmanShot.club_path_deg),
            sql_func.avg(TrackmanShot.face_to_path_deg),
            sql_func.count(),
        )
        .filter(
            TrackmanShot.club_id.isnot(None),
            TrackmanShot.face_angle_deg.isnot(None),
        )
        .group_by(TrackmanShot.club_id)
        .all()
    )
    for club_id, avg_face, avg_path, avg_ftp, count in tm_cause:
        if count < 5:
            continue
        club_name = club_id_to_name.get(club_id)
        if not club_name:
            continue
        cause_data = {
            "avg_face_angle": round(avg_face, 1) if avg_face else None,
            "avg_club_path": round(avg_path, 1) if avg_path else None,
            "avg_face_to_path": round(avg_ftp, 1) if avg_ftp else None,
            "sample": count,
        }
        if club_name in result:
            result[club_name]["trackman_root_cause"] = cause_data
        else:
            result[club_name] = {"course_miss": None, "range_miss": None, "trackman_root_cause": cause_data}

    return result


def _build_proximity_analysis(db: Session) -> list[dict]:
    """Approach shot proximity grouped by distance bucket."""
    # Query approach shots with distance and outcome data
    approach_shots = (
        db.query(Shot.distance_yards, Shot.green_distance_yards, Shot.on_green,
                 Shot.sg_pga, Shot.club, Shot.shot_type)
        .join(Round, Shot.round_id == Round.id)
        .filter(
            Round.exclude_from_stats != True,
            Shot.distance_yards.isnot(None),
            Shot.distance_yards > 30,
            Shot.shot_type.in_(["APPROACH", "LAYUP", "TEE"]),
        )
        .all()
    )

    buckets = defaultdict(lambda: {"shots": 0, "gir_count": 0, "sg_sum": 0, "proximity": [], "clubs": defaultdict(int)})

    for dist, green_dist, on_green, sg, club, shot_type in approach_shots:
        # Skip TEE shots unless they're par-3 approaches (we can't filter by par here easily,
        # but TEE shots under 250yd are likely par-3 approaches)
        if shot_type == "TEE" and dist > 250:
            continue

        bucket_name = _distance_band(int(dist))
        b = buckets[bucket_name]
        b["shots"] += 1
        if on_green:
            b["gir_count"] += 1
        if sg is not None:
            b["sg_sum"] += sg
        if green_dist is not None:
            b["proximity"].append(green_dist)
        if club:
            b["clubs"][club] += 1

    result = []
    for bucket_name, data in sorted(buckets.items()):
        if data["shots"] < 3:
            continue
        avg_prox = round(sum(data["proximity"]) / len(data["proximity"]), 1) if data["proximity"] else None
        sg_per = round(data["sg_sum"] / data["shots"], 3) if data["shots"] else 0
        primary_club = max(data["clubs"].items(), key=lambda x: x[1])[0] if data["clubs"] else None

        result.append({
            "bucket": bucket_name,
            "shot_count": data["shots"],
            "gir_pct": round(data["gir_count"] / data["shots"] * 100, 1),
            "avg_proximity_yards": avg_prox,
            "sg_per_shot": sg_per,
            "primary_club": primary_club,
            "clubs_used": dict(data["clubs"]),
        })

    # Sort by worst SG (most negative first)
    result.sort(key=lambda x: x["sg_per_shot"])
    return result


def _build_scoring_pattern_analysis(db: Session) -> dict:
    """Scoring pattern analysis: 3-putt rate, scramble, penalties, bogey causes."""
    round_holes = (
        db.query(RoundHole, Round)
        .join(Round, RoundHole.round_id == Round.id)
        .filter(
            Round.exclude_from_stats != True,
            RoundHole.strokes.isnot(None),
            RoundHole.strokes > 0,
        )
        .all()
    )

    if not round_holes:
        return {}

    total_holes = 0
    three_putts = 0
    gir_missed = 0
    scramble_success = 0
    total_penalties = 0
    bogey_plus_count = 0
    bogey_causes = {"tee_miss": 0, "approach_miss": 0, "short_game": 0, "putting": 0}

    # Get par data for bogey cause analysis
    round_ids = list({rh.round_id for rh, r in round_holes})
    course_hole_pars = {}
    for rh, r in round_holes:
        if r.tee_id:
            ch = (
                db.query(CourseHole.par)
                .filter(CourseHole.tee_id == r.tee_id, CourseHole.hole_number == rh.hole_number)
                .first()
            )
            if ch:
                course_hole_pars[(r.id, rh.hole_number)] = ch.par

    for rh, r in round_holes:
        total_holes += 1
        par = course_hole_pars.get((r.id, rh.hole_number), 4)

        # 3-putt rate
        if rh.putts is not None and rh.putts >= 3:
            three_putts += 1

        # Scramble (missed GIR but still made par or better)
        if rh.gir == False:
            gir_missed += 1
            if rh.strokes <= par:
                scramble_success += 1

        # Penalties
        if rh.penalty_strokes:
            total_penalties += rh.penalty_strokes

        # Bogey+ cause analysis
        if rh.strokes > par:
            bogey_plus_count += 1
            # Try to identify primary cause
            if rh.fairway in ("LEFT", "RIGHT") and par >= 4:
                bogey_causes["tee_miss"] += 1
            elif rh.gir == False and rh.putts and rh.putts <= 2:
                bogey_causes["approach_miss"] += 1
            elif rh.putts and rh.putts >= 3:
                bogey_causes["putting"] += 1
            else:
                bogey_causes["short_game"] += 1

    round_count = len(set(rh.round_id for rh, _ in round_holes))
    putt_holes = sum(1 for rh, _ in round_holes if rh.putts is not None)

    return {
        "three_putt_rate": round(three_putts / putt_holes * 100, 1) if putt_holes else 0,
        "scramble_pct": round(scramble_success / gir_missed * 100, 1) if gir_missed else 0,
        "penalties_per_round": round(total_penalties / round_count, 1) if round_count else 0,
        "bogey_plus_count": bogey_plus_count,
        "bogey_causes": {
            k: round(v / bogey_plus_count * 100) if bogey_plus_count else 0
            for k, v in bogey_causes.items()
        },
        "total_holes": total_holes,
        "round_count": round_count,
    }


def _build_player_context(db: Session) -> dict:
    """Extract practice-relevant context from player's post-round notes."""
    recent_rounds = (
        db.query(Round)
        .filter(Round.exclude_from_stats != True)
        .order_by(Round.date.desc())
        .limit(5)
        .all()
    )

    if not recent_rounds:
        return {}

    # Collect text fields
    struggles = []
    goals = []
    next_focuses = []
    energy_ratings = []
    focus_ratings = []

    for r in recent_rounds:
        if r.what_struggled:
            struggles.append(r.what_struggled)
        if r.session_goals:
            goals.append(r.session_goals)
        if r.next_focus:
            next_focuses.append(r.next_focus)
        if r.energy_rating:
            energy_ratings.append(r.energy_rating)
        if r.focus_rating:
            focus_ratings.append(r.focus_rating)

    # Extract keywords from text
    club_keywords = {
        "driver": "Driver", "3 wood": "3 Wood", "5 wood": "5 Wood", "7 wood": "7 Wood",
        "hybrid": "Hybrid", "3 iron": "3 Iron", "4 iron": "4 Iron", "5 iron": "5 Iron",
        "6 iron": "6 Iron", "7 iron": "7 Iron", "8 iron": "8 Iron", "9 iron": "9 Iron",
        "pitching wedge": "Pitching Wedge", "pw": "Pitching Wedge",
        "gap wedge": "Gap Wedge", "gw": "Gap Wedge",
        "sand wedge": "Sand Wedge", "sw": "Sand Wedge",
        "lob wedge": "Lob Wedge", "lw": "Lob Wedge",
        "putter": "Putter", "putting": "Putter",
        "wedge": "wedges", "irons": "mid_irons", "woods": "fairway_woods",
    }
    skill_keywords = {
        "distance": "distance", "accuracy": "accuracy", "dispersion": "spread",
        "spread": "spread", "tempo": "tempo", "alignment": "start_line",
        "trajectory": "trajectory", "speed": "speed_control", "consistency": "consistency",
        "short game": "chipping", "chipping": "chipping", "bunker": "bunker",
        "putting": "lag_putting", "lag": "lag_putting", "3-putt": "lag_putting",
        "fairway": "accuracy", "slice": "accuracy", "hook": "accuracy",
        "swing change": "swing_change", "new swing": "swing_change",
    }

    mentioned_clubs = set()
    mentioned_skills = set()

    all_text = " ".join(struggles + goals + next_focuses).lower()
    for keyword, club in club_keywords.items():
        if keyword in all_text:
            mentioned_clubs.add(club)
    for keyword, skill in skill_keywords.items():
        if keyword in all_text:
            mentioned_skills.add(skill)

    return {
        "recent_struggles": struggles,
        "recent_goals": goals,
        "recent_next_focus": next_focuses,
        "mentioned_clubs": list(mentioned_clubs),
        "mentioned_skills": list(mentioned_skills),
        "avg_energy": round(sum(energy_ratings) / len(energy_ratings), 1) if energy_ratings else None,
        "avg_focus": round(sum(focus_ratings) / len(focus_ratings), 1) if focus_ratings else None,
        "has_notes": bool(struggles or goals or next_focuses),
    }


def _build_range_swing_analysis(db: Session) -> dict:
    """Per-club swing analysis from Trackman data."""
    result = {}

    # Trackman aggregate per club
    tm_agg = (
        db.query(
            TrackmanShot.club_id,
            sql_func.avg(TrackmanShot.club_speed_mph),
            sql_func.avg(TrackmanShot.ball_speed_mph),
            sql_func.avg(TrackmanShot.smash_factor),
            sql_func.avg(TrackmanShot.attack_angle_deg),
            sql_func.avg(TrackmanShot.launch_angle_deg),
            sql_func.avg(TrackmanShot.spin_rate_rpm),
            sql_func.avg(TrackmanShot.impact_offset_in),
            sql_func.avg(TrackmanShot.impact_height_in),
            sql_func.count(),
        )
        .filter(TrackmanShot.club_id.isnot(None))
        .group_by(TrackmanShot.club_id)
        .all()
    )

    # Also get spin std dev per club (need separate query)
    tm_spin_std = {}
    spin_rows = (
        db.query(TrackmanShot.club_id, TrackmanShot.spin_rate_rpm)
        .filter(TrackmanShot.club_id.isnot(None), TrackmanShot.spin_rate_rpm.isnot(None))
        .all()
    )
    spin_by_club = defaultdict(list)
    for club_id, spin in spin_rows:
        spin_by_club[club_id].append(spin)

    import statistics as stats_mod
    for club_id, spins in spin_by_club.items():
        if len(spins) >= 3:
            tm_spin_std[club_id] = round(stats_mod.stdev(spins))

    clubs = db.query(Club).all()
    club_id_to_name = {c.id: c.club_type for c in clubs}

    SMASH_THRESHOLDS = {"Driver": 1.44, "3 Wood": 1.42, "5 Wood": 1.40}
    DEFAULT_SMASH_THRESHOLD = 1.35

    for club_id, cs, bs, sf, aa, la, sr, io, ih, count in tm_agg:
        if count < 5:
            continue
        club_name = club_id_to_name.get(club_id)
        if not club_name:
            continue

        flags = []

        # Smash factor check
        smash_threshold = SMASH_THRESHOLDS.get(club_name, DEFAULT_SMASH_THRESHOLD)
        if sf and sf < smash_threshold:
            flags.append("low_smash")

        # Spin variability
        spin_std = tm_spin_std.get(club_id, 0)
        if spin_std > 500:
            flags.append("high_spin_variability")

        # Attack angle checks (driver should be positive, irons negative)
        if aa is not None:
            if club_name == "Driver" and aa < -2:
                flags.append("steep_attack_driver")
            elif club_name != "Driver" and "Wood" not in club_name and aa > 0:
                flags.append("shallow_attack_iron")

        # Impact pattern
        impact_pattern = "centered"
        if io is not None:
            if io > 0.3:
                impact_pattern = "toe_heavy"
                flags.append("toe_strikes")
            elif io < -0.3:
                impact_pattern = "heel_heavy"
                flags.append("heel_strikes")

        result[club_name] = {
            "avg_club_speed": round(cs, 1) if cs else None,
            "avg_ball_speed": round(bs, 1) if bs else None,
            "smash_factor": round(sf, 3) if sf else None,
            "avg_attack_angle": round(aa, 1) if aa else None,
            "avg_launch_angle": round(la, 1) if la else None,
            "spin_rate_avg": round(sr) if sr else None,
            "spin_rate_std": spin_std,
            "impact_pattern": impact_pattern,
            "flags": flags,
            "sample": count,
        }

    return result


# ── Step 2: Weakness profile ──────────────────────────────────────────

def _build_weakness_profile(profile: dict) -> list[dict]:
    """Rank SG categories and clubs by weakness severity."""
    all_shots = profile["all_shots"]
    recent_shots = profile["recent_shots"]
    club_stats = profile["club_stats"]
    miss_analysis = profile.get("miss_analysis", {})
    swing_analysis = profile.get("swing_analysis", {})

    # Aggregate SG by category — overall
    overall_by_cat = _aggregate_sg_by_category(all_shots)
    # Aggregate SG by category — recent (last 5 rounds)
    recent_by_cat = _aggregate_sg_by_category(recent_shots)

    # Aggregate SG by club within each category
    club_sg = _aggregate_sg_by_club(all_shots)

    weaknesses = []
    for cat in CATEGORIES:
        ov = overall_by_cat.get(cat, {})
        rec = recent_by_cat.get(cat, {})

        overall_per_round = ov.get("sg_per_round", 0.0)
        recent_per_round = rec.get("sg_per_round", 0.0)

        # Trend detection
        diff = recent_per_round - overall_per_round
        if diff < -0.2:
            trend = "declining"
        elif diff > 0.2:
            trend = "improving"
        else:
            trend = "stable"

        # Worst clubs in this category — attach miss + swing data
        cat_clubs = club_sg.get(cat, [])
        cat_clubs.sort(key=lambda x: x["sg_per_shot"])
        worst_clubs = []
        for cc in cat_clubs[:3]:
            club_entry = dict(cc)  # copy
            club_entry["miss_data"] = miss_analysis.get(cc["club_name"])
            club_entry["swing_data"] = swing_analysis.get(cc["club_name"])
            worst_clubs.append(club_entry)

        # Range-course gaps for clubs in this category
        gaps = []
        for cc in cat_clubs:
            club_name = cc["club_name"]
            # Find matching club stats
            for cid, cs in club_stats.items():
                if cs["club_name"] == club_name or cs["display_name"] == club_name:
                    if cs["course_avg"] and cs["range_avg"]:
                        gap = round(cs["range_avg"] - cs["course_avg"], 1)
                        if abs(gap) >= 3:  # only flag meaningful gaps
                            gaps.append({
                                "club_id": cid,
                                "club_name": cs["display_name"],
                                "range_avg": cs["range_avg"],
                                "course_avg": cs["course_avg"],
                                "gap": gap,
                            })
                    break

        weaknesses.append({
            "category": cat,
            "label": CATEGORY_LABELS[cat],
            "overall_per_round": round(overall_per_round, 2),
            "recent_per_round": round(recent_per_round, 2),
            "overall_per_shot": round(ov.get("sg_per_shot", 0.0), 3),
            "shot_count": ov.get("shot_count", 0),
            "round_count": ov.get("round_count", 0),
            "trend": trend,
            "worst_clubs": worst_clubs,
            "range_course_gaps": gaps,
        })

    # Sort by severity (most negative per-round first)
    weaknesses.sort(key=lambda x: x["overall_per_round"])

    return weaknesses


def _aggregate_sg_by_category(shots: list[dict]) -> dict:
    """Aggregate SG values by category."""
    by_cat = defaultdict(lambda: {"total_sg": 0.0, "shot_count": 0, "round_ids": set()})
    for s in shots:
        cat = s["category"]
        by_cat[cat]["total_sg"] += s["sg_pga_value"]
        by_cat[cat]["shot_count"] += 1
        by_cat[cat]["round_ids"].add(s["round_id"])

    result = {}
    for cat, data in by_cat.items():
        n_rounds = len(data["round_ids"])
        n_shots = data["shot_count"]
        result[cat] = {
            "sg_total": round(data["total_sg"], 2),
            "sg_per_round": round(data["total_sg"] / n_rounds, 2) if n_rounds else 0.0,
            "sg_per_shot": round(data["total_sg"] / n_shots, 3) if n_shots else 0.0,
            "shot_count": n_shots,
            "round_count": n_rounds,
        }
    return result


def _aggregate_sg_by_club(shots: list[dict]) -> dict[str, list[dict]]:
    """Aggregate SG by club within each category."""
    by_cat_club = defaultdict(lambda: defaultdict(lambda: {"total_sg": 0.0, "count": 0}))
    for s in shots:
        cat = s["category"]
        club = s["club_name"]
        if club:
            by_cat_club[cat][club]["total_sg"] += s["sg_pga_value"]
            by_cat_club[cat][club]["count"] += 1

    result = {}
    for cat, clubs in by_cat_club.items():
        club_list = []
        for club_name, data in clubs.items():
            club_list.append({
                "club_name": club_name,
                "sg_per_shot": round(data["total_sg"] / data["count"], 3) if data["count"] else 0,
                "sg_total": round(data["total_sg"], 2),
                "shot_count": data["count"],
            })
        result[cat] = club_list
    return result


# ── Step 3: Course needs ──────────────────────────────────────────────

def _build_course_needs(db: Session, round_plan_id: int) -> Optional[dict]:
    """Analyze a round plan to identify course-specific practice needs."""
    plan = (
        db.query(RoundPlan)
        .options(joinedload(RoundPlan.holes).joinedload(RoundPlanHole.shots))
        .filter(RoundPlan.id == round_plan_id)
        .first()
    )
    if not plan:
        return None

    # Get course info
    course = db.query(Course).filter(Course.id == plan.course_id).first()
    golf_club = db.query(GolfClub).filter(GolfClub.id == course.golf_club_id).first() if course else None
    course_name = golf_club.name if golf_club else "Unknown"
    if course and course.name:
        course_name = f"{golf_club.name} — {course.name}" if golf_club else course.name

    # Get course holes for yardage info
    course_holes = (
        db.query(CourseHole)
        .filter(CourseHole.tee_id == plan.tee_id)
        .all()
    )
    hole_info = {ch.hole_number: {"par": ch.par, "yardage": ch.yardage} for ch in course_holes}

    # Count planned club usage
    club_frequency = defaultdict(int)
    for hole in plan.holes:
        for shot in (hole.shots or []):
            if shot.club:
                club_frequency[shot.club] += 1

    # Group approach distances into bands
    distance_bands = defaultdict(lambda: {"count": 0, "clubs": defaultdict(int)})
    for hole in plan.holes:
        hi = hole_info.get(hole.hole_number, {})
        par = hi.get("par", 4)
        yardage = hi.get("yardage")
        if not yardage:
            continue

        # For par 3s, the tee shot IS the approach
        if par == 3:
            band = _distance_band(yardage)
            distance_bands[band]["count"] += 1
            # Find planned tee club
            tee_shot = next((s for s in (hole.shots or []) if s.shot_number == 1), None)
            if tee_shot and tee_shot.club:
                distance_bands[band]["clubs"][tee_shot.club] += 1

        # For par 4s/5s, estimate approach distance from planned shots
        elif len(hole.shots or []) >= 2:
            # If there are planned shots, the 2nd shot on par 4 is typically the approach
            for shot in (hole.shots or []):
                if shot.shot_number >= 2 and shot.club:
                    # Estimate distance from club stats or hole yardage
                    est_distance = _estimate_approach_distance(yardage, par, shot.shot_number)
                    if est_distance:
                        band = _distance_band(est_distance)
                        distance_bands[band]["count"] += 1
                        distance_bands[band]["clubs"][shot.club] += 1

    # Format distance bands
    bands_list = []
    for band_name, data in sorted(distance_bands.items()):
        primary_club = max(data["clubs"].items(), key=lambda x: x[1])[0] if data["clubs"] else None
        bands_list.append({
            "range": band_name,
            "count": data["count"],
            "primary_club": primary_club,
        })

    return {
        "course_name": course_name,
        "plan_name": plan.name,
        "club_frequency": dict(club_frequency),
        "distance_bands": bands_list,
        "total_holes": len(plan.holes),
    }


def _distance_band(yards: int) -> str:
    """Map a distance to a band label."""
    if yards < 100:
        return "Under 100"
    elif yards < 130:
        return "100-130"
    elif yards < 150:
        return "130-150"
    elif yards < 170:
        return "150-170"
    elif yards < 190:
        return "170-190"
    elif yards < 210:
        return "190-210"
    else:
        return "210+"


def _estimate_approach_distance(hole_yardage: int, par: int, shot_number: int) -> Optional[int]:
    """Rough estimate of approach distance based on hole yardage and par."""
    if par == 4 and shot_number == 2:
        # Assume ~240yd drive on par 4
        return max(hole_yardage - 240, 50)
    elif par == 5 and shot_number == 2:
        # Lay-up or long approach
        return max(hole_yardage - 240, 100)
    elif par == 5 and shot_number == 3:
        # Wedge approach
        return max(hole_yardage - 480, 50)
    return None


# ── Step 4 & 5: Allocate and generate ─────────────────────────────────

def _allocate_sessions(
    db: Session,
    sessions_spec: list[dict],
    weaknesses: list[dict],
    course_needs: Optional[dict],
    plan_type: str,
    profile: dict,
    focus_tags: Optional[list[str]] = None,
) -> list[dict]:
    """Allocate practice activities across sessions."""
    result = []

    for i, spec in enumerate(sessions_spec):
        session_type = spec["session_type"]
        ball_count = spec.get("ball_count")
        duration_minutes = spec.get("duration_minutes")
        capabilities = SESSION_CAPABILITIES.get(session_type, set())

        is_time_based = duration_minutes is not None and ball_count is None

        # Filter weaknesses to what this session can address
        applicable = [w for w in weaknesses if w["category"] in capabilities]
        if not applicable:
            # Fallback: just do general work with the categories available
            applicable = [{"category": cat, "label": CATEGORY_LABELS[cat],
                          "overall_per_round": 0, "worst_clubs": [], "range_course_gaps": [],
                          "trend": "stable", "shot_count": 0}
                         for cat in capabilities]

        activities = _generate_session_activities(
            db=db,
            session_type=session_type,
            ball_count=ball_count,
            duration_minutes=duration_minutes,
            is_time_based=is_time_based,
            weaknesses=applicable,
            course_needs=course_needs,
            plan_type=plan_type,
            profile=profile,
            focus_tags=focus_tags,
        )

        result.append({
            "session_order": i + 1,
            "session_type": session_type,
            "ball_count": ball_count,
            "duration_minutes": duration_minutes,
            "activities": activities,
        })

    return result


def _generate_session_activities(
    db: Session,
    session_type: str,
    ball_count: Optional[int],
    duration_minutes: Optional[int],
    is_time_based: bool,
    weaknesses: list[dict],
    course_needs: Optional[dict],
    plan_type: str,
    profile: dict,
    focus_tags: Optional[list[str]] = None,
) -> list[dict]:
    """Generate ordered activities for a single session."""
    activities = []
    total = duration_minutes if is_time_based else (ball_count or 60)
    unit = "minutes" if is_time_based else "balls"
    min_per_activity = MIN_MINUTES_PER_ACTIVITY if is_time_based else MIN_BALLS_PER_ACTIVITY

    # Reserve warm-up
    warmup_amount = max(min_per_activity, int(total * WARMUP_FRACTION))
    remaining = total - warmup_amount

    # Add warm-up activity
    warmup_club = _pick_warmup_club(session_type, profile)
    activities.append({
        "activity_order": 1,
        "club": warmup_club["name"] if warmup_club else None,
        "club_id": warmup_club["id"] if warmup_club else None,
        "ball_count": warmup_amount if not is_time_based else None,
        "duration_minutes": warmup_amount if is_time_based else None,
        "focus_area": "warm_up",
        "sg_category": None,
        "rationale": "Start with a comfortable club to find your rhythm before focused work.",
        "target_metric": None,
        "notes": None,
    })

    # Build allocation buckets
    buckets = _build_allocation_buckets(weaknesses, course_needs, plan_type, session_type, profile)

    # Apply tag weights
    if focus_tags:
        buckets = _apply_tag_weights(buckets, focus_tags, profile, session_type)

    if not buckets:
        return activities

    # Calculate severity weights for proportional allocation
    total_weight = sum(b["weight"] for b in buckets)
    if total_weight <= 0:
        total_weight = len(buckets)
        for b in buckets:
            b["weight"] = 1.0

    # Allocate remaining to buckets proportionally
    allocated_buckets = []
    for bucket in buckets:
        fraction = bucket["weight"] / total_weight
        amount = int(remaining * fraction)
        if amount >= min_per_activity:
            allocated_buckets.append({**bucket, "amount": amount})

    # Redistribute any remainder to the largest bucket
    total_allocated = sum(b["amount"] for b in allocated_buckets)
    leftover = remaining - total_allocated
    if leftover > 0 and allocated_buckets:
        allocated_buckets[0]["amount"] += leftover

    # Convert buckets to activities with drill recommendations
    order = 2
    for bucket in allocated_buckets:
        club_info = bucket.get("club_info")
        club_name = club_info["name"] if club_info else bucket.get("club_name")

        # Look up a matching drill using analysis data
        drill = _find_drill(
            db,
            bucket["sg_category"] or "approach",
            bucket["focus_area"],
            club_name,
            session_type,
            miss_data=bucket.get("miss_data"),
            swing_data=bucket.get("swing_data"),
        )

        rationale = bucket["rationale"]
        drill_notes = None
        target = bucket.get("target_metric")

        drill_id = None
        drill_name = None
        if drill:
            drill_id = drill.get("id")
            drill_name = drill.get("name")
            drill_notes = f"**{drill['name']}**: {drill['description']}"
            if drill.get("target") and not target:
                target = drill["target"]

        activities.append({
            "activity_order": order,
            "club": club_name,
            "club_id": club_info["id"] if club_info else None,
            "drill_id": drill_id,
            "drill_name": drill_name,
            "ball_count": bucket["amount"] if not is_time_based else None,
            "duration_minutes": bucket["amount"] if is_time_based else None,
            "focus_area": bucket["focus_area"],
            "sg_category": bucket["sg_category"],
            "rationale": rationale,
            "target_metric": target,
            "notes": drill_notes,
        })
        order += 1

    return activities


def _build_allocation_buckets(
    weaknesses: list[dict],
    course_needs: Optional[dict],
    plan_type: str,
    session_type: str,
    profile: dict,
) -> list[dict]:
    """Build weighted allocation buckets from weaknesses and course needs."""
    buckets = []
    capabilities = SESSION_CAPABILITIES.get(session_type, set())
    club_stats = profile["club_stats"]

    if plan_type == "round_prep" and course_needs:
        # 60% course-specific, 40% weakness-driven
        course_buckets = _course_specific_buckets(course_needs, capabilities, profile)
        weakness_buckets = _weakness_driven_buckets(weaknesses, capabilities, profile)

        # Scale weights
        for b in course_buckets:
            b["weight"] *= 0.6
        for b in weakness_buckets:
            b["weight"] *= 0.4

        buckets = course_buckets + weakness_buckets
    else:
        # 100% weakness-driven
        buckets = _weakness_driven_buckets(weaknesses, capabilities, profile)

    # Deduplicate: if same club appears in multiple buckets, merge them
    merged = {}
    for b in buckets:
        key = (b.get("club_name", ""), b["sg_category"], b["focus_area"])
        if key in merged:
            merged[key]["weight"] += b["weight"]
            # Keep the more specific rationale
            if len(b["rationale"]) > len(merged[key]["rationale"]):
                merged[key]["rationale"] = b["rationale"]
        else:
            merged[key] = b

    result = list(merged.values())
    result.sort(key=lambda x: -x["weight"])

    # Cap at 6 activities per session (plus warm-up)
    return result[:6]


def _course_specific_buckets(
    course_needs: dict,
    capabilities: set,
    profile: dict,
) -> list[dict]:
    """Generate buckets from round plan course needs."""
    buckets = []
    club_stats = profile["club_stats"]
    clubs = profile["clubs"]

    # Most-used clubs in the plan
    for club_name, count in sorted(course_needs["club_frequency"].items(), key=lambda x: -x[1]):
        # Determine which SG category this club falls into
        sg_cat = _club_to_sg_category(club_name)
        if sg_cat not in capabilities:
            continue

        # Find club info
        club_info = _find_club_by_name(club_name, profile)
        stats = club_stats.get(club_info["id"]) if club_info else None

        target_metric = None
        if stats and stats.get("combined_p10") and stats.get("combined_p90"):
            target_metric = f"carry {stats['combined_p10']:.0f}-{stats['combined_p90']:.0f}yd"

        focus = "distance_control" if sg_cat == "approach" else "accuracy"

        rationale = (
            f"{club_name} is planned for {count} holes at {course_needs['course_name']}."
        )
        # Add gap info if available
        if stats and stats.get("range_avg") and stats.get("course_avg"):
            gap = stats["range_avg"] - stats["course_avg"]
            if abs(gap) >= 3:
                rationale += f" Range avg {stats['range_avg']:.0f}yd vs course avg {stats['course_avg']:.0f}yd ({gap:+.0f}yd gap)."

        buckets.append({
            "club_name": club_name,
            "club_info": club_info,
            "sg_category": sg_cat,
            "focus_area": focus,
            "weight": count * 2.0,  # Weight by frequency
            "rationale": rationale,
            "target_metric": target_metric,
        })

    return buckets[:4]  # Top 4 course-specific


def _weakness_driven_buckets(
    weaknesses: list[dict],
    capabilities: set,
    profile: dict,
) -> list[dict]:
    """Generate buckets from SG weakness analysis."""
    buckets = []
    club_stats = profile["club_stats"]
    scoring_patterns = profile.get("scoring_patterns", {})

    for w in weaknesses:
        if w["category"] not in capabilities:
            continue

        severity = abs(w["overall_per_round"])
        if severity < 0.05 and not w["worst_clubs"]:
            continue

        # Use worst club in this category if available
        if w["worst_clubs"]:
            worst = w["worst_clubs"][0]
            club_info = _find_club_by_name(worst["club_name"], profile)
            stats = club_stats.get(club_info["id"]) if club_info else None

            # Smart focus area selection using decision tree
            focus = _decide_focus_area(w["category"], worst, w["range_course_gaps"], club_info, scoring_patterns)

            # Build rationale from all available data
            rationale_parts = []
            rationale_parts.append(
                f"Your {worst['club_name']} {w['label']} SG is {worst['sg_per_shot']:+.3f}/shot "
                f"({worst['shot_count']} shots)."
            )

            # Add gap info
            for gap in w["range_course_gaps"]:
                if gap["club_name"] == (club_info["name"] if club_info else ""):
                    rationale_parts.append(f"Range: {gap['range_avg']:.0f}yd vs course: {gap['course_avg']:.0f}yd ({gap['gap']:+.0f}yd gap).")
                    break

            # Add miss direction info
            miss_data = worst.get("miss_data")
            if miss_data and miss_data.get("course_miss") and miss_data["course_miss"].get("dominant"):
                cm = miss_data["course_miss"]
                rationale_parts.append(f"Misses {cm['dominant']} {cm['left_pct'] if cm['dominant'] == 'left' else cm['right_pct']}% of the time, avg {cm['avg_miss_yards']}yd off center.")

            # Add swing flags
            swing_data = worst.get("swing_data")
            if swing_data and swing_data.get("flags"):
                flag_msgs = {
                    "low_smash": "Contact quality below optimal (smash factor).",
                    "high_spin_variability": "Inconsistent spin — face control issue.",
                    "steep_attack_driver": f"Attack angle {swing_data.get('avg_attack_angle', 0):.1f}° too steep for driver.",
                    "toe_strikes": "Strike pattern trending toward toe.",
                    "heel_strikes": "Strike pattern trending toward heel.",
                }
                for flag in swing_data["flags"][:2]:
                    if flag in flag_msgs:
                        rationale_parts.append(flag_msgs[flag])

            # Trend
            if w["trend"] == "declining":
                rationale_parts.append("Trend: declining recently.")
            elif w["trend"] == "improving":
                rationale_parts.append("Trend: improving — keep it up.")

            target_metric = None
            if stats and stats.get("combined_p10") and stats.get("combined_p90"):
                target_metric = f"carry {stats['combined_p10']:.0f}-{stats['combined_p90']:.0f}yd"

            buckets.append({
                "club_name": worst["club_name"],
                "club_info": club_info,
                "sg_category": w["category"],
                "focus_area": focus,
                "weight": severity * 10,
                "rationale": " ".join(rationale_parts),
                "target_metric": target_metric,
                "miss_data": miss_data,
                "swing_data": swing_data,
            })
        else:
            # Category-level bucket without specific club
            focus = CATEGORY_FOCUS_AREAS[w["category"]][0]
            rationale = (
                f"{w['label']} SG is {w['overall_per_round']:+.2f}/round. "
                f"Work on general {focus.replace('_', ' ')}."
            )

            buckets.append({
                "club_name": None,
                "club_info": None,
                "sg_category": w["category"],
                "focus_area": focus,
                "weight": max(severity * 10, 1.0),
                "rationale": rationale,
                "target_metric": None,
            })

    return buckets


# ── Tag weighting ──────────────────────────────────────────────────────

def _apply_tag_weights(
    buckets: list[dict],
    focus_tags: list[str],
    profile: dict,
    session_type: str,
) -> list[dict]:
    """Apply focus tag boosts to allocation buckets."""
    if not focus_tags or not buckets:
        return buckets

    # Parse tags into club names and skill overrides
    tagged_club_names = set()
    for tag in focus_tags:
        tag_lower = tag.lower().replace(" ", "_")
        if tag_lower in CLUB_TAG_MAP:
            tagged_club_names.update(CLUB_TAG_MAP[tag_lower])

    skill_override = None
    for tag in focus_tags:
        tag_lower = tag.lower().replace(" ", "_")
        if tag_lower in SKILL_TAG_MAP:
            skill_override = SKILL_TAG_MAP[tag_lower]
            break  # use first matching skill tag

    # Check for situational tags
    situational = {}
    for tag in focus_tags:
        tag_lower = tag.lower().replace(" ", "_")
        if tag_lower in SITUATIONAL_TAGS:
            situational.update(SITUATIONAL_TAGS[tag_lower])

    # Boost buckets matching tagged clubs — very aggressive boost
    any_club_matched = False
    for bucket in buckets:
        club_name = bucket.get("club_name") or ""
        if club_name in tagged_club_names:
            bucket["weight"] = max(bucket["weight"] * 5.0, 20.0)
            any_club_matched = True
            if skill_override:
                bucket["focus_area"] = skill_override
                bucket["rationale"] = f"Focus tag: {club_name} — {skill_override.replace('_', ' ')}. " + bucket.get("rationale", "")

    # If club tags were specified but no existing bucket matched, create new buckets
    # Also create if only some tagged clubs matched — ensure ALL tagged clubs are represented
    capabilities = SESSION_CAPABILITIES.get(session_type, set())
    matched_club_names = {b.get("club_name") for b in buckets if b.get("club_name") in tagged_club_names}
    missing_club_names = tagged_club_names - matched_club_names
    if missing_club_names:
        for club_name in missing_club_names:
            club_info = _find_club_by_name(club_name, profile)
            if not club_info:
                continue
            sg_cat = _club_to_sg_category(club_name)
            if sg_cat not in capabilities:
                continue
            focus = skill_override or "distance_control"
            stats = profile["club_stats"].get(club_info["id"])
            target_metric = None
            if stats and stats.get("combined_p10") and stats.get("combined_p90"):
                target_metric = f"carry {stats['combined_p10']:.0f}-{stats['combined_p90']:.0f}yd"

            # Build rationale from stats if available
            rationale = f"Focus tag: {club_name} — {focus.replace('_', ' ')}."
            if stats:
                if stats.get("range_avg") and stats.get("course_avg"):
                    gap = stats["range_avg"] - stats["course_avg"]
                    rationale += f" Range: {stats['range_avg']:.0f}yd vs course: {stats['course_avg']:.0f}yd ({gap:+.0f}yd gap)."
                elif stats.get("combined_avg"):
                    rationale += f" Avg carry: {stats['combined_avg']:.0f}yd."

            buckets.append({
                "club_name": club_name,
                "club_info": club_info,
                "sg_category": sg_cat,
                "focus_area": focus,
                "weight": 25.0,  # very high weight — user explicitly asked for this
                "rationale": rationale,
                "target_metric": target_metric,
            })

    # When club tags are specified, demote non-tagged club buckets
    if tagged_club_names:
        for bucket in buckets:
            club_name = bucket.get("club_name") or ""
            if club_name not in tagged_club_names:
                bucket["weight"] *= 0.3  # significantly reduce non-tagged clubs

    # Apply skill override to non-club-tagged buckets too
    if skill_override and not tagged_club_names:
        for bucket in buckets:
            bucket["focus_area"] = skill_override

    # Situational: scoring_zones forces certain categories
    if "force_categories" in situational:
        forced = set(situational["force_categories"])
        for bucket in buckets:
            if bucket["sg_category"] in forced:
                bucket["weight"] *= 2.0
            else:
                bucket["weight"] *= 0.3

    # Situational: swing_change reduces variety
    if "max_clubs" in situational:
        max_clubs = situational["max_clubs"]
        buckets.sort(key=lambda x: -x["weight"])
        buckets = buckets[:max_clubs]
        reps_mult = situational.get("reps_multiplier", 1.0)
        for b in buckets:
            b["weight"] *= reps_mult
            b["rationale"] = "Swing change: deep reps with fewer clubs. " + b.get("rationale", "")

    # Situational: trouble_shots forces specific focus areas
    if "force_focus" in situational:
        forced_focus = set(situational["force_focus"])
        for bucket in buckets:
            if bucket["focus_area"] in forced_focus:
                bucket["weight"] *= 2.5

    # Re-sort by weight
    buckets.sort(key=lambda x: -x["weight"])
    return buckets[:6]


def _generate_surprise_tags(db: Session) -> list[str]:
    """Generate random focus tags for 'surprise me' mode."""
    # Pick a random club tag
    club_tags = list(CLUB_TAG_MAP.keys())
    chosen_club = random.choice(club_tags)

    # Pick a random skill tag
    skill_tags = list(SKILL_TAG_MAP.keys())
    chosen_skill = random.choice(skill_tags)

    return [chosen_club, chosen_skill]


# ── Helpers ────────────────────────────────────────────────────────────

def _pick_warmup_club(session_type: str, profile: dict) -> Optional[dict]:
    """Pick a comfortable warm-up club based on session type."""
    clubs = profile["clubs"]
    club_stats = profile["club_stats"]

    # Prefer mid-irons for range, wedges for short game
    preferred_types = {
        "trackman_range": ["Pitching Wedge", "9 Iron", "8 Iron", "7 Iron"],
        "outdoor_range": ["Pitching Wedge", "9 Iron", "8 Iron", "7 Iron"],
        "simulator": ["Pitching Wedge", "9 Iron", "8 Iron"],
        "home_net": ["8 Iron", "9 Iron", "Pitching Wedge", "7 Iron"],
        "short_game_area": ["Pitching Wedge", "Sand Wedge", "Gap Wedge"],
        "putting_green": [],
    }

    for pref in preferred_types.get(session_type, []):
        for cid, c in clubs.items():
            if c.club_type == pref and not c.retired:
                return {"id": cid, "name": c.club_type}

    # Fallback: any non-retired club with stats
    for cid, cs in club_stats.items():
        if cs.get("combined_avg"):
            return {"id": cid, "name": cs["club_name"]}

    return None


def _find_club_by_name(name: str, profile: dict) -> Optional[dict]:
    """Find a club by display name or type."""
    for cid, c in profile["clubs"].items():
        if c.club_type == name or c.name == name:
            return {"id": cid, "name": c.club_type}
    return None


def _club_to_sg_category(club_name: str) -> str:
    """Map a club name to its primary SG category."""
    name_lower = club_name.lower()
    if "driver" in name_lower:
        return "off_the_tee"
    if "putter" in name_lower:
        return "putting"
    if any(w in name_lower for w in ["lob", "sand", "gap"]) or "wedge" in name_lower:
        # Wedges can be approach or short game — default to approach for plan context
        return "approach"
    if any(w in name_lower for w in ["wood", "hybrid"]):
        return "off_the_tee"
    # Irons are approach
    return "approach"


# ── Analysis summary ──────────────────────────────────────────────────

def _build_analysis_summary(
    db: Session,
    profile: dict,
    weaknesses: list[dict],
    course_needs: Optional[dict],
) -> dict:
    """Build the analysis summary for the UI."""
    # SG by category
    sg_summary = []
    for w in weaknesses:
        sg_summary.append({
            "category": w["category"],
            "label": w["label"],
            "sg_per_round": w["overall_per_round"],
            "sg_per_shot": w.get("overall_per_shot", 0),
            "recent_sg_per_round": w["recent_per_round"],
            "trend": w["trend"],
            "shot_count": w["shot_count"],
        })

    # Range-course gaps (all clubs, deduplicated by club_id)
    all_gaps = []
    seen_club_ids = set()
    for w in weaknesses:
        for gap in w["range_course_gaps"]:
            if gap["club_id"] not in seen_club_ids:
                seen_club_ids.add(gap["club_id"])
                all_gaps.append(gap)
    all_gaps.sort(key=lambda x: -abs(x["gap"]))

    # Miss direction highlights (clubs with dominant miss)
    miss_highlights = []
    miss_analysis = profile.get("miss_analysis", {})
    for club_name, data in miss_analysis.items():
        cm = data.get("course_miss")
        if cm and cm.get("dominant") and cm.get("sample", 0) >= 5:
            miss_highlights.append({
                "club": club_name,
                "dominant": cm["dominant"],
                "pct": cm["left_pct"] if cm["dominant"] == "left" else cm["right_pct"],
                "avg_miss_yards": cm["avg_miss_yards"],
                "sample": cm["sample"],
            })
    miss_highlights.sort(key=lambda x: -x["pct"])

    # Worst proximity bucket
    proximity = profile.get("proximity_analysis", [])
    worst_proximity = proximity[0] if proximity else None  # already sorted by worst SG

    # Scoring patterns
    scoring = profile.get("scoring_patterns", {})

    # Player context
    player_ctx = profile.get("player_context", {})

    # Gap trending — add trend to each gap
    try:
        from app.services.club_stats_service import compute_windowed_club_stats
        recent_course = compute_windowed_club_stats(db, "rounds", 5)
        recent_range = compute_windowed_club_stats(db, "sessions", 3)
        for gap in all_gaps:
            cid = gap["club_id"]
            rc = recent_course.get(cid, {})
            rr = recent_range.get(cid, {})
            if rc.get("avg_yards") and rr.get("avg_yards"):
                recent_gap = abs(rr["avg_yards"] - rc["avg_yards"])
                overall_gap = abs(gap["gap"])
                if recent_gap < overall_gap - 2:
                    gap["trend"] = "closing"
                elif recent_gap > overall_gap + 2:
                    gap["trend"] = "widening"
                else:
                    gap["trend"] = "stable"
            else:
                gap["trend"] = None
    except Exception:
        pass  # don't break if windowed stats fail

    return {
        "sg_by_category": sg_summary,
        "range_course_gaps": all_gaps[:5],
        "course_needs": course_needs,
        "total_rounds": profile["total_rounds"],
        "miss_highlights": miss_highlights[:3],
        "worst_proximity_bucket": worst_proximity,
        "scoring_patterns": scoring,
        "player_context": {
            "mentioned_clubs": player_ctx.get("mentioned_clubs", []),
            "mentioned_skills": player_ctx.get("mentioned_skills", []),
            "recent_struggles": player_ctx.get("recent_struggles", []),
            "has_notes": player_ctx.get("has_notes", False),
        } if player_ctx else None,
    }
