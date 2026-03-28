from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from app.api import rounds, courses, clubs, import_api, images, range_sessions
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
app.include_router(images.router)
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
    from app.database import get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return {"status": "cleared"}
