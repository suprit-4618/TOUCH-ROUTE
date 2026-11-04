import pytest
from app.api.routes.projects import (
    create_project,
    delete_project,
    get_project,
    get_project_stats,
    list_projects,
)
from app.database.session import SessionLocal
from app.schemas.project import ProjectCreate, ProjectStats


def test_list_projects():
    db = SessionLocal()
    try:
        projects = list_projects(include_demo=False, status=None, db=db)
        assert isinstance(projects, list)
        assert all(isinstance(p.is_demo, bool) for p in projects)
        assert all(p.is_demo is False for p in projects)
    finally:
        db.close()


def test_project_stats():
    db = SessionLocal()
    try:
        stats = get_project_stats(db)
        assert isinstance(stats, ProjectStats)
        assert isinstance(stats.total_projects, int)
        assert isinstance(stats.demo_projects, int)
        assert isinstance(stats.total_accessible_routes, int)
    finally:
        db.close()


def test_create_and_delete_project():
    db = SessionLocal()
    try:
        new_payload = ProjectCreate(
            name="Community Health Pavilion",
            building_name="East Wing Care Center",
            description="Specialized accessible vision therapy wing",
            address="500 Wellness Way",
            is_demo=False,
        )
        created = create_project(new_payload, db=db)
        assert created.name == "Community Health Pavilion"
        assert created.is_demo is False
        assert created.id is not None

        # Fetch detail
        detail = get_project(created.id, db=db)
        assert detail.id == created.id
        assert detail.building_name == "East Wing Care Center"

        # Verify stats reflect new genuine building
        stats = get_project_stats(db)
        assert stats.total_projects >= 1

        # Delete
        delete_project(created.id, db=db)

        # Verify deletion
        with pytest.raises(Exception):
            get_project(created.id, db=db)
    finally:
        db.close()
