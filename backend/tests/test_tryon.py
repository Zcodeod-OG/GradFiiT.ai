"""
Test TryOn model operations
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_db_context
from app.models import User, Garment, TryOn, UserTier, GarmentCategory, GarmentSourceType, QualitySetting, TryOnStatus
from sqlalchemy import select


async def test_tryon_operations():
    """Test try-on CRUD operations."""
    print("=" * 60)
    print("Testing TryOn Model Operations")
    print("=" * 60)
    print()
    
    async with get_db_context() as db:
        # Create test user
        print("Creating test user...")
        user = User(
            clerk_user_id="test_clerk_tryon_123",
            email="tryon@example.com",
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
            title="Test Jacket",
            category=GarmentCategory.JACKET,
            is_processed=True
        )
        db.add(garment)
        await db.flush()
        print(f"✅ Garment created: {garment}")
        print()
        
        # Create test try-on
        print("Creating test try-on...")
        tryon = TryOn(
            user_id=user.id,
            garment_id=garment.id,
            person_image_url="https://s3.amazonaws.com/bucket/person.jpg",
            quality_setting=QualitySetting.BALANCED,
            status=TryOnStatus.PENDING
        )
        db.add(tryon)
        await db.flush()
        print(f"✅ TryOn created: {tryon}")
        print()
        
        # Test status transitions
        print("Testing status transitions...")
        print(f"  Initial status: {tryon.status.value}")
        print(f"  Is pending: {tryon.is_pending}")
        
        tryon.mark_processing(task_id="celery-task-123")
        print(f"  After mark_processing: {tryon.status.value}")
        print(f"  Task ID: {tryon.task_id}")
        print(f"  Is processing: {tryon.is_processing}")
        
        tryon.mark_completed(
            result_url="https://s3.amazonaws.com/bucket/result.jpg",
            processing_time=45.5
        )
        print(f"  After mark_completed: {tryon.status.value}")
        print(f"  Processing time: {tryon.processing_time_seconds}s")
        print(f"  Is completed: {tryon.is_completed}")
        print(f"  Has result: {tryon.has_result}")
        print()
        
        # Test properties
        print("Testing try-on properties...")
        print(f"  Progress: {tryon.progress_percentage}%")
        print(f"  Total time: {tryon.total_time_seconds}s")
        print(f"  Is final: {tryon.is_final}")
        print()
        
        # Test methods
        print("Testing try-on methods...")
        tryon.toggle_favorite()
        print(f"  Is favorite: {tryon.is_favorite}")
        
        tryon.set_rating(5, "Great result!")
        print(f"  Rating: {tryon.rating}/5")
        print(f"  Feedback: {tryon.feedback}")
        
        tryon.mark_downloaded()
        print(f"  Is downloaded: {tryon.is_downloaded}")
        print()
        
        # Test to_dict
        print("Testing to_dict...")
        tryon_dict = tryon.to_dict()
        print(f"  Dictionary keys: {list(tryon_dict.keys())[:10]}...")
        print()
        
        # Test status dict
        print("Testing to_status_dict...")
        status_dict = tryon.to_status_dict()
        print(f"  Status dict: {status_dict}")
        print()
        
        # Query try-on
        print("Querying try-on...")
        result = await db.execute(
            select(TryOn).where(TryOn.id == tryon.id)
        )
        found_tryon = result.scalar_one()
        print(f"✅ Found try-on: {found_tryon}")
        print()
        
        # Test relationships
        print("Testing relationships...")
        print(f"  TryOn user: {found_tryon.user.email}")
        print(f"  TryOn garment: {found_tryon.garment.title}")
        print(f"  User's try-ons: {len(user.tryons)}")
        print(f"  Garment's try-ons: {len(garment.tryons)}")
        print()
        
        # Test failed try-on
        print("Testing failed try-on...")
        failed_tryon = TryOn(
            user_id=user.id,
            garment_id=garment.id,
            person_image_url="https://s3.amazonaws.com/bucket/person2.jpg",
            quality_setting=QualitySetting.FAST,
            status=TryOnStatus.PENDING
        )
        db.add(failed_tryon)
        await db.flush()
        
        failed_tryon.mark_processing()
        failed_tryon.mark_failed("Model inference failed", "MODEL_ERROR")
        print(f"  Failed status: {failed_tryon.status.value}")
        print(f"  Error: {failed_tryon.error_message}")
        print(f"  Can retry: {failed_tryon.can_retry}")
        
        if failed_tryon.retry():
            print(f"  After retry: {failed_tryon.status.value}")
            print(f"  Retry count: {failed_tryon.retry_count}")
        print()
        
        print("=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_tryon_operations())    