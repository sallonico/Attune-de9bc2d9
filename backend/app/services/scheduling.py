"""Pure scheduling logic for the medication reminder feature.

Everything here is a pure function of (medication/schedule, routine, date/now) — no
database, no I/O — so it is fully unit-testable via ``scripts/test_schedule.py`` and
reusable by every route. Weekday convention matches ``datetime.date.weekday()``:
Monday = 0 ... Sunday = 6.

The schedule and routine objects are plain dicts stored embedded in the user's
profile document. See ``ensure_schedule`` / ``ensure_routine`` / ``ensure_requirements``
for their shape and for the lazy migration of legacy profiles.

Two big capabilities live here:

* **Per-medication requirements** (``requirements``: doses/day, food rule, bedtime-only,
  minimum spacing) feed ``generate_dose_times`` — the recommendation generator that turns
  "twice a day, with food" into concrete clock times anchored to the user's routine.
* **Variable weekly routines** (``routine.scheduleType``): a medication scheduled with
  ``source == 'auto'`` re-derives its dose times from *that day's* routine, so a later
  wake-up on weekends automatically shifts the weekend reminders.
"""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

WINDOWS = ("morning", "afternoon", "evening", "night")
FOOD_REQUIREMENTS = ("none", "with_food", "without_food", "before_meals", "after_meals")
SCHEDULE_TYPES = ("same", "weekday_weekend", "per_day")
WEEKEND_DAYS = (5, 6)  # Sat, Sun (weekday() convention)
DEFAULT_TZ = "UTC"
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
NEAR_MEAL_MINUTES = 45
NEXT_DUE_HORIZON_DAYS = 15
DAY_MINUTES = 24 * 60

# Minutes relative to a meal for the "before/after meals" rules, and the gap we
# keep dose times away from meals for the "without food" rule.
BEFORE_MEAL_OFFSET = -30
AFTER_MEAL_OFFSET = 30
AWAY_FROM_MEAL_MINUTES = 90

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


