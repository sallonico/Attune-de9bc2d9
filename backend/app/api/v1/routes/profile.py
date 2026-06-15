import uuid
from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, get_database
from app.services.scheduling import (
    ALL_DAYS,
    DEFAULT_TZ,
    default_schedule,
    derive_profile_mirrors,
    ensure_medications,
    ensure_routine,
    ensure_schedule,
)

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


def _validate_tz(v: str) -> str:
    """Accept only a real IANA zone (e.g. ``America/New_York``) so we never store
    junk that would silently fall back to UTC at display time."""
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("timezone must be a valid IANA name (e.g. America/New_York)")
    return v


class Features(BaseModel):
    aiInsights: bool = True
    wellnessCheckIns: bool = True
    caregiverAccess: bool = False


class MedicationInput(BaseModel):
    """One medication and its own default schedule. Two medications may share a
    time or sit at completely different times — each carries its own."""
    name: str = Field(min_length=1, max_length=120)
    time: str
    daysOfWeek: list[int] = Field(default_factory=lambda: list(ALL_DAYS), min_length=1)
    window: str | None = None
    reason: str | None = Field(default=None, max_length=400)
    source: Literal["ai", "user"] = "user"
    rxcui: str | None = None

    @field_validator("time")
    @classmethod
    def _t(cls, v: str) -> str:
        return _validate_hhmm(v)

    @field_validator("daysOfWeek")
    @classmethod
    def _d(cls, v: list[int]) -> list[int]:
        cleaned = sorted(set(v))
        if any(d < 0 or d > 6 for d in cleaned):
            raise ValueError("daysOfWeek entries must be 0..6 (Mon..Sun)")
        return cleaned

    @field_validator("window")
    @classmethod
    def _w(cls, v: str | None) -> str | None:
        if v is not None and v not in ("morning", "afternoon", "evening", "night"):
            raise ValueError("invalid window")
        return v


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    medications: list[MedicationInput] = Field(min_length=1, max_length=10)
    timezone: str = DEFAULT_TZ
    features: Features = Field(default_factory=Features)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        return _validate_tz(v)


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    timezone: str | None = None
    features: Features | None = None

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        return _validate_tz(v) if v is not None else v


def _build_medications(items: list[MedicationInput]) -> list[dict]:
    """Turn the onboarding payload into stored medication docs, each with a
    fresh id and a complete schedule."""
    meds: list[dict] = []
    for m in items:
        sched = default_schedule(
            time=m.time, window=m.window, reason=m.reason, source=m.source, rxcui=m.rxcui
        )
        sched["daysOfWeek"] = m.daysOfWeek
        meds.append({"id": uuid.uuid4().hex, "name": m.name, "schedule": sched})
    return meds


def _serialize(profile: dict) -> dict:
    meds = ensure_medications(profile)
    return {
        "name": profile["name"],
        "medications": meds,
        # Legacy mirrors so older readers keep working.
        "medication": profile.get("medication", ""),
        "scheduleTime": profile.get("scheduleTime", ""),
        "timezone": profile.get("timezone", DEFAULT_TZ),
        "features": profile.get("features", {}),
        "deviceConnected": profile.get("deviceConnected", False),
        "remindMeCounts": profile.get("remindMeCounts", {}),
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
    meds = _build_medications(body.medications)
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {
            "$set": {
                "name": body.name,
                "medications": meds,
                **derive_profile_mirrors(meds),
                "timezone": body.timezone,
                "features": body.features.model_dump(),
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": current_user["_id"],
                "deviceConnected": False,
                "remindMeCounts": {},
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
    if body.timezone is not None:
        update["timezone"] = body.timezone
    if body.features is not None:
        update["features"] = body.features.model_dump()
    if update:
        update["updated_at"] = datetime.now(timezone.utc)
        await db.profiles.update_one({"user_id": current_user["_id"]}, {"$set": update})
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    return _serialize(profile)
