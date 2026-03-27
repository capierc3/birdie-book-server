# Birdie Book Server

Self-hosted golf data backend for the GolfCompanion Android app. Ingests Garmin Connect exports, stores round/shot/course/club data, caches satellite hole imagery, and serves it all via REST API.

## Tech Stack

- **Backend**: Python 3.12 + FastAPI
- **Database**: PostgreSQL (production) / SQLite (local dev)
- **ORM**: SQLAlchemy 2.0 + Alembic migrations
- **FIT Parsing**: garmin-fit-sdk (official Garmin SDK)
- **Image Caching**: Google Maps Static API + local file storage
- **Web UI**: Jinja2 templates + vanilla JS
- **Deployment**: Docker Compose

## Architecture

```
Android App (GolfCompanion)
        |
        | REST API (JSON over HTTP)
        |
  Birdie Book Server (FastAPI)
        |
    PostgreSQL / SQLite
        |
    Cached Satellite Images (disk)
```

**Two-way sync**: Both the Android app and this server can create/edit data. Garmin imports upsert by ID. Rounds flagged `locally_modified` are protected from Garmin overwrites.

## Data Flow

```
Garmin Connect Data Export
    |
    +-- Golf-CLUB_TYPES.json  (reference: club specs)
    +-- Golf-CLUB.json         (your bag: models, shafts)
    +-- Golf-COURSE.json       (course ID -> name mapping)
    +-- Golf-SCORECARD.json    (rounds: scores, holes, putts, fairways, pin GPS)
    +-- Golf-SHOT.json         (individual shots: GPS, club, lie, distance, type)
    +-- Golf-SCORECARD_RAWDATA-*.fit  (binary backup, subset of JSON data)
    |
    v
  Import Service (upsert by garmin_id + lastModifiedTime)
    |
    v
  Database (courses, rounds, holes, shots, clubs)
    |
    v
  REST API  -->  Android App / Web UI
```

**JSON is the primary import path.** FIT files are a fallback — the JSONs contain everything the FIT has plus club-per-shot, lie type, shot classification, and pin positions.

## Database Schema

```
Player (1) <-- Round (N), Club (N)
Course (1) <-- CourseTee (N) <-- CourseHole (N) <-- HoleImage (N)
Course (1) <-- Round (N) <-- RoundHole (N) <-- Shot (N)
Club (1) <-- ClubStats (1)
```

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **Player** | Golfer identity | name (unique) |
| **Course** | Golf course | garmin_snapshot_id, name, address, lat/lng, holes, par, rating, slope |
| **CourseTee** | Tee box config per course | tee_name, course_rating, slope_rating, par_total, total_yards |
| **CourseHole** | Per-hole data per tee | hole_number, par, yardage, handicap, flag_lat/flag_lng |
| **Round** | A played round | garmin_id, player, course, tee, date, strokes, score_vs_par, handicap, weather, pre/post session notes, source |
| **RoundHole** | Per-hole scoring | hole_number, strokes, putts, fairway, GIR, handicap_strokes, penalty_strokes |
| **Shot** | Individual shot GPS | garmin_id, club, start/end lat/lng/lie, distance_m, shot_type, timestamp |
| **Club** | Player's bag | garmin_id, type, model, shaft_length, flex, loft, lie, retired |
| **ClubStats** | Aggregated distances | avg, median, std_dev, min, max, p10, p90, sample_count |
| **HoleImage** | Cached satellite image | course_hole, filename, zoom, center lat/lng, width/height |

## API Endpoints

### Import
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/import/garmin-json` | Bulk import Garmin JSON exports (5 files) |
| POST | `/api/import/fit` | Import single FIT file (fallback) |
| POST | `/api/import/fit/preview` | Preview FIT file without saving |

### Rounds
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rounds/` | List rounds (paginated, sorted by date desc) |
| GET | `/api/rounds/{round_id}` | Full round detail with holes and shots |

