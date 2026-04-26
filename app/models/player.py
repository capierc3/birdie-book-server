from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from app.database import Base


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)

    # Auth (nullable today; populated when login lands)
    email = Column(String(255), nullable=True, unique=True)
    password_hash = Column(String(255), nullable=True)

    # External identities
    trackman_user_id = Column(String(50), nullable=True, unique=True)

    # True for registered app users (login-capable). False for buddies you've
    # only recorded as playing partners. Multi-user readiness: importers and
    # session creation resolve "the active user" via this flag.
    is_app_user = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