def _from_minutes(total: int) -> str:
    total %= DAY_MINUTES
    return _fmt_hhmm(total // 60, total % 60)


def add_minutes(hhmm: str, minutes: int) -> str:
    """Add (or subtract) minutes to an HH:mm string, wrapping within a day."""
    return _from_minutes(_minutes_of(hhmm) + minutes)


def _parse_date(value: str) -> date_cls:
    y, m, d = value.split("-")
    return date_cls(int(y), int(m), int(d))


def _dedupe_sorted(times: list[str]) -> list[str]:
    return sorted(dict.fromkeys(times))


# --------------------------------------------------------------------------- #
# Defaults & lazy migration
# --------------------------------------------------------------------------- #
def _default_day_routine() -> dict:
    return {
        "wakeTime": "07:00",
        "sleepTime": "23:00",
        "withFood": False,
        "mealTimes": {"breakfast": "08:00", "lunch": "12:30", "dinner": "18:30"},
    }


def default_routine() -> dict:
    base = _default_day_routine()
    return {
        **base,
        "variableDays": [],
        # Variable weekly schedule. "same" = one routine for every day.
        "scheduleType": "same",
        "weekendRoutine": None,   # used when scheduleType == "weekday_weekend"
        "dayRoutines": {},        # {"5": {...}} used when scheduleType == "per_day"
    }


def default_requirements() -> dict:
    return {
        "dosesPerDay": 1,
        "foodRequirement": "none",   # one of FOOD_REQUIREMENTS
        "bedtimeOnly": False,
        "minSpacingMinutes": None,   # only meaningful when dosesPerDay > 1
    }


def ensure_requirements(req: dict | None) -> dict:
    """Return a complete requirements dict, clamping to sane ranges."""
    base = default_requirements()
    base.update(req or {})
    try:
        base["dosesPerDay"] = max(1, min(8, int(base.get("dosesPerDay") or 1)))
    except (TypeError, ValueError):
        base["dosesPerDay"] = 1
    if base.get("foodRequirement") not in FOOD_REQUIREMENTS:
        base["foodRequirement"] = "none"
    base["bedtimeOnly"] = bool(base.get("bedtimeOnly"))
    spacing = base.get("minSpacingMinutes")
    if spacing is not None:
        try:
            base["minSpacingMinutes"] = max(0, min(DAY_MINUTES, int(spacing)))
        except (TypeError, ValueError):
            base["minSpacingMinutes"] = None
    return base


def default_schedule(
    time: str = "08:00",
    *,
    times: list[str] | None = None,
    window: str | None = None,
    reason: str | None = None,
    source: str = "user",
    rxcui: str | None = None,
) -> dict:
    resolved_times = _dedupe_sorted(times) if times else [time]
    return {
        "time": resolved_times[0],   # legacy mirror == first dose
        "times": resolved_times,
        "daysOfWeek": list(ALL_DAYS),
        "window": window,
        "reason": reason,
        "source": source,
        "rxcui": rxcui,
        "dayOverrides": {},   # {"5": ["10:00"]} -> Saturday at 10:00
        "dateOverrides": [],  # [{id,start,end,type,shiftMinutes|time,note}]
    }


def _coerce_times(value, fallback: str) -> list[str]:
    """Accept a list, a single HH:mm string, or None and return a clean list."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple)) and value:
        return _dedupe_sorted([t for t in value if isinstance(t, str)]) or [fallback]
    return [fallback]


def ensure_schedule(profile: dict | None) -> dict:
    """Return a complete schedule dict, lazily migrating legacy profiles.

    Handles three generations of data: a flat ``scheduleTime`` (pre-schedule),
    a single ``time`` (pre-multi-dose), and the current ``times`` list. Also
    migrates ``dayOverrides`` values from a bare HH:mm string to a list.
    """
    profile = profile or {}
    sched = dict(profile.get("schedule") or {})
    if not sched:
        sched = default_schedule(time=profile.get("scheduleTime") or "08:00")

    fallback = sched.get("time") or profile.get("scheduleTime") or "08:00"
    sched["times"] = _coerce_times(sched.get("times") or sched.get("time"), fallback)
    sched["time"] = sched["times"][0]
    sched.setdefault("daysOfWeek", list(ALL_DAYS))
    sched.setdefault("window", None)
    sched.setdefault("reason", None)
    sched.setdefault("source", "user")
    sched.setdefault("rxcui", None)

    raw_overrides = sched.get("dayOverrides") or {}
    sched["dayOverrides"] = {
        k: _coerce_times(v, fallback) for k, v in raw_overrides.items()
    }
    sched.setdefault("dateOverrides", [])
    return sched


def _ensure_day_routine(routine: dict | None) -> dict:
    base = _default_day_routine()
    base.update(routine or {})
    meals = _default_day_routine()["mealTimes"]
    meals.update(base.get("mealTimes") or {})
    base["mealTimes"] = meals
    base["withFood"] = bool(base.get("withFood"))
    return base


def ensure_routine(profile: dict | None) -> dict:
    profile = profile or {}
    raw = profile.get("routine") or {}
    routine = default_routine()
    routine.update(raw)
    # Normalize the base/weekday routine fields + meals.
    base = _ensure_day_routine(raw)
    routine.update({k: base[k] for k in ("wakeTime", "sleepTime", "withFood", "mealTimes")})

    if routine.get("scheduleType") not in SCHEDULE_TYPES:
        routine["scheduleType"] = "same"
    routine.setdefault("variableDays", [])

    weekend = routine.get("weekendRoutine")
    routine["weekendRoutine"] = _ensure_day_routine(weekend) if weekend else None

    day_routines = routine.get("dayRoutines") or {}
    routine["dayRoutines"] = {
        str(k): _ensure_day_routine(v) for k, v in day_routines.items()
    }
    return routine


def routine_for_day(routine: dict, weekday: int) -> dict:
    """Return the effective wake/sleep/meals routine for one weekday, honoring the
    variable-weekly-schedule mode. Falls back to the base routine when no
    day-specific routine is defined."""
    routine = ensure_routine({"routine": routine})
    base = {k: routine[k] for k in ("wakeTime", "sleepTime", "withFood", "mealTimes")}
    kind = routine.get("scheduleType", "same")

    if kind == "per_day":
        return routine["dayRoutines"].get(str(weekday), base)
    if kind == "weekday_weekend" and weekday in WEEKEND_DAYS:
        return routine.get("weekendRoutine") or base
    return base


def normalize_medication(med: dict | None) -> dict:
    """Return a complete medication dict ``{id, name, requirements, schedule}``,
    filling any missing fields the same way the ``ensure_*`` helpers do."""
    med = med or {}
    return {
        "id": med.get("id") or LEGACY_MED_ID,
        "name": med.get("name") or "",
        "requirements": ensure_requirements(med.get("requirements")),
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
        "requirements": default_requirements(),
        "schedule": ensure_schedule(profile),
    }]


def derive_profile_mirrors(meds: list[dict]) -> dict:
    """Legacy flat fields kept in sync so older readers (display strings, the
    profile serializer) keep working without knowing about the medications list.
    ``medication`` is the joined names; ``scheduleTime``/``schedule`` mirror the
    first medication's first dose."""
    first = meds[0] if meds else {"schedule": default_schedule()}
    return {
        "medication": ", ".join(m["name"] for m in meds if m.get("name")),
        "scheduleTime": first["schedule"]["time"],
        "schedule": first["schedule"],
    }


def find_medication(meds: list[dict], med_id: str) -> dict | None:
    return next((m for m in meds if m["id"] == med_id), None)


# --------------------------------------------------------------------------- #
# Window -> concrete time (legacy AI single-dose suggestion path, kept working)
# --------------------------------------------------------------------------- #
def resolve_window_to_time(window: str, routine: dict | None) -> str:
    r = _ensure_day_routine(routine)
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
    """Re-derive a legacy single-dose AI time from its window. Manual user times
    (``source != 'ai'``) are never touched. Superseded by ``generate_dose_times``
    for the requirements-driven ``source == 'auto'`` path."""
    if schedule.get("source") == "ai" and schedule.get("window") in WINDOWS:
        t = resolve_window_to_time(schedule["window"], routine)
        return {**schedule, "time": t, "times": [t]}
    return schedule


# --------------------------------------------------------------------------- #
# Recommendation generator: requirements + a day's routine -> concrete times
# --------------------------------------------------------------------------- #
def _awake_window(day_routine: dict) -> tuple[int, int]:
    """Return (start, end) minutes for the waking window, unwrapping a sleep time
    that falls past midnight (e.g. wake 07:00, sleep 01:00 -> end 25:00)."""
    wake = _minutes_of(day_routine["wakeTime"])
    sleep = _minutes_of(day_routine["sleepTime"])
    if sleep <= wake:
        sleep += DAY_MINUTES
    return wake, sleep


def _even_spread(start: int, end: int, n: int) -> list[int]:
    """``n`` points spread across [start, end] with equal interior gaps, inset
    from the edges so doses don't land exactly at wake/sleep."""
    if n <= 0:
        return []
    span = end - start
    inset = min(30, span // (n + 1) if n else span)
    s, e = start + inset, end - inset
    if n == 1:
        return [s]
    step = (e - s) / (n - 1)
    return [round(s + step * i) for i in range(n)]


def _meal_minutes(day_routine: dict) -> list[int]:
    m = day_routine["mealTimes"]
    return [_minutes_of(m["breakfast"]), _minutes_of(m["lunch"]), _minutes_of(m["dinner"])]


def _pick_meals(meal_mins: list[int], n: int) -> list[int]:
    """Pick ``n`` meals for ``n`` doses: 1->breakfast, 2->breakfast+dinner,
    3->all three. For >3, all meals plus an even spread fills the rest."""
    b, l, d = meal_mins
    if n == 1:
        return [b]
    if n == 2:
        return [b, d]
    if n == 3:
        return [b, l, d]
    return meal_mins  # caller spreads the remainder


def _apply_min_spacing(times: list[int], spacing: int | None, start: int, end: int) -> list[int]:
    """If any adjacent gap is below ``spacing``, fall back to an even spread that
    guarantees the spacing where the window allows it."""
    if not spacing or len(times) < 2:
        return times
    times = sorted(times)
    if all(b - a >= spacing for a, b in zip(times, times[1:])):
        return times
    # Re-lay the doses spacing apart from the first, clamped into the window.
    out = [times[0]]
    for _ in range(len(times) - 1):
        nxt = min(out[-1] + spacing, end)
        out.append(nxt)
    return out


def generate_dose_times(requirements: dict | None, day_routine: dict) -> list[str]:
    """Turn a medication's requirements into concrete HH:mm dose times for a day,
    anchored to that day's wake/sleep/meal routine.

    This is the heart of "the scheduling engine should use these requirements
    when generating recommendations". It is a pure function of (requirements,
    day_routine), so a weekend routine with a later wake-up yields later doses.
    """
    req = ensure_requirements(requirements)
    day = _ensure_day_routine(day_routine)
    n = req["dosesPerDay"]
    food = req["foodRequirement"]
    start, end = _awake_window(day)
    meals = _meal_minutes(day)

    if req["bedtimeOnly"]:
        bedtime = _minutes_of(day["sleepTime"]) - 30
        if bedtime < start:
            bedtime += DAY_MINUTES
        if n == 1:
            mins = [bedtime]
        else:
            # Multiple bedtime-ish doses: cluster them before bed, spacing apart.
            spacing = req["minSpacingMinutes"] or 60
            mins = [bedtime - spacing * (n - 1 - i) for i in range(n)]
    elif food in ("with_food", "before_meals", "after_meals"):
        offset = {"with_food": 0, "before_meals": BEFORE_MEAL_OFFSET,
                  "after_meals": AFTER_MEAL_OFFSET}[food]
        if n <= 3:
            mins = [m + offset for m in _pick_meals(meals, n)]
        else:
            mins = [m + offset for m in meals] + _even_spread(start, end, n - 3)
    elif food == "without_food":
        mins = _even_spread(start, end, n)
        mins = [_nudge_from_meals(t, meals) for t in mins]
    else:  # "none"
        mins = _even_spread(start, end, n)

    mins = _apply_min_spacing(mins, req["minSpacingMinutes"], start, end)
    return _dedupe_sorted([_from_minutes(t) for t in mins])


def _nudge_from_meals(minute: int, meals: list[int]) -> int:
    """Push a dose at least ``AWAY_FROM_MEAL_MINUTES`` from every meal so a
    "without food" dose doesn't land on top of a meal."""
    for meal in meals:
        if abs((minute % DAY_MINUTES) - meal) < AWAY_FROM_MEAL_MINUTES:
            return meal + AWAY_FROM_MEAL_MINUTES
    return minute


# --------------------------------------------------------------------------- #
# Resolution: what times (if any) is the dose on a given date?
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


def _base_times_for(
    schedule: dict, d: date_cls, routine: dict | None, requirements: dict | None
) -> list[str] | None:
    """The dose times ignoring date overrides. ``None`` means "no dose this day".

    For ``source == 'auto'`` medications the times are regenerated from this day's
    routine (so variable weekly schedules apply automatically); otherwise the
    stored per-weekday override or default ``times`` list is used.
    """
    dow = str(d.weekday())
    day_overrides = schedule.get("dayOverrides") or {}
    if dow in day_overrides:
        return _coerce_times(day_overrides[dow], schedule.get("time") or "08:00")
    if d.weekday() not in schedule.get("daysOfWeek", []):
        return None
    if requirements is not None and schedule.get("source") == "auto" and routine is not None:
        return generate_dose_times(requirements, routine_for_day(routine, d.weekday()))
    return schedule.get("times") or [schedule.get("time") or "08:00"]


def resolve_times_for_date(
    schedule: dict, routine: dict, d: date_cls, requirements: dict | None = None
) -> list[str]:
    """Resolve all dose times for one date. Returns a (possibly empty) sorted list.

    Precedence, highest first:
      1. date override: pause -> []; set -> [fixed time]; shift -> base +/- minutes
      2. per-weekday override
      3. generated (auto) or default times if the weekday is active
      4. otherwise []
    """
    ov = _covering_override(schedule, d)
    if ov is not None:
        kind = ov.get("type")
        if kind == "pause":
            return []
        if kind == "set":
            return [ov.get("time")] if ov.get("time") else []
        if kind == "shift":
            base = _base_times_for(schedule, d, routine, requirements)
            if not base:
                return []
            shift = int(ov.get("shiftMinutes", 0))
            return _dedupe_sorted([add_minutes(t, shift) for t in base])
    return _base_times_for(schedule, d, routine, requirements) or []


def resolve_for_date(schedule: dict, routine: dict, d: date_cls) -> str | None:
    """Back-compatible single-dose resolver: the first dose time on a date, or
    ``None``. New callers should prefer ``resolve_times_for_date``."""
    times = resolve_times_for_date(schedule, routine, d)
    return times[0] if times else None


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
    schedule: dict, routine: dict, now: datetime, tz: tzinfo = timezone.utc,
    requirements: dict | None = None,
) -> datetime | None:
    """First dose datetime at or after ``now``, scanning forward up to ~2 weeks.

    Considers *every* dose time on a day (not just the first), so a med taken
    morning + evening returns this evening's dose once the morning one passes."""
    now = _as_utc(now)
    now_local = now.astimezone(tz)
    for offset in range(NEXT_DUE_HORIZON_DAYS):
        d = (now_local + timedelta(days=offset)).date()
        for t in resolve_times_for_date(schedule, routine, d, requirements):
            h, m = _parse_hhmm(t)
            cand = datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
            if cand >= now:
                return cand
    return None


def upcoming(
    schedule: dict, routine: dict, now: datetime, days: int = 7, tz: tzinfo = timezone.utc,
    requirements: dict | None = None,
) -> list[dict]:
    now = _as_utc(now)
    start = now.astimezone(tz).date()
    out = []
    for offset in range(days):
        d = start + timedelta(days=offset)
        times = resolve_times_for_date(schedule, routine, d, requirements)
        out.append({
            "date": d.isoformat(),
            "times": times,
            "time": times[0] if times else None,  # legacy single-time mirror
            "skipped": len(times) == 0,
        })
    return out


# --------------------------------------------------------------------------- #
# Conflict detection (intra-schedule; drug-drug interaction is a future hook)
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


def detect_conflicts(
    schedule: dict, routine: dict, requirements: dict | None = None
) -> list[dict]:
    """Return scheduling warnings. Structured so multi-med interaction checks can
    later append entries with ``type='drug_interaction'`` without changing callers."""
    warnings: list[dict] = []
    base_day = routine_for_day(routine, 0)  # weekday baseline for warnings
    wake, sleep = base_day["wakeTime"], base_day["sleepTime"]
    req = ensure_requirements(requirements)
    times = schedule.get("times") or ([schedule["time"]] if schedule.get("time") else [])

    for t in times:
        if not _is_awake(t, wake, sleep):
            warnings.append({
                "type": "outside_awake_hours",
                "message": f"A dose at {t} falls outside your usual awake hours "
                           f"({wake}–{sleep}).",
            })
            break

    # Food-rule proximity check uses the medication's own requirement (preferred)
    # and falls back to the routine-wide withFood flag for legacy single-dose meds.
    wants_meal = req["foodRequirement"] in ("with_food", "before_meals", "after_meals") \
        or (req["foodRequirement"] == "none" and base_day.get("withFood"))
    if wants_meal and times:
        meals = list((base_day.get("mealTimes") or {}).values())
        for t in times:
            near = any(abs(_minutes_of(t) - _minutes_of(mt)) <= NEAR_MEAL_MINUTES for mt in meals)
            if not near:
                warnings.append({
                    "type": "not_near_meal",
                    "message": f"This medication should be taken with food, but {t} "
                               f"isn't close to any of your meal times.",
                })
                break

    if req["foodRequirement"] == "without_food" and times:
        meals = list((base_day.get("mealTimes") or {}).values())
        for t in times:
            near = any(abs(_minutes_of(t) - _minutes_of(mt)) <= NEAR_MEAL_MINUTES for mt in meals)
            if near:
                warnings.append({
                    "type": "too_near_meal",
                    "message": f"This medication should be taken without food, but {t} "
                               f"is close to a meal time.",
                })
                break

    # Minimum-spacing check across the day's doses.
    spacing = req["minSpacingMinutes"]
    if spacing and len(times) >= 2:
        mins = sorted(_minutes_of(t) for t in times)
        if any(b - a < spacing for a, b in zip(mins, mins[1:])):
            warnings.append({
                "type": "doses_too_close",
                "message": f"Two doses are less than {spacing} minutes apart, "
                           f"below this medication's required spacing.",
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


def apply_generated_times(med: dict, routine: dict) -> dict:
    """For an ``auto`` (requirements-driven) medication, (re)generate the stored
    base ``times`` from the base/weekday routine. Manual (``source != 'auto'``)
    medications are returned unchanged. Mutates and returns ``med``."""
    sched = med["schedule"]
    if sched.get("source") == "auto":
        base_day = routine_for_day(routine, 0)
        times = generate_dose_times(med.get("requirements"), base_day)
        sched["times"] = times
        sched["time"] = times[0]
    return med


# --------------------------------------------------------------------------- #
# Public view assembled for the API
# --------------------------------------------------------------------------- #
def schedule_view(profile: dict | None, now: datetime) -> dict:
    """Legacy single-schedule view (kept for back-compat / tests)."""
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
    """The resolved view for one medication: its requirements + schedule plus
    next-due, 7-day upcoming, and conflicts — each computed against the shared
    routine and the medication's own requirements."""
    sched = med["schedule"]
    req = med.get("requirements")
    nd = next_due(sched, routine, now, tz, req)
    return {
        "id": med["id"],
        "name": med["name"],
        "requirements": ensure_requirements(req),
        "schedule": sched,
        "nextDue": nd.isoformat() if nd else None,
        "upcoming": upcoming(sched, routine, now, 7, tz, req),
        "conflicts": detect_conflicts(sched, routine, req),
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
