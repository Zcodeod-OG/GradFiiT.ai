"""Affiliate click tracking.

Every time a user clicks a "Buy this" button on a try-on result we log
the raw retailer URL, the rewritten affiliate URL, and which network
handled the rewrite. Conversions (actual sales) are reconciled later via
the network's postback / API -- we flip `is_conversion=True` when we
receive confirmation.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class AffiliateClick(Base):
    __tablename__ = "affiliate_clicks"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    garment_id = Column(
        Integer, ForeignKey("garments.id"), nullable=True, index=True
    )
    tryon_id = Column(Integer, ForeignKey("tryons.id"), nullable=True, index=True)

    network = Column(String, nullable=False)
    merchant = Column(String, nullable=True)
    original_url = Column(Text, nullable=False)
    affiliate_url = Column(Text, nullable=False)

    is_conversion = Column(Boolean, nullable=False, default=False)
    conversion_value_usd = Column(String, nullable=True)
    conversion_at = Column(DateTime(timezone=True), nullable=True)

    clicked_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", back_populates="affiliate_clicks")
    garment = relationship("Garment", back_populates="affiliate_clicks")
    tryon = relationship("TryOn")
