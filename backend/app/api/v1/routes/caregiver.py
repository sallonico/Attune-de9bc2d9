from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_current_user, get_database

router = APIRouter(prefix="/caregiver", tags=["caregiver"])


def _humanize(ts: datetime, now: datetime) -> str:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta = now - ts
    if delta < timedelta(hours=24) and ts.date() == now.date():
        return f"Today, {ts.strftime('%-I:%M %p')}"
    if (now.date() - ts.date()).days == 1:
        return f"Yesterday, {ts.strftime('%-I:%M %p')}"
    days = (now.date() - ts.date()).days
    return f"{days} days ago"


async def build_summary(db: AsyncIOMotorDatabase, patient_user_id) -> dict:
    """Adherence + wellness summary for a single patient.

    Shared by the patient's own caregiver-view tab and by linked caregivers
    (see ``connections`` route). Enforces the ``caregiverAccess`` permission
    flag — the patient's switch that governs whether their data may be viewed.
    """
    profile = await db.profiles.find_one({"user_id": patient_user_id})
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="profile_not_found")
    if not profile.get("features", {}).get("caregiverAccess", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="caregiver_access_disabled")

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)

    cursor = db.logs.find({"user_id": patient_user_id, "timestamp": {"$gte": cutoff}}).sort("timestamp", 1)
    logs = [doc async for doc in cursor]

    total = len(logs)
    taken = sum(1 for log in logs if log["status"] == "taken")
    missed = sum(1 for log in logs if log["status"] == "missed")
    adherence = round((taken / total) * 100) if total else 0

    phys_scores = [log["checkIn"]["physical"] for log in logs if log.get("checkIn") and log["checkIn"].get("physical")]
    emo_scores = [log["checkIn"]["emotional"] for log in logs if log.get("checkIn") and log["checkIn"].get("emotional")]
    avg_physical = round(sum(phys_scores) / len(phys_scores), 1) if phys_scores else 0.0
    avg_mood = round(sum(emo_scores) / len(emo_scores), 1) if emo_scores else 0.0

    # Alert: 2+ consecutive most-recent missed
    sorted_desc = sorted(logs, key=lambda log: log["timestamp"], reverse=True)
    consecutive_missed = 0
    for log in sorted_desc:
        if log["status"] == "missed":
            consecutive_missed += 1
        else:
            break
    alert = None
    if consecutive_missed >= 2:
        alert = {
            "title": "Attention Needed",
            "body": (
                f"{profile['name']} has missed {consecutive_missed} consecutive doses. "
                "A gentle check-in might be helpful."
            ),
        }

    recent: list[dict] = []
    for log in sorted_desc[:4]:
        is_taken = log["status"] == "taken"
        item = {
            "title": "Dose Taken" if is_taken else "Dose Missed",
            "time": _humanize(log["timestamp"], now),
            "status": "good" if is_taken else "bad",
        }
        if log.get("checkIn") and log["checkIn"].get("note"):
            item["note"] = log["checkIn"]["note"]
        recent.append(item)

    return {
        "patientName": profile["name"],
        "adherence": adherence,
        "missedDoses": missed,
        "avgPhysical": avg_physical,
        "avgMood": avg_mood,
        "alert": alert,
        "recentActivity": recent,
    }


@router.get("/summary")
async def summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """A patient viewing their own caregiver-style summary."""
    return await build_summary(db, current_user["_id"])
