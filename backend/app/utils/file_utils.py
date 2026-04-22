"""
AULTER.AI - File Utility Functions
Helper functions for file handling and validation
"""

import hashlib
import uuid
from datetime import datetime
from typing import Tuple, Optional
from pathlib import Path
import imghdr

from app.config import get_settings

settings = get_settings()


def generate_unique_filename(original_filename: str, prefix: str = "") -> str:
    """
    Generate unique filename with timestamp and UUID.
    
    Args:
        original_filename: Original file name
        prefix: Optional prefix for the filename
        
    Returns:
        Unique filename string
    """
    # Get file extension
    ext = Path(original_filename).suffix.lower()
    
    # Generate unique ID
    unique_id = str(uuid.uuid4())[:8]
    
    # Get timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    
    # Build filename
    if prefix:
        filename = f"{prefix}_{timestamp}_{unique_id}{ext}"
    else:
        filename = f"{timestamp}_{unique_id}{ext}"
    
    return filename


def generate_s3_key(folder: str, filename: str, user_id: str = None) -> str:
    """
    Generate S3 key with proper folder structure.
    
    Args:
        folder: Folder name (uploads, results, garments, etc.)
        filename: File name
        user_id: Optional user ID for user-specific folders
        
    Returns:
        S3 key string
    """
    if user_id:
        return f"{folder}/{user_id}/{filename}"
    else:
        return f"{folder}/{filename}"


def validate_image_file(file_data: bytes, max_size: int = None) -> Tuple[bool, Optional[str]]:
    """
    Validate image file.
    
    Args:
        file_data: File content as bytes
        max_size: Maximum file size in bytes (default from settings)
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if max_size is None:
        max_size = settings.MAX_UPLOAD_SIZE
    
    # Check file size
    if len(file_data) > max_size:
        max_mb = max_size / (1024 * 1024)
        return False, f"File size exceeds maximum allowed ({max_mb:.1f}MB)"
    
    # Check if it's a valid image
    image_type = imghdr.what(None, h=file_data)
    
    if image_type is None:
        return False, "File is not a valid image"
    
    # Check if extension is allowed
    allowed_extensions = settings.allowed_extensions_list
    
    if image_type not in allowed_extensions:
        return False, f"Image type '{image_type}' not allowed. Allowed: {', '.join(allowed_extensions)}"
    
    return True, None


def get_file_hash(file_data: bytes) -> str:
    """
    Calculate SHA256 hash of file.
    
    Args:
        file_data: File content as bytes
        
    Returns:
        Hex string of file hash
    """
    return hashlib.sha256(file_data).hexdigest()


def get_content_type_from_extension(filename: str) -> str:
    """
    Get content type from file extension.
    
    Args:
        filename: File name with extension
        
    Returns:
        Content type string
    """
    ext = Path(filename).suffix.lower()
    
    content_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
    }
    
    return content_types.get(ext, 'application/octet-stream')


def format_file_size(size_bytes: int) -> str:
    """
    Format file size in human-readable format.
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Formatted string (e.g., "1.5 MB")
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    
    return f"{size_bytes:.1f} PB"


def extract_filename_from_url(url: str) -> str:
    """
    Extract filename from S3 URL.
    
    Args:
        url: S3 URL
        
    Returns:
        Filename string
    """
    return Path(url).name


def build_thumbnail_key(original_key: str) -> str:
    """
    Build thumbnail key from original key.
    
    Args:
        original_key: Original S3 key
        
    Returns:
        Thumbnail key string
    """
    path = Path(original_key)
    return str(path.parent / f"{path.stem}_thumb{path.suffix}")


__all__ = [
    "generate_unique_filename",
    "generate_s3_key",
    "validate_image_file",
    "get_file_hash",
    "get_content_type_from_extension",
    "format_file_size",
    "extract_filename_from_url",
    "build_thumbnail_key",
]