# Decision log

Short records of the choices that shape this codebase, written as they are
made. Each entry says what was decided, what else was considered, and what the
decision costs - the cost line matters more than the choice.

---

## D1 - pnpm workspace monorepo

**Decision.** `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared`
(types only).

**Why.** The API and the browser client disagreeing about a response shape is
the most common way a small full-stack project rots. A shared types package
turns that into a compile error on both sides at once. pnpm workspaces are the
cheapest way to get it without a build orchestrator.

**Cost.** Dockerfiles have to build from the repository root and copy the
lockfile, which makes them slightly less obvious than a single-app Dockerfile.

---

## D2 - Postgres + pgvector as the only datastore

**Decision.** One Postgres instance holds both the relational data and the
embeddings.

**Why.** At this scale a dedicated vector database buys nothing and costs an
extra service to run, back up and reason about. pgvector's HNSW index is
comfortably fast for tens of thousands of chunks, and keeping chunk metadata
and vectors in the same row means retrieval filtering ("only this repository")
is a plain `WHERE` clause rather than a second lookup.

**Cost.** This stops being the right answer somewhere past a few million
chunks, or once we want sharding per tenant.

---

## D3 - Local embedding model, not a hosted one

**Decision.** `bge-small-en-v1.5` (384 dimensions) running in-process via
transformers.js on CPU.

