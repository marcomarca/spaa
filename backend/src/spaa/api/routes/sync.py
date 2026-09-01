from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaa.adapters.database import get_db
from spaa.adapters.db_models import PlaybackStateModel
from spaa.services.sync_service import SyncService

router = APIRouter(prefix="/api/sync", tags=["Sync"])


class ClientEvent(BaseModel):
    event_id: str
    event_type: str
    entity_id: str
    timestamp: str
    payload: Dict[str, Any] = {}


class SyncPushRequest(BaseModel):
    device_id: str
    events: List[ClientEvent]


@router.post("/events")
def push_events(req: SyncPushRequest, db: Session = Depends(get_db)):
    svc = SyncService(db)
    raw_events = [ev.model_dump() for ev in req.events]
    result = svc.process_events(device_id=req.device_id, events=raw_events)
    return result


@router.get("/playback/{device_id}")
def get_playback_states(device_id: str, db: Session = Depends(get_db)):
    stmt = select(PlaybackStateModel).where(PlaybackStateModel.device_id == device_id)
    states = list(db.scalars(stmt).all())
    return [
        {
            "book_id": s.book_id,
            "chapter_id": s.chapter_id,
            "position_ms": s.position_ms,
            "speed": s.speed,
            "is_completed": s.is_completed,
            "updated_at": s.updated_at.isoformat(),
        }
        for s in states
    ]
