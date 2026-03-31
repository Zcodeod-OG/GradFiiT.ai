"""
AULTER.AI - Replicate Service
Handles virtual try-on generation using Replicate API
"""

import logging
import os
from typing import Dict, Any, Optional
import replicate
from replicate.exceptions import ReplicateError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ReplicateService:
    """
    Service for interacting with Replicate API for virtual try-on.
    """
    
    # IDM-VTON model on Replicate
    MODEL_VERSION = "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4"
    
    def __init__(self):
        """Initialize Replicate service."""
        self.api_token = settings.REPLICATE_API_TOKEN
        
        if not self.api_token:
            logger.warning("⚠️  REPLICATE_API_TOKEN not set")
        
        # Set environment variable for replicate client
        os.environ["REPLICATE_API_TOKEN"] = self.api_token
    
    def generate_tryon(
        self,
        person_image_url: str,
        garment_image_url: str,
        garment_description: str = "a garment",
        webhook_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate virtual try-on using Replicate.
        
        Args:
            person_image_url: URL to person image
            garment_image_url: URL to garment image
            garment_description: Description of garment
            webhook_url: Optional webhook URL for async results
            
        Returns:
            Dictionary with prediction info
            
        Raises:
            ReplicateError: If API call fails
        """
        try:
            logger.info(f"🎨 Starting try-on generation")
            logger.info(f"   Person: {person_image_url}")
            logger.info(f"   Garment: {garment_image_url}")
            
            # Prepare input
            input_data = {
                "human_img": person_image_url,
                "garm_img": garment_image_url,
                "garment_des": garment_description,
            }
            
            # Run prediction
            if webhook_url:
                # Async with webhook
                prediction = replicate.predictions.create(
                    version=self.MODEL_VERSION,
                    input=input_data,
                    webhook=webhook_url,
                    webhook_events_filter=["completed"]
                )
                
                logger.info(f"✅ Async prediction created: {prediction.id}")
                
                return {
                    "prediction_id": prediction.id,
                    "status": prediction.status,
                    "webhook_url": webhook_url,
                    "async": True
                }
            else:
                # Synchronous
                logger.info("⏳ Running synchronous prediction...")
                
                output = replicate.run(
                    self.MODEL_VERSION,
                    input=input_data
                )
                
                logger.info(f"✅ Prediction complete")
                
                return {
                    "output_url": output,
                    "status": "succeeded",
                    "async": False
                }
                
        except ReplicateError as e:
            logger.error(f"❌ Replicate API error: {str(e)}")
            raise
            
        except Exception as e:
            logger.error(f"❌ Unexpected error: {str(e)}")
            raise
    
    def get_prediction(self, prediction_id: str) -> Dict[str, Any]:
        """
        Get status of a prediction.
        
        Args:
            prediction_id: Replicate prediction ID
            
        Returns:
            Prediction status and output
        """
        try:
            prediction = replicate.predictions.get(prediction_id)
            
            return {
                "id": prediction.id,
                "status": prediction.status,
                "output": prediction.output,
                "error": prediction.error,
                "logs": prediction.logs,
                "metrics": prediction.metrics,
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get prediction: {str(e)}")
            raise
    
    def cancel_prediction(self, prediction_id: str) -> bool:
        """
        Cancel a running prediction.
        
        Args:
            prediction_id: Replicate prediction ID
            
        Returns:
            True if cancelled successfully
        """
        try:
            prediction = replicate.predictions.get(prediction_id)
            prediction.cancel()
            
            logger.info(f"✅ Prediction cancelled: {prediction_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to cancel prediction: {str(e)}")
            return False


# Singleton instance
_replicate_service: Optional[ReplicateService] = None


def get_replicate_service() -> ReplicateService:
    """Get singleton instance of ReplicateService."""
    global _replicate_service
    
    if _replicate_service is None:
        _replicate_service = ReplicateService()
    
    return _replicate_service


__all__ = ["ReplicateService", "get_replicate_service"]