from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_current_user, get_database

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/trend")
async def trend(
    days: int = Query(default=30, ge=1, le=90),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.logs.find(
        {"user_id": current_user["_id"], "timestamp": {"$gte": cutoff}},
        {"status": 1},
    )
    total = 0
    taken = 0
    async for doc in cursor:
        total += 1
        if doc.get("status") == "taken":
            taken += 1
    pct = round((taken / total) * 100) if total else 0
    return {"days": days, "takenCount": taken, "totalCount": total, "trendPercentage": pct}
