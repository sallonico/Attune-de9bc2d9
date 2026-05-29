from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, get_database
from app.services.scheduling import ensure_routine, ensure_schedule

router = APIRouter(prefix="/profile", tags=["profile"])


def _validate_hhmm(v: str) -> str:
    if len(v) != 5 or v[2] != ":":
        raise ValueError("scheduleTime must be HH:mm")
    hh, mm = v.split(":")
    if not (hh.isdigit() and mm.isdigit()):
        raise ValueError("scheduleTime must be HH:mm")
    h, m = int(hh), int(mm)
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("scheduleTime out of range")
    return v


class Features(BaseModel):
    aiInsights: bool = True
    wellnessCheckIns: bool = True
    caregiverAccess: bool = False


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    medication: str = Field(min_length=1, max_length=120)
    scheduleTime: str
    features: Features = Field(default_factory=Features)

    @field_validator("scheduleTime")
    @classmethod
    def _valid(cls, v: str) -> str:
        return _validate_hhmm(v)


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    medication: str | None = Field(default=None, min_length=1, max_length=120)
    scheduleTime: str | None = None
    features: Features | None = None

    @field_validator("scheduleTime")
    @classmethod
    def _valid(cls, v: str | None) -> str | None:
        return _validate_hhmm(v) if v is not None else v


def _serialize(profile: dict) -> dict:
    return {
        "name": profile["name"],
        "medication": profile["medication"],
        "scheduleTime": profile["scheduleTime"],
        "features": profile.get("features", {}),
        "deviceConnected": profile.get("deviceConnected", False),
        "remindMeCount": profile.get("remindMeCount", 0),
        "schedule": ensure_schedule(profile),
        "routine": ensure_routine(profile),
    }


@router.post("")
async def upsert_profile(
    body: ProfileBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    now = datetime.now(timezone.utc)
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {
            "$set": {
                "name": body.name,
                "medication": body.medication,
                "scheduleTime": body.scheduleTime,
                "features": body.features.model_dump(),
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": current_user["_id"],
                "deviceConnected": False,
                "remindMeCount": 0,
                "created_at": now,
            },
        },
        upsert=True,
    )
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    return _serialize(profile)


@router.get("")
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="profile_not_found")
    return _serialize(profile)


@router.patch("")
async def patch_profile(
    body: ProfilePatch,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    existing = await db.profiles.find_one({"user_id": current_user["_id"]})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="profile_not_found")
    update: dict = {}
    if body.name is not None:
        update["name"] = body.name
    if body.medication is not None:
        update["medication"] = body.medication
    if body.scheduleTime is not None:
        update["scheduleTime"] = body.scheduleTime
    if body.features is not None:
        update["features"] = body.features.model_dump()
    if update:
        update["updated_at"] = datetime.now(timezone.utc)
        await db.profiles.update_one({"user_id": current_user["_id"]}, {"$set": update})
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    return _serialize(profile)
