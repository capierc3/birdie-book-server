from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from app.api import rounds, courses, import_api, images
from app.config import settings

app = FastAPI(
    title="Birdie Book",
    description="Golf data API — Garmin FIT import, round tracking, course management",
    version="0.1.0",
)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Jinja2 templates for web UI
templates = Jinja2Templates(directory="app/templates")

# API routers
app.include_router(rounds.router)
app.include_router(courses.router)
app.include_router(import_api.router)
app.include_router(images.router)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok"}
