# SPAA System Architecture

## Overview

SPAA (Sistema Personal de Audiolibros y Aprendizaje) is an offline-first personal learning and audiobook system designed for Windows (Master Server) and Android (Offline Client).

```text
┌────────────────────────────────────────────────────────┐
│                      PC WINDOWS                        │
│                                                        │
│  Markdown Source ──> Segmentation (<=950 words)        │
│                              │                         │
│                              ▼                         │
│                     TTS Job Queue Engine               │
│                     (Leases & Heartbeats)              │
│                              │                         │
│         ┌────────────────────┼────────────────────┐    │
│         ▼                    ▼                    ▼    │
│  Gemini AI Studio         F5-TTS              Edge TTS │
│  (Chrome MV3 Extension)  (Local PyTorch)     (Fallback)│
│         │                    │                    │    │
│         └────────────────────┼────────────────────┘    │
│                              ▼                         │
│                      Temporary WAV QA                  │
│                              ▼                         │
│                   FFmpeg MP3 Concatenation             │
│                     (1 MP3 per Chapter)                │
│                              ▼                         │
│                     Master Library API                 │
└──────────────────────────────┬─────────────────────────┘
                               │
                      LAN / Tailscale Sync
                               │
                               ▼
┌────────────────────────────────────────────────────────┐
│                        ANDROID                         │
│                                                        │
│  Offline Cache Buffer (~12 hours)                      │
│  Custom Transport Audio Player (0.8x - 3.0x)           │
│  Study & Cheatsheet Manager                            │
│  FSRS Spaced Repetition Engine (Local)                 │
│  Idempotent Event Sync (SyncEvent UUIDs)               │
└────────────────────────────────────────────────────────┘
```

## Core Principles

1. **Simplicity > Sophistication**, but **Recoverability > Extreme Simplicity**.
2. **Zero Intellectual Local LLMs**: Heavy semantic work (Feynman explanations, exam question generation) is carried out manually with ChatGPT via the AI Workspace.
3. **Deterministic Markdown Processing**: `SOURCE` is immutable, `PREPARED` is human-optimized, `SPOKEN` is deterministic text ready for TTS.
4. **Resilient Queueing**: Workers lease chunks. If a worker dies or Chrome closes, the lease expires and returns to `QUEUED` without lost progress.
5. **Atomic Downloads & Idempotent Events**: Android verifies SHA-256 before renaming `.part` files. Every interaction event uses a unique UUID to prevent duplicates.
