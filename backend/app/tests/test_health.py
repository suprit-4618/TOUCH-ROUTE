import pytest
from app.api.routes.health import health_check
from app.database.session import SessionLocal


def test_health_check_endpoint():
    db = SessionLocal()
    try:
        res = health_check(db)
        assert res["status"] == "healthy"
        assert res["database"] == "connected"
        assert res["app_name"] == "TouchRoute"
    finally:
        db.close()
