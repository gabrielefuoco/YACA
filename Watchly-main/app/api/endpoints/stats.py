from fastapi import APIRouter
from loguru import logger

from app.api.models.stats import StatsResponse
from app.services.token_store import token_store

router = APIRouter(tags=["Stats"])


@router.get("/stats")
async def get_stats() -> StatsResponse:
    try:
        total = await token_store.count_users()
    except Exception as exc:
        logger.error(f"Failed to get total users: {exc}")
        total = 0
    return StatsResponse(total_users=total)
