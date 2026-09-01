import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import spaa.adapters.db_models  # noqa: F401
from spaa.adapters.database import Base, get_db
from spaa.api.main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_create_and_list_cheatsheets(client: TestClient):
    payload = {
        "book_id": "book-robotics-1",
        "concept": "3D Gaussian Splatting",
        "trigger": "Novel views rápidas y alta resolución",
        "rule": "Representación explícita mediante gaussianas 3D covariantes",
        "procedure": "Optimización continua -> Rasterización diferenciable",
        "pitfall": "Memoria GPU escala con número de primitivas",
        "association": "NeRF / Point Clouds",
        "user_version": "Técnica explícita de renderizado rápido basada en elipses 3D.",
        "selected_for_memory": True,
    }

    res = client.post("/api/study/cheatsheets", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["concept"] == "3D Gaussian Splatting"
    assert data["selected_for_memory"] is True
    entry_id = data["id"]

    # List cheatsheets
    list_res = client.get("/api/study/cheatsheets")
    assert list_res.status_code == 200
    entries = list_res.json()
    assert len(entries) == 1
    assert entries[0]["id"] == entry_id

    # Test FSRS review
    review_res = client.post("/api/study/fsrs/review", json={"entity_id": entry_id, "rating": 3})
    assert review_res.status_code == 200
    rev_data = review_res.json()
    assert rev_data["success"] is True
    assert rev_data["reps"] == 1
    assert rev_data["stability"] > 1.0
