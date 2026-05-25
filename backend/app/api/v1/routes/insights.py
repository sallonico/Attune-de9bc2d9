from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_current_user, get_database

router = APIRouter(prefix="/insights", tags=["insights"])

# Wed = 2, Thu = 3 (Monday=0)
WED_THU = {2, 3}
LOOKBACK_DAYS = 60
MIN_TOTAL_LOGS = 7
WINDOW_SIZE = 8
MIN_MISSED = 4


@router.get("/pattern")
async def pattern(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    cursor = db.logs.find(
        {"user_id": current_user["_id"], "timestamp": {"$gte": cutoff}},
        {"timestamp": 1, "status": 1},
    ).sort("timestamp", -1)

    all_recent = []
    wed_thu = []
    async for doc in cursor:
        ts: datetime = doc["timestamp"]
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        all_recent.append(doc)
        if ts.weekday() in WED_THU:
            wed_thu.append({
                "date": ts.date().isoformat(),
                "status": doc["status"],
            })

    if len(all_recent) < MIN_TOTAL_LOGS:
        return {"detected": False, "message": "", "evidence": []}

    window = wed_thu[:WINDOW_SIZE]
    missed = sum(1 for e in window if e["status"] == "missed")
    if len(window) < 2 or missed < MIN_MISSED:
        return {"detected": False, "message": "", "evidence": list(reversed(window))}

    message = (
        f"You tend to skip your dose on Wednesdays and Thursdays — based on recent logs, "
        f"this has happened {missed} of the last {len(window)} occurrences."
    )
    return {
        "detected": True,
        "message": message,
        "evidence": list(reversed(window)),
    }
