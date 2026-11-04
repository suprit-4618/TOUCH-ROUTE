import os
# Ensure tests use an isolated test database so test fixtures never touch or contaminate touchroute.db
os.environ["TEST_DATABASE_URL"] = "sqlite:///./test_touchroute.db"

import pytest
from fastapi.testclient import TestClient
from app.database.session import Base, SessionLocal, engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    try:
        engine.dispose()
        if os.path.exists("./test_touchroute.db"):
            os.remove("./test_touchroute.db")
    except Exception:
        pass


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
