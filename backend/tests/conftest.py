"""Shared pytest setup for backend tests.

The app's Settings model requires a handful of env vars at import time.
We populate dummy values here -- before any `app.*` module is imported --
so unit tests that only exercise pure logic (no real DB / AWS calls) can
import the app package without a configured environment.
"""

import os

# File-based SQLite so engine creation succeeds without psycopg2 or a live
# Postgres. Unit tests here never actually open a session, but SQLAlchemy
# imports the DBAPI driver eagerly at create_engine() time. Dummy AWS /
# secret values keep boto3 client construction happy.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_unit.db")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test-access-key")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test-secret-key")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("REPLICATE_API_TOKEN", "test-replicate-token")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
