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
    card.reps += 1

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
