"""Helpers for resolving the active app user (single-user today, multi-user later).

Today the app is single-user: there is exactly one row with `is_app_user=true`,
and every owned record (clubs, rounds, range sessions, play sessions) belongs to
it. When auth lands, `get_active_player` will read from the auth context
instead of `WHERE is_app_user=true LIMIT 1`. Importers and play-session creation
should resolve "the user" through this module rather than guessing by name.
"""

from sqlalchemy.orm import Session

from app.models.player import Player


def get_active_player(db: Session, fallback_name: str | None = None) -> Player:
    """Return the registered app user, creating one if the DB has none yet.

    Lookup order:
      1. The single row where `is_app_user=true`.
      2. If `fallback_name` is provided, find a player by name and promote it
         to `is_app_user=true` (handles legacy DBs where the flag was never
         set on a pre-existing row).
      3. Otherwise create a new player with `fallback_name` (or "Player 1")
         and `is_app_user=true`.
    """
    active = db.query(Player).filter(Player.is_app_user.is_(True)).first()
    if active:
        return active

    if fallback_name:
        existing = db.query(Player).filter(Player.name == fallback_name).first()
        if existing:
            existing.is_app_user = True
            db.flush()
            return existing

    new_player = Player(name=fallback_name or "Player 1", is_app_user=True)
    db.add(new_player)
    db.flush()
    return new_player


def record_trackman_handle(db: Session, player: Player, handle: str | None) -> None:
    """Capture the Trackman portal handle on the player row if it's not already set."""
    if not handle:
        return
    if player.trackman_user_id:
        return
    player.trackman_user_id = handle
    db.flush()
