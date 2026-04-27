"""Tag library backing the pre-round tag pickers (and any future tag use cases).

Categories (today): bring_in, pull_out, intention. Sub-categories group tags
within a category for the picker UI (e.g. Mind / Mood / Body / Mindset under
bring_in).
"""

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("category", "name", name="uq_tags_category_name"),
    )

    id = Column(Integer, primary_key=True)
    category = Column(String(20), nullable=False, index=True)
    sub_category = Column(String(50), nullable=True)
    name = Column(String(80), nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    is_archived = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class PlaySessionTag(Base):
    __tablename__ = "play_session_tags"
    __table_args__ = (
        UniqueConstraint("session_id", "tag_id", name="uq_play_session_tags_session_tag"),
    )

    id = Column(Integer, primary_key=True)
    session_id = Column(
        Integer, ForeignKey("play_sessions.id", ondelete="CASCADE"), nullable=False
    )
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    tag = relationship("Tag")
