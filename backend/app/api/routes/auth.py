from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import jwt
from datetime import datetime, timedelta

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, User as UserSchema
from app.config import settings
from app.api.deps import get_current_active_user
from app.services.storage import get_storage
from app.services.subscription import PLAN_RULES
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

router = APIRouter()
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _verify_legacy_bcrypt(plain_password: str, hashed_password: str) -> bool:
    """Verify legacy bcrypt hashes without relying on passlib's bcrypt backend."""
    try:
        import bcrypt  # type: ignore

        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        return _verify_legacy_bcrypt(plain_password, hashed_password)

    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, UnknownHashError):
        # Unknown/invalid hash formats should fail authentication, not crash login.
        return False


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


@router.post("/register", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user already exists
    normalized_email = user_data.email.strip().lower()
    db_user = db.query(User).filter(User.email == normalized_email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    tier = (user_data.subscription_tier or "free_2d").strip().lower()
    if tier not in PLAN_RULES:
        tier = "free_2d"

    preferred_mode = (user_data.preferred_tryon_mode or "2d").strip().lower()
    if preferred_mode not in {"2d", "3d"}:
        preferred_mode = "2d"
    if preferred_mode not in PLAN_RULES[tier].allowed_modes:
        preferred_mode = PLAN_RULES[tier].allowed_modes[0]

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=normalized_email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        subscription_tier=tier,
        preferred_tryon_mode=preferred_mode,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    """Login and get access token"""
    normalized_email = form_data.username.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserSchema)
def read_users_me(current_user: User = Depends(get_current_active_user)):
    """Get current user information.

    Rewrites any private S3 URLs on the user record (default person
    photo, smart-crop, cropped face) to short-lived presigned URLs so
    the frontend can render them directly in <img src> without 403ing.
    """
    payload = UserSchema.model_validate(current_user)

    storage = get_storage()

    def _sign(url: str | None) -> str | None:
        if not url:
            return url
        try:
            return storage.to_provider_access_url(url, expiration=3600) or url
        except Exception:
            return url

    payload.default_person_image_url = _sign(payload.default_person_image_url)
    payload.default_person_smart_crop_url = _sign(payload.default_person_smart_crop_url)
    payload.default_person_face_url = _sign(payload.default_person_face_url)
    return payload

