"""
Dev helper: seed or wipe medication logs for an existing user.

Usage:
  python -m scripts.seed_logs --email you@example.com --reset
  python -m scripts.seed_logs --email you@example.com --seed-wed-thu
  python -m scripts.seed_logs --email you@example.com --reset --seed-wed-thu --days 45
"""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings


async def run(email: str, reset: bool, seed: bool, days: int) -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    user = await db.users.find_one({"email": email.lower()})
    if not user:
        raise SystemExit(f"No user with email={email}")
    uid = user["_id"]
    print(f"user: {email}  _id={uid}")

    if reset:
        res = await db.logs.delete_many({"user_id": uid})
        print(f"deleted {res.deleted_count} logs")

    if seed:
        now = datetime.now(timezone.utc)
        docs = []
        # Skip today (i=0) so the dashboard's "log today" flow still works
        for i in range(1, days + 1):
            d = now - timedelta(days=i)
            # weekday(): Mon=0 ... Sun=6 -> Wed=2, Thu=3
            status = "missed" if d.weekday() in (2, 3) else "taken"
            check_in = (
                {"physical": 5, "emotional": 4}
                if status == "taken"
                else {"physical": 2, "emotional": 2}
            )
            docs.append({
                "user_id": uid,
                "date_key": d.strftime("%Y-%m-%d"),
                "timestamp": d,
                "status": status,
                "checkIn": check_in,
            })
        if docs:
            await db.logs.insert_many(docs)
            print(f"inserted {len(docs)} logs over the last {days} days")

    # Show resulting state
    total = await db.logs.count_documents({"user_id": uid})
    taken = await db.logs.count_documents({"user_id": uid, "status": "taken"})
    print(f"now: {taken}/{total} taken")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--reset", action="store_true", help="delete all logs for this user first")
    p.add_argument("--seed-wed-thu", action="store_true", dest="seed",
                   help="seed historical logs missed on Wed/Thu, taken otherwise")
    p.add_argument("--days", type=int, default=45)
    args = p.parse_args()
    if not (args.reset or args.seed):
        p.error("pass --reset and/or --seed-wed-thu")
    asyncio.run(run(args.email, args.reset, args.seed, args.days))


if __name__ == "__main__":
    main()
