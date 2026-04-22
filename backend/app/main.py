import logging
import time
from contextlib import asynccontextmanager
from typing import Callable
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import engine
from app.api.routes import (
    affiliate,
    auth,
    billing,
    garments,
    tryon,
    upload,
    user,
    webhook,
)


logger = logging.getLogger("gradfit.api")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context.

    Used for startup/shutdown tasks such as database connectivity checks.
    """
    # Startup
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        logger.info("Database connection established successfully.")
    except Exception as exc:  # pragma: no cover - log-only path
        logger.exception("Database connection failed during startup: %s", exc)

    yield

    # Shutdown
    try:
        engine.dispose()
        logger.info("Database engine disposed successfully.")
    except Exception as exc:  # pragma: no cover - log-only path
        logger.exception("Error while disposing database engine: %s", exc)


limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

app = FastAPI(
    title="GradFiT API",
    description="AI-powered virtual try-on API",
    version="1.0.0",
    lifespan=lifespan,
)

# Attach limiter to app state for use in routes if needed
app.state.limiter = limiter


# CORS middleware
allowed_origins = set(settings.CORS_ORIGINS or [])
allowed_origins.add("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Rate limiting middleware
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next: Callable):
    """Add basic security headers to all responses."""
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-XSS-Protection", "1; mode=block")
    response.headers.setdefault(
        "Referrer-Policy",
        "strict-origin-when-cross-origin",
    )
    # Very relaxed CSP; tighten as needed
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src * data: blob:; media-src * data: blob:;",
    )
    return response


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: Callable):
    """Log incoming requests and their response time."""
    start_time = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "Unhandled error for %s %s",
            request.method,
            request.url.path,
        )
        raise

    process_time = (time.perf_counter() - start_time) * 1000
    logger.info(
        "%s %s - %d (%.2f ms)",
        request.method,
        request.url.path,
        response.status_code,
        process_time,
    )
    return response


# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(user.router, tags=["user"])
app.include_router(garments.router, prefix="/api/garments", tags=["garments"])
app.include_router(tryon.router, tags=["tryon"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(webhook.router, tags=["webhooks"])
app.include_router(billing.router)
app.include_router(affiliate.router)


@app.get("/")
async def root():
    return {"message": "GradFiT API", "version": app.version}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": app.version}


# Exception handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={
                "detail": "Resource not found",
                "path": request.url.path,
            },
        )
    # For other HTTP errors, return the default structure
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    logger.warning("Validation error on %s %s: %s", request.method, request.url, exc)
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded",
            "error": str(exc.detail) if hasattr(exc, "detail") else str(exc),
        },
    )

