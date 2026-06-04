import secrets

from motor.motor_asyncio import AsyncIOMotorDatabase

# Unambiguous alphabet: no 0/O/1/I/L to keep codes easy to read aloud / type.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def _random_code() -> str:
    """A cryptographically secure, human-friendly connection code."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))


async def generate_unique_code(db: AsyncIOMotorDatabase, *, max_attempts: int = 12) -> str:
    """Generate a connection code guaranteed unique across all patients.

    Relies on the unique index on ``users.connection_code`` as the source of
    truth; this just avoids a round-trip insert failure in the common case.
    """
    for _ in range(max_attempts):
        code = _random_code()
        existing = await db.users.find_one({"connection_code": code}, {"_id": 1})
        if not existing:
            return code
    # Astronomically unlikely with a 31^8 space; surface rather than loop forever.
    raise RuntimeError("could_not_generate_unique_connection_code")
