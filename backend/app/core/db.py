from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings


_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGODB_URI)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.MONGODB_DB]


async def ping() -> bool:
    await get_client().admin.command("ping")
    return True


async def ensure_indexes() -> None:
    """Create the indexes the app relies on. Idempotent — safe to run on every
    startup."""
    db = get_db()
    # Connection codes must be unique across all patients. Sparse so the many
    # caregiver users (which never carry a code) don't collide on null.
    await db.users.create_index("connection_code", unique=True, sparse=True, name="uniq_connection_code")
    # A caregiver may link to many patients, but never the same patient twice.
    await db.connections.create_index(
        [("caregiver_id", 1), ("patient_id", 1)], unique=True, name="uniq_caregiver_patient"
    )
    # Fast lookups of "who am I linked to" from either side.
    await db.connections.create_index("caregiver_id", name="by_caregiver")
    await db.connections.create_index("patient_id", name="by_patient")
