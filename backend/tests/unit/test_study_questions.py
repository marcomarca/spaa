import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from spaa.adapters.database import Base, get_db
from spaa.adapters.db_models import BookModel, BookVariantModel, ChapterModel
from spaa.api.main import app


@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = testing_session_local()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(test_db_session):
    def override_get_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_question_lifecycle_and_chatgpt_evaluation(client, test_db_session):
    # Setup parent book and chapter
    book = BookModel(id="book-q-1", title="Libro de Pruebas")
    variant = BookVariantModel(id="var-q-1", book_id="book-q-1", language="es")
    chapter = ChapterModel(
        id="chap-q-1",
        book_id="book-q-1",
        variant_id="var-q-1",
        sequence=1,
        title="Capítulo 1",
        prepared_text="El principio de Arquímedes afirma que todo cuerpo sumergido experimenta un empuje...",
    )
    test_db_session.add_all([book, variant, chapter])
    test_db_session.commit()

    # 1. Create a question
    q_payload = {
        "chapter_id": "chap-q-1",
        "question_type": "feynman",
        "prompt_text": "Explica el principio de Arquímedes a un niño de 10 años sin usar fórmulas.",
        "expected_criteria": "Mencionar el agua desplazada y la fuerza que empuja hacia arriba.",
    }
    q_res = client.post("/api/study/questions", json=q_payload)
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert q_data["id"] is not None
    q_id = q_data["id"]

    # 2. List questions for chapter
    list_res = client.get(f"/api/study/questions/chapter/{chapter.id}")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Submit an answer
    ans_payload = {
        "question_id": q_id,
        "user_response": "Cuando te metes a la bañera el agua sube porque tu cuerpo ocupa su lugar, y esa agua empuja hacia arriba.",
    }
    ans_res = client.post("/api/study/answers", json=ans_payload)
    assert ans_res.status_code == 200
    ans_data = ans_res.json()
    assert ans_data["status"] == "PENDING_REVIEW"
    ans_id = ans_data["id"]

    # 4. Generate evaluation prompt for ChatGPT
    prompt_res = client.post(f"/api/study/answers/{ans_id}/generate-prompt")
    assert prompt_res.status_code == 200
    prompt_data = prompt_res.json()
    assert "EVALUACIÓN DE RESPUESTA DE ESTUDIO" in prompt_data["prompt"]
    assert "FEYNMAN" in prompt_data["prompt"]

    # 5. Submit evaluation result
    eval_payload = {
        "score": 9.0,
        "correct_points": ["Uso adecuado de la analogía de la bañera", "Explicación intuitiva del empuje"],
        "missing_points": ["Podría mencionar la flotabilidad explícitamente"],
        "misconceptions": [],
        "feedback": "Excelente analogía intuitiva.",
        "fsrs_rating": 3,
    }
    eval_res = client.post(f"/api/study/answers/{ans_id}/evaluate", json=eval_payload)
    assert eval_res.status_code == 200
    evaluated_data = eval_res.json()
    assert evaluated_data["status"] == "REVIEWED"
    assert evaluated_data["score"] == 9.0
