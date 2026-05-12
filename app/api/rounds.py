from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from datetime import date
from statistics import median
from typing import Optional

from app.database import get_db
from app.models import Round, RoundHole, Shot, CourseHole

router = APIRouter(prefix="/api/rounds", tags=["rounds"])


# --- Pydantic response schemas ---

class ShotResponse(BaseModel):
    id: int
    shot_number: int
    club: Optional[str] = None
    shot_type: Optional[str] = None
    start_lie: Optional[str] = None
    end_lie: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    distance_yards: Optional[float] = None
    # Computed spatial metrics
    pin_distance_yards: Optional[float] = None
    fairway_side: Optional[str] = None
    fairway_side_yards: Optional[float] = None
    fairway_progress_yards: Optional[float] = None
    nearest_hazard_type: Optional[str] = None
    nearest_hazard_name: Optional[str] = None
    nearest_hazard_yards: Optional[float] = None
    green_distance_yards: Optional[float] = None
    on_green: Optional[bool] = None
    sg_pga: Optional[float] = None
    sg_personal: Optional[float] = None

    class Config:
        from_attributes = True


class RoundHoleResponse(BaseModel):
    id: int
    hole_number: int
    strokes: Optional[int] = None
    handicap_strokes: Optional[int] = None
    putts: Optional[int] = None
    fairway: Optional[str] = None
    gir: Optional[bool] = None
    penalty_strokes: int = 0
    shots: list[ShotResponse] = []

    class Config:
        from_attributes = True


class RoundSummaryResponse(BaseModel):
    id: int
    garmin_id: Optional[int] = None
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    tee_name: Optional[str] = None
    tee_id: Optional[int] = None
    date: date
    holes_completed: Optional[int] = None
    total_strokes: Optional[int] = None
    score_vs_par: Optional[int] = None
    course_rating: Optional[float] = None
    slope_rating: Optional[float] = None
    shots_tracked: Optional[int] = None
    source: Optional[str] = None
    exclude_from_stats: bool = False
    game_format: Optional[str] = None

    class Config:
        from_attributes = True


