from fastapi import APIRouter

from app.api.v1.routes import auth, health, profile

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(profile.router)
