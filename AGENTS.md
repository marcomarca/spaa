# Operating Contract for AI Developers — SPAA Project

> This repository adheres to high-level engineering standards.
> - **Backend / Python**: Python 3.11+, managed via `uv`, tested with `pytest`, linted with `ruff`, following Clean Architecture (`domain/`, `services/`, `adapters/`, `api/`).
> - **Frontend / TypeScript**: React + TypeScript + Vite, managed via `bun`, tested with `bun test`, linted with `Biome`, packaged for Android via Capacitor.
> - **Extension / TypeScript**: Chrome MV3 extension for Gemini AI Studio automation with isolated DOM adapters.

---

## Core Behavior Rules

1. Work from the repository state, not from assumptions.
2. Prefer small vertical slices over broad rewrites.
3. Preserve existing public behavior unless explicitly changing it.
4. Do not invent hidden requirements. When a requirement is missing, make a reasonable assumption and state it.
5. Do not introduce new dependencies unless they solve a specific problem better than existing tools.
6. Every meaningful change must be testable.
7. When touching existing code, first understand call sites, data flow, and tests.
8. When a bug exists, reproduce it before fixing it when feasible.
9. When a behavior is important, encode it in tests or executable checks.
10. Leave the repo cleaner, but do not perform unrelated cleanup.

## Default Work Loop

```txt
1. Read relevant files and inspect git status.
2. Identify the smallest useful slice.
3. State the intended change briefly.
4. Add or update tests first when practical.
5. Implement the change.
6. Run the narrowest useful checks (ruff, biome, pytest, bun test).
7. Run the broader quality gate before finalizing.
8. Summarize changed files, checks run, and residual risks.
```

## Non-Negotiables

```txt
- Do not bypass tests to make a task appear complete.
- Do not delete user work without explicit instruction.
- Do not use destructive git commands (reset --hard, clean -fd, restore .).
- Do not mix formatting-only changes with behavioral changes.
- Do not add abstractions without a real variation point or clear simplification.
- Do not test private implementation details when public behavior can be tested.
- Domain logic must remain pure and free from framework/transport dependencies.
- Do not include user-imported books, markdown texts, audio files, or copyrighted material in git commits or commit messages. Keep all user data inside data/ (strictly ignored in .gitignore).
```

---

## Tooling & Quality Gate Commands

### Backend (Python / uv)
```bash
cd backend
uv run ruff format .
uv run ruff check .
uv run pytest
```

### Frontend (TypeScript / Bun)
```bash
cd frontend
bun run format
bun run lint
bun run typecheck
bun test
bun run build
```

### Chrome Extension (TypeScript / Bun)
```bash
cd extension
bun run build
```
