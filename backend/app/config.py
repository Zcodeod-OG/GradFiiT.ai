
"""AULTER.AI - Application Configuration
Centralized settings management using Pydantic"""

from pathlib import Path
from typing import Optional, List
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE_PATH = BASE_DIR / ".env"


class Settings(BaseSettings):
    
    """Application settings loaded from environment variables.
    Uses Pydantic for validation and type safety."""
    
    
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )
    
    # ==================== Application Settings ====================
    
    APP_NAME: str = Field(
        default="AULTER.AI",
        description="Application name"
    )
    
    APP_VERSION: str = Field(
        default="1.0.0",
        description="Application version"
    )
    
    ENVIRONMENT: str = Field(
        default="development",
        description="Environment (development, staging, production)"
    )
    
    DEBUG: bool = Field(
        default=True,
        description="Debug mode"
    )
    
    # ==================== Server Settings ====================
    
    HOST: str = Field(
        default="0.0.0.0",
        description="Server host"
    )
    
    PORT: int = Field(
        default=8000,
        description="Server port"
    )
    
    BACKEND_URL: str = Field(
        default="http://localhost:8000",
        description="Backend URL for webhooks and callbacks"
    )
    
    FRONTEND_URL: str = Field(
        default="http://localhost:3000",
        description="Frontend URL for CORS and redirects"
    )
    
    # ==================== Database Settings ====================
    
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL database URL"
    )
    
    DB_ECHO: bool = Field(
        default=False,
        description="Echo SQL queries (for debugging)"
    )
    
    DB_POOL_SIZE: int = Field(
        default=5,
        description="Database connection pool size"
    )
    
    DB_MAX_OVERFLOW: int = Field(
        default=10,
        description="Maximum overflow connections"
    )
    
    # ==================== Redis Settings ====================
    
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis URL for caching and Celery"
    )
    
    REDIS_MAX_CONNECTIONS: int = Field(
        default=50,
        description="Maximum Redis connections"
    )
    
    # ==================== AWS S3 Settings ====================
    
    AWS_ACCESS_KEY_ID: str = Field(
        ...,
        description="AWS access key ID"
    )
    
    AWS_SECRET_ACCESS_KEY: str = Field(
        ...,
        description="AWS secret access key"
    )
    
    AWS_REGION: str = Field(
        default="us-east-1",
        description="AWS region"
    )
    
    S3_BUCKET_NAME: str = Field(
        ...,
        description="S3 bucket name for file storage"
    )
    
    S3_PUBLIC_URL: Optional[str] = Field(
        default=None,
        description="Public URL for S3 bucket (CloudFront, etc.)"
    )
    
    # ==================== Clerk Authentication ====================
    
    CLERK_SECRET_KEY: Optional[str] = Field(
        default=None,
        description="Clerk secret key for JWT verification"
    )

    CLERK_PUBLISHABLE_KEY: Optional[str] = Field(
        default=None,
        description="Clerk publishable key"
    )
    
    CLERK_WEBHOOK_SECRET: Optional[str] = Field(
        default=None,
        description="Clerk webhook signing secret"
    )
    
    # ==================== Replicate API ====================
    
    REPLICATE_API_TOKEN: str = Field(
        ...,
        description="Replicate API token for virtual try-on"
    )

    TRYON_STAGE1_MODEL: str = Field(
        default="CHANGE_ME_OOT_MODEL",
        description="Replicate model slug/version for Stage-1 OOTDiffusion try-on"
    )

    OOT_DIFFUSION_DEFAULT_CATEGORY: str = Field(
        default="upperbody",
        description="Default garment category sent to OOTDiffusion (upperbody, lowerbody, dress)"
    )

    # ==================== Try-On Provider Selection ====================

    TRYON_PROVIDER: str = Field(
        default="fashn",
        description="Active try-on provider. One of: fashn, replicate_legacy"
    )

    TRYON_OUTPUT_RESOLUTION: str = Field(
        default="1024",
        description="Default output resolution for single-call providers"
    )

    TRYON_OUTPUT_FORMAT: str = Field(
        default="png",
        description="Default output format for single-call providers (png|jpeg)"
    )

    # ==================== Fashn.ai Provider ====================

    FASHN_API_KEY: Optional[str] = Field(
        default=None,
        description="Fashn.ai API key for the commercial VTON provider"
    )

    FASHN_BASE_URL: str = Field(
        default="https://api.fashn.ai/v1",
        description="Base URL for the Fashn.ai REST API"
    )

    FASHN_HTTP_TIMEOUT_SECONDS: int = Field(
        default=60,
        description="HTTP timeout for individual Fashn API calls"
    )

    FASHN_POLL_INTERVAL_SECONDS: float = Field(
        default=1.5,
        description="Polling interval (seconds) when waiting for Fashn predictions"
    )

    FASHN_MAX_WAIT_SECONDS: int = Field(
        default=180,
        description="Maximum wall-clock wait for a Fashn prediction to finish"
    )

    FASHN_WEBHOOK_URL: Optional[str] = Field(
        default=None,
        description="Public webhook base for Fashn callbacks (e.g. https://api.example.com/api/webhooks/fashn)"
    )

    FASHN_DEFAULT_MODEL: str = Field(
        default="tryon-v1.6",
        description="Default Fashn model name for fast/balanced lanes"
    )

    FASHN_BEST_MODEL: str = Field(
        default="tryon-max",
        description="Fashn model name for the best-quality lane"
    )

    FASHN_BEST_NUM_SAMPLES: int = Field(
        default=2,
        description="Number of samples to draw on the best lane (we pick the best via CLIP)"
    )

    FASHN_BALANCED_NUM_SAMPLES: int = Field(
        default=2,
        description="Number of samples to draw on the balanced lane (postprocessor picks the best)"
    )

    # ==================== Try-On Quality Layers (L1 input gate + L2 postprocess) ====================
    # All toggles are best-effort: any failure in a step logs a warning and the
    # pipeline falls through to the previous stage's output. The user always
    # gets *something*. Hard failure only happens on INPUT_GATE_HARD_FAIL=true.

    TRYON_POSTPROCESS_ENABLED: bool = Field(
        default=True,
        description="Master switch for the Layer 2 post-processing stack (Fashn provider only)"
    )

    POSTPROCESS_LANES: str = Field(
        default="balanced,best",
        description="Comma-separated list of quality lanes that get post-processing (fast lane stays raw for latency)"
    )

    INPUT_GATE_ENABLED: bool = Field(
        default=True,
        description="Run Layer 1 input quality gate before sending to the provider"
    )

    INPUT_GATE_HARD_FAIL: bool = Field(
        default=False,
        description="If true, reject the try-on with a user-facing error when the gate fails. If false, log only."
    )

    INPUT_GATE_MIN_BLUR_VAR: float = Field(
        default=80.0,
        description="Minimum Laplacian variance for the person image (lower = blurrier). 0 disables the check."
    )

    INPUT_GATE_MIN_BODY_COVERAGE: float = Field(
        default=0.55,
        description="Minimum fraction of YOLO11-pose keypoints that must be visible (0..1)"
    )

    INPUT_GATE_SMART_CROP: bool = Field(
        default=True,
        description="When pose detection finds a clear person bbox, tightly crop around it before sending to the provider"
    )

    INPUT_GATE_SMART_CROP_PADDING: float = Field(
        default=0.08,
        description="Padding fraction added around the detected person bbox for the smart crop (0.08 = 8 percent)"
    )

    BG_ISOLATE_ENABLED: bool = Field(
        default=False,
        description="Layer 1: rembg-based person isolation on a neutral background before VTON (extra latency, opt-in)"
    )

    BG_COMPOSE_ENABLED: bool = Field(
        default=False,
        description="Layer 2: composite the VTON result back onto the original person background (requires BG_ISOLATE_ENABLED)"
    )

    IDENTITY_CHECK_ENABLED: bool = Field(
        default=True,
        description="Layer 2: compare CLIP face embedding of input vs output to detect identity drift"
    )

    IDENTITY_DRIFT_THRESHOLD: float = Field(
        default=0.78,
        description="Minimum acceptable face cosine similarity (CLIP). Below this we consider the identity drifted."
    )

    IDENTITY_RETRY_MAX: int = Field(
        default=1,
        description="Maximum number of provider retries with a fresh seed when identity drift is detected"
    )

    FACE_RESTORE_ENABLED: bool = Field(
        default=True,
        description="Layer 2: GFPGAN face restoration on the VTON output (Apache 2.0)"
    )

    FACE_RESTORE_MODEL: str = Field(
        default="tencentarc/gfpgan",
        description="Replicate slug (or slug:version) for GFPGAN face restoration"
    )

    FACE_RESTORE_SCALE: int = Field(
        default=2,
        description="Upscale factor passed to GFPGAN (1, 2, or 4)"
    )

    UPSCALE_ENABLED: bool = Field(
        default=True,
        description="Layer 2: Real-ESRGAN super-resolution on the VTON output (BSD-3)"
    )

    UPSCALE_MODEL: str = Field(
        default="nightmareai/real-esrgan",
        description="Replicate slug (or slug:version) for Real-ESRGAN"
    )

    UPSCALE_FACTOR: int = Field(
        default=2,
        description="Upscale factor for Real-ESRGAN (2 or 4). Skipped when GFPGAN already upscaled to the target."
    )

    UPSCALE_FACE_ENHANCE: bool = Field(
        default=False,
        description="Tell Real-ESRGAN to also run face enhance. Default off because GFPGAN already handled faces."
    )

    POSTPROCESS_HTTP_TIMEOUT_SECONDS: int = Field(
        default=60,
        description="HTTP timeout for downloading/uploading post-processed artifacts"
    )

    # ==================== Celery Settings ====================
    
    CELERY_BROKER_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Celery broker URL"
    )
    
    CELERY_RESULT_BACKEND: str = Field(
        default="redis://localhost:6379/0",
        description="Celery result backend URL"
    )

    ENABLE_CELERY_TRYON: bool = Field(
        default=True,
        description="Dispatch try-on generation to Celery workers"
    )

    ALLOW_THREAD_FALLBACK_FOR_TRYON: bool = Field(
        default=True,
        description="Allow thread fallback when Celery dispatch fails"
    )

    TRYON_SOFT_TIME_LIMIT_SECONDS: int = Field(
        default=240,
        description="Soft Celery time limit for try-on tasks"
    )

    TRYON_HARD_TIME_LIMIT_SECONDS: int = Field(
        default=300,
        description="Hard Celery time limit for try-on tasks"
    )

    TRYON_STAGE0_TIMEOUT_SECONDS: int = Field(
        default=90,
        description="Timeout for garment extraction stage (seconds)"
    )

    TRYON_STAGE1_TIMEOUT_SECONDS: int = Field(
        default=210,
        description="Timeout for stage-1 try-on generation (seconds)"
    )

    TRYON_STAGE2_TIMEOUT_SECONDS: int = Field(
        default=75,
        description="Timeout for quality gate stage (seconds)"
    )

    TRYON_STAGE3_TIMEOUT_SECONDS: int = Field(
        default=150,
        description="Timeout for quality refinement stage (seconds)"
    )

    TRYON_STAGE4_TIMEOUT_SECONDS: int = Field(
        default=75,
        description="Timeout for final rating stage (seconds)"
    )

    TRYON_ENABLE_REFINEMENT: bool = Field(
        default=True,
        description="Enable heavy quality refinement stage"
    )

    TRYON_ENABLE_RATING: bool = Field(
        default=False,
        description="Enable final quality rating stage"
    )

    ENABLE_CELERY_GARMENT_PREPROCESS: bool = Field(
        default=True,
        description="Dispatch garment preprocessing to Celery workers"
    )
    
    # ==================== Security Settings ====================
    
    SECRET_KEY: str = Field(
        ...,
        description="Secret key for signing tokens"
    )
    
    ALGORITHM: str = Field(
        default="HS256",
        description="JWT algorithm"
    )
    
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=30,
        description="Access token expiration in minutes"
    )
    
    # ==================== CORS Settings ====================
    
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000"],
        description="Allowed CORS origins"
    )
    
    CORS_ALLOW_CREDENTIALS: bool = Field(
        default=True,
        description="Allow credentials in CORS"
    )
    
    CORS_ALLOW_METHODS: List[str] = Field(
        default=["*"],
        description="Allowed HTTP methods"
    )
    
    CORS_ALLOW_HEADERS: List[str] = Field(
        default=["*"],
        description="Allowed HTTP headers"
    )
    
    # ==================== Rate Limiting ====================
    
    RATE_LIMIT_ENABLED: bool = Field(
        default=True,
        description="Enable rate limiting"
    )
    
    RATE_LIMIT_PER_MINUTE: int = Field(
        default=60,
        description="Default rate limit per minute"
    )
    
    # ==================== File Upload Settings ====================
    
    MAX_UPLOAD_SIZE: int = Field(
        default=10 * 1024 * 1024,  # 10 MB
        description="Maximum file upload size in bytes"
    )
    
    ALLOWED_IMAGE_EXTENSIONS: List[str] = Field(
        default=["jpg", "jpeg", "png", "webp"],
        description="Allowed image file extensions"
    )
    
    # ==================== Logging Settings ====================
    
    LOG_LEVEL: str = Field(
        default="INFO",
        description="Logging level"
    )
    
    LOG_FORMAT: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="Log format"
    )
    
    # ==================== Email Settings (Optional) ====================
    
    SMTP_HOST: Optional[str] = Field(
        default=None,
        description="SMTP host for sending emails"
    )
    
    SMTP_PORT: Optional[int] = Field(
        default=587,
        description="SMTP port"
    )
    
    SMTP_USER: Optional[str] = Field(
        default=None,
        description="SMTP username"
    )
    
    SMTP_PASSWORD: Optional[str] = Field(
        default=None,
        description="SMTP password"
    )
    
    SMTP_FROM_EMAIL: Optional[str] = Field(
        default=None,
        description="From email address"
    )
    
    # ==================== Stripe Settings (Optional) ====================
    
    STRIPE_SECRET_KEY: Optional[str] = Field(
        default=None,
        description="Stripe secret key for payments"
    )
    
    STRIPE_PUBLISHABLE_KEY: Optional[str] = Field(
        default=None,
        description="Stripe publishable key"
    )
    
    STRIPE_WEBHOOK_SECRET: Optional[str] = Field(
        default=None,
        description="Stripe webhook signing secret"
    )

    # Stripe Price IDs per plan. Leave blank for plans that are not yet
    # purchasable (coming-soon tiers). When a Price ID is not set the
    # /api/billing/checkout-session endpoint returns 503 for that plan.
    STRIPE_PRICE_PREMIUM_2D: Optional[str] = Field(
        default=None,
        description="Stripe Price ID for the Premium 2D subscription ($3.99/mo)"
    )

    STRIPE_PRICE_PREMIUM_3D: Optional[str] = Field(
        default=None,
        description="Stripe Price ID for the Premium 3D subscription (launching later)"
    )

    STRIPE_PRICE_ULTRA: Optional[str] = Field(
        default=None,
        description="Stripe Price ID for the Ultra subscription (launching later)"
    )

    STRIPE_SUCCESS_URL: str = Field(
        default="http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}",
        description="Redirect URL after successful Stripe Checkout"
    )

    STRIPE_CANCEL_URL: str = Field(
        default="http://localhost:3000/pricing?canceled=1",
        description="Redirect URL when the user cancels Stripe Checkout"
    )

    STRIPE_BILLING_PORTAL_RETURN_URL: str = Field(
        default="http://localhost:3000/account/billing",
        description="Where Stripe Customer Portal sends the user after they finish"
    )

    # ==================== Affiliate Settings (Optional) ====================

    AFFILIATE_DISCLOSURE_TEXT: str = Field(
        default="We may earn a small commission when you buy through this link, at no extra cost to you.",
        description="FTC-required disclosure shown next to every Buy-this button"
    )

    AFFILIATE_AMAZON_US_TAG: Optional[str] = Field(
        default=None,
        description="Amazon Associates tracking ID for amazon.com (e.g. 'gradfit-20')"
    )

    AFFILIATE_AMAZON_IN_TAG: Optional[str] = Field(
        default=None,
        description="Amazon Associates tracking ID for amazon.in"
    )

    AFFILIATE_AMAZON_UK_TAG: Optional[str] = Field(
        default=None,
        description="Amazon Associates tracking ID for amazon.co.uk"
    )

    AFFILIATE_EARNKARO_TOKEN: Optional[str] = Field(
        default=None,
        description="EarnKaro API token for Myntra/Ajio/Nykaa/Flipkart deep links"
    )

    AFFILIATE_CUELINKS_CID: Optional[str] = Field(
        default=None,
        description="CueLinks customer ID used as a fallback rewriter"
    )

    AFFILIATE_GENERIC_SUBID: Optional[str] = Field(
        default="gradfit",
        description="Sub-ID / SID attached to every outbound affiliate link for attribution"
    )

    # ==================== Sentry Settings (Optional) ====================
    
    SENTRY_DSN: Optional[str] = Field(
        default=None,
        description="Sentry DSN for error tracking"
    )
    
    # ==================== Feature Flags ====================
    
    ENABLE_WEBHOOKS: bool = Field(
        default=True,
        description="Enable webhook endpoints"
    )
    
    ENABLE_ANALYTICS: bool = Field(
        default=True,
        description="Enable analytics tracking"
    )
    
    ENABLE_CACHING: bool = Field(
        default=True,
        description="Enable Redis caching"
    )

    QUICK_PREVIEW_DEFAULT_PERSON_IMAGE_URL: str = Field(
        default="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=960&q=80",
        description="Fallback model image URL for quick try-on previews"
    )

    QUICK_PREVIEW_CACHE_TTL_SECONDS: int = Field(
        default=600,
        description="In-memory cache TTL for quick preview responses"
    )

    EMBEDDING_CACHE_TTL_SECONDS: int = Field(
        default=86400,
        description="TTL for cached CLIP embeddings"
    )

    ARTIFACT_CACHE_TTL_SECONDS: int = Field(
        default=604800,
        description="TTL for cached artifact URLs such as background-removed images"
    )

    QUALITY_THRESHOLD_EXCELLENT: float = Field(
        default=0.82,
        description="Combined quality score threshold for passing without refinement"
    )

    QUALITY_THRESHOLD_ACCEPTABLE: float = Field(
        default=0.70,
        description="Combined quality score threshold for light correction path"
    )

    QUALITY_THRESHOLD_POOR: float = Field(
        default=0.60,
        description="Combined quality score threshold lower bound"
    )

    # ==================== Tripo AI (3D Pipeline) ====================

    THREE_D_ENGINE: str = Field(
        default="smpl_pifuhd",
        description="Primary 3D engine. Supported: smpl_pifuhd, tripo"
    )

    THREE_D_ALLOW_TRIPO_FALLBACK: bool = Field(
        default=True,
        description="Allow Tripo fallback when SMPL+PIFuHD service is unavailable"
    )

    SMPL_PIFUHD_API_BASE_URL: Optional[str] = Field(
        default=None,
        description="Base URL for SMPL + PIFuHD 3D service"
    )

    SMPL_PIFUHD_CREATE_AVATAR_ENDPOINT: str = Field(
        default="/v1/avatar/create",
        description="SMPL+PIFuHD endpoint for avatar creation"
    )

    SMPL_PIFUHD_FIT_GARMENT_ENDPOINT: str = Field(
        default="/v1/avatar/fit-garment",
        description="SMPL+PIFuHD endpoint for 3D garment fitting"
    )

    SMPL_PIFUHD_HTTP_TIMEOUT_SECONDS: int = Field(
        default=120,
        description="HTTP timeout for SMPL+PIFuHD requests"
    )

    SMPL_PIFUHD_API_KEY: Optional[str] = Field(
        default=None,
        description="Optional API key for SMPL+PIFuHD service"
    )

    TRIPO_API_KEY: Optional[str] = Field(
        default=None,
        description="Tripo API key for 3D mannequin generation"
    )

    TRIPO_API_BASE_URL: str = Field(
        default="https://api.tripo3d.ai",
        description="Base URL for Tripo API"
    )

    TRIPO_CREATE_AVATAR_ENDPOINT: str = Field(
        default="/v2/openapi/avatar/create",
        description="Tripo endpoint for avatar creation"
    )

    TRIPO_FIT_GARMENT_ENDPOINT: str = Field(
        default="/v2/openapi/avatar/fit-garment",
        description="Tripo endpoint for 3D garment fitting"
    )

    TRIPO_TASK_STATUS_ENDPOINT: str = Field(
        default="/v2/openapi/task/{task_id}",
        description="Tripo endpoint template for task status polling"
    )

    TRIPO_HTTP_TIMEOUT_SECONDS: int = Field(
        default=30,
        description="HTTP timeout for Tripo API requests"
    )

    TRIPO_POLL_INTERVAL_SECONDS: int = Field(
        default=2,
        description="Polling interval in seconds for async Tripo tasks"
    )

    TRIPO_MAX_WAIT_SECONDS: int = Field(
        default=180,
        description="Maximum wait time for Tripo async tasks"
    )

    # ==================== YOLO11 Pose (Quick Preview) ====================

    YOLO11_POSE_ENABLED: bool = Field(
        default=True,
        description="Enable YOLO11 pose extraction for quick try-on previews"
    )

    YOLO11_POSE_MODEL: str = Field(
        default="yolo11n-pose.pt",
        description="Ultralytics model identifier/path for YOLO11 pose"
    )
    
    # ==================== Validators ====================
    
    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Validate environment value."""
        allowed = ["development", "staging", "production"]
        if v not in allowed:
            raise ValueError(f"Environment must be one of {allowed}")
        return v
    
    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level."""
        allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in allowed:
            raise ValueError(f"Log level must be one of {allowed}")
        return v.upper()

    @field_validator("THREE_D_ENGINE")
    @classmethod
    def validate_three_d_engine(cls, v: str) -> str:
        """Validate 3D engine selection."""
        normalized = (v or "smpl_pifuhd").strip().lower()
        allowed = ["smpl_pifuhd", "tripo"]
        if normalized not in allowed:
            raise ValueError(f"THREE_D_ENGINE must be one of {allowed}")
        return normalized

    @field_validator("TRYON_PROVIDER")
    @classmethod
    def validate_tryon_provider(cls, v: str) -> str:
        """Validate try-on provider selection."""
        normalized = (v or "fashn").strip().lower()
        allowed = ["fashn", "replicate_legacy"]
        if normalized not in allowed:
            raise ValueError(f"TRYON_PROVIDER must be one of {allowed}")
        return normalized

    @field_validator("TRYON_OUTPUT_FORMAT")
    @classmethod
    def validate_output_format(cls, v: str) -> str:
        normalized = (v or "png").strip().lower()
        allowed = ["png", "jpeg", "jpg"]
        if normalized not in allowed:
            raise ValueError(f"TRYON_OUTPUT_FORMAT must be one of {allowed}")
        return "jpeg" if normalized == "jpg" else normalized

    @field_validator("POSTPROCESS_LANES")
    @classmethod
    def validate_postprocess_lanes(cls, v: str) -> str:
        raw = (v or "").strip().lower()
        if not raw:
            return ""
        allowed = {"fast", "balanced", "best"}
        lanes = [token.strip() for token in raw.split(",") if token.strip()]
        invalid = [lane for lane in lanes if lane not in allowed]
        if invalid:
            raise ValueError(f"POSTPROCESS_LANES contains unknown lanes: {invalid}. Allowed: {sorted(allowed)}")
        return ",".join(lanes)
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    # ==================== Computed Properties ====================
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.ENVIRONMENT == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.ENVIRONMENT == "development"
    
    @property
    def database_url_async(self) -> str:
        """Get async database URL."""
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.DATABASE_URL
    
    @property
    def s3_endpoint_url(self) -> str:
        """Get S3 endpoint URL."""
        return f"https://s3.{self.AWS_REGION}.amazonaws.com"
    
    # ==================== Helper Methods ====================
    
    def get_s3_url(self, key: str) -> str:
        """
        Get full S3 URL for a key.
        
        Args:
            key: S3 object key
            
        Returns:
            Full S3 URL
        """
        if self.S3_PUBLIC_URL:
            return f"{self.S3_PUBLIC_URL}/{key}"
        return f"https://{self.S3_BUCKET_NAME}.s3.{self.AWS_REGION}.amazonaws.com/{key}"
    
    def model_dump_safe(self) -> dict:
        """
        Dump settings without sensitive values.
        
        Returns:
            Dictionary with safe settings
        """
        sensitive_keys = {
            "DATABASE_URL",
            "REDIS_URL",
            "AWS_SECRET_ACCESS_KEY",
            "SECRET_KEY",
            "CLERK_SECRET_KEY",
            "CLERK_WEBHOOK_SECRET",
            "REPLICATE_API_TOKEN",
            "FASHN_API_KEY",
            "SMTP_PASSWORD",
            "STRIPE_SECRET_KEY",
            "STRIPE_WEBHOOK_SECRET",
            "SENTRY_DSN",
        }
        
        data = self.model_dump()
        
        for key in sensitive_keys:
            if key in data and data[key]:
                data[key] = "***REDACTED***"
        
        return data


# ==================== Singleton Instance ====================

@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Returns:
        Settings instance
    """
    return Settings()


# ==================== Export ====================

settings = get_settings()

__all__ = ["Settings", "get_settings", "settings"]