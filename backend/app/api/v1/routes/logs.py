from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.deps import get_current_user, get_database
from app.services.scheduling import LEGACY_MED_ID, ensure_medications, find_medication

router = APIRouter(prefix="/logs", tags=["logs"])


class LogBody(BaseModel):
    status: Literal["taken", "missed"]
    # Which medication this dose is for. Optional for backward compatibility;
    # absent means the legacy single medication.
    medicationId: str | None = None


class CheckInBody(BaseModel):
    physical: int = Field(ge=1, le=5)
    emotional: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=500)


def _serialize_log(log: dict) -> dict:
    out = {
        "id": str(log["_id"]),
        "timestamp": log["timestamp"].isoformat() if isinstance(log["timestamp"], datetime) else log["timestamp"],
        "status": log["status"],
        # Legacy logs predate per-med tracking → map them to the primary med.
        "medicationId": log.get("medication_id", LEGACY_MED_ID),
    }
    if log.get("checkIn"):
        out["checkIn"] = log["checkIn"]
    return out


async def _resolve_med_id(db: AsyncIOMotorDatabase, user_id, medication_id: str | None) -> str:
    """Validate the medication id against the profile, defaulting to the only
    medication when the client omits it (single-med convenience)."""
    profile = await db.profiles.find_one({"user_id": user_id})
    meds = ensure_medications(profile)
    if medication_id is None:
        return meds[0]["id"]
    if find_medication(meds, medication_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="medication_not_found")
    return medication_id


def _date_key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


@router.post("")
async def create_log(
    body: LogBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    med_id = await _resolve_med_id(db, current_user["_id"], body.medicationId)
    now = datetime.now(timezone.utc)
    key = _date_key(now)
    # One log per medication per day: upsert on (user, medication, date).
    await db.logs.update_one(
        {"user_id": current_user["_id"], "medication_id": med_id, "date_key": key},
        {
            "$set": {
                "user_id": current_user["_id"],
                "medication_id": med_id,
                "date_key": key,
                "timestamp": now,
                "status": body.status,
            },
            "$setOnInsert": {"checkIn": None},
        },
        upsert=True,
    )
    # Reset this medication's remind-me counter on any dose log.
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {f"remindMeCounts.{med_id}": 0}},
    )
    log = await db.logs.find_one(
        {"user_id": current_user["_id"], "medication_id": med_id, "date_key": key}
    )
    return _serialize_log(log)


@router.get("")
async def list_logs(
    days: int = Query(default=30, ge=1, le=90),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.logs.find(
        {"user_id": current_user["_id"], "timestamp": {"$gte": cutoff}}
    ).sort("timestamp", 1)
    logs = [_serialize_log(doc) async for doc in cursor]
    return {"logs": logs}


@router.post("/{log_id}/check-in")
async def attach_check_in(
    log_id: str,
    body: CheckInBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    try:
        oid = ObjectId(log_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="log_not_found")
    log = await db.logs.find_one({"_id": oid, "user_id": current_user["_id"]})
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="log_not_found")
    check_in = {"physical": body.physical, "emotional": body.emotional}
    if body.note is not None and body.note.strip():
        check_in["note"] = body.note.strip()
    await db.logs.update_one({"_id": oid}, {"$set": {"checkIn": check_in}})
    updated = await db.logs.find_one({"_id": oid})
    return _serialize_log(updated)
