from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.db import get_db
from app.core.security import decode_token


async def get_database() -> AsyncIOMotorDatabase:
    return get_db()


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_not_found")
    return user


def user_role(user: dict) -> str:
    """Role of a user. Accounts created before roles existed are patients."""
    return user.get("role", "patient")


async def get_current_patient(current_user: dict = Depends(get_current_user)) -> dict:
    if user_role(current_user) != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="patient_role_required")
    return current_user


async def get_current_caregiver(current_user: dict = Depends(get_current_user)) -> dict:
    if user_role(current_user) != "caregiver":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="caregiver_role_required")
    return current_user
