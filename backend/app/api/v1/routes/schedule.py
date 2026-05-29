import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, get_database
from app.services.drug_timing import suggest_timing
from app.services.scheduling import (
    ensure_routine,
    ensure_schedule,
    recompute_ai_time,
    resolve_window_to_time,
    schedule_view,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])


# --------------------------------------------------------------------------- #
# Validation helpers (mirrors profile.py's HH:mm check)
# --------------------------------------------------------------------------- #
def _validate_hhmm(v: str) -> str:
    if len(v) != 5 or v[2] != ":":
        raise ValueError("time must be HH:mm")
    hh, mm = v.split(":")
    if not (hh.isdigit() and mm.isdigit()):
        raise ValueError("time must be HH:mm")
    h, m = int(hh), int(mm)
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("time out of range")
    return v


def _validate_ymd(v: str) -> str:
    parts = v.split("-")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError("date must be YYYY-MM-DD")
    y, m, d = (int(p) for p in parts)
    if not (1 <= m <= 12 and 1 <= d <= 31):
        raise ValueError("date out of range")
    return f"{y:04d}-{m:02d}-{d:02d}"


async def _require_profile(db: AsyncIOMotorDatabase, user: dict) -> dict:
    profile = await db.profiles.find_one({"user_id": user["_id"]})
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="profile_not_found")
    return profile


async def _save(db: AsyncIOMotorDatabase, user_id, schedule: dict) -> None:
    """Persist the schedule, keeping the legacy flat ``scheduleTime`` in sync so
    untouched code (dashboard header, profile serializer) keeps working."""
    await db.profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "schedule": schedule,
            "scheduleTime": schedule["time"],
            "updated_at": datetime.now(timezone.utc),
        }},
    )


def _view(profile: dict) -> dict:
    return schedule_view(profile, datetime.now(timezone.utc))


# --------------------------------------------------------------------------- #
# AI timing suggestion (used during onboarding and when changing meds)
# --------------------------------------------------------------------------- #
class SuggestBody(BaseModel):
    medication: str = Field(min_length=1, max_length=120)
    withFood: bool | None = None


@router.post("/suggest")
async def suggest(
    body: SuggestBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    # Profile may not exist yet (called mid-onboarding); ensure_routine handles None.
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    routine = ensure_routine(profile)
    suggestion = await suggest_timing(body.medication, body.withFood)
    suggestion["time"] = resolve_window_to_time(suggestion["window"], routine)
    return suggestion


# --------------------------------------------------------------------------- #
# Read the resolved schedule + next due + upcoming + conflicts
# --------------------------------------------------------------------------- #
@router.get("")
async def get_schedule(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    return _view(profile)


# --------------------------------------------------------------------------- #
# Set the default weekly schedule
# --------------------------------------------------------------------------- #
class ScheduleBody(BaseModel):
    time: str
    daysOfWeek: list[int] = Field(min_length=1)
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


@router.put("")
async def put_schedule(
    body: ScheduleBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    sched = ensure_schedule(profile)
    sched.update({
        "time": body.time,
        "daysOfWeek": body.daysOfWeek,
        "window": body.window,
        "reason": body.reason,
        "source": body.source,
        "rxcui": body.rxcui if body.rxcui is not None else sched.get("rxcui"),
    })
    await _save(db, current_user["_id"], sched)
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Per-weekday override
# --------------------------------------------------------------------------- #
class DayOverrideBody(BaseModel):
    weekday: int = Field(ge=0, le=6)
    time: str

    @field_validator("time")
    @classmethod
    def _t(cls, v: str) -> str:
        return _validate_hhmm(v)


@router.post("/day-override")
async def add_day_override(
    body: DayOverrideBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    sched = ensure_schedule(profile)
    sched.setdefault("dayOverrides", {})[str(body.weekday)] = body.time
    await _save(db, current_user["_id"], sched)
    return _view(await _require_profile(db, current_user))


@router.delete("/day-override/{weekday}")
async def remove_day_override(
    weekday: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    sched = ensure_schedule(profile)
    sched.get("dayOverrides", {}).pop(str(weekday), None)
    await _save(db, current_user["_id"], sched)
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Date-range override: temporary shift, fixed time, or pause
# --------------------------------------------------------------------------- #
class DateOverrideBody(BaseModel):
    start: str
    end: str | None = None
    type: Literal["shift", "set", "pause"]
    shiftMinutes: int | None = Field(default=None, ge=-720, le=720)
    time: str | None = None
    note: str | None = Field(default=None, max_length=120)

    @field_validator("start", "end")
    @classmethod
    def _date(cls, v: str | None) -> str | None:
        return _validate_ymd(v) if v is not None else v

    @field_validator("time")
    @classmethod
    def _t(cls, v: str | None) -> str | None:
        return _validate_hhmm(v) if v is not None else v


@router.post("/date-override")
async def add_date_override(
    body: DateOverrideBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if body.type == "shift" and body.shiftMinutes is None:
        raise HTTPException(status_code=422, detail="shiftMinutes required for type 'shift'")
    if body.type == "set" and body.time is None:
        raise HTTPException(status_code=422, detail="time required for type 'set'")

    profile = await _require_profile(db, current_user)
    sched = ensure_schedule(profile)
    override = {
        "id": uuid.uuid4().hex,
        "start": body.start,
        "end": body.end or body.start,
        "type": body.type,
        "note": body.note,
    }
    if body.type == "shift":
        override["shiftMinutes"] = body.shiftMinutes
    if body.type == "set":
        override["time"] = body.time
    sched.setdefault("dateOverrides", []).append(override)
    await _save(db, current_user["_id"], sched)
    return _view(await _require_profile(db, current_user))


@router.delete("/date-override/{override_id}")
async def remove_date_override(
    override_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    sched = ensure_schedule(profile)
    sched["dateOverrides"] = [
        ov for ov in sched.get("dateOverrides", []) if ov.get("id") != override_id
    ]
    await _save(db, current_user["_id"], sched)
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Routine (wake/sleep/meals) — recalculates AI-sourced dose times
# --------------------------------------------------------------------------- #
class RoutineBody(BaseModel):
    wakeTime: str
    sleepTime: str
    withFood: bool = False
    mealTimes: dict[str, str] = Field(default_factory=dict)
    variableDays: list[int] = Field(default_factory=list)

    @field_validator("wakeTime", "sleepTime")
    @classmethod
    def _t(cls, v: str) -> str:
        return _validate_hhmm(v)

    @field_validator("mealTimes")
    @classmethod
    def _meals(cls, v: dict[str, str]) -> dict[str, str]:
        for key, val in v.items():
            _validate_hhmm(val)
        return v

    @field_validator("variableDays")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("variableDays entries must be 0..6")
        return sorted(set(v))


@router.put("/routine")
async def put_routine(
    body: RoutineBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    routine = {
        "wakeTime": body.wakeTime,
        "sleepTime": body.sleepTime,
        "withFood": body.withFood,
        "mealTimes": body.mealTimes,
        "variableDays": body.variableDays,
    }
    # Recalculate the dose time from the AI window against the new routine
    # (no-op when the time was set manually).
    sched = recompute_ai_time(ensure_schedule(profile), ensure_routine({"routine": routine}))
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {
            "routine": routine,
            "schedule": sched,
            "scheduleTime": sched["time"],
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return _view(await _require_profile(db, current_user))
