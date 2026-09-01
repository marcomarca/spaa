# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-01

### Added
- Master backend architecture in Python with FastAPI, SQLAlchemy, and SQLite.
- Deterministic Markdown cleaner (`SOURCE` -> `PREPARED` -> `SPOKEN`).
- Deterministic chapter and chunk segmenter enforcing $\le 950$ words hard maximum.
- TTS Job Queue with lease expiration, automatic recovery, worker heartbeats, and retry policy.
- Audio QA validation rules and FFmpeg concatenation with `loudnorm` for chapter MP3 generation.
- Responsive offline-first Web and Android (Capacitor) client in React + TypeScript with Bun.
- Transport Player screen with large controls, speed adjustment (0.8x - 3.0x), and bookmarking.
- AI Workspace for manual ChatGPT workflow with 8 prompt templates.
- Cheatsheet manager and FSRS spaced repetition engine.
- Chrome Extension Manifest V3 for Gemini AI Studio TTS automation with isolated DOM adapter.
- Automated CI/CD workflow with GitHub Actions, tests, and MIT license.
