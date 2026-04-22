"""
Test Authentication Dependencies
"""

import sys
from pathlib import Path
import asyncio

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.api.deps import verify_clerk_token, jwks_cache


async def test_auth():
    """Test authentication functions."""
    print("=" * 60)
    print("Testing Authentication")
    print("=" * 60)
    print()
    
    # Test 1: Fetch JWKS
    print("Test 1: Fetch Clerk JWKS")
    print("-" * 40)
    
    try:
        jwks = await jwks_cache.get_jwks()
        print(f"✅ JWKS fetched successfully")
        print(f"   Keys: {len(jwks.get('keys', []))}")
        print()
    except Exception as e:
        print(f"❌ Failed: {str(e)}")
        print()
    
    # Test 2: Verify token (with sample token)
    print("Test 2: Verify Token")
    print("-" * 40)
    print("⚠️  Skipping - requires valid Clerk token")
    print("   To test: Use a real token from your frontend")
    print()
    
    # Test 3: Cache expiration
    print("Test 3: JWKS Cache")
    print("-" * 40)
    print(f"   Cache expired: {jwks_cache.is_expired()}")
    print(f"   Last fetch: {jwks_cache._last_fetch}")
    print()
    
    print("=" * 60)
    print("✅ Tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_auth())