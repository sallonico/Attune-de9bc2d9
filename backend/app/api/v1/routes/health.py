from fastapi import APIRouter

from app.core.db import ping

router = APIRouter()


@router.get("/healthz")
async def healthz():
    try:
        await ping()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "ok", "db": "error", "detail": str(e)}
