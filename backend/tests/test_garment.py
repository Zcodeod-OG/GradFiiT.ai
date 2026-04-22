"""
Test Garment model operations
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_db_context
from app.models import User, Garment, GarmentCategory, GarmentSourceType, UserTier
from sqlalchemy import select


async def test_garment_operations():
    """Test garment CRUD operations."""
    print("=" * 60)
    print("Testing Garment Model Operations")
    print("=" * 60)
    print()
    
    async with get_db_context() as db:
        # Create test user
        print("Creating test user...")
        user = User(
            clerk_user_id="test_clerk_123",
            email="test@example.com",
            tier=UserTier.PRO
        )
        db.add(user)
        await db.flush()
        print(f"✅ User created: {user}")
        print()
        
        # Create test garment
        print("Creating test garment...")
        garment = Garment(
            user_id=user.id,
            source_type=GarmentSourceType.UPLOAD,
            original_url="https://s3.amazonaws.com/bucket/garment.jpg",
            thumbnail_url="https://s3.amazonaws.com/bucket/garment_thumb.jpg",
            title="Blue Denim Jacket",
            brand="Levi's",
            category=GarmentCategory.JACKET,
            colors=["#4A90E2", "#2E5C8A"],
            primary_color="#4A90E2",
            tags=["casual", "denim", "spring"],
            price=89.99,
            file_size_bytes=2048000,
            image_width=1024,
            image_height=1024,
            is_public=True,
            is_processed=True
        )
        db.add(garment)
        await db.flush()
        print(f"✅ Garment created: {garment}")
        print()
        
        # Test properties
        print("Testing garment properties...")
        print(f"  Display Title: {garment.display_title}")
        print(f"  File Size: {garment.file_size_mb:.2f} MB")
        print(f"  Aspect Ratio: {garment.aspect_ratio}")
        print(f"  Is Ready: {garment.is_ready_for_tryon}")
        print(f"  Popularity: {garment.popularity_score}")
        print()
        
        # Test methods
        print("Testing garment methods...")
        garment.increment_try_on_count()
        garment.increment_view_count()
        garment.add_tag("vintage")
        print(f"  Try-on count: {garment.try_on_count}")
        print(f"  View count: {garment.view_count}")
        print(f"  Tags: {garment.tag_list}")
        print()
        
        # Test to_dict
        print("Testing to_dict...")
        garment_dict = garment.to_dict()
        print(f"  Dictionary keys: {list(garment_dict.keys())[:10]}...")
        print()
        
        # Query garment
        print("Querying garment...")
        result = await db.execute(
            select(Garment).where(Garment.id == garment.id)
        )
        found_garment = result.scalar_one()
        print(f"✅ Found garment: {found_garment.display_title}")
        print()
        
        # Test user relationship
        print("Testing user relationship...")
        print(f"  Garment owner: {found_garment.user.email}")
        print(f"  User's garments: {len(user.garments)}")
        print()
        
        print("=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_garment_operations())