from typing import List, Tuple
from fastapi import UploadFile
from app.config import settings


def validate_file_extension(filename: str) -> bool:
    """Validate file extension"""
    if not filename:
        return False
    file_ext = "." + filename.split(".")[-1].lower()
    return file_ext in settings.ALLOWED_IMAGE_EXTENSIONS


def validate_file_size(file_size: int) -> bool:
    """Validate file size"""
    return file_size <= settings.MAX_UPLOAD_SIZE


def validate_upload_file(file: UploadFile) -> Tuple[bool, str]:
    """Validate uploaded file"""
    if not validate_file_extension(file.filename):
        return False, f"Invalid file extension. Allowed: {', '.join(settings.ALLOWED_IMAGE_EXTENSIONS)}"
    
    # Note: file.size might not be available, need to read file to check size
    return True, ""

