# ADR 0001: System Architecture and Technology Stack

## Status
Accepted

## Context
SPAA requires a dual-environment system (Windows master server + Android offline client).
Key constraints:
- Non-trivial TTS processing (Gemini AI Studio web automation, F5-TTS, Edge TTS).
- Total offline availability on Android (no runtime dependency on backend during transport).
- Minimal administrative overhead and maximum failure recoverability.

## Decision
1. **Backend**: Python 3.11+ using `uv`, FastAPI, SQLAlchemy, SQLite, FFmpeg.
2. **Frontend & Mobile**: React + TypeScript + Vite managed via `bun`, wrapped with Capacitor for Android.
3. **Chrome Extension**: Manifest V3 in TypeScript for Gemini AI Studio TTS automation.
4. **Data Protocol**: REST API over LAN/Tailscale with atomic file verification (SHA-256) and idempotent event synchronization.

## Consequences
- Single unified codebase for Web and Android UI.
- Deterministic and auditable audio pipeline.
- High resilience: lease timeouts allow transparent recovery from browser or server crashes.
