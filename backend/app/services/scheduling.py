"""Pure scheduling logic for the medication reminder feature.

Everything here is a pure function of (schedule, routine, date/now) — no database,
no I/O — so it is fully unit-testable via ``scripts/test_schedule.py`` and reusable
by every route. Weekday convention matches ``datetime.date.weekday()``:
Monday = 0 ... Sunday = 6.

The schedule and routine objects are plain dicts stored embedded in the user's
profile document. See ``ensure_schedule`` / ``ensure_routine`` for their shape and
for the lazy migration of legacy profiles that only have a flat ``scheduleTime``.
"""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

WINDOWS = ("morning", "afternoon", "evening", "night")
DEFAULT_TZ = "UTC"
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
NEAR_MEAL_MINUTES = 45
NEXT_DUE_HORIZON_DAYS = 15

# Stable id given to the single medication of a profile created before
# multi-medication support. Legacy logs (written with no ``medication_id``) are
# treated as belonging to this id so nothing orphans on migration.
LEGACY_MED_ID = "primary"


# --------------------------------------------------------------------------- #
# Small HH:mm / date helpers
# --------------------------------------------------------------------------- #
def _parse_hhmm(value: str) -> tuple[int, int]:
    hh, mm = value.split(":")
    return int(hh), int(mm)


def _fmt_hhmm(hours: int, minutes: int) -> str:
    return f"{hours:02d}:{minutes:02d}"


def _minutes_of(hhmm: str) -> int:
    h, m = _parse_hhmm(hhmm)
    return h * 60 + m


