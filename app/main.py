from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from app.api import rounds, courses, clubs, import_api, range_sessions, stats, round_plans, practice_plans, drills
from app.config import settings
from app.database import Base, engine, SessionLocal
import app.models  # noqa: F401 — registers all models with Base.metadata

app = FastAPI(
    title="Birdie Book",
    description="Golf data API — Garmin FIT import, round tracking, course management",
    version="0.1.0",
)

# Create tables if they don't exist (dev mode — no alembic needed)
Base.metadata.create_all(bind=engine)

# Seed default drills on first startup
def _seed_drills():
    from app.models.drill import Drill
    from app.services.practice_recommendation_service import DRILL_LIBRARY
    import json
    db = SessionLocal()
    try:
        if db.query(Drill).first() is not None:
            return  # already seeded
        for (sg_cat, focus, club_type), drill_list in DRILL_LIBRARY.items():
            for d in drill_list:
                db.add(Drill(
                    name=d["name"],
                    description=d["description"],
                    target=d.get("target"),
                    sg_category=sg_cat,
                    focus_area=focus,
                    club_type=club_type,
                    session_types=json.dumps(sorted(d["env"])) if d.get("env") else None,
                    is_default=True,
                ))
        db.commit()
    finally:
        db.close()

_seed_drills()

# Automatic database backups (SQLite only — runs silently)
from app.services.backup_service import run_backup_if_needed, start_backup_scheduler
run_backup_if_needed()
start_backup_scheduler()

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Jinja2 templates for web UI
templates = Jinja2Templates(directory="app/templates")

# API routers
app.include_router(rounds.router)
app.include_router(courses.router)
app.include_router(clubs.router)
app.include_router(import_api.router)
app.include_router(range_sessions.router)
app.include_router(stats.router)
app.include_router(round_plans.router)
app.include_router(practice_plans.router)
app.include_router(drills.router)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/usage")
async def api_usage():
    from app.services.api_tracker import get_usage
    return get_usage()


@app.post("/api/settings/clear-data")
def clear_all_data():
    """Drop all tables and recreate them. Wipes all data."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return {"status": "cleared"}


@app.post("/api/settings/rebuild-personal-baseline")
def rebuild_personal_baseline_endpoint():
    """Rebuild personal strokes gained baseline from all course data, then recalc all shots."""
    from app.database import SessionLocal
    from app.services.strokes_gained import rebuild_personal_baseline
    from app.services.course_calc_service import recalc_course_shots
    from app.models.course import Course

    db = SessionLocal()
    try:
        stats = rebuild_personal_baseline(db)
        # Recalc all courses to populate sg_personal
        courses = db.query(Course).all()
        total_updated = 0
        for c in courses:
            total_updated += recalc_course_shots(db, c.id)
        stats["shots_updated"] = total_updated
        return {"status": "ok", **stats}
    finally:
        db.close()


@app.post("/api/settings/recompute-scores")
def recompute_scores_endpoint():
    """Recompute score_vs_par for all rounds from hole strokes and course par."""
    from app.database import SessionLocal
    from app.models import Round, RoundHole, CourseHole

    db = SessionLocal()
    try:
        rounds = db.query(Round).filter(Round.tee_id.isnot(None)).all()
        updated = 0
        for r in rounds:
            holes = db.query(RoundHole).filter(RoundHole.round_id == r.id).all()
            if not holes:
                continue
            course_holes = db.query(CourseHole).filter(CourseHole.tee_id == r.tee_id).all()
            par_map = {ch.hole_number: ch.par for ch in course_holes}

            played = [h for h in holes if h.strokes and h.strokes > 0]
            if not played:
                continue
            total_strokes = sum(h.strokes for h in played)
            total_par = sum(par_map.get(h.hole_number, 0) for h in played)

            if total_strokes and total_par:
                new_vs_par = total_strokes - total_par
                if r.score_vs_par != new_vs_par:
                    r.score_vs_par = new_vs_par
                    updated += 1

        db.commit()
        return {"status": "ok", "rounds_checked": len(rounds), "updated": updated}
    finally:
        db.close()


@app.get("/api/settings/backups")
def list_backups_endpoint():
    """List all database backups."""
    from app.services.backup_service import list_backups
    return list_backups()


@app.post("/api/settings/backup")
def create_backup_endpoint():
    """Trigger a manual database backup."""
    from app.services.backup_service import create_backup, prune_old_backups
    path = create_backup("daily")
    prune_old_backups()
    if path:
        return {"status": "ok", "path": path}
    return {"status": "skipped", "reason": "Not a SQLite database"}