class RoundDetailResponse(RoundSummaryResponse):
    handicapped_strokes: Optional[int] = None
    player_handicap: Optional[float] = None
    session_type: Optional[str] = None
    game_format: Optional[str] = None
    weather_temp_f: Optional[float] = None
    weather_description: Optional[str] = None
    overall_rating: Optional[int] = None
    key_takeaway: Optional[str] = None
    holes: list[RoundHoleResponse] = []

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("/", response_model=list[RoundSummaryResponse])
def list_rounds(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    rounds = (db.query(Round)
              .order_by(Round.date.desc())
              .offset(skip).limit(limit)
              .all())

    results = []
    for r in rounds:
        results.append(RoundSummaryResponse(
            id=r.id,
            garmin_id=r.garmin_id,
            course_id=r.course_id,
            course_name=r.course.display_name if r.course else None,
            tee_name=r.tee.tee_name if r.tee_id and r.tee else None,
            tee_id=r.tee_id,
            date=r.date,
            holes_completed=r.holes_completed,
            total_strokes=r.total_strokes,
            score_vs_par=r.score_vs_par,
            course_rating=r.course_rating,
            slope_rating=r.slope_rating,
            shots_tracked=r.shots_tracked,
            source=r.source,
            exclude_from_stats=r.exclude_from_stats or False,
            game_format=r.game_format,
        ))
    return results


@router.get("/{round_id}", response_model=RoundDetailResponse)
def get_round(round_id: int, db: Session = Depends(get_db)):
    r = (db.query(Round)
         .options(joinedload(Round.holes).joinedload(RoundHole.shots))
         .filter(Round.id == round_id)
         .first())

    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    return RoundDetailResponse(
        id=r.id,
        garmin_id=r.garmin_id,
        course_id=r.course_id,
        course_name=r.course.display_name if r.course else None,
        tee_name=r.tee.tee_name if r.tee_id and r.tee else None,
        tee_id=r.tee_id,
        date=r.date,
        holes_completed=r.holes_completed,
        total_strokes=r.total_strokes,
        score_vs_par=r.score_vs_par,
        course_rating=r.course_rating,
        slope_rating=r.slope_rating,
        shots_tracked=r.shots_tracked,
        source=r.source,
        handicapped_strokes=r.handicapped_strokes,
        player_handicap=r.player_handicap,
        session_type=r.session_type,
        game_format=r.game_format,
        weather_temp_f=r.weather_temp_f,
        weather_description=r.weather_description,
        overall_rating=r.overall_rating,
        key_takeaway=r.key_takeaway,
        holes=[RoundHoleResponse(
            id=h.id,
            hole_number=h.hole_number,
            strokes=h.strokes,
            handicap_strokes=h.handicap_strokes,
            putts=h.putts,
            fairway=h.fairway,
            gir=h.gir,
            penalty_strokes=h.penalty_strokes,
            shots=[ShotResponse.model_validate(s) for s in sorted(h.shots, key=lambda s: s.shot_number)],
        ) for h in sorted(r.holes, key=lambda x: x.hole_number)],
    )


class RoundUpdate(BaseModel):
    game_format: Optional[str] = None
    exclude_from_stats: Optional[bool] = None
    tee_id: Optional[int] = None


def _recompute_tee_positions(db: Session, tee_id: int) -> None:
    """Refresh CourseHole.tee_lat/tee_lng for every hole under `tee_id` to the
    per-axis median of `shot_number == 1` start positions across all rounds
    attached to this tee.

    Median is robust to a single bad GPS fix and converges as more rounds are
    added — a tee box is a small region, not a point, so we don't want a noisy
    last-write-wins. Holes with no shot data are left untouched (preserves
    OSM / API values when there's nothing better to use).
    """
    shots = (
        db.query(Shot.start_lat, Shot.start_lng, RoundHole.hole_number)
        .join(RoundHole, Shot.round_hole_id == RoundHole.id)
        .join(Round, RoundHole.round_id == Round.id)
        .filter(
            Round.tee_id == tee_id,
            Shot.shot_number == 1,
            Shot.start_lat.isnot(None),
            Shot.start_lng.isnot(None),
        )
        .all()
    )
    if not shots:
        return

    by_hole: dict[int, tuple[list[float], list[float]]] = {}
    for lat, lng, hole_number in shots:
        lats, lngs = by_hole.setdefault(hole_number, ([], []))
        lats.append(lat)
        lngs.append(lng)

    holes = db.query(CourseHole).filter(CourseHole.tee_id == tee_id).all()
    for hole in holes:
        coords = by_hole.get(hole.hole_number)
        if not coords:
            continue
        lats, lngs = coords
        hole.tee_lat = median(lats)
        hole.tee_lng = median(lngs)


@router.patch("/{round_id}")
def update_round(round_id: int, body: RoundUpdate, db: Session = Depends(get_db)):
    """Update round metadata (game format, exclude from stats, tee assignment)."""
    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    exclude_changed = False
    tee_changed = False
    old_tee_id = r.tee_id
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "exclude_from_stats" and getattr(r, field) != value:
            exclude_changed = True
        if field == "tee_id" and getattr(r, field) != value:
            tee_changed = True
        setattr(r, field, value)

    db.commit()

    # Recompute stats if exclusion changed
    if exclude_changed:
        from app.services.club_stats_service import compute_club_stats
        compute_club_stats(db)

    # Re-medianize tee positions for any tee that lost or gained this round so
    # the on-map tee marker reflects actual played-from data, not OSM fallbacks.
    if tee_changed:
        if old_tee_id:
            _recompute_tee_positions(db, old_tee_id)
        if r.tee_id:
            _recompute_tee_positions(db, r.tee_id)
        db.commit()

    return {"status": "updated", "round_id": round_id}


@router.post("/{round_id}/recalc")
def recalc_round(round_id: int, db: Session = Depends(get_db)):
    """Recalculate computed spatial metrics for all shots in a round."""
    from app.services.course_calc_service import recalc_round_shots

    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    count = recalc_round_shots(db, round_id)
    return {"status": "ok", "shots_updated": count}


@router.post("/{round_id}/holes/{hole_number}/rechain")
def rechain_hole_shots(round_id: int, hole_number: int, db: Session = Depends(get_db)):
    """Re-chain end→start coords for every shot on this hole and snap the last
    shot's end to the pin. Useful after manually reassigning shots between holes
    so the ball's path is continuous and the final shot points to the green.

    If CourseHole.flag_lat is unset for this tee/hole, we infer the pin from
    the median of other rounds' last-shot-ends at this hole and persist it
    (excluding the round being rechained — its data may be the reason we're
    rechaining in the first place).

    Distance_yards is recomputed for any shot whose end coord changes, then
    spatial metrics & SG are recomputed for the round.
    """
    r = db.query(Round).filter(Round.id == round_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    rh = (
        db.query(RoundHole)
        .filter(RoundHole.round_id == round_id, RoundHole.hole_number == hole_number)
        .first()
    )
    if not rh:
        raise HTTPException(status_code=404, detail="Hole not found in this round")

    shots = (
        db.query(Shot)
        .filter(Shot.round_hole_id == rh.id)
        .order_by(Shot.shot_number, Shot.id)
        .all()
    )
    if not shots:
        return {"status": "ok", "shots_updated": 0}

    from app.services.course_calc_service import haversine_yards, recalc_round_shots

    def set_end(sh: Shot, lat: float, lng: float) -> None:
        sh.end_lat = lat
        sh.end_lng = lng
        if sh.start_lat is not None and sh.start_lng is not None:
            sh.distance_yards = round(
                haversine_yards(sh.start_lat, sh.start_lng, lat, lng), 1
            )

    updated = 0
    for i in range(len(shots) - 1):
        nxt = shots[i + 1]
        if nxt.start_lat is None or nxt.start_lng is None:
            continue
        set_end(shots[i], nxt.start_lat, nxt.start_lng)
        updated += 1

    # Snap the last shot's end to the pin so the visualized path reaches the
    # green. Prefer the stored CourseHole.flag_lat/flag_lng; if missing, infer
    # from the median of OTHER rounds' last shots and persist back.
    pin_lat = pin_lng = None
    pin_inferred = False
    ch = None
    if r.tee_id is not None:
        ch = (
            db.query(CourseHole)
            .filter(CourseHole.tee_id == r.tee_id, CourseHole.hole_number == hole_number)
            .first()
        )
        if ch and ch.flag_lat is not None and ch.flag_lng is not None:
            pin_lat, pin_lng = ch.flag_lat, ch.flag_lng
        else:
            # Median of last-shot-ends across other rounds at this tee/hole.
            rows = (
                db.query(Shot.end_lat, Shot.end_lng, RoundHole.round_id, Shot.shot_number)
                .join(RoundHole, RoundHole.id == Shot.round_hole_id)
                .join(Round, Round.id == RoundHole.round_id)
                .filter(
                    Round.tee_id == r.tee_id,
                    RoundHole.hole_number == hole_number,
                    Round.id != round_id,
                    Shot.end_lat.isnot(None),
                    Shot.end_lng.isnot(None),
                )
                .order_by(RoundHole.round_id, Shot.shot_number.desc())
                .all()
            )
            last_per_round: dict[int, tuple[float, float]] = {}
            for end_lat, end_lng, rid, _sn in rows:
                if rid not in last_per_round:
                    last_per_round[rid] = (end_lat, end_lng)
            if last_per_round:
                pin_lat = median([p[0] for p in last_per_round.values()])
                pin_lng = median([p[1] for p in last_per_round.values()])
                pin_inferred = True
                if ch is not None:
                    ch.flag_lat = pin_lat
                    ch.flag_lng = pin_lng

    if pin_lat is not None and pin_lng is not None:
        set_end(shots[-1], pin_lat, pin_lng)
        updated += 1

    db.commit()
    recalc_round_shots(db, round_id)

    return {
        "status": "ok",
        "shots_updated": updated,
        "pinned_last": pin_lat is not None,
        "pin_inferred": pin_inferred,
    }


def _chain_predecessor_end_to_start(db: Session, round_hole_id: int, position: int) -> None:
    """Snap shot[position-1].end coords to shot[position].start coords so the
    ball's path is continuous between shots. Also recomputes the predecessor's
    distance_yards against its (possibly unchanged) start. No-op if either side
    is missing or the next shot has no GPS start."""
    if position <= 1:
        return
    prev = (
        db.query(Shot)
        .filter(Shot.round_hole_id == round_hole_id, Shot.shot_number == position - 1)
        .first()
    )
    curr = (
        db.query(Shot)
        .filter(Shot.round_hole_id == round_hole_id, Shot.shot_number == position)
        .first()
    )
    if prev is None or curr is None:
        return
    if curr.start_lat is None or curr.start_lng is None:
        return
    prev.end_lat = curr.start_lat
    prev.end_lng = curr.start_lng
    if prev.start_lat is not None and prev.start_lng is not None:
        from app.services.course_calc_service import haversine_yards
        prev.distance_yards = round(
            haversine_yards(prev.start_lat, prev.start_lng, prev.end_lat, prev.end_lng), 1
        )


class ShotMoveRequest(BaseModel):
    hole_number: int


@router.patch("/{round_id}/shots/{shot_id}/move")
def move_shot_to_hole(
    round_id: int,
    shot_id: int,
    body: ShotMoveRequest,
    db: Session = Depends(get_db),
):
    """Move a shot to a different hole within the same round.

    Renumbers shots on both source and target holes, then recomputes spatial
    metrics so SG / pin distance / on-green reflect the new hole's geometry.
    RoundHole-level fields (strokes, putts, fairway, gir) are left untouched —
    they came from the scorecard and may still be correct independent of which
    hole the GPS shots were attributed to.
    """
    shot = (
        db.query(Shot)
        .filter(Shot.id == shot_id, Shot.round_id == round_id)
        .first()
    )
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found in this round")

    source_hole = db.query(RoundHole).filter(RoundHole.id == shot.round_hole_id).first()
    if not source_hole:
        raise HTTPException(status_code=500, detail="Source round hole missing")

    if source_hole.hole_number == body.hole_number:
        return {"status": "no-op", "shot_id": shot_id}

    target_hole = (
        db.query(RoundHole)
        .filter(RoundHole.round_id == round_id, RoundHole.hole_number == body.hole_number)
        .first()
    )
    if not target_hole:
        target_hole = RoundHole(
            round_id=round_id,
            hole_number=body.hole_number,
            penalty_strokes=0,
        )
        db.add(target_hole)
        db.flush()

    max_num = (
        db.query(func.max(Shot.shot_number))
        .filter(Shot.round_hole_id == target_hole.id)
        .scalar()
    ) or 0

    source_old_position = shot.shot_number

    shot.round_hole_id = target_hole.id
    shot.shot_number = max_num + 1
    db.flush()

    # Renumber source hole shots 1..N to close the gap left by the moved shot.
    remaining = (
        db.query(Shot)
        .filter(Shot.round_hole_id == source_hole.id)
        .order_by(Shot.shot_number, Shot.id)
        .all()
    )
    for i, s in enumerate(remaining, 1):
        s.shot_number = i

    # Re-chain end→start at the affected positions on both holes so the ball
    # doesn't appear to teleport between shots. Garmin's recorded end_lat is
    # often a noisy estimate; the next shot's GPS start_lat is more accurate,
    # so we snap the predecessor's end to it.
    _chain_predecessor_end_to_start(db, target_hole.id, position=max_num + 1)
    _chain_predecessor_end_to_start(db, source_hole.id, position=source_old_position)

    db.commit()

    # Recompute spatial metrics & SG against the new hole geometry.
    from app.services.course_calc_service import recalc_round_shots
    recalc_round_shots(db, round_id)

    return {
        "status": "moved",
        "shot_id": shot_id,
        "from_hole": source_hole.hole_number,
        "to_hole": body.hole_number,
    }
