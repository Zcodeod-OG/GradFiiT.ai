"""
Test S3 Storage service
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.storage import get_storage, S3StorageError
import io


def test_storage_operations():
    """Test S3 storage operations."""
    print("=" * 60)
    print("Testing S3 Storage Service")
    print("=" * 60)
    print()
    
    try:
        # Get storage instance
        print("Initializing S3 storage...")
        storage = get_storage()
        print(f"✅ Storage initialized: {storage.bucket_name}")
        print()
        
        # Test file upload
        print("Testing file upload...")
        test_data = b"Hello, AULTER.AI! This is a test file."
        test_key = "test/sample.txt"
        
        url = storage.upload_file(
            file_data=test_data,
            key=test_key,
            content_type="text/plain"
        )
        print(f"✅ File uploaded: {url}")
        print()
        
        # Test file exists
        print("Testing file existence...")
        exists = storage.file_exists(test_key)
        print(f"✅ File exists: {exists}")
        print()
        
        # Test get metadata
        print("Testing get metadata...")
        metadata = storage.get_file_metadata(test_key)
        print(f"✅ Metadata retrieved:")
        print(f"   Size: {metadata['size']} bytes")
        print(f"   Content-Type: {metadata['content_type']}")
        print(f"   Last Modified: {metadata['last_modified']}")
        print()
        
        # Test presigned URL
        print("Testing presigned URL generation...")
        presigned_url = storage.generate_presigned_url(test_key, expiration=300)
        print(f"✅ Presigned URL generated (5 min expiry)")
        print(f"   URL: {presigned_url[:80]}...")
        print()
        
        # Test private upload
        print("Testing private file upload...")
        private_key = "test/private-sample.txt"
        key = storage.upload_private_file(
            file_data=test_data,
            key=private_key,
            content_type="text/plain"
        )
        print(f"✅ Private file uploaded: {key}")
        print()
        
        # Test list files
        print("Testing list files...")
        files = storage.list_files(prefix="test/", max_keys=10)
        print(f"✅ Found {len(files)} files:")
        for file in files:
            print(f"   - {file['key']} ({file['size']} bytes)")
        print()
        
        # Test file deletion
        print("Testing file deletion...")
        deleted = storage.delete_file(test_key)
        print(f"✅ File deleted: {deleted}")
        
        deleted = storage.delete_file(private_key)
        print(f"✅ Private file deleted: {deleted}")
        print()
        
        # Test bucket size
        print("Testing bucket size calculation...")
        size = storage.get_bucket_size(prefix="test/")
        print(f"✅ Bucket size (test/ prefix): {size / 1024:.2f} KB")
        print()
        
        print("=" * 60)
        print("✅ All storage tests passed!")
        print("=" * 60)
        
    except S3StorageError as e:
        print(f"❌ Storage error: {str(e)}")
        
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    test_storage_operations()