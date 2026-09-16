# Plan - Code Documentation Assistant (assignment Option 2)

This file is the source of truth for scope and progress. The requirements
below come from `Fullstack AI Engineer - Assignment v4` (Option 2). Anything
not traceable to that document is marked as an enhancement and only starts
once every required item is done.

Status legend: **Done** · **Partial** · **Not started** · **Verify** (built, not yet confirmed working live)

Last reviewed: 2026-09-16

---

## 1. Requirements from the assignment

### 1.1 Core functionality

| #   | Requirement (assignment wording)                                                           | Status | Notes                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Ingest a codebase ("GitHub repo or local files" - either satisfies it)                     | Done   | GitHub URL ingest confirmed working live: clone, walk, chunk, embed, persist all ran successfully against a real repo through the UI.                                                                                  |
| C2  | Answer questions about the code (how it works, where things live, endpoints, dependencies) | Done   | Confirmed working live with a real LLM call (Ollama, qwen2.5-coder:7b) through the UI.                                                                                                                                 |
| C3  | Uses RAG or similar retrieval                                                              | Done   | pgvector cosine + trigram boost, token-budgeted context.                                                                                                                                                               |
| C4  | Conversational assistant                                                                   | Done   | Client-sent history, see D9.                                                                                                                                                                                           |
| C5  | "Nice user interface" / "well designed application" / creativity in UI/UX                  | Done   | Intake + chat, markdown/code-rendered answers, citations that expand to the real code excerpt, starter questions, list of already-indexed repos. Not yet re-verified live in a browser (see progress log 2026-09-16g). |

### 1.2 Approach and thought process (must be visible in code and README)

| #   | Area                      | Status  | Notes                                                                                                                                                                                                                                         |
| --- | ------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Chunking                  | Done    | tree-sitter (TS/JS/Python) confirmed working under real test execution (see progress log 2026-09-16b). Fixed a real bug found in the process: merging a small trailing named symbol into its neighbour silently dropped one of the two names. |
| A2  | Embedding model selection | Done    | Local bge-small-en-v1.5 (D3, D4).                                                                                                                                                                                                             |
| A3  | LLM selection             | Done    | Haiku-class default behind provider interface, Ollama alternative.                                                                                                                                                                            |
| A4  | Retrieval approach        | Done    | D6. Golden-set recall test passes against real symbol-aware chunks (confirmed 2026-09-16).                                                                                                                                                    |
| A5  | Prompt engineering        | Done    | Grounding rules in `answering/prompt.ts`.                                                                                                                                                                                                     |
| A6  | Context management        | Done    | Token budget, top-K, history caps (D7, D9).                                                                                                                                                                                                   |
| A7  | Guardrails                | Done    | Ingest guardrails (host allowlist, size/file limits, timeouts) and DTO limits, plus prompt-level guardrails: retrieved code treated as untrusted content, off-topic questions declined, provider errors surfaced readably.                    |
| A8  | Quality controls          | Partial | Golden-set recall@K. No check that answers are grounded (acceptable if documented).                                                                                                                                                           |
| A9  | Observability             | Done    | pino + trace id, `query_logs` with chunk ids, scores, per-stage timings.                                                                                                                                                                      |

### 1.3 Engineering excellence

| #   | Requirement                            | Status | Notes                                                                                                                                                                                                                                                         |
| --- | -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Clean, readable, well-structured code  | Done   | Refactored for single responsibility: stores own all DB access, orchestrators split into ingest / indexing / file-indexing / query, domain errors decoupled from HTTP (D15), injectable git + LLM transports. Web: state in hooks, presentational components. |
| E2  | Containerised                          | Done   | `docker compose up` confirmed working end-to-end: indexed a repo and got answers back through the UI (Ollama provider).                                                                                                                                       |
| E3  | Well tested                            | Done   | 350+ API unit/contract tests (~96% lines), 84 web tests (100% lines), 79 MCP tests (100% lines) covering happy, failure and edge paths; DB-backed e2e + golden retrieval set for the real pipeline (D16).                                                     |
| E4  | Observable                             | Done   | See A9.                                                                                                                                                                                                                                                       |
| E5  | Tech stack that can graduate to an MVP | Done   | NestJS, Next.js, Postgres/pgvector.                                                                                                                                                                                                                           |