**Considered.** Voyage (Anthropic's recommended partner), OpenAI embeddings,
Cohere.

**Why.** Anthropic does not offer an embedding model, so a hosted embedding
model means a _second_ credential a reviewer has to go and obtain before this
project runs at all. Local means: one env var to fill, no network dependency in
tests, deterministic results in CI, and zero embedding cost regardless of how
many repositories get indexed.

**Cost.** A hosted model would almost certainly retrieve better on large or
polyglot repositories. The first request pays a one-off ~130MB model download.
The embedding provider is behind an interface, so swapping is a config change
plus a migration - see D4.

---

## D4 - The vector width is in the schema, on purpose

**Decision.** The `chunks.embedding` column is `vector(384)`, matching the
default model, rather than a dimension-agnostic blob.

**Why.** pgvector indexes require a fixed width. Making the coupling explicit
means changing the embedding model produces a migration you have to think
about, instead of silently producing a corpus with mixed-width vectors.

**Cost.** Changing embedding model is a re-index, not a restart. That is the
honest cost of changing an embedding model anyway.

---

## D5 - Code-aware chunking via tree-sitter, with a fallback that always works

**Decision.** Parse supported languages with tree-sitter and chunk on
function/class/method boundaries. Anything else - config, markdown, YAML, an
unsupported language, or a grammar that fails to load - falls back to
line-window chunking with overlap.

**Languages in v1.** TypeScript/JavaScript (incl. TSX) and Python.

**Why.** Fixed-size chunking cuts functions in half, and half a function
retrieves badly and reads worse when it lands in the prompt. Chunking on symbol
boundaries also gives every chunk a name, which is what makes citations
readable.

**Sizing.** Target <= 1200 characters per chunk. Symbols under ~200 characters
are merged with their neighbours so imports and one-line helpers do not become
their own chunks. Symbols over the target are split into overlapping windows
(~15% overlap) that all keep the parent symbol name.

**Cost.** Each language is a grammar to ship and maintain. Degradation is
graceful but real: a Rust repository gets line-based chunks and worse recall.

**Implementation note.** Grammars run as prebuilt WASM via `web-tree-sitter` +
`tree-sitter-wasms`, not the native Node bindings - this avoids requiring a
C/C++ toolchain on whatever machine runs the API, which matters more for a
reviewer's machine than the marginal speed of a native binding. Every step of
loading a grammar is wrapped and treated as "unavailable" on any failure, so a
grammar that does not resolve degrades to line-based chunking rather than
crashing ingest - `ChunkerService` logs a one-time warning per language when
that happens.

---

## D6 - Retrieval: vector search first, with a cheap lexical boost

**Decision.** Cosine similarity over pgvector, top-K = 8, filtered by
repository id. A small trigram-based lexical score is blended in
(`KEYWORD_BOOST`, default 0.15).

**Why.** Questions about code quote identifiers verbatim - "where is
`validateSession` called?" - and dense embeddings are mediocre at exact token
matching. A full BM25 implementation is more than this needs; a trigram index
on `chunks.content` gets most of the benefit for one index and a few lines of
SQL.

**Cost.** The blend weight is a magic number tuned by hand against the golden
set, not learned. It is one env var, so it is at least easy to challenge.

---

## D7 - Cost posture: cheap by default

**Decision.** top-K 8, a 4000-token context budget, and a Haiku-class model as
the default. All three are env vars.

**Why.** The default configuration should be the one someone can run all day
against their own repositories without thinking about the bill. Embeddings are
free because they are local; the only spend is the answer call, and a
4000-token context keeps it small.

**Cost.** Questions whose answer genuinely spans many files will hit the
retrieval ceiling and get an incomplete answer. Raising `RETRIEVAL_TOP_K` and
`CONTEXT_TOKEN_BUDGET` is the escape hatch, and the trade-off is explicit.

---

## D8 - No job queue in v1

**Decision.** Indexing runs as an in-process background task; status lives in
the `repositories` table and the UI polls it. No BullMQ, no Redis.

**Why.** A queue earns its place when you need retries across process
restarts, multiple workers, or backpressure. With a single API instance and
minutes-long indexing jobs, Redis would be one more container in
`docker compose` to make the architecture diagram look busier.

**Cost.** An API restart mid-index leaves a repository stuck in `INDEXING`.
The mitigation for now is a startup sweep that marks orphaned rows `FAILED` so
they can be retried. This is the first thing I would change for real
multi-user traffic, and it is called out in the README.

---

## D9 - Conversation history: client-supplied, generation-side by default

**Decision.** The client (web UI) resends the last few Q&A turns with every
`/ask` call; the server stays stateless - no `conversations` table, no
session id. Those turns are folded into the LLM prompt in full, so a
follow-up like "and where is that called from?" resolves correctly in the
_answer_. For _retrieval_, only the single previous question - never its
answer - is prepended to the current one before embedding.

**Why split it this way.** The original concern here (see below) was about
retrieval: guessing what a follow-up refers to and embedding the guess is
what silently degrades results and produces confidently wrong answers.
Generation-side history doesn't have that risk - handing the model the prior
Q&A verbatim and asking it to resolve pronouns is exactly the kind of thing
an LLM is good at, and it's what actually fixes the "the assistant forgets
what I just asked" UX complaint. The retrieval-side change is intentionally
the narrow, low-risk version of what was originally ruled out: one prior
question as a lexical nudge, not a rewritten query, not the full thread, and
never the answer text (which is long and would drag the embedding toward
whatever the model said rather than what the user is asking now).

**What this doesn't do.** A multi-turn thread where the third follow-up
depends on resolving something from the first question, not the second, will
still under-retrieve - the nudge only looks one turn back. A real query
rewrite step (a small LLM call that turns "what about the logout flow" into
a standalone "How does the logout flow work in this codebase?" before
embedding) would handle that properly and is still the "what I'd do next"
item; today's version is a heuristic, not that.

**Cost.** Each request now resends up to 4 prior turns (capped to ~600
chars of answer text per turn client-side, 6 turns / 2000+8000 chars
server-side as a hard ceiling via `AskDto`) - more prompt tokens per
question as a chat gets longer, bounded rather than unbounded.

---

## D10 - MCP transport: stdio

**Decision.** When the MCP adapter lands, it speaks stdio.

**Why.** stdio is what Claude Desktop and Claude Code actually consume, so it
is the transport that makes the demo real. HTTP/SSE matters for a hosted
multi-tenant server, which this is not yet.

**Cost.** The MCP server has to run next to the client rather than being a
remote service. Both transports over the same orchestrator is a small change
when it is needed.

**Update.** The transport stayed stdio; where the server gets its data
changed - see D14.

---

## D11 - Test depth: three layers, no live API calls

**Decision.**

1. **Chunker unit tests.** Committed fixture files with asserted chunk
   boundaries and symbol names. Deterministic, fast, and this is where the
   subtle bugs live.
2. **Golden-set retrieval test.** A tiny fixture repository committed to the
   test suite, plus a handful of questions with the file that should answer
   them. Asserts recall@K. Because embeddings are local, this runs in CI with
   no credentials.
3. **One end-to-end happy path** with the LLM provider stubbed.

**Why.** Retrieval quality is the thing that actually breaks in a RAG system,
and it breaks silently. A recall@K assertion over a golden set is the only
test that notices when a chunking change quietly makes retrieval worse.

**Cost.** No test asserts that the _answers_ are good, only that the right
context was retrieved. Judging answer quality needs an eval harness with a
model in the loop, which is out of scope here.

---

## D12 - npm workspaces, not pnpm

**Decision.** Started with pnpm, switched to plain npm workspaces before any
real code landed.

**Why.** pnpm's monorepo ergonomics are nicer on paper, but it immediately hit
a real-world wall: a stale pnpm 8.x binary on the dev machine's `PATH` (from an
earlier global install) hit a known `ERR_INVALID_THIS` bug against the npm
registry, unrelated to this project. npm workspaces do everything this
project needs - shared local packages via `workspaces` in the root
`package.json`, a single lockfile, `--workspace` flags for targeted commands -
with one fewer tool a reviewer has to have installed correctly. There was no
feature this project actually used that pnpm had and npm doesn't.

