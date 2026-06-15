import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, get_database
from app.services.scheduling import (
    ALL_DAYS,
    default_schedule,
    derive_profile_mirrors,
    ensure_medications,
    ensure_routine,
    find_medication,
    medications_view,
    recompute_ai_time,
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


def _require_med(meds: list[dict], med_id: str) -> dict:
    med = find_medication(meds, med_id)
    if med is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="medication_not_found")
    return med


async def _save_meds(db: AsyncIOMotorDatabase, user_id, meds: list[dict]) -> None:
    """Persist the medications list, keeping the legacy flat mirrors in sync so
    untouched code (dashboard header text, profile serializer) keeps working."""
    await db.profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "medications": meds,
            **derive_profile_mirrors(meds),
            "updated_at": datetime.now(timezone.utc),
        }},
    )


def _view(profile: dict) -> dict:
    return medications_view(profile, datetime.now(timezone.utc))


# --------------------------------------------------------------------------- #
# Read every medication's resolved schedule + next due + upcoming + conflicts
# --------------------------------------------------------------------------- #
@router.get("")
async def get_schedule(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    return _view(profile)


# --------------------------------------------------------------------------- #
# Add / remove a medication
# --------------------------------------------------------------------------- #
class AddMedicationBody(BaseModel):
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


@router.post("/medications")
async def add_medication(
    body: AddMedicationBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    if len(meds) >= 10:
        raise HTTPException(status_code=422, detail="medication_limit_reached")
    sched = default_schedule(
        time=body.time, window=body.window, reason=body.reason,
        source=body.source, rxcui=body.rxcui,
    )
    sched["daysOfWeek"] = body.daysOfWeek
    meds.append({"id": uuid.uuid4().hex, "name": body.name, "schedule": sched})
    await _save_meds(db, current_user["_id"], meds)
    return _view(await _require_profile(db, current_user))


@router.delete("/medications/{med_id}")
async def remove_medication(
    med_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    _require_med(meds, med_id)
    if len(meds) <= 1:
        raise HTTPException(status_code=422, detail="cannot_remove_last_medication")
    meds = [m for m in meds if m["id"] != med_id]
    await _save_meds(db, current_user["_id"], meds)
    # Drop this med's snooze counter too (best-effort).
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$unset": {f"remindMeCounts.{med_id}": ""}},
    )
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Routine (wake/sleep/meals) — shared across all meds; recomputes AI-sourced
# dose times for every medication.
#
# NOTE: declared before the dynamic ``PUT /{med_id}`` so "/schedule/routine"
# isn't captured as a medication id.
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
    # Re-derive each AI-sourced dose time against the new routine (no-op for
    # medications whose time was set manually).
    norm_routine = ensure_routine({"routine": routine})
    meds = ensure_medications(profile)
    for med in meds:
        med["schedule"] = recompute_ai_time(med["schedule"], norm_routine)
    await db.profiles.update_one(
        {"user_id": current_user["_id"]},
        {"$set": {
            "routine": routine,
            "medications": meds,
            **derive_profile_mirrors(meds),
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Set one medication's default weekly schedule (and rename it)
# --------------------------------------------------------------------------- #
class ScheduleBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
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


@router.put("/{med_id}")
async def put_schedule(
    med_id: str,
    body: ScheduleBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    med = _require_med(meds, med_id)
    if body.name is not None:
        med["name"] = body.name
    med["schedule"].update({
        "time": body.time,
        "daysOfWeek": body.daysOfWeek,
        "window": body.window,
        "reason": body.reason,
        "source": body.source,
        "rxcui": body.rxcui if body.rxcui is not None else med["schedule"].get("rxcui"),
    })
    await _save_meds(db, current_user["_id"], meds)
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Per-weekday override (scoped to a medication)
# --------------------------------------------------------------------------- #
class DayOverrideBody(BaseModel):
    weekday: int = Field(ge=0, le=6)
    time: str

    @field_validator("time")
    @classmethod
    def _t(cls, v: str) -> str:
        return _validate_hhmm(v)


@router.post("/{med_id}/day-override")
async def add_day_override(
    med_id: str,
    body: DayOverrideBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    med = _require_med(meds, med_id)
    med["schedule"].setdefault("dayOverrides", {})[str(body.weekday)] = body.time
    await _save_meds(db, current_user["_id"], meds)
    return _view(await _require_profile(db, current_user))


@router.delete("/{med_id}/day-override/{weekday}")
async def remove_day_override(
    med_id: str,
    weekday: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    med = _require_med(meds, med_id)
    med["schedule"].get("dayOverrides", {}).pop(str(weekday), None)
    await _save_meds(db, current_user["_id"], meds)
    return _view(await _require_profile(db, current_user))


# --------------------------------------------------------------------------- #
# Date-range override: temporary shift, fixed time, or pause (scoped to a med)
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


@router.post("/{med_id}/date-override")
async def add_date_override(
    med_id: str,
    body: DateOverrideBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    if body.type == "shift" and body.shiftMinutes is None:
        raise HTTPException(status_code=422, detail="shiftMinutes required for type 'shift'")
    if body.type == "set" and body.time is None:
        raise HTTPException(status_code=422, detail="time required for type 'set'")

    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    med = _require_med(meds, med_id)
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
    med["schedule"].setdefault("dateOverrides", []).append(override)
    await _save_meds(db, current_user["_id"], meds)
    return _view(await _require_profile(db, current_user))


@router.delete("/{med_id}/date-override/{override_id}")
async def remove_date_override(
    med_id: str,
    override_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await _require_profile(db, current_user)
    meds = ensure_medications(profile)
    med = _require_med(meds, med_id)
    med["schedule"]["dateOverrides"] = [
        ov for ov in med["schedule"].get("dateOverrides", []) if ov.get("id") != override_id
    ]
    await _save_meds(db, current_user["_id"], meds)
    return _view(await _require_profile(db, current_user))
