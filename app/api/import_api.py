import json
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.fit_parser import parse_fit_file
from app.services.import_service import import_parsed_round
from app.services.garmin_json_parser import parse_full_export
from app.services.json_import_service import import_full_export

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/fit")
async def import_fit_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and import a Garmin FIT golf scorecard file."""
    if not file.filename or not file.filename.lower().endswith(".fit"):
        raise HTTPException(status_code=400, detail="File must be a .fit file")

    # Save to temp file for the FIT SDK (needs a file path)
    with tempfile.NamedTemporaryFile(suffix=".fit", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        parsed = parse_fit_file(tmp_path)
        round_obj = import_parsed_round(db, parsed)

        return {
            "status": "imported",
            "round_id": round_obj.id,
            "garmin_id": round_obj.garmin_id,
            "course": parsed.course_name,
            "date": str(parsed.date.date()),
            "strokes": parsed.total_strokes,
            "holes": parsed.holes_completed,
            "shots_tracked": parsed.shots_tracked,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/garmin-json")
async def import_garmin_json(
    club_types: Optional[UploadFile] = File(None),
    clubs: Optional[UploadFile] = File(None),
    courses: Optional[UploadFile] = File(None),
    scorecards: Optional[UploadFile] = File(None),
    shots: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """
    Import Garmin JSON data export files.
    Upload any combination of: Golf-CLUB_TYPES.json, Golf-CLUB.json,
    Golf-COURSE.json, Golf-SCORECARD.json, Golf-SHOT.json.

    Uses upsert logic — safe to re-import the same files.
    """
    files = {}

    async def _read_json(upload: Optional[UploadFile], key: str):
        if upload and upload.filename:
            content = await upload.read()
            files[key] = json.loads(content)

    await _read_json(club_types, "club_types")
    await _read_json(clubs, "clubs")
    await _read_json(courses, "courses")
    await _read_json(scorecards, "scorecards")
    await _read_json(shots, "shots")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        parsed = parse_full_export(files)
        results = import_full_export(db, parsed)
        return {
            "status": "imported",
            "results": results,
            "summary": {
                "clubs_processed": len(parsed.get("clubs", [])),
                "courses_processed": len(parsed.get("courses", [])),
                "scorecards_processed": len(parsed.get("scorecards", [])),
                "shots_processed": len(parsed.get("shots", [])),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fit/preview")
async def preview_fit_file(file: UploadFile = File(...)):
    """Preview a FIT file's contents without saving to database."""
    if not file.filename or not file.filename.lower().endswith(".fit"):
        raise HTTPException(status_code=400, detail="File must be a .fit file")

    with tempfile.NamedTemporaryFile(suffix=".fit", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        parsed = parse_fit_file(tmp_path)
        return {
            "course": parsed.course_name,
            "tee": parsed.tee_box,
            "date": str(parsed.date.date()),
            "holes_completed": parsed.holes_completed,
            "total_strokes": parsed.total_strokes,
            "par": parsed.par,
            "score_vs_par": parsed.total_strokes - parsed.par,
            "course_rating": parsed.course_rating,
            "slope_rating": parsed.slope_rating,
            "shots_tracked": parsed.shots_tracked,
            "player": parsed.player_name,
            "scorecard": [
                {
                    "hole": s.hole_number,
                    "strokes": s.strokes,
                    "putts": s.putts,
                    "fairway": s.fairway,
                }
                for s in parsed.scores
            ],
            "hole_data": [
                {
                    "hole": h.hole_number,
                    "par": h.par,
                    "yardage": h.yardage_yards,
                    "handicap": h.handicap,
                }
                for h in parsed.holes
            ],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)
