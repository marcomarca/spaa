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
    # Setup isolated test database with StaticPool so all connections share the same memory instance
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


def test_health_check(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_import_and_list_books(client: TestClient):
    # 1. Import markdown book
    payload = {
        "title": "Manual de Robótica y Percepción",
        "author": "Dr. Smith",
        "language": "es",
        "mode": "auto",
        "markdown_text": """# Capítulo 1: Cinemática Directa

La cinemática directa calcula la posición del efector final a partir de las coordenadas articulares.

## Parámetros DH

Los parámetros de Denavit-Hartenberg son cuatro: theta, d, a, alpha.

# Capítulo 2: Cinemática Inversa

Calcula los ángulos articulares requeridos para alcanzar una pose deseada en el espacio cartesiano.
""",
    }

    resp = client.post("/api/books/import", json=payload)
    assert resp.status_code == 200
    book_data = resp.json()
    assert book_data["title"] == "Manual de Robótica y Percepción"
    assert len(book_data["chapters"]) == 2
    book_id = book_data["id"]

    # 2. List books
    list_resp = client.get("/api/books")
    assert list_resp.status_code == 200
    books = list_resp.json()
    assert any(b["id"] == book_id for b in books)

    # 3. Worker claims first chunk
    claim_resp = client.post(
        "/api/queue/claim",
        json={"worker_id": "worker-qwen-1", "profile_alias": "Perfil Qwen", "provider": "qwen"},
    )
    assert claim_resp.status_code == 200
    claim_data = claim_resp.json()
    assert claim_data["job"] is not None
    assert claim_data["job"]["provider"] == "qwen"
    assert claim_data["job"]["voice"] == "Ryan"
    assert "energética" in claim_data["job"]["instruct"]
    assert "Cinemática Directa" in claim_data["job"]["spoken_text"]


def test_sync_events_idempotency(client: TestClient):
    event_payload = {
        "device_id": "android-pixel-7",
        "events": [
            {
                "event_id": "evt-uuid-100",
                "event_type": "PlaybackChanged",
                "entity_id": "chap-1",
                "timestamp": "2026-09-01T12:00:00Z",
                "payload": {
                    "chapter_id": "chap-1",
                    "book_id": "book-1",
                    "position_ms": 15400,
                    "speed": 1.2,
                },
            }
        ],
    }

    # First push: 1 processed
    r1 = client.post("/api/sync/events", json=event_payload)
    assert r1.status_code == 200
    assert r1.json()["processed"] == 1
    assert r1.json()["skipped_duplicates"] == 0

    # Second push (identical event_id): 0 processed, 1 duplicate skipped
    r2 = client.post("/api/sync/events", json=event_payload)
    assert r2.status_code == 200
    assert r2.json()["processed"] == 0
    assert r2.json()["skipped_duplicates"] == 1


def test_queue_monitor_and_logs(client: TestClient):
    # Import a sample book first to populate chunks
    book_payload = {
        "title": "Libro de Prueba Monitor",
        "author": "Autor Test",
        "language": "es",
        "mode": "auto",
        "markdown_text": "# Cap 1\n\nTexto de prueba para el monitor.\n",
    }
    client.post("/api/books/import", json=book_payload)

    # 1. Test /api/queue/monitor
    res_monitor = client.get("/api/queue/monitor")
    assert res_monitor.status_code == 200
    data = res_monitor.json()
    assert "summary" in data
    assert data["summary"]["total_chunks"] >= 1
    assert "chunks" in data
    assert len(data["chunks"]) >= 1
    first_chunk = data["chunks"][0]
    assert "status" in first_chunk
    assert "chapter_title" in first_chunk

    # 2. Test /api/queue/logs
    res_logs = client.get("/api/queue/logs?lines=50")
    assert res_logs.status_code == 200
    logs_data = res_logs.json()
    assert "lines" in logs_data

    # 3. Test /api/queue/retry-failed
    res_retry = client.post("/api/queue/retry-failed")
    assert res_retry.status_code == 200
    assert "reset_count" in res_retry.json()

    # 4. Test /api/queue/worker/status
    res_worker_status = client.get("/api/queue/worker/status")
    assert res_worker_status.status_code == 200
    worker_data = res_worker_status.json()
    assert "is_running" in worker_data

    # 5. Test /api/queue/worker/stop
    res_worker_stop = client.post("/api/queue/worker/stop")
    assert res_worker_stop.status_code == 200
    assert res_worker_stop.json()["success"] is True
