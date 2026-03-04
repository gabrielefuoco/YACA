import json

import httpx
from loguru import logger


class CinemetaService:
    def __init__(self):
        self.base_url = "https://v3-cinemeta.strem.io"

    async def get_metadata(self, imdb_id: str, content_type: str) -> dict[str, any]:
        url = f"{self.base_url}/meta/{content_type}/{imdb_id}.json"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(url, follow_redirects=True)
                response.raise_for_status()  # Raise an exception for 4xx/5xx responses
                json_response = response.json()
                return json_response.get("meta", {})
            except (httpx.HTTPStatusError, httpx.RequestError, json.JSONDecodeError) as e:
                logger.error(f"Error getting metadata for {imdb_id}: {e}")
                return {}


cinemeta_service = CinemetaService()
