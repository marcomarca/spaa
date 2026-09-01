# Testing Strategy

## Layers

1. **Unit Tests**:
   - Backend: Pure segmentation algorithms, markdown cleaner, QA rules, FSRS calculations.
   - Frontend: Audio state machines, storage persistence logic, time formatters, sync queues.
2. **Integration Tests**:
   - Backend: Database repositories, queue lease timeouts, heartbeat handling, FFmpeg audio processor, FastAPI endpoints.
   - Frontend: Local storage adapter, sync payload serialization, player state transitions.
3. **E2E & Contract Tests**:
   - Full lifecycle from markdown ingestion to chunk creation, simulated worker claiming, WAV upload, QA analysis, MP3 chapter generation, and sync event replay.

## Quality Gates

- Python Backend:
  `uv run ruff check .`
  `uv run pytest`
- Frontend:
  `bun run lint`
  `bun run typecheck`
  `bun test`
