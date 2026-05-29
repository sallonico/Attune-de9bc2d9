#!/usr/bin/env python3
"""No-DB tests for the pure scheduling algorithm.

    python -m scripts.test_schedule      # run from the backend/ folder

Exercises resolution precedence, pauses, shifts, day-of-week overrides,
window->time mapping, AI recompute, conflict detection, and next_due.
"""
import sys
from datetime import date, datetime, timezone

from app.services import scheduling as s
from app.services.drug_timing import extract_from_label

PASS, FAIL = 0, 0


def check(label: str, got, want) -> None:
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  ok   {label}")
    else:
        FAIL += 1
        print(f"  FAIL {label}\n         got:  {got!r}\n         want: {want!r}")


# Reference dates (May 2026): 25th = Monday ... 31st = Sunday.
MON = date(2026, 5, 25)
SAT = date(2026, 5, 30)
SUN = date(2026, 5, 31)


def test_resolution_precedence():
    print("resolve_for_date precedence")
    routine = s.default_routine()
    sched = s.default_schedule(time="08:00")  # every day, 08:00

    check("default weekday -> time", s.resolve_for_date(sched, routine, MON), "08:00")

    sched_3day = {**sched, "daysOfWeek": [0, 2, 4]}  # Mon/Wed/Fri only
    check("non-active day -> None", s.resolve_for_date(sched_3day, routine, SAT), None)
    check("active day -> time", s.resolve_for_date(sched_3day, routine, MON), "08:00")

    sched_dow = {**sched, "dayOverrides": {"5": "10:00"}}  # Saturday 10:00
    check("day-of-week override wins over default", s.resolve_for_date(sched_dow, routine, SAT), "10:00")
    check("day-of-week override leaves other days", s.resolve_for_date(sched_dow, routine, MON), "08:00")


def test_date_overrides():
    print("date overrides: pause / set / shift")
    routine = s.default_routine()
    base = s.default_schedule(time="08:00")

    paused = {**base, "dateOverrides": [
        {"id": "1", "start": "2026-05-30", "end": "2026-05-30", "type": "pause"}]}
    check("pause -> None on that date", s.resolve_for_date(paused, routine, SAT), None)
    check("pause leaves other dates", s.resolve_for_date(paused, routine, SUN), "08:00")

    shifted = {**base, "dateOverrides": [
        {"id": "1", "start": "2026-06-01", "end": "2026-06-07", "type": "shift", "shiftMinutes": 120}]}
    check("vacation shift +2h", s.resolve_for_date(shifted, routine, date(2026, 6, 3)), "10:00")
    check("shift outside range untouched", s.resolve_for_date(shifted, routine, date(2026, 6, 8)), "08:00")

    fixed = {**base, "dateOverrides": [
        {"id": "1", "start": "2026-06-02", "end": "2026-06-02", "type": "set", "time": "15:30"}]}
    check("set fixed time", s.resolve_for_date(fixed, routine, date(2026, 6, 2)), "15:30")

    # pause beats a same-day shift
    both = {**base, "dateOverrides": [
        {"id": "1", "start": "2026-06-02", "end": "2026-06-02", "type": "shift", "shiftMinutes": 60},
        {"id": "2", "start": "2026-06-02", "end": "2026-06-02", "type": "pause"}]}
    check("pause precedence over shift", s.resolve_for_date(both, routine, date(2026, 6, 2)), None)


def test_window_to_time():
    print("window -> time")
    empty = {**s.default_routine(), "withFood": False, "wakeTime": "06:30", "sleepTime": "22:00"}
    check("morning empty-stomach = wake+30", s.resolve_window_to_time("morning", empty), "07:00")
    check("night = sleep-30", s.resolve_window_to_time("night", empty), "21:30")

    food = {**s.default_routine(), "withFood": True,
            "mealTimes": {"breakfast": "08:15", "lunch": "12:00", "dinner": "19:00"}}
    check("morning with-food = breakfast", s.resolve_window_to_time("morning", food), "08:15")
    check("evening with-food = dinner", s.resolve_window_to_time("evening", food), "19:00")