### Courses
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/courses/` | List all courses |
| GET | `/api/courses/{course_id}` | Course detail with tees, holes, images |
| POST | `/api/courses/` | Create course |
| POST | `/api/courses/{course_id}/tees/{tee_id}/fetch-images` | Fetch satellite images for all holes |

### Images
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/images/holes/{image_id}` | Serve cached hole image by DB ID |
| GET | `/api/images/holes/by-path/{course_id}/{tee_id}/{filename}` | Serve by file path |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Web UI dashboard |
| GET | `/health` | Health check |
| GET | `/docs` | Interactive API docs (Swagger) |

## Upsert Strategy

All Garmin imports use **upsert by garmin_id**:
- **New record** (garmin_id not in DB): insert
- **Existing record** (garmin_id found): update only if `lastModifiedTime` is newer
- **Locally modified rounds**: skipped during import to protect manual edits

This means re-importing the same Garmin export is safe — no duplicates, no data loss.

## Local Development

```bash
cd "D:\Brick Road Software\birdie-book-server"

# Create venv with Python 3.12
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create SQLite tables
python -c "from app.database import Base, engine; from app.models import *; Base.metadata.create_all(bind=engine)"

# Start dev server (hot reload)
uvicorn app.main:app --reload --port 8000
```

- Web UI: http://localhost:8000
- API docs: http://localhost:8000/docs
- Database: `birdie_book_dev.db` (SQLite, auto-created)

Local dev uses SQLite via `.env`. Docker overrides to PostgreSQL automatically — no config changes needed.

## Docker Deployment

```bash
# Set your Google Maps API key
echo "GOOGLE_MAPS_API_KEY=your_key" > .env

# Build and start
docker compose up -d

# View logs
docker compose logs -f app
```

Services:
- **app**: FastAPI on port 8000
- **db**: PostgreSQL 16 on port 5432
- **pgdata volume**: persistent database storage
- **hole_images volume**: cached satellite images

## Project Structure

```
birdie-book-server/
  app/
    api/
      import_api.py      # POST endpoints for Garmin JSON/FIT import
      rounds.py           # GET endpoints for round data
      courses.py          # GET/POST endpoints for course data
      images.py           # GET endpoints for cached hole images
    models/
      player.py           # Player table
      course.py           # Course, CourseTee, CourseHole tables
      round.py            # Round, RoundHole, Shot tables
      club.py             # Club, ClubStats tables
      hole_image.py       # HoleImage table
    services/
      garmin_json_parser.py   # Parse Garmin JSON exports
      json_import_service.py  # Upsert JSON data into DB
      fit_parser.py           # Parse Garmin FIT binary files
      import_service.py       # Upsert FIT data into DB
      image_service.py        # Google Maps Static API + caching
    static/
      style.css           # Dark golf theme
      app.js              # Client-side import/browse logic
      images/holes/       # Cached satellite images (gitignored)
    templates/
      base.html           # Layout wrapper
      index.html          # Dashboard: import, rounds, courses
    config.py             # Pydantic settings (env var config)
    database.py           # SQLAlchemy engine, session, Base
    main.py               # FastAPI app entry point
  migrations/
    env.py                # Alembic config
    versions/             # Migration files
  tests/
  docker-compose.yml
  Dockerfile
  requirements.txt
  alembic.ini
  .env                    # Local config (gitignored)
  .env.example            # Template
```

## Roadmap

- [x] Project scaffold (FastAPI + Docker + PostgreSQL)
- [ ] Verify/update SQLAlchemy models against full JSON data
- [ ] Alembic migrations for initial schema
- [ ] Garmin JSON import (primary): CLUB_TYPES, CLUB, COURSE, SCORECARD, SHOT
- [ ] REST read endpoints (rounds, courses, clubs, shots)
- [ ] Google Maps satellite image fetching + caching + serving
- [ ] Web UI for import management and data browsing
- [ ] FIT file import (backup/fallback)
- [ ] Android app API integration (two-way sync)
- [ ] Shot overlay on hole satellite images
