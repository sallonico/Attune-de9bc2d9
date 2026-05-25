from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.deps import get_current_user, get_database

router = APIRouter(prefix="/logs", tags=["logs"])


class LogBody(BaseModel):
    status: Literal["taken", "missed"]


class CheckInBody(BaseModel):
    physical: int = Field(ge=1, le=5)
    emotional: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=500)


def _serialize_log(log: dict) -> dict:
    out = {
        "id": str(log["_id"]),
        "timestamp": log["timestamp"].isoformat() if isinstance(log["timestamp"], datetime) else log["timestamp"],
        "status": log["status"],
    }
    if log.get("checkIn"):
        out["checkIn"] = log["checkIn"]
    return out


def _date_key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


@router.post("")
async def create_log(
    body: LogBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    now = datetime.now(timezone.utc)
    key = _date_key(now)
    await db.logs.update_one(
        {"user_id": current_user["_id"], "date_key": key},
        {
            "$set": {
                "user_id": current_user["_id"],
                "date_key": key,
                "timestamp": now,
                "status": body.status,
            },
            "$setOnInsert": {"checkIn": None},
        },
        upsert=True,
    )
    # Reset remind-me counter on any dose log
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"remindMeCount": 0}},
    )
    log = await db.logs.find_one({"user_id": current_user["_id"], "date_key": key})
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
