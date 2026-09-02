import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaa.adapters.database import get_db
from spaa.adapters.db_models import CheatEntryModel, FsrsCardModel

router = APIRouter(prefix="/api/study", tags=["Study & Cheatsheets & FSRS"])


class CheatEntryCreate(BaseModel):
    book_id: str
    chapter_id: Optional[str] = None
    concept: str
    trigger: str = ""
    rule: str = ""
    procedure: str = ""
    pitfall: str = ""
    association: str = ""
    user_version: str  # Mandatory personal synthesis (summary_written = true)
    chatgpt_version: Optional[str] = None
    selected_for_memory: bool = True


class CheatEntryResponse(CheatEntryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: str


class FsrsReviewRequest(BaseModel):
    entity_id: str
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy


@router.get("/cheatsheets", response_model=List[CheatEntryResponse])
def list_cheatsheets(book_id: Optional[str] = None, db: Session = Depends(get_db)):
    stmt = select(CheatEntryModel)
    if book_id:
        stmt = stmt.where(CheatEntryModel.book_id == book_id)
    entries = list(db.scalars(stmt.order_by(CheatEntryModel.created_at.desc())).all())
    return [
        CheatEntryResponse(
            id=e.id,
            book_id=e.book_id,
            chapter_id=e.chapter_id,
            concept=e.concept,
            trigger=e.trigger,
            rule=e.rule,
            procedure=e.procedure,
            pitfall=e.pitfall,
            association=e.association,
            user_version=e.user_version,
            chatgpt_version=e.chatgpt_version,
            selected_for_memory=e.selected_for_memory,
            created_at=e.created_at.isoformat(),
        )
        for e in entries
    ]


@router.post("/cheatsheets", response_model=CheatEntryResponse)
def create_cheatsheet(req: CheatEntryCreate, db: Session = Depends(get_db)):
    if not req.user_version.strip():
        raise HTTPException(
            status_code=400,
            detail="La versión de usuario es obligatoria para considerar aprendido el concepto (summary_written = true)",
        )

    entry_id = str(uuid.uuid4())
    entry = CheatEntryModel(
        id=entry_id,
        book_id=req.book_id,
        chapter_id=req.chapter_id,
        concept=req.concept,
        trigger=req.trigger,
        rule=req.rule,
        procedure=req.procedure,
        pitfall=req.pitfall,
        association=req.association,
        user_version=req.user_version,
        chatgpt_version=req.chatgpt_version,
        selected_for_memory=req.selected_for_memory,
    )
    db.add(entry)

    # If selected for memory, create FSRS card
    if req.selected_for_memory:
        card = FsrsCardModel(
            id=str(uuid.uuid4()),
            entity_id=entry_id,
            due=datetime.now(timezone.utc),
            stability=1.0,
            difficulty=5.0,
            state=0,
        )
        db.add(card)

    db.commit()
    db.refresh(entry)

    return CheatEntryResponse(
        id=entry.id,
        book_id=entry.book_id,
        chapter_id=entry.chapter_id,
        concept=entry.concept,
        trigger=entry.trigger,
        rule=entry.rule,
        procedure=entry.procedure,
        pitfall=entry.pitfall,
        association=entry.association,
        user_version=entry.user_version,
        chatgpt_version=entry.chatgpt_version,
        selected_for_memory=entry.selected_for_memory,
        created_at=entry.created_at.isoformat(),
    )


@router.post("/fsrs/review")
def record_fsrs_review(req: FsrsReviewRequest, db: Session = Depends(get_db)):
    stmt = select(FsrsCardModel).where(FsrsCardModel.entity_id == req.entity_id)
    card = db.scalar(stmt)
    now = datetime.now(timezone.utc)

    if not card:
        card = FsrsCardModel(
            id=str(uuid.uuid4()),
            entity_id=req.entity_id,
            due=now,
            stability=1.0,
            difficulty=5.0,
            state=0,
            reps=0,
            lapses=0,
        )
        db.add(card)

    # Simplified deterministic FSRS interval calculation
    # Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
    if req.rating == 1:
        card.stability = max(0.5, card.stability * 0.5)
        card.difficulty = min(10.0, card.difficulty + 0.8)
        card.state = 3  # Relearning
        interval_days = 0.2  # Review in a few hours
    elif req.rating == 2:
        card.stability *= 1.2
        card.difficulty = min(10.0, card.difficulty + 0.3)
        card.state = 2
        interval_days = max(1.0, card.stability * 0.8)
    elif req.rating == 3:
        card.stability *= 2.0
        card.difficulty = max(1.0, card.difficulty - 0.2)
        card.state = 2
        interval_days = max(1.0, card.stability)
    else:  # Easy
        card.stability *= 3.0
        card.difficulty = max(1.0, card.difficulty - 0.5)
        card.state = 2
        interval_days = max(2.0, card.stability * 1.5)

    card.due = now + timedelta(days=interval_days)
    card.last_review = now
    card.reps = (card.reps or 0) + 1

    db.commit()
    db.refresh(card)

    return {
        "success": True,
        "entity_id": req.entity_id,
        "next_due": card.due.isoformat(),
        "stability": round(card.stability, 2),
        "difficulty": round(card.difficulty, 2),
        "reps": card.reps,
    }


# ==========================================
# Question & Answer Schemas and Endpoints
# ==========================================


class QuestionCreate(BaseModel):
    chapter_id: str
    question_type: str = "feynman"  # feynman, why_chain, application, contrast, counterexample
    prompt_text: str
    expected_criteria: str = ""


class QuestionResponse(QuestionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: str


class AnswerCreate(BaseModel):
    question_id: str
    user_response: str


class AnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    user_response: str
    status: str
    score: Optional[float] = None
    correct_points: str
    missing_points: str
    misconceptions: str
    evaluator_feedback: Optional[str] = None
    evaluated_at: Optional[str] = None
    created_at: str


class EvaluationSubmit(BaseModel):
    score: float
    correct_points: List[str] = []
    missing_points: List[str] = []
    misconceptions: List[str] = []
    feedback: str = ""
    fsrs_rating: Optional[int] = None  # 1 to 4


@router.post("/questions", response_model=QuestionResponse)
def create_question(req: QuestionCreate, db: Session = Depends(get_db)):
    from spaa.adapters.db_models import QuestionModel

    q_id = str(uuid.uuid4())
    q = QuestionModel(
        id=q_id,
        chapter_id=req.chapter_id,
        question_type=req.question_type,
        prompt_text=req.prompt_text,
        expected_criteria=req.expected_criteria,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return QuestionResponse(
        id=q.id,
        chapter_id=q.chapter_id,
        question_type=q.question_type,
        prompt_text=q.prompt_text,
        expected_criteria=q.expected_criteria,
        created_at=q.created_at.isoformat(),
    )


@router.get("/questions/chapter/{chapter_id}", response_model=List[QuestionResponse])
def list_chapter_questions(chapter_id: str, db: Session = Depends(get_db)):
    from spaa.adapters.repositories import QuestionRepository

    repo = QuestionRepository(db)
    questions = repo.list_by_chapter(chapter_id)
    return [
        QuestionResponse(
            id=q.id,
            chapter_id=q.chapter_id,
            question_type=q.question_type,
            prompt_text=q.prompt_text,
            expected_criteria=q.expected_criteria,
            created_at=q.created_at.isoformat(),
        )
        for q in questions
    ]


@router.post("/answers", response_model=AnswerResponse)
def submit_answer(req: AnswerCreate, db: Session = Depends(get_db)):
    from spaa.adapters.db_models import AnswerModel
    from spaa.adapters.repositories import AnswerRepository

    repo = AnswerRepository(db)
    ans = AnswerModel(
        id=str(uuid.uuid4()),
        question_id=req.question_id,
        user_response=req.user_response,
        status="PENDING_REVIEW",
    )
    ans = repo.create(ans)
    return AnswerResponse(
        id=ans.id,
        question_id=ans.question_id,
        user_response=ans.user_response,
        status=ans.status,
        score=ans.score,
        correct_points=ans.correct_points,
        missing_points=ans.missing_points,
        misconceptions=ans.misconceptions,
        evaluator_feedback=ans.evaluator_feedback,
        evaluated_at=ans.evaluated_at.isoformat() if ans.evaluated_at else None,
        created_at=ans.created_at.isoformat(),
    )


@router.get("/answers/pending", response_model=List[AnswerResponse])
def list_pending_answers(db: Session = Depends(get_db)):
    from spaa.adapters.repositories import AnswerRepository

    repo = AnswerRepository(db)
    pending = repo.list_pending_reviews()
    return [
        AnswerResponse(
            id=a.id,
            question_id=a.question_id,
            user_response=a.user_response,
            status=a.status,
            score=a.score,
            correct_points=a.correct_points,
            missing_points=a.missing_points,
            misconceptions=a.misconceptions,
            evaluator_feedback=a.evaluator_feedback,
            evaluated_at=a.evaluated_at.isoformat() if a.evaluated_at else None,
            created_at=a.created_at.isoformat(),
        )
        for a in pending
    ]


@router.post("/answers/{answer_id}/generate-prompt")
def generate_evaluation_prompt(answer_id: str, db: Session = Depends(get_db)):
    from spaa.adapters.repositories import AnswerRepository, ChapterRepository, QuestionRepository

    ans_repo = AnswerRepository(db)
    q_repo = QuestionRepository(db)
    chap_repo = ChapterRepository(db)

    answer = ans_repo.get(answer_id)
    if not answer:
        raise HTTPException(status_code=404, detail="Respuesta no encontrada")

    question = q_repo.get(answer.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    chapter = chap_repo.get(question.chapter_id)
    chapter_text = chapter.prepared_text if chapter else ""

    prompt = f"""# EVALUACIÓN DE RESPUESTA DE ESTUDIO (SPAA)

Actúa como un evaluador técnico y pedagógico riguroso. Evalúa la respuesta del estudiante a la pregunta sobre el material estudiado.

## CONTEXTO DEL CAPÍTULO:
\"\"\"{chapter_text[:3000]}\"\"\"

## TIPO DE PREGUNTA:
{question.question_type.upper()}

## PREGUNTA FORMULADA:
{question.prompt_text}

## CRITERIOS / RÚBRICA ESPERADA:
{question.expected_criteria or "Explicación clara, precisa, sin ambigüedades ni términos superficiales sin justificar."}

## RESPUESTA DEL ESTUDIANTE:
\"\"\"{answer.user_response}\"\"\"

---
## INSTRUCCIONES DE RESPUESTA (DEVUELVE ÚNICAMENTE ESTE JSON VÁLIDO):
```json
{{
  "score": 8.5,
  "correct_points": ["Punto correcto 1", "Punto correcto 2"],
  "missing_points": ["Detalle faltante 1"],
  "misconceptions": ["Concepto erróneo o imprecisión identificada"],
  "feedback": "Explicación constructiva breve de las fortalezas y áreas de mejora.",
  "suggested_fsrs_rating": 3
}}
```"""

    return {
        "answer_id": answer_id,
        "question_id": question.id,
        "prompt": prompt,
    }


@router.post("/answers/{answer_id}/evaluate", response_model=AnswerResponse)
def evaluate_answer(answer_id: str, req: EvaluationSubmit, db: Session = Depends(get_db)):
    import json

    from spaa.adapters.repositories import AnswerRepository

    ans_repo = AnswerRepository(db)
    updated = ans_repo.update_evaluation(
        answer_id=answer_id,
        score=req.score,
        correct_points=json.dumps(req.correct_points, ensure_ascii=False),
        missing_points=json.dumps(req.missing_points, ensure_ascii=False),
        misconceptions=json.dumps(req.misconceptions, ensure_ascii=False),
        feedback=req.feedback,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Respuesta no encontrada")

    # If FSRS rating provided, also record FSRS review
    if req.fsrs_rating:
        record_fsrs_review(FsrsReviewRequest(entity_id=updated.question_id, rating=req.fsrs_rating), db)

    return AnswerResponse(
        id=updated.id,
        question_id=updated.question_id,
        user_response=updated.user_response,
        status=updated.status,
        score=updated.score,
        correct_points=updated.correct_points,
        missing_points=updated.missing_points,
        misconceptions=updated.misconceptions,
        evaluator_feedback=updated.evaluator_feedback,
        evaluated_at=updated.evaluated_at.isoformat() if updated.evaluated_at else None,
        created_at=updated.created_at.isoformat(),
    )