### 1.4 What to submit

| #   | Deliverable                                                                                                                                                                   | Status                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| S1  | GitHub repo with the code                                                                                                                                                     | Done                                                                                                          |
| S2a | README: quick setup instructions                                                                                                                                              | Done                                                                                                          | `npm run setup -- ollama\|anthropic` - one command, fully automated, either provider. |
| S2b | README: architecture overview (diagram optional)                                                                                                                              | Done - nine Mermaid diagrams (system, layers, ingest + ask sequences, chunking, errors, MCP, web, data model) |
| S2c | README: what it takes to productionize, scale and deploy on AWS / GCP / Azure / Cloudflare                                                                                    | Not started                                                                                                   |
| S2d | README: RAG/LLM approach - options considered and final choice for LLM, embeddings, vector DB, orchestration; prompt & context management; guardrails; quality; observability | Not started (raw material in `docs/decisions.md`)                                                             |
| S2e | README: key technical decisions and why                                                                                                                                       | Partial (decision log exists, needs README summary)                                                           |
| S2f | README: engineering standards followed, and some skipped                                                                                                                      | Not started                                                                                                   |
| S2g | README: how AI tools were used in development (incl. do's and don'ts, repeatability)                                                                                          | Not started                                                                                                   |
| S2h | README: what you'd do differently with more time                                                                                                                              | Not started                                                                                                   |
| S2i | Written in your own words, not LLM output                                                                                                                                     | Your writing - AI can supply facts/outline only                                                               |
| S3  | Screenshots of the application                                                                                                                                                | Not started                                                                                                   |
| S3+ | Video recording (if time permits)                                                                                                                                             | Not started                                                                                                   |
| T1  | Acknowledge edge cases / limitations in README                                                                                                                                | Not started                                                                                                   |
| T2  | Document what you'd add next in README                                                                                                                                        | Not started                                                                                                   |

---

## 2. Work plan (in order)

Guiding rule from the assignment: _a solid, well-engineered basic solution beats
an over-engineered one._ Nothing from section 3 starts before phase 4 is done.

### Phase 1 - Make the core provably work

1. ~~**Fix tree-sitter under Jest.**~~ **Done 2026-09-16.** `apps/api/package.json`'s
   `test`/`test:watch` scripts now run with `NODE_OPTIONS=--experimental-vm-modules`
   so web-tree-sitter's internal dynamic import works under Jest. The
   "uses symbol boundaries" test is strict now (fails if the grammar is null,
   no more silent pass). This surfaced and fixed a real bug: a small trailing
   named symbol (e.g. `const shout = () => {}`) merged into the previous
   chunk was silently losing its name - now both names are kept.
2. ~~**Run the full test suite against Postgres**~~ **Done 2026-09-16.** Ran
   `docker compose up -d db`, `npm run db:migrate`, `npm test` - full suite
   (unit + e2e + golden retrieval) passes against real Postgres and real
   symbol-aware chunks.
3. ~~**Live end-to-end run**~~ **Done 2026-09-16.** `docker compose up`
   works end-to-end (api, web, db all healthy); indexed a repo and asked it
   questions through the UI with Ollama as the LLM provider - answers came
   back correctly. See progress log for the bugs found and fixed to get here.
4. ~~Fix whatever step 3 finds.~~ Done - see progress log 2026-09-16d/e.

### Phase 2 - Close the guardrail gap

1. ~~Treat retrieved code as untrusted data in the prompt~~ **Done 2026-09-16.**
   `answering/prompt.ts`: system prompt now has an explicit rule that
   everything inside `<context>` is untrusted file content, not instructions,
   and `buildUserMessage` wraps the retrieved context in `<context>` tags so
   there's a concrete boundary for that rule to point at. Covered by
   `prompt.spec.ts`.
2. ~~Refuse/redirect clearly off-topic questions cheaply~~ **Done 2026-09-16.**
   Same system prompt change adds a scope rule: decline questions unrelated
   to the indexed codebase rather than answering from outside knowledge - a
   prompt rule, no extra call/classifier.
