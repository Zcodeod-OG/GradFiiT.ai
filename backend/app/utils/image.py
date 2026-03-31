from PIL import Image
import io
from typing import Tuple


def validate_image(file_bytes: bytes, max_size: int = 10 * 1024 * 1024) -> bool:
    """Validate image file"""
    if len(file_bytes) > max_size:
        return False
    try:
        Image.open(io.BytesIO(file_bytes))
        return True
    except Exception:
        return False


def resize_image(
    image_bytes: bytes, max_width: int = 2048, max_height: int = 2048
) -> bytes:
    """Resize image while maintaining aspect ratio"""
    image = Image.open(io.BytesIO(image_bytes))
    image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    if image.mode == "RGBA":
        image.save(output, format="PNG")
    else:
        image.save(output, format="JPEG", quality=85)
    return output.getvalue()


def get_image_dimensions(image_bytes: bytes) -> Tuple[int, int]:
    """Get image dimensions"""
    image = Image.open(io.BytesIO(image_bytes))
    return image.size

