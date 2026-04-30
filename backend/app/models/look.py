"""SQLAlchemy model for user-saved Looks (closet outfit assemblies).

A ``Look`` is a named combination of 2-3 garments the user assembled in
the closet's outfit builder. It's the persisted form of the combo
try-on payload so users can re-render the same outfit later (e.g.
"Friday office", "weekend coffee") without re-picking the garments.

The cover image and last-rendered timestamp are derived at serialize
time from the joined ``TryOn`` row referenced by
``last_rendered_tryon_id`` -- TryOn is the source of truth, so we
don't risk the look's preview drifting from the actual rendered image.
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Look(Base):
    __tablename__ = "looks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    name = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    # Ordered list of garment ids (bottom-layer first). Stored as JSON
    # rather than a join table because the order matters and the row
    # count is tiny (2-3).
    garment_ids = Column(JSON, nullable=False, default=list)

    # Most recent combo try-on rendered for this look. Image URL +
    # completed-at are derived from the joined TryOn row at serialize
    # time so we don't have to keep them in sync here.
    last_rendered_tryon_id = Column(
        Integer, ForeignKey("tryons.id", ondelete="SET NULL"), nullable=True
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", backref="looks")
    last_rendered_tryon = relationship("TryOn", foreign_keys=[last_rendered_tryon_id])
