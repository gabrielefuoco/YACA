from pydantic import BaseModel


class StatsResponse(BaseModel):
    total_users: int
