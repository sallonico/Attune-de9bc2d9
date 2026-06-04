from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.api.v1.routes.caregiver import build_summary
from app.core.deps import get_current_caregiver, get_current_patient, get_database
from app.services.connections import generate_unique_code

router = APIRouter(prefix="/connections", tags=["connections"])


class ConnectBody(BaseModel):
    # Codes are uppercase alphanumeric; accept lower/whitespace and normalize.
    code: str = Field(min_length=4, max_length=16)


# --------------------------------------------------------------------------- #
# Patient side
# --------------------------------------------------------------------------- #
@router.get("/code")
async def get_code(
    current_user: dict = Depends(get_current_patient),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """The patient's connection code (lazily backfilled for legacy accounts)."""
    code = current_user.get("connection_code")
    if not code:
        code = await generate_unique_code(db)
        await db.users.update_one({"_id": current_user["_id"]}, {"$set": {"connection_code": code}})
    return {"connectionCode": code}


@router.post("/regenerate")
async def regenerate_code(
    current_user: dict = Depends(get_current_patient),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Issue a fresh code. Existing caregiver links are unaffected — only future
    connection attempts with the old code stop working."""
    code = await generate_unique_code(db)
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"connection_code": code, "code_updated_at": datetime.now(timezone.utc)}},
    )
    return {"connectionCode": code}


@router.get("/caregivers")
async def list_caregivers(
    current_user: dict = Depends(get_current_patient),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Caregivers currently linked to this patient — for transparency/control."""
    out: list[dict] = []
    cursor = db.connections.find({"patient_id": current_user["_id"]}).sort("created_at", 1)
    async for conn in cursor:
        caregiver = await db.users.find_one({"_id": conn["caregiver_id"]}, {"email": 1})
        if not caregiver:
            continue
        out.append(
            {
                "connectionId": str(conn["_id"]),
                "caregiverEmail": caregiver["email"],
                "connectedAt": conn["created_at"].isoformat(),
            }
        )
    return {"caregivers": out}


@router.delete("/caregivers/{connection_id}")
async def revoke_caregiver(
    connection_id: str,
    current_user: dict = Depends(get_current_patient),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Patient revokes a caregiver's access."""
    try:
        oid = ObjectId(connection_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="connection_not_found")
    result = await db.connections.delete_one({"_id": oid, "patient_id": current_user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="connection_not_found")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Caregiver side
# --------------------------------------------------------------------------- #
@router.post("/connect")
async def connect_to_patient(
    body: ConnectBody,
    current_user: dict = Depends(get_current_caregiver),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Link the caregiver to the patient that owns ``code``."""
    code = body.code.strip().upper()
    patient = await db.users.find_one({"connection_code": code, "role": "patient"})
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invalid_connection_code")
    if patient["_id"] == current_user["_id"]:
        # Defensive — a caregiver account never holds a patient code, but be safe.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_connect_to_self")

    existing = await db.connections.find_one(
        {"caregiver_id": current_user["_id"], "patient_id": patient["_id"]}
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_connected")

    profile = await db.profiles.find_one({"user_id": patient["_id"]}, {"name": 1})
    now = datetime.now(timezone.utc)
    try:
        result = await db.connections.insert_one(
            {
                "caregiver_id": current_user["_id"],
                "patient_id": patient["_id"],
                "status": "active",
                "created_at": now,
            }
        )
    except Exception:
        # Unique-index race: another concurrent connect won.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_connected")

    return {
        "connectionId": str(result.inserted_id),
        "patientId": str(patient["_id"]),
        "patientName": profile["name"] if profile else patient["email"],
    }


async def _require_connection(db: AsyncIOMotorDatabase, caregiver_id, patient_oid) -> dict:
    conn = await db.connections.find_one({"caregiver_id": caregiver_id, "patient_id": patient_oid})
    if not conn:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_connected_to_patient")
    return conn


@router.get("/patients")
async def list_patients(
    current_user: dict = Depends(get_current_caregiver),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Patients this caregiver is linked to, with light metadata for the list."""
    out: list[dict] = []
    cursor = db.connections.find({"caregiver_id": current_user["_id"]}).sort("created_at", 1)
    async for conn in cursor:
        patient = await db.users.find_one({"_id": conn["patient_id"]}, {"email": 1})
        if not patient:
            continue
        profile = await db.profiles.find_one(
            {"user_id": conn["patient_id"]}, {"name": 1, "medication": 1, "features": 1}
        )
        out.append(
            {
                "patientId": str(conn["patient_id"]),
                "connectionId": str(conn["_id"]),
                "name": (profile or {}).get("name") or patient["email"],
                "medication": (profile or {}).get("medication"),
                "accessEnabled": bool((profile or {}).get("features", {}).get("caregiverAccess", False)),
                "connectedAt": conn["created_at"].isoformat(),
            }
        )
    return {"patients": out}


@router.get("/patients/{patient_id}/summary")
async def patient_summary(
    patient_id: str,
    current_user: dict = Depends(get_current_caregiver),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Adherence + wellness summary for a linked patient.

    Authorization: caregiver must hold an active connection AND the patient must
    have ``caregiverAccess`` enabled (enforced inside ``build_summary``)."""
    try:
        patient_oid = ObjectId(patient_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="patient_not_found")
    await _require_connection(db, current_user["_id"], patient_oid)
    return await build_summary(db, patient_oid)


@router.delete("/patients/{patient_id}")
async def disconnect_patient(
    patient_id: str,
    current_user: dict = Depends(get_current_caregiver),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Caregiver disconnects themselves from a patient."""
    try:
        patient_oid = ObjectId(patient_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="connection_not_found")
    result = await db.connections.delete_one(
        {"caregiver_id": current_user["_id"], "patient_id": patient_oid}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="connection_not_found")
    return {"ok": True}