def add_minutes(hhmm: str, minutes: int) -> str:
    """Add (or subtract) minutes to an HH:mm string, wrapping within a day."""
    total = (_minutes_of(hhmm) + minutes) % (24 * 60)
    return _fmt_hhmm(total // 60, total % 60)


def _parse_date(value: str) -> date_cls:
    y, m, d = value.split("-")
    return date_cls(int(y), int(m), int(d))


# --------------------------------------------------------------------------- #
# Defaults & lazy migration
# --------------------------------------------------------------------------- #
def default_routine() -> dict:
    return {
        "wakeTime": "07:00",
        "sleepTime": "23:00",
        "withFood": False,
        "mealTimes": {"breakfast": "08:00", "lunch": "12:30", "dinner": "18:30"},
        "variableDays": [],
    }


def default_schedule(
    time: str = "08:00",
    *,
    window: str | None = None,
    reason: str | None = None,
    source: str = "user",
    rxcui: str | None = None,
) -> dict:
    return {
        "time": time,
        "daysOfWeek": list(ALL_DAYS),
        "window": window,
        "reason": reason,
        "source": source,
        "rxcui": rxcui,
        "dayOverrides": {},   # {"5": "10:00"} -> Saturday at 10:00
        "dateOverrides": [],  # [{id,start,end,type,shiftMinutes|time,note}]
    }


def ensure_schedule(profile: dict | None) -> dict:
    """Return a complete schedule dict, lazily migrating legacy profiles.

    A profile created before this feature has only a flat ``scheduleTime``; we
    synthesize a daily schedule from it on read so nothing else has to migrate.
    """
    profile = profile or {}
    sched = dict(profile.get("schedule") or {})
    if not sched:
        sched = default_schedule(time=profile.get("scheduleTime") or "08:00")
    sched.setdefault("time", profile.get("scheduleTime") or "08:00")
    sched.setdefault("daysOfWeek", list(ALL_DAYS))
    sched.setdefault("window", None)
    sched.setdefault("reason", None)
    sched.setdefault("source", "user")
    sched.setdefault("rxcui", None)
    sched.setdefault("dayOverrides", {})
    sched.setdefault("dateOverrides", [])
    return sched


def ensure_routine(profile: dict | None) -> dict:
    profile = profile or {}
    routine = default_routine()
    routine.update(profile.get("routine") or {})
    base_meals = default_routine()["mealTimes"]
    base_meals.update(routine.get("mealTimes") or {})
    routine["mealTimes"] = base_meals
    return routine


# --------------------------------------------------------------------------- #
# Multiple medications: each med owns a full schedule (so two meds can sit at
# the same time or at completely different times). The routine above is shared
# across all of a person's medications. Pure functions, like everything else
# here — id assignment lives in the route layer.
# --------------------------------------------------------------------------- #
def normalize_medication(med: dict | None) -> dict:
    """Return a complete medication dict ``{id, name, schedule}``, filling any
    missing schedule fields the same way ``ensure_schedule`` does."""
    med = med or {}
    return {
        "id": med.get("id") or LEGACY_MED_ID,
        "name": med.get("name") or "",
        "schedule": ensure_schedule({"schedule": med.get("schedule")}),
    }


def ensure_medications(profile: dict | None) -> list[dict]:
    """Return the profile's medications, lazily migrating a legacy single-med
    profile (flat ``medication`` + embedded ``schedule``) into a one-element list
    keyed by ``LEGACY_MED_ID`` so its existing logs keep mapping cleanly."""
    profile = profile or {}
    meds = profile.get("medications")
    if meds:
        return [normalize_medication(m) for m in meds]
    return [{
        "id": LEGACY_MED_ID,
        "name": profile.get("medication") or "",
        "schedule": ensure_schedule(profile),
    }]


def derive_profile_mirrors(meds: list[dict]) -> dict:
    """Legacy flat fields kept in sync so older readers (display strings, the
    profile serializer) keep working without knowing about the medications list.
    ``medication`` is the joined names; ``scheduleTime``/``schedule`` mirror the
    first medication."""
    first = meds[0] if meds else {"schedule": default_schedule()}
    return {
        "medication": ", ".join(m["name"] for m in meds if m.get("name")),
        "scheduleTime": first["schedule"]["time"],
        "schedule": first["schedule"],
    }


def find_medication(meds: list[dict], med_id: str) -> dict | None:
    return next((m for m in meds if m["id"] == med_id), None)


# --------------------------------------------------------------------------- #
# Window -> concrete time (default assignment from the AI suggestion, and the
# hook that makes wake/sleep changes recalculate AI-sourced times)
# --------------------------------------------------------------------------- #
def resolve_window_to_time(window: str, routine: dict | None) -> str:
    r = ensure_routine({"routine": routine} if routine else None)
    meals = r["mealTimes"]
    with_food = bool(r.get("withFood"))
    wake, sleep = r["wakeTime"], r["sleepTime"]

    if window == "morning":
        return meals["breakfast"] if with_food else add_minutes(wake, 30)
    if window == "afternoon":
        return meals["lunch"] if with_food else add_minutes(wake, 6 * 60)
    if window == "evening":
        return meals["dinner"] if with_food else add_minutes(sleep, -3 * 60)
    if window == "night":
        return add_minutes(sleep, -30)
    return add_minutes(wake, 30)


def recompute_ai_time(schedule: dict, routine: dict) -> dict:
    """Re-derive the dose time from the AI window when (and only when) the time
    was AI-sourced. Manual user overrides (``source != 'ai'``) are never touched."""
    if schedule.get("source") == "ai" and schedule.get("window") in WINDOWS:
        return {**schedule, "time": resolve_window_to_time(schedule["window"], routine)}
    return schedule


# --------------------------------------------------------------------------- #
# Resolution: what time (if any) is the dose on a given date?
# --------------------------------------------------------------------------- #
def _covering_override(schedule: dict, d: date_cls) -> dict | None:
    matches = []
    for ov in schedule.get("dateOverrides", []):
        start = _parse_date(ov["start"])
        end = _parse_date(ov.get("end") or ov["start"])
        if start <= d <= end:
            matches.append(ov)
    if not matches:
        return None
    # A pause always wins; otherwise the last-defined override wins.
    for ov in matches:
        if ov.get("type") == "pause":
            return ov
    return matches[-1]


def _base_time_for(schedule: dict, d: date_cls) -> str | None:
    """The dose time ignoring date overrides (day-of-week override or default)."""
    dow = str(d.weekday())
    day_overrides = schedule.get("dayOverrides") or {}
    if dow in day_overrides:
        return day_overrides[dow]
    if d.weekday() in schedule.get("daysOfWeek", []):
        return schedule.get("time")
    return None


def resolve_for_date(schedule: dict, routine: dict, d: date_cls) -> str | None:
    """Resolve the dose time for one date. Returns HH:mm, or None if no dose.

    Precedence, highest first:
      1. date override: pause -> no dose; set -> fixed time; shift -> base +/- minutes
      2. per-weekday override
      3. default time if the weekday is an active day
      4. otherwise no dose
    """
    ov = _covering_override(schedule, d)
    if ov is not None:
        kind = ov.get("type")
        if kind == "pause":
            return None
        if kind == "set":
            return ov.get("time")
        if kind == "shift":
            base = _base_time_for(schedule, d)
            if base is None:
                return None
            return add_minutes(base, int(ov.get("shiftMinutes", 0)))
    return _base_time_for(schedule, d)


# --------------------------------------------------------------------------- #
# Next-due & upcoming (drives the in-app reminder display)
# --------------------------------------------------------------------------- #
def _as_utc(now: datetime) -> datetime:
    return now.astimezone(timezone.utc) if now.tzinfo else now.replace(tzinfo=timezone.utc)


def resolve_tz(name: str | None) -> tzinfo:
    """Return a tzinfo for an IANA name (e.g. ``America/New_York``), falling back
    to UTC for a missing or unknown name so display never crashes on bad data."""
    if not name:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def next_due(
    schedule: dict, routine: dict, now: datetime, tz: tzinfo = timezone.utc
) -> datetime | None:
    """First dose datetime at or after ``now``, scanning forward up to ~2 weeks.

    HH:mm times are wall-clock in the user's timezone ``tz``: each candidate is
    built in ``tz`` so the returned datetime carries the correct offset, and the
    day scan starts from "today" as seen in ``tz`` (so a dose near midnight lands
    on the right calendar day). Defaults to UTC for callers without a tz."""
    now = _as_utc(now)
    now_local = now.astimezone(tz)
    for offset in range(NEXT_DUE_HORIZON_DAYS):
        d = (now_local + timedelta(days=offset)).date()
        t = resolve_for_date(schedule, routine, d)
        if t is None:
            continue
        h, m = _parse_hhmm(t)
        cand = datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
        if cand >= now:
            return cand
    return None


def upcoming(
    schedule: dict, routine: dict, now: datetime, days: int = 7, tz: tzinfo = timezone.utc
) -> list[dict]:
    now = _as_utc(now)
    start = now.astimezone(tz).date()
    out = []
    for offset in range(days):
        d = start + timedelta(days=offset)
        t = resolve_for_date(schedule, routine, d)
        out.append({"date": d.isoformat(), "time": t, "skipped": t is None})
    return out


# --------------------------------------------------------------------------- #
# Conflict detection (intra-schedule today; drug-drug interaction is a
# documented future hook — see module note in drug_timing).
# --------------------------------------------------------------------------- #
def _is_awake(hhmm: str, wake: str, sleep: str) -> bool:
    t, w, s = _minutes_of(hhmm), _minutes_of(wake), _minutes_of(sleep)
    if w <= s:
        return w <= t <= s
    # Sleep time is past midnight relative to wake (e.g. wake 07:00, sleep 01:00)
    return t >= w or t <= s


def _ranges_overlap(a: dict, b: dict) -> bool:
    a_start, a_end = _parse_date(a["start"]), _parse_date(a.get("end") or a["start"])
    b_start, b_end = _parse_date(b["start"]), _parse_date(b.get("end") or b["start"])
    return a_start <= b_end and b_start <= a_end


def detect_conflicts(schedule: dict, routine: dict) -> list[dict]:
    """Return scheduling warnings. Structured so multi-med interaction checks can
    later append entries with ``type='drug_interaction'`` without changing callers."""
    warnings: list[dict] = []
    r = ensure_routine({"routine": routine} if routine else None)
    wake, sleep = r["wakeTime"], r["sleepTime"]
    time = schedule.get("time")

    if time and not _is_awake(time, wake, sleep):
        warnings.append({
            "type": "outside_awake_hours",
            "message": f"Your dose at {time} falls outside your usual awake hours "
                       f"({wake}–{sleep}).",
        })

    if r.get("withFood") and time:
        meals = list((r.get("mealTimes") or {}).values())
        near = any(abs(_minutes_of(time) - _minutes_of(mt)) <= NEAR_MEAL_MINUTES for mt in meals)
        if not near:
            warnings.append({
                "type": "not_near_meal",
                "message": f"This medication should be taken with food, but {time} "
                           f"isn't close to any of your meal times.",
            })

    overrides = schedule.get("dateOverrides", [])
    for i in range(len(overrides)):
        for j in range(i + 1, len(overrides)):
            if _ranges_overlap(overrides[i], overrides[j]):
                warnings.append({
                    "type": "overlapping_overrides",
                    "message": "Two date overrides overlap; a pause wins, otherwise "
                               "the later one applies.",
                })
                break
    return warnings


# --------------------------------------------------------------------------- #
# Public view assembled for the API
# --------------------------------------------------------------------------- #
def schedule_view(profile: dict | None, now: datetime) -> dict:
    sched = ensure_schedule(profile)
    routine = ensure_routine(profile)
    tz_name = (profile or {}).get("timezone") or DEFAULT_TZ
    tz = resolve_tz(tz_name)
    nd = next_due(sched, routine, now, tz)
    return {
        "schedule": sched,
        "routine": routine,
        "timezone": tz_name,
        "nextDue": nd.isoformat() if nd else None,
        "upcoming": upcoming(sched, routine, now, 7, tz),
        "conflicts": detect_conflicts(sched, routine),
    }


def medication_view(med: dict, routine: dict, now: datetime, tz: tzinfo) -> dict:
    """The resolved view for one medication: its schedule plus next-due,
    7-day upcoming, and conflicts — each computed against the shared routine."""
    sched = med["schedule"]
    nd = next_due(sched, routine, now, tz)
    return {
        "id": med["id"],
        "name": med["name"],
        "schedule": sched,
        "nextDue": nd.isoformat() if nd else None,
        "upcoming": upcoming(sched, routine, now, 7, tz),
        "conflicts": detect_conflicts(sched, routine),
    }


def medications_view(profile: dict | None, now: datetime) -> dict:
    """The full multi-medication schedule view returned by ``GET /schedule``:
    a per-medication view list plus the shared routine and timezone."""
    meds = ensure_medications(profile)
    routine = ensure_routine(profile)
    tz_name = (profile or {}).get("timezone") or DEFAULT_TZ
    tz = resolve_tz(tz_name)
    return {
        "medications": [medication_view(m, routine, now, tz) for m in meds],
        "routine": routine,
        "timezone": tz_name,
    }
