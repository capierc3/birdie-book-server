from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from app.api import rounds, courses, clubs, import_api, range_sessions
from app.config import settings
from app.database import Base, engine
import app.models  # noqa: F401 — registers all models with Base.metadata

app = FastAPI(
    title="Birdie Book",
    description="Golf data API — Garmin FIT import, round tracking, course management",
    version="0.1.0",
)

# Create tables if they don't exist (dev mode — no alembic needed)
Base.metadata.create_all(bind=engine)

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
