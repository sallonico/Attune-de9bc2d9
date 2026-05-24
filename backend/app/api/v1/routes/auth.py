from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from app.core.deps import get_current_user, get_database
from app.core.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


def _public_profile(profile: dict | None) -> dict | None:
    if not profile:
        return None
    return {
        "name": profile.get("name"),
        "medication": profile.get("medication"),
        "scheduleTime": profile.get("scheduleTime"),
        "features": profile.get("features", {}),
        "deviceConnected": profile.get("deviceConnected", False),
        "remindMeCount": profile.get("remindMeCount", 0),
    }


@router.post("/signup")
async def signup(body: SignupBody, db: AsyncIOMotorDatabase = Depends(get_database)):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email_already_registered")
    user_doc = {
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    return {"user_id": user_id, "email": user_doc["email"], "access_token": create_access_token(user_id)}


@router.post("/login")
async def login(body: LoginBody, db: AsyncIOMotorDatabase = Depends(get_database)):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    user_id = str(user["_id"])
    return {"user_id": user_id, "email": user["email"], "access_token": create_access_token(user_id)}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    return {"ok": True}


@router.get("/me")
async def me(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await db.profiles.find_one({"user_id": current_user["_id"]})
    return {
        "user_id": str(current_user["_id"]),
        "email": current_user["email"],
        "profile": _public_profile(profile),
    }
