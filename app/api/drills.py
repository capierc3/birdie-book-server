"""Drills API — browse, create, edit, delete practice drills."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json

from app.database import get_db
from app.models.drill import Drill

router = APIRouter(prefix="/api/drills", tags=["drills"])


# ── Pydantic schemas ──────────────────────────────────────────────────

class CreateDrillRequest(BaseModel):
    name: str
    description: str
    target: Optional[str] = None
    sg_category: Optional[str] = None
    focus_area: Optional[str] = None
    club_type: Optional[str] = None
    session_types: Optional[list[str]] = None


class UpdateDrillRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target: Optional[str] = None
    sg_category: Optional[str] = None
    focus_area: Optional[str] = None
    club_type: Optional[str] = None
    session_types: Optional[list[str]] = None


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("")
def list_drills(
    sg_category: Optional[str] = None,
    focus_area: Optional[str] = None,
    club_type: Optional[str] = None,
    session_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List drills with optional filters."""
    q = db.query(Drill).order_by(Drill.is_default.desc(), Drill.name)

    if sg_category:
        q = q.filter((Drill.sg_category == sg_category) | (Drill.sg_category.is_(None)))
    if focus_area:
        q = q.filter((Drill.focus_area == focus_area) | (Drill.focus_area.is_(None)))
    if club_type:
        q = q.filter((Drill.club_type == club_type) | (Drill.club_type.is_(None)))
    if search:
        q = q.filter(Drill.name.ilike(f"%{search}%"))

    drills = q.all()

    # Post-filter by session_type (stored as JSON array)
    if session_type:
        filtered = []
        for d in drills:
            if d.session_types:
                try:
                    types = json.loads(d.session_types)
                    if session_type in types:
                        filtered.append(d)
                except (json.JSONDecodeError, TypeError):
                    filtered.append(d)
            else:
                filtered.append(d)  # no session_types = works everywhere
        drills = filtered

    return [_drill_dict(d) for d in drills]


@router.get("/{drill_id}")
def get_drill(drill_id: int, db: Session = Depends(get_db)):
    """Get a single drill."""
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    return _drill_dict(drill)


@router.post("")
def create_drill(req: CreateDrillRequest, db: Session = Depends(get_db)):
    """Create a custom drill."""
    drill = Drill(
        name=req.name,
        description=req.description,
        target=req.target,
        sg_category=req.sg_category,
        focus_area=req.focus_area,
        club_type=req.club_type,
        session_types=json.dumps(req.session_types) if req.session_types else None,
        is_default=False,
    )
    db.add(drill)
    db.commit()
    db.refresh(drill)
    return _drill_dict(drill)


@router.put("/{drill_id}")
def update_drill(drill_id: int, req: UpdateDrillRequest, db: Session = Depends(get_db)):
    """Update a drill."""
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    if req.name is not None:
        drill.name = req.name
    if req.description is not None:
        drill.description = req.description
    if req.target is not None:
        drill.target = req.target
    if req.sg_category is not None:
        drill.sg_category = req.sg_category if req.sg_category else None
    if req.focus_area is not None:
        drill.focus_area = req.focus_area if req.focus_area else None
    if req.club_type is not None:
        drill.club_type = req.club_type if req.club_type else None
    if req.session_types is not None:
        drill.session_types = json.dumps(req.session_types) if req.session_types else None

    db.commit()
    return _drill_dict(drill)


@router.delete("/{drill_id}")
def delete_drill(drill_id: int, db: Session = Depends(get_db)):
    """Delete a drill. Only user-created drills can be deleted."""
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    if drill.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete a default drill")
    db.delete(drill)
    db.commit()
    return {"status": "ok"}


# ── Helpers ───────────────────────────────────────────────────────────

def _drill_dict(d: Drill) -> dict:
    try:
        session_types = json.loads(d.session_types) if d.session_types else None
    except (json.JSONDecodeError, TypeError):
        session_types = None

    return {
        "id": d.id,
        "name": d.name,
        "description": d.description,
        "target": d.target,
        "sg_category": d.sg_category,
        "focus_area": d.focus_area,
        "club_type": d.club_type,
        "session_types": session_types,
        "is_default": d.is_default,
    }
