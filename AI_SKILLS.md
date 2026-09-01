# AI Development Skills & Operating Contract

## 1. Skill Router

| Situation | Skill | Output |
|---|---|---|
| New project, unclear module boundaries, major refactor | Codebase Design | Interfaces, seams, module responsibilities |
| Ambiguous terms, domain rules, business concepts | Domain Modeling | Glossary, invariants, examples, ADR candidates |
| Vague idea or many possible approaches | Decision Mapping | Decision map, risks, staged choices |
| Need to validate UI, algorithm, API, or data model quickly | Prototype | Throwaway prototype answering one question |
| Implementing a feature or bugfix | TDD + Implementation | Tests, code, refactor, quality gate |
| Failing behavior or regression | Diagnosing Bugs | Reproduction, hypothesis, fix, regression test |
| Reviewing branch, PR, generated code, or architecture | Two-Axis Review | Findings separated into Spec and Standards |
| Code feels hard to change or test | Improve Architecture | Deepening opportunities and refactor path |
| Converting a rough idea into product scope | To PRD | PRD with goals, non-goals, stories, risks |
| Converting a plan into work items | To Issues | Vertical issues with acceptance criteria |
| Setting up repo safety | Pre-Commit + Git Guardrails | Hooks, checks, protected workflow |
| Continuing work later or handing off to another agent | Handoff | Current state, decisions, next actions, risks |

---

## 2. Python Engineering Standards (Backend)

- **Package & Dependency Manager:** `uv`
- **Metadata & Lockfile:** `pyproject.toml` and `uv.lock`
- **Linter & Formatter:** `ruff`
- **Test Runner:** `pytest`
- **Architecture Structure:**
  ```txt
  backend/src/spaa/
    domain/     # Pure rules, models, invariants, segmentation, cleaner
    services/   # Use cases, queue orchestration, pipeline, sync
    adapters/   # SQLite, repositories, FFmpeg wrapper, filesystem storage
    api/        # FastAPI endpoints, schemas, dependencies
    config.py   # Pydantic Settings
  ```
- **Rules:**
  - `domain` must never import FastAPI, SQLAlchemy, or FFmpeg adapters.
  - Services coordinate use cases and depend on domain + adapter protocols.
  - Adapters translate external data into internal domain types.
  - Tests verify public behaviors, not internal mock calls.

---

## 3. TypeScript Engineering Standards (Frontend & Extension)

- **Runtime & Package Manager:** `Bun`
- **Metadata & Lockfile:** `package.json` and `bun.lock`
- **Linter & Formatter:** `Biome`
- **Type Checker:** `tsc --noEmit`
- **Test Runner:** `bun test`
- **Architecture Structure (Frontend):**
  ```txt
  frontend/src/
    domain/     # Pure types, state machines, validation
    services/   # Storage, audio engine, sync client
    adapters/   # IndexedDB/SQLite, Web Audio, network
    components/ # Reusable UI components (Player, Transport, Drawers)
    features/   # Feature views (Player, Library, AI Workspace, Study)
    styles/     # Vanilla / CSS Modules design system
  ```
- **Rules:**
  - TypeScript strict mode enabled.
  - Discriminated unions for state machines (`idle` | `loading` | `success` | `error`).
  - No `any` at module boundaries.
  - UI components remain thin; domain logic resides in pure modules/services.

---

## 4. Chrome Extension Standards (MV3)

- **Manifest:** Manifest V3 (`service-worker.ts`, `content-script.ts`).
- **DOM Isolation:** All DOM manipulation and AI Studio interactions must reside exclusively in `aistudio-adapter.ts`.
- **Worker Protocol:** Long-polling or HTTP heartbeats for job claims and status reporting to the backend queue.
- **Chrome APIs:** Real download monitoring via `chrome.downloads`.