**Cost.** npm has no built-in parallel dev-server runner, so `npm run dev`
shells out to `concurrently` to run the API and web app together. That is one
extra devDependency in exchange for removing an entire tool from the
prerequisites.

---

## D13 - Skipped the external skill-framework installs

**Decision.** Did not install `mattpocock/skills`, `planetscale/skills`, or the
`code-simplifier`/`superpowers` Claude Code plugins that were on the original
tooling list.

**Why.** Two real obstacles, not just laziness: (1) the specific skill names
in the original plan (`write-a-prd`, `request-refactor-plan`) turned out not
to exist in the actual repo - a mistake in the plan itself, caught by
actually trying to install them rather than assuming; (2) the `claude plugins
install` path (the intended install method) needs the Claude Code CLI, which
was never installed in this environment - this project was built through
Cowork instead. Getting the CLI installed just to try a plugin framework
built around ongoing team workflows (issue triage, ADRs, ticket generation)
was a worse use of a 2-3 day deadline than just continuing to build.

**Cost.** No first-hand data on whether that framework would have helped.
Honest, rather than a checklist of tools installed without evaluation - which
is exactly what the assignment says it wants more than a long tool list.

---

## D14 - The MCP server is a separate process that calls the HTTP API

**Decision.** `apps/mcp` is its own small package: a stdio MCP server whose
tools call the running API over HTTP, rather than a second entry point inside
`apps/api` that boots the Nest application context and calls the
orchestrators in-process (what D10 originally assumed).

**Why.** The in-process version sounds more direct but is worse to actually
use. Claude Code spawns the server on the host, not in Docker, so an
in-process server would need its own `DATABASE_URL`, would download and load
the embedding model a second time, and would need a _different_
`OLLAMA_BASE_URL` from the API container (`localhost` on the host vs.
`ollama` inside the compose network) - three ways to misconfigure it. It
would also share pino's stdout with the MCP protocol stream, which corrupts
the session on the first log line. Over HTTP, the server needs one optional
setting, starts in milliseconds, can't reach the database at all, and every
guardrail (validation, error mapping, scoping) applies to Claude exactly as
it does to the browser, because it is the same endpoints.

**What it added to the API.** One retrieval-only endpoint,
`POST /repositories/:id/search`. When the client is Claude, routing a
question through our own (often small, local) LLM loses information; handing
back the ranked code lets the stronger model do the reasoning. `ask` is still
exposed for a quick grounded answer.

**Cost.** The API has to be running for any tool to work (every tool says so
and how to start it), and each call pays an HTTP hop - negligible next to
embedding and generation time.

---

## D15 - Domain errors instead of HTTP exceptions in services

**Decision.** Services throw classes from `common/errors/domain-errors.ts`
(`RepositoryNotFoundError`, `LlmUnavailableError`, ...) that carry a `kind`
but no status code. `AllExceptionsFilter` maps kinds to HTTP statuses in one
table.

**Why.** Services previously threw Nest's `NotFoundException` and friends,
so the domain knew it was being served over HTTP, and a mistake like reusing
`RepositoryTooLargeError` (413) for a failed clone went unnoticed because the
status was chosen far from where it mattered. With one mapping table, adding
another adapter (a CLI, a queue worker) means mapping kinds once rather than
catching framework exceptions everywhere.

**Cost.** One more small file and one lookup table to keep in sync with the
error classes - enforced by a test that covers every kind.

---

## D16 - Tests at the seams that actually break

**Decision.** On top of D11's three layers: unit tests for every service with
fakes injected at constructor boundaries (the refactor that introduced
`GitClient`, the stores and injectable LLM transports exists largely to make
this possible), HTTP contract tests that boot the real Nest pipeline with
faked orchestrators, Vitest + Testing Library for the web app, and MCP tests
that go through the real protocol in memory and over stdio against the built
binary.

**Why.** Every bug found while writing these sat in an edge case or at a
seam that the original three layers never exercised: a one-line chunk window
that looped forever on minified code, a temp directory leaked when
`git rev-parse` failed after a clone, a polling interval restarted by a new
callback identity on every render, and a question that could be submitted
twice while the first was still pending. The HTTP contract tests in
particular pin every status code and error body without needing Postgres,
so they run everywhere in seconds.

**Cost.** More test code than application code, and fakes that must be kept
honest - they return promises where the real stores do, for example, which
one test initially got wrong. DB-backed e2e tests still need Postgres, so a
laptop without Docker running only gets the fast layers.
