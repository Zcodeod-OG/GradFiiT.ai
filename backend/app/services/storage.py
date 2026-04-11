import boto3
from botocore.exceptions import ClientError
from typing import BinaryIO, Tuple, Optional
import uuid
from datetime import datetime
from urllib.parse import urlparse

from app.config import settings


class StorageService:
    """Service for S3 storage operations"""

    def __init__(self):
        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        self.bucket_name = settings.S3_BUCKET_NAME

    def upload_file(
        self, file_obj: BinaryIO, filename: str, user_id: int
    ) -> Tuple[str, str]:
        """Upload a file to S3"""
        # Generate unique key
        file_ext = filename.split(".")[-1] if "." in filename else "jpg"
        key = f"users/{user_id}/{uuid.uuid4()}.{file_ext}"

        try:
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                key,
                ExtraArgs={"ContentType": "image/jpeg"},
            )
            url = f"https://{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
            return key, url
        except ClientError as e:
            raise Exception(f"Failed to upload to S3: {str(e)}")

    def upload_garment(
        self, file_obj: BinaryIO, filename: str, user_id: int
    ) -> Tuple[str, str]:
        """Upload a garment image to S3"""
        file_ext = filename.split(".")[-1] if "." in filename else "jpg"
        key = f"garments/{user_id}/{uuid.uuid4()}.{file_ext}"

        try:
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                key,
                ExtraArgs={"ContentType": "image/jpeg"},
            )
            url = f"https://{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
            return key, url
        except ClientError as e:
            raise Exception(f"Failed to upload garment to S3: {str(e)}")

    def delete_file(self, key: str) -> bool:
        """Delete a file from S3"""
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            raise Exception(f"Failed to delete from S3: {str(e)}")

    def get_presigned_url(self, key: str, expiration: int = 3600) -> str:
        """Generate a presigned URL for temporary access"""
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expiration,
            )
            return url
        except ClientError as e:
            raise Exception(f"Failed to generate presigned URL: {str(e)}")

    def _extract_bucket_key_from_url(self, url: str) -> Optional[str]:
        """Extract object key when URL points to this service bucket."""
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return None

        host = parsed.netloc.lower()
        path_key = parsed.path.lstrip("/")
        if not path_key:
            return None

        canonical_hosts = {
            f"{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com".lower(),
            f"{self.bucket_name}.s3.amazonaws.com".lower(),
        }
        if host in canonical_hosts:
            return path_key

        # Handles variants like s3-accelerate or regional suffixes.
        if host.startswith(f"{self.bucket_name}.s3"):
            return path_key

        return None

    def to_provider_access_url(
        self,
        url: Optional[str],
        s3_key: Optional[str] = None,
        expiration: int = 3600,
    ) -> Optional[str]:
        """Return provider-safe URL, presigning bucket objects when needed."""
        if not url:
            return url

        key = s3_key or self._extract_bucket_key_from_url(url)
        if not key:
            return url

        try:
            return self.get_presigned_url(key, expiration=expiration)
        except Exception:
            # Keep behavior resilient; callers can still attempt the original URL.
            return url


_storage_service = None


def get_storage() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service

