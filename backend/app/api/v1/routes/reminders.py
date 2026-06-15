from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.deps import get_current_user, get_database
from app.services.scheduling import ensure_medications, find_medication

router = APIRouter(prefix="/reminders", tags=["reminders"])


class RemindBody(BaseModel):
    # Which medication is being snoozed. Optional → the single/first medication.
    medicationId: str | None = None


def _date_key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


async def _resolve_med_id(db: AsyncIOMotorDatabase, user_id, medication_id: str | None) -> str:
    profile = await db.profiles.find_one({"user_id": user_id})
    meds = ensure_medications(profile)
    if medication_id is None:
        return meds[0]["id"]
    if find_medication(meds, medication_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="medication_not_found")
    return medication_id


@router.post("/remind-later")
async def remind_later(
    body: RemindBody | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    med_id = await _resolve_med_id(db, current_user["_id"], (body or RemindBody()).medicationId)
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    counts = (profile or {}).get("remindMeCounts", {}) or {}
    new_count = counts.get(med_id, 0) + 1

    if new_count >= 3:
        now = datetime.now(timezone.utc)
        key = _date_key(now)
        await db.logs.update_one(
            {"user_id": current_user["_id"], "medication_id": med_id, "date_key": key},
            {
                "$set": {
                    "user_id": current_user["_id"],
                    "medication_id": med_id,
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
            {"$set": {f"remindMeCounts.{med_id}": 0}},
        )
        return {"medicationId": med_id, "remindMeCount": 0, "autoMissed": True}

    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {f"remindMeCounts.{med_id}": new_count}},
    )
    return {"medicationId": med_id, "remindMeCount": new_count, "autoMissed": False}


@router.post("/reset")
async def reset_reminder(
    body: RemindBody | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    med_id = await _resolve_med_id(db, current_user["_id"], (body or RemindBody()).medicationId)
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {f"remindMeCounts.{med_id}": 0}},
    )
    return {"medicationId": med_id, "remindMeCount": 0}
