"""
Enable PostgreSQL pg_trgm extension for full-text search
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import async_engine


async def enable_pg_trgm():
    """Enable pg_trgm extension for trigram-based text search."""
    print("Enabling pg_trgm extension...")
    
    async with async_engine.begin() as conn:
        # Check if extension exists
        result = await conn.execute(
            text("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')")
        )
        exists = result.scalar()
        
        if not exists:
            # Create extension
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            print("✅ pg_trgm extension enabled successfully!")
        else:
            print("✅ pg_trgm extension already enabled")


if __name__ == "__main__":
    asyncio.run(enable_pg_trgm())