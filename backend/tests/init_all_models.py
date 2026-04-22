"""
Initialize all database models and create sample data
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import init_db, check_db_connection, get_db_context
from app.models import (
    User, UserTier,
    Garment, GarmentCategory, GarmentSourceType,
    TryOn, TryOnStatus, QualitySetting
)


async def create_sample_data():
    """Create sample data for testing."""
    print("\nCreating sample data...")
    
    async with get_db_context() as db:
        # Create sample user
        user = User(
            clerk_user_id="sample_user_123",
            email="demo@aulter.ai",
            username="demo_user",
            first_name="Demo",
            last_name="User",
            tier=UserTier.PRO
        )
        db.add(user)
        await db.flush()
        print(f"✅ Created user: {user.email}")
        
        # Create sample garments
        garments = [
            Garment(
                user_id=user.id,
                source_type=GarmentSourceType.CATALOG,
                original_url="https://example.com/jacket1.jpg",
                thumbnail_url="https://example.com/jacket1_thumb.jpg",
                title="Classic Denim Jacket",
                brand="Levi's",
                category=GarmentCategory.JACKET,
                colors=["#4A90E2", "#2E5C8A"],
                primary_color="#4A90E2",
                tags=["casual", "denim", "classic"],
                price=89.99,
                is_public=True,
                is_processed=True,
                is_featured=True
            ),
            Garment(
                user_id=user.id,
                source_type=GarmentSourceType.UPLOAD,
                original_url="https://example.com/shirt1.jpg",
                thumbnail_url="https://example.com/shirt1_thumb.jpg",
                title="White Cotton Shirt",
                brand="Uniqlo",
                category=GarmentCategory.SHIRT,
                colors=["#FFFFFF"],
                primary_color="#FFFFFF",
                tags=["formal", "cotton", "white"],
                price=29.99,
                is_public=True,
                is_processed=True
            ),
            Garment(
                user_id=user.id,
                source_type=GarmentSourceType.EXTENSION,
                original_url="https://example.com/dress1.jpg",
                thumbnail_url="https://example.com/dress1_thumb.jpg",
                title="Summer Floral Dress",
                brand="Zara",
                category=GarmentCategory.DRESS,
                colors=["#FF6B9D", "#FFC93C"],
                primary_color="#FF6B9D",
                tags=["summer", "floral", "casual"],
                price=59.99,
                is_public=True,
                is_processed=True
            )
        ]
        
        for garment in garments:
            db.add(garment)
        
        await db.flush()
        print(f"✅ Created {len(garments)} garments")
        
        # Create sample try-ons
        tryons = [
            TryOn(
                user_id=user.id,
                garment_id=garments[0].id,
                person_image_url="https://example.com/person1.jpg",
                result_image_url="https://example.com/result1.jpg",
                quality_setting=QualitySetting.BALANCED,
                status=TryOnStatus.COMPLETED,
                processing_time_seconds=45.2,
                is_favorite=True,
                rating=5
            ),
            TryOn(
                user_id=user.id,
                garment_id=garments[1].id,
                person_image_url="https://example.com/person2.jpg",
                result_image_url="https://example.com/result2.jpg",
                quality_setting=QualitySetting.BEST,
                status=TryOnStatus.COMPLETED,
                processing_time_seconds=98.7,
                rating=4
            ),
            TryOn(
                user_id=user.id,
                garment_id=garments[2].id,
                person_image_url="https://example.com/person3.jpg",
                quality_setting=QualitySetting.FAST,
                status=TryOnStatus.PROCESSING
            )
        ]
        
        for tryon in tryons:
            db.add(tryon)
        
        await db.flush()
        print(f"✅ Created {len(tryons)} try-ons")
        
        print("\n✅ Sample data created successfully!")


async def main():
    """Main initialization function."""
    print("=" * 60)
    print("AULTER.AI - Complete Database Initialization")
    print("=" * 60)
    print()
    
    # Check connection
    print("Checking database connection...")
    is_healthy = await check_db_connection()
    
    if not is_healthy:
        print("❌ Database connection failed!")
        return
    
    print("✅ Database connection successful!")
    print()
    
    # Create tables
    print("Creating database tables...")
    await init_db()
    print("✅ Tables created successfully!")
    
    # Create sample data
    try:
        await create_sample_data()
    except Exception as e:
        print(f"⚠️  Sample data creation failed: {e}")
        print("   (This is OK if data already exists)")
    
    print()
    print("=" * 60)
    print("✅ Database initialization complete!")
    print("=" * 60)
    print()
    print("Models created:")
    print("  - users")
    print("  - garments")
    print("  - tryons")
    print()
    print("You can now start the application:")
    print("  python backend/app/main.py")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())