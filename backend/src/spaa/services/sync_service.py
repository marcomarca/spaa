import json
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from spaa.adapters.db_models import SyncEventModel
from spaa.adapters.repositories import (
    PlaybackRepository,
    SyncEventRepository,
)
from spaa.domain.models import utc_now


class SyncService:
    """Processes client synchronization events idempotently."""

    def __init__(self, db: Session):
        self.db = db
        self.events_repo = SyncEventRepository(db)
        self.playback_repo = PlaybackRepository(db)

    def process_events(self, device_id: str, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        processed_count = 0
        skipped_duplicates = 0

        for ev in events:
            event_id = ev.get("event_id")
            if not event_id:
                continue

            if self.events_repo.exists(event_id):
                skipped_duplicates += 1
                continue

            event_type = ev.get("event_type", "")
            entity_id = ev.get("entity_id", "")
            payload = ev.get("payload", {})

            # Record event in sync_events table
            event_model = SyncEventModel(
                event_id=event_id,
                device_id=device_id,
                event_type=event_type,
                entity_id=entity_id,
                payload_json=json.dumps(payload),
                processed_at=utc_now(),
            )
            self.events_repo.record_event(event_model)

            # Apply state updates based on event_type
            if event_type in ["PlaybackChanged", "ChapterCompleted"]:
                self.playback_repo.upsert_state(
                    device_id=device_id,
                    book_id=payload.get("book_id", ""),
                    chapter_id=payload.get("chapter_id", entity_id),
                    position_ms=payload.get("position_ms", 0),
                    speed=payload.get("speed", 1.0),
                    is_completed=payload.get("is_completed", event_type == "ChapterCompleted"),
                )

            processed_count += 1

        return {
            "success": True,
            "processed": processed_count,
            "skipped_duplicates": skipped_duplicates,
        }
