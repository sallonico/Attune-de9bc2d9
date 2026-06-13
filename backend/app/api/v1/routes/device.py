from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.deps import get_current_user, get_database

router = APIRouter(prefix="/device", tags=["device"])


class DeviceStateBody(BaseModel):
    connected: bool


async def _get_profile(db: AsyncIOMotorDatabase, user_id) -> dict:
    profile = await db.profiles.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="profile_not_found")
    return profile


@router.get("")
async def get_device(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _get_profile(db, current_user["_id"])
    return {"deviceConnected": bool(profile.get("deviceConnected", False))}


@router.post("")
async def set_device(
    body: DeviceStateBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    # The actual BLE link lives in the browser; this only records the last known
    # connected/disconnected state so it survives a refresh and can be shared.
    await _get_profile(db, current_user["_id"])  # 404 if no profile
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {"deviceConnected": body.connected}},
    )
    return {"deviceConnected": body.connected}
