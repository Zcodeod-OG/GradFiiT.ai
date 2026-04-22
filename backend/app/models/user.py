from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    subscription_tier = Column(String, nullable=False, default="free_2d")
    preferred_tryon_mode = Column(String, nullable=False, default="2d")
    avatar_status = Column(String, nullable=False, default="not_started")
    avatar_source_image_url = Column(String, nullable=True)
    avatar_model_id = Column(String, nullable=True)
    avatar_model_url = Column(String, nullable=True)
    avatar_preview_url = Column(String, nullable=True)
    avatar_turntable_url = Column(String, nullable=True)
    avatar_metadata = Column(JSON, nullable=True)
    avatar_error_message = Column(Text, nullable=True)
    avatar_updated_at = Column(DateTime(timezone=True), nullable=True)
    # Persistent canonical "person photo" -- uploaded once, reused across every
    # try-on surface (web /try, dashboard Quick Try, Chrome extension overlay).
    # We also cache the smart-crop and CLIP face embedding so the runtime
    # pipeline can skip the input gate / face crop / face embed roundtrips.
    default_person_image_url = Column(String, nullable=True)
    default_person_image_s3_key = Column(String, nullable=True)
    default_person_smart_crop_url = Column(String, nullable=True)
    default_person_face_url = Column(String, nullable=True)
    default_person_face_embedding = Column(JSON, nullable=True)
    default_person_input_gate_metrics = Column(JSON, nullable=True)
    default_person_uploaded_at = Column(DateTime(timezone=True), nullable=True)

    # Stripe billing. Populated by the billing webhook once a user finishes
    # Checkout. `subscription_status` mirrors Stripe's state machine
    # (active / trialing / past_due / canceled / unpaid / incomplete /
    # inactive). We keep `subscription_tier` as the single source of truth
    # for quota enforcement -- it's only flipped by the webhook handler.
    stripe_customer_id = Column(String, nullable=True, index=True)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_status = Column(String, nullable=False, default="inactive")
    subscription_renews_at = Column(DateTime(timezone=True), nullable=True)
    subscription_cancel_at_period_end = Column(Boolean, nullable=False, default=False)

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    garments = relationship("Garment", back_populates="user")
    tryons = relationship("TryOn", back_populates="user")
    affiliate_clicks = relationship("AffiliateClick", back_populates="user")