def test_recompute_ai_time():
    print("recompute_ai_time (wake/sleep change)")
    routine = {**s.default_routine(), "withFood": False, "wakeTime": "07:00"}
    ai = s.default_schedule(time="07:30", window="morning", source="ai")
    routine2 = {**routine, "wakeTime": "09:00"}
    check("AI time follows wake change", s.recompute_ai_time(ai, routine2)["time"], "09:30")

    manual = s.default_schedule(time="07:30", window="morning", source="user")
    check("manual time is NOT recomputed", s.recompute_ai_time(manual, routine2)["time"], "07:30")


def test_conflicts():
    print("detect_conflicts")
    routine = {**s.default_routine(), "wakeTime": "07:00", "sleepTime": "22:00"}
    late = s.default_schedule(time="23:30")
    types = {w["type"] for w in s.detect_conflicts(late, routine)}
    check("dose outside awake hours flagged", "outside_awake_hours" in types, True)

    food_routine = {**routine, "withFood": True,
                    "mealTimes": {"breakfast": "08:00", "lunch": "12:30", "dinner": "18:30"}}
    not_meal = s.default_schedule(time="15:00")
    types2 = {w["type"] for w in s.detect_conflicts(not_meal, food_routine)}
    check("with-food but not near meal flagged", "not_near_meal" in types2, True)

    near_meal = s.default_schedule(time="08:20")
    types3 = {w["type"] for w in s.detect_conflicts(near_meal, food_routine)}
    check("with-food near breakfast -> no meal warning", "not_near_meal" in types3, False)


def test_next_due():
    print("next_due")
    routine = s.default_routine()
    sched = s.default_schedule(time="08:00")
    now = datetime(2026, 5, 25, 9, 0, tzinfo=timezone.utc)  # Mon 09:00, after today's dose
    nd = s.next_due(sched, routine, now)
    check("next due rolls to tomorrow 08:00", nd, datetime(2026, 5, 26, 8, 0, tzinfo=timezone.utc))

    now2 = datetime(2026, 5, 25, 7, 0, tzinfo=timezone.utc)  # before today's dose
    nd2 = s.next_due(sched, routine, now2)
    check("next due today 08:00", nd2, datetime(2026, 5, 25, 8, 0, tzinfo=timezone.utc))

    sched_3day = {**sched, "daysOfWeek": [0, 2, 4]}  # Mon/Wed/Fri
    now3 = datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc)  # Saturday
    nd3 = s.next_due(sched_3day, routine, now3)
    check("skips to next active day (Mon)", nd3, datetime(2026, 6, 1, 8, 0, tzinfo=timezone.utc))


def test_legacy_migration():
    print("ensure_schedule lazy migration")
    legacy = {"name": "x", "medication": "y", "scheduleTime": "09:15"}
    sched = s.ensure_schedule(legacy)
    check("migrates flat scheduleTime", sched["time"], "09:15")
    check("defaults to every day", sched["daysOfWeek"], [0, 1, 2, 3, 4, 5, 6])
    check("empty profile is safe", s.ensure_schedule(None)["time"], "08:00")


def test_label_extraction():
    print("extract_from_label (free, grounded)")
    morning = extract_from_label(
        "Administer once daily, preferably on an empty stomach, "
        "one-half to one hour before breakfast."
    )
    check("empty-stomach/before breakfast -> morning", morning["window"], "morning")
    check("empty stomach -> withFood False", morning["withFood"], False)
    check("morning confidence high", morning["confidence"], "high")

    # Negation must NOT classify as night.
    neg = extract_from_label(
        "Do not take this medication at bedtime. "
        "Take upon arising for the day before any food."
    )
    check("negated bedtime is ignored -> morning", neg["window"], "morning")

    night = extract_from_label("Take one tablet at bedtime.")
    check("bedtime -> night", night["window"], "night")

    food = extract_from_label("Take orally twice daily with meals.")
    check("with meals -> withFood True", food["withFood"], True)
    check("food-only -> medium confidence", food["confidence"], "medium")

    check("no timing/food info -> None", extract_from_label("Swallow tablet whole."), None)
    check("empty label -> None", extract_from_label(""), None)


def main():
    for fn in (
        test_resolution_precedence,
        test_date_overrides,
        test_window_to_time,
        test_recompute_ai_time,
        test_conflicts,
        test_next_due,
        test_legacy_migration,
        test_label_extraction,
    ):
        fn()
    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