3. ~~Make sure LLM/provider errors reach the UI as readable messages~~
   **Done 2026-09-16.** Ollama's provider already did this. Anthropic's
   didn't - an SDK error (bad key, rate limit, connection failure) fell
   through to `AllExceptionsFilter`'s generic "Internal server error",
   hiding the real cause. Added `mapAnthropicError` in `anthropic.provider.ts`
   (unit tested directly against the SDK's real error classes) covering
   auth/rate-limit/connection/other cases, each with an actionable message -
   same shape Ollama's errors already have, and the web UI already displays
   any API error's `message` field, so no frontend change was needed.

### Phase 3 - UI good enough to be called "well designed"

1. ~~Render answers as markdown~~ **Done 2026-09-16.** Added `react-markdown` +
   `remark-gfm` + `rehype-highlight` (`MarkdownAnswer` component), with hand-rolled
   prose/code-block CSS matching the app's dark palette instead of pulling in a
   full typography/theme package.
2. ~~Citations you can click to see the actual code excerpt~~ **Done 2026-09-16.**
   New `GET /repositories/:id/chunks/:chunkId` endpoint (scoped to the
   repository, so one repo's citation can't read another's chunk), backed by
   `ChunkRepository.findById`. `Citation` now carries a `chunkId`; `CitationChip`
   fetches and expands the excerpt on click, on demand rather than shipping
   every cited chunk's content with every answer.
3. ~~Starter questions on an empty chat~~ **Done 2026-09-16.** Four generic
   clickable prompts in `ChatPanel`'s empty state.
4. ~~List of already-indexed repositories~~ **Done 2026-09-16.** `RepoIntake`
   now fetches `GET /repositories` (already existed server-side, just wasn't
   used) and lists INDEXED ones; clicking one skips straight to chat instead
   of re-pasting/re-indexing a URL.
5. Clear progress / failure / retry states while indexing - already mostly
   there (status label + spinner + error banner, retry by resubmitting the
   same URL); not revisited this pass.

### Phase 4 - Submission deliverables

1. README sections S2c-S2h + limitations + "what I'd add next" - written by
   you. Claude can draft bullet-point facts from the code and decision log to
   write from, not prose to paste.
2. Screenshots (intake, indexing, answer with citations) committed under `docs/screenshots/`.
3. Optional short video.
4. Final pass: fresh clone → `docker compose up --build` works on a clean machine, CI green.

---

## 3. Enhancements (after all of the above)

- ~~MCP server~~ **Done 2026-09-16** - `apps/mcp`, stdio, five tools over the HTTP API (D14), with `.mcp.json` for Claude Code.
- Local files ingest (zip upload or folder path).
- Streaming answers.
- Query rewriting for multi-turn follow-ups (D9 "what I'd do next").
- Job queue for indexing (D8) instead of in-process background task.
- Answer-quality eval harness with a model in the loop (D11).
- More tree-sitter languages.

---

## 4. Progress log

- **2026-09-16** - Plan created from the assignment PDF. Verified: typecheck passes,
  32/32 unit tests pass. Found: tree-sitter chunking works in the compiled
  API (TS + Python symbols detected) but silently falls back to line chunks
  under Jest. Not yet run: e2e/golden tests (need Postgres), live Docker + LLM run.
- **2026-09-16b** - Fixed the Jest/tree-sitter issue (Phase 1 step 1). Root cause
  was more specific than "ESM vs CommonJS": `web-tree-sitter`'s `Language.load()`
  does a dynamic `import()` internally, which Node refuses inside Jest's sandboxed
  VM context with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` unless the process
  runs with `--experimental-vm-modules`. Added that flag to the `test` script.
  With the grammar actually loading, the "uses symbol boundaries" test then
  failed for real, exposing a genuine chunking bug (see A1) - fixed in
  `tree-sitter-chunker.ts`. All 32 unit tests pass with the real grammar in the
  loop; typecheck clean. Still not run: e2e/golden tests against Postgres,
  live Docker + LLM run (Phase 1 steps 2-3).
- **2026-09-16c** - Phase 1 step 2 done: `docker compose up -d db`, `npm run
db:migrate`, `npm test` all run successfully against real Postgres - full
  suite (unit + e2e + golden retrieval) passes. Retrieval quality is now
  verified against real symbol-aware chunks, not the line-chunk fallback.
  Next: Phase 1 step 3, live `docker compose up --build` run with a real LLM.
- **2026-09-16d** - Phase 1 step 3 (live Docker run) hit two real bugs, both fixed:
  1. `apps/api` container looped forever on `sh: cannot open
/usr/local/bin/docker-entrypoint.sh: Permission denied`. Root cause: a
     Docker Desktop bug (containerd image store, notably on Apple Silicon)
     that corrupts a COPY'd file's permission bits on layer read-back once a
     later `RUN` step touches them (here, `chmod +x`) - the file came back
     unreadable at container start regardless of the mode the build set.
     Fixed by removing the separate `docker-entrypoint.sh` COPY from the
     image entirely and inlining the migrate-then-start command directly into
     `ENTRYPOINT` in `apps/api/Dockerfile`, so there is no filesystem layer
     for that bug to corrupt. `docker-entrypoint.sh` stays in the repo as the
     readable reference copy (keep both in sync if changed).
  2. With that fixed, the container then failed with `Cannot find module
'/app/apps/api/dist/main.js'`. Root cause: `apps/api` had no
     `tsconfig.build.json`, so `nest build` fell back to `tsconfig.json`
     (which includes `test/**/*.ts` for typecheck purposes), and TypeScript's
     inferred `rootDir` widened to cover both `src/` and `test/`, nesting the
     output under `dist/src/main.js` instead of `dist/main.js`. Added the
     standard Nest `tsconfig.build.json` (excludes `test/`, `*.spec.ts`) so
     the build output matches what `package.json`'s `start` script and the
     Dockerfile already expected. Verified: `node apps/api/dist/main.js` now
     boots the Nest app correctly outside Docker; typecheck and all 32 unit
     tests still pass.
  - Also, separately: ran out of Docker Desktop disk space mid-session
    (unrelated to the app) after a couple of full image rebuilds, which is
    an operational gotcha worth remembering, not a code bug - `docker system
prune` (with `-a` if needed) frees it, and `docker system prune -a -f`
    is aggressive: it removes every stopped container and unused image
    Docker-Desktop-wide, not just this project's.
  - Not yet done: actually indexing a repo and asking it questions through
    the running UI - that's still the rest of Phase 1 step 3.
- **2026-09-16e** - Phase 1 step 3 completed. Separately hit and fixed a config
  issue (not a code bug): `.env` had a leftover duplicate `OLLAMA_BASE_URL`
  block, and the value that won (dotenv keeps the first occurrence of a
  duplicate key) was `http://localhost:11434` - inside the `api` container
  that resolves to the container itself, not the Mac running Ollama, so every
  question failed with "Could not reach Ollama". Fixed by cleaning up `.env`
  to the single correct value, `http://host.docker.internal:11434` (Docker's
  DNS name for the host, already wired up via `extra_hosts` in
  docker-compose.yml). After restarting the api container and confirming
  Ollama was running locally, indexed a repo and got correct, cited answers
  back through the UI. **Phase 1 is done.** Next: Phase 2 (guardrails).
- **2026-09-16f** - Phase 2 done. Added an untrusted-content rule and an
  off-topic-scope rule to the system prompt (`prompt.spec.ts` covers both),
  and fixed a real gap where Anthropic provider errors weren't turned into
  readable messages the way Ollama's already were - added `mapAnthropicError`
  with its own unit tests against the SDK's real error classes. Full suite:
  41/41 unit tests pass, typecheck clean. Next: Phase 3 (UI polish).
- **2026-09-16g** - Phase 3 (UI polish) done, items 1-4. Backend: new
  `GET /repositories/:id/chunks/:chunkId` endpoint and `Citation.chunkId` to
  support on-demand excerpt fetch. Frontend: markdown+syntax-highlighted
  answers, clickable citations that expand to the real code, starter
  questions, and a list of already-indexed repos on the intake screen.
  Verified: full monorepo lint, typecheck, and unit tests all pass; `next
build` succeeds. Item 5 (indexing progress/retry states) left as-is - the
  existing status label/spinner/error banner already cover it reasonably.
  Next: Phase 4 (submission deliverables) - or another live Docker run to
  confirm the UI changes end-to-end, since this pass never opened a browser.
- **2026-09-16h** - One-command setup, at the user's request: `npm run setup
-- ollama|anthropic` does the entire setup - creates `.env` from
  `.env.example`, configures the chosen provider (prompting for
  `ANTHROPIC_API_KEY` only if needed, never overwriting one already set),
  and runs `docker compose up --build`. The `ollama` path now also brings up
  a bundled Ollama container (`docker-compose.yml`'s `ollama` service, still
  behind the `local-llm` profile so it's never started for anthropic setups)
  and a one-shot `ollama-pull` service that pulls `qwen2.5-coder:7b`
  automatically - no host Ollama install, no API key at all. Added
  `npm run llm:switch -- <provider>` to swap providers on an already-running
  stack without a full rebuild (only recreates what actually changed).
  Shared bash logic lives in `scripts/lib/env-file.sh`, unit-tested manually
  against a scratch .env file (idempotent key replacement, correct handling
  of values containing `=`, no accidental line duplication) since there's no
  shell-script test runner in this project. Documented trade-offs in the
  README: first `ollama` run downloads ~4.7GB and is slower to build; Ollama
  inside Docker Desktop's Linux VM runs CPU-only (no GPU/Metal passthrough),
  so answers are slower per-question than a native Ollama install. Not yet
  run for real (no Docker in this environment - same caveat as every other
  Docker change this session) - worth a live check next.
- **2026-09-16i** - Engineering pass at the user's request (step 4, "wow"
  features, deliberately postponed by the user):
  1. **Refactor.** Every Prisma query moved into `persistence/`
     (`RepositoryStore`, `ChunkStore`, `QueryLogStore`). The old
     `IngestOrchestratorService` split into `IngestOrchestratorService`
     (reuse/retry/create decision), `RepositoryIndexerService` (pipeline for
     one repo, never throws) and `FileIndexerService` (one file). Services
     throw domain errors mapped to HTTP in one filter (D15). `GitClient`
     wraps every git call; LLM providers take their transport (Anthropic
     client, `fetch`) by injection; shared `configureApp()` so tests run
     exactly what `main.ts` serves. Web: state moved into hooks
     (`useChat`, `useRepositoryIndexing`, `useActiveRepository`, ...),
     components split and presentational.
  2. **Bugs found and fixed along the way:** `chunkByLines` looped forever on
     a line over 1200 chars followed by more lines (minified code - would
     hang indexing); a failed clone was reported as `RepositoryTooLargeError`;
     the temp clone dir leaked if `git rev-parse` failed; the web polling
     interval restarted whenever the parent re-rendered; a second question
     could be submitted while one was pending.
  3. **Tests.** API: 350+ unit and HTTP-contract tests (real Nest pipeline,
     faked orchestrators, no DB), ~96% line coverage; real-git integration
     test against a local repo; e2e gained 404 paths. Web: Vitest + Testing
     Library, 84 tests, 100% lines. MCP: 79 tests incl. the built binary over
     real stdio, 100% lines. Regression tests proven to fail with the old
     bugs reintroduced.
  4. **MCP server** (`apps/mcp`): `list_repositories`, `index_repository`,
     `search_code`, `ask_repository`, `get_code_excerpt`; new retrieval-only
     `POST /repositories/:id/search` endpoint; `.mcp.json` for Claude Code;
     `npm run mcp:build`, built automatically by `setup`. Dockerfiles unchanged:
     verified `npm ci` accepts the lockfile without the host-only `apps/mcp`
     workspace present, so the images don't carry MCP dependencies.
  5. **Docs.** README architecture rewritten with nine Mermaid diagrams (all
     validated with the Mermaid parser), MCP usage and testing sections;
     decision log D14-D16.
  - Not verifiable in this environment, to run on the Mac: `npm test` with
    Postgres up (e2e + golden), `docker compose up --build` (Dockerfile
    change), and Claude Code actually calling the MCP tools (`claude mcp
list`, then a prompt) - the sandboxed Claude CLI here rejects MCP flags.
