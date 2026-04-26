"""Players API — current user (`/api/me`) and roster of playing partners."""

from datetime import date as DateType

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.play_session import PlaySession, PlaySessionPartner
from app.models.player import Player
from app.services.active_user import get_active_player


router = APIRouter(prefix="/api", tags=["players"])


class CurrentUser(BaseModel):
    id: int
    name: str
    email: str | None = None
    trackman_user_id: str | None = None
    is_app_user: bool = True

    model_config = {"from_attributes": True}


class CurrentUserUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=255)
    trackman_user_id: str | None = Field(default=None, max_length=50)


class PartnerSummary(BaseModel):
    id: int
    name: str
    times_played_with: int
    last_played: DateType | None = None


@router.get("/me", response_model=CurrentUser)
def get_me(db: Session = Depends(get_db)):
    """Return the active app user. Single-row lookup today; auth-driven later."""
    return CurrentUser.model_validate(get_active_player(db))


@router.get("/players/partners", response_model=list[PartnerSummary])
def list_partners(limit: int = 20, db: Session = Depends(get_db)):
    """Return every non-self player along with how many PlaySessions they've
    appeared on as a partner and when they last played. Players with zero
    PlaySession links still appear (`times_played_with=0`,
    `last_played=null`) so the autocomplete can surface them; the frontend
    decides which subset to use for "Recent" pills vs typeahead suggestions.
    """
    me = get_active_player(db)

    rows = (
        db.query(
            Player.id,
            Player.name,
            func.count(PlaySessionPartner.id).label("times_played_with"),
            func.max(PlaySession.date).label("last_played"),
        )
        .outerjoin(PlaySessionPartner, PlaySessionPartner.player_id == Player.id)
        .outerjoin(PlaySession, PlaySession.id == PlaySessionPartner.session_id)
        .filter(Player.id != me.id)
        .filter(Player.is_app_user.is_(False))
        .group_by(Player.id, Player.name)
        # NULL last_played sorts last (never-played-with goes after recent partners).
        .order_by(desc(func.coalesce(PlaySession.date, sa_null_date())), desc("times_played_with"), Player.name)
        .limit(max(1, min(limit, 200)))
        .all()
    )

    return [
        PartnerSummary(
            id=r.id,
            name=r.name,
            times_played_with=r.times_played_with,
            last_played=r.last_played,
        )
        for r in rows
    ]


def sa_null_date():
    """A value that sorts before any real date — used so NULL `last_played`
    rows end up at the bottom under DESC ordering."""
    from sqlalchemy import literal
    return literal("0001-01-01")


@router.patch("/me", response_model=CurrentUser)
def update_me(body: CurrentUserUpdate, db: Session = Depends(get_db)):
    """Update editable profile fields on the active app user."""
    me = get_active_player(db)
    data = body.model_dump(exclude_unset=True)

    if "name" in data:
        new_name = (data["name"] or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        if new_name != me.name:
            clash = db.query(Player).filter(Player.name == new_name, Player.id != me.id).first()
            if clash:
                raise HTTPException(status_code=409, detail="A player with that name already exists")
            me.name = new_name

    if "email" in data:
        new_email = data["email"]
        if new_email is not None:
            new_email = new_email.strip() or None
        if new_email and new_email != me.email:
            clash = db.query(Player).filter(Player.email == new_email, Player.id != me.id).first()
            if clash:
                raise HTTPException(status_code=409, detail="email already in use")
        me.email = new_email

    if "trackman_user_id" in data:
        me.trackman_user_id = (data["trackman_user_id"] or "").strip() or None

    db.commit()
    db.refresh(me)
    return CurrentUser.model_validate(me)
