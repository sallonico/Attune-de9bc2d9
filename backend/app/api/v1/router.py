from fastapi import APIRouter

from app.api.v1.routes import auth, health, insights, logs, profile, reminders, stats

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(logs.router)
api_router.include_router(reminders.router)
api_router.include_router(stats.router)
api_router.include_router(insights.router)
