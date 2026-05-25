from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_current_user, get_database

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _date_key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


@router.post("/remind-later")
async def remind_later(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    current = (profile or {}).get("remindMeCount", 0)
    new_count = current + 1

    if new_count >= 3:
        now = datetime.now(timezone.utc)
        key = _date_key(now)
        await db.logs.update_one(
            {"user_id": current_user["_id"], "date_key": key},
            {
                "$set": {
                    "user_id": current_user["_id"],
                    "date_key": key,
                    "timestamp": now,
                    "status": "missed",
                },
                "$setOnInsert": {"checkIn": None},
            },
            upsert=True,
        )
        await db.profiles.update_one(
            {"user_id": current_user["_id"]},
            {"$set": {"remindMeCount": 0}},
        )
        return {"remindMeCount": 0, "autoMissed": True}

    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"remindMeCount": new_count}},
    )
    return {"remindMeCount": new_count, "autoMissed": False}


@router.post("/reset")
async def reset_reminder(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"remindMeCount": 0}},
    )
    return {"remindMeCount": 0}
