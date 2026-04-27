"""Tag library API.

Backs the pre-round tag pickers (and any future tag use cases). Categories
today: bring_in, pull_out, intention. The user-facing management UI is
deferred (see ROADMAP backlog "Tag Library Management UI") but full CRUD is
scaffolded here so the UI can land later without a backend round-trip.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tag import PlaySessionTag, Tag


router = APIRouter(prefix="/api/tags", tags=["tags"])


VALID_CATEGORIES = {"bring_in", "pull_out", "intention", "performance"}


class TagOut(BaseModel):
    id: int
    category: str
    sub_category: Optional[str] = None
    name: str
    is_default: bool
    is_archived: bool
    sort_order: int
    times_used: int = 0

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    category: str = Field(..., max_length=20)
    sub_category: Optional[str] = Field(default=None, max_length=50)
    name: str = Field(..., max_length=80)
    sort_order: Optional[int] = None


class TagUpdate(BaseModel):
    sub_category: Optional[str] = Field(default=None, max_length=50)
    name: Optional[str] = Field(default=None, max_length=80)
    is_archived: Optional[bool] = None
    sort_order: Optional[int] = None


def _to_out(t: Tag, times_used: int) -> TagOut:
    return TagOut(
        id=t.id,
        category=t.category,
        sub_category=t.sub_category,
        name=t.name,
        is_default=t.is_default,
        is_archived=t.is_archived,
        sort_order=t.sort_order,
        times_used=times_used,
    )


@router.get("", response_model=list[TagOut])
def list_tags(
    category: Optional[str] = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
):
    """List tags with usage counts. Filters: category, include_archived."""
    if category is not None and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    usage_rows = (
        db.query(PlaySessionTag.tag_id, func.count(PlaySessionTag.id))
        .group_by(PlaySessionTag.tag_id)
        .all()
    )
    usage_map: dict[int, int] = {tag_id: count for tag_id, count in usage_rows}

    q = db.query(Tag)
    if category:
        q = q.filter(Tag.category == category)
    if not include_archived:
        q = q.filter(Tag.is_archived.is_(False))
    q = q.order_by(Tag.category, Tag.sub_category, Tag.sort_order, Tag.name)

    return [_to_out(t, usage_map.get(t.id, 0)) for t in q.all()]


@router.post("", response_model=TagOut)
def create_tag(body: TagCreate, db: Session = Depends(get_db)):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {body.category}")

    existing = (
        db.query(Tag)
        .filter(Tag.category == body.category, Tag.name == body.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A tag with that name already exists in this category")

    sort_order = body.sort_order
    if sort_order is None:
        max_order = (
            db.query(func.max(Tag.sort_order))
            .filter(Tag.category == body.category, Tag.sub_category == body.sub_category)
            .scalar()
        )
        sort_order = (max_order or 0) + 1

    tag = Tag(
        category=body.category,
        sub_category=body.sub_category,
        name=body.name,
        sort_order=sort_order,
        is_default=False,
        is_archived=False,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _to_out(tag, 0)


@router.patch("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, body: TagUpdate, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    data = body.model_dump(exclude_unset=True)
    new_name = data.get("name")
    if new_name is not None and new_name != tag.name:
        clash = (
            db.query(Tag)
            .filter(Tag.category == tag.category, Tag.name == new_name, Tag.id != tag.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="A tag with that name already exists in this category")

    for k, v in data.items():
        setattr(tag, k, v)
    db.commit()
    db.refresh(tag)

    times_used = (
        db.query(func.count(PlaySessionTag.id))
        .filter(PlaySessionTag.tag_id == tag.id)
        .scalar()
        or 0
    )
    return _to_out(tag, times_used)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, hard: bool = False, db: Session = Depends(get_db)):
    """Archive a tag (default) or hard-delete if `?hard=true` and unused."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if hard:
        ref_count = (
            db.query(func.count(PlaySessionTag.id))
            .filter(PlaySessionTag.tag_id == tag.id)
            .scalar()
            or 0
        )
        if ref_count > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Tag is used by {ref_count} session(s); archive it instead or remove it from those sessions first.",
            )
        db.delete(tag)
        db.commit()
        return {"status": "deleted", "tag_id": tag_id}

    tag.is_archived = True
    db.commit()
    return {"status": "archived", "tag_id": tag_id}
