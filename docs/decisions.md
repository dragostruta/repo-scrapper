# Decision log

Every entry here is one choice I made while building this, written down when I
made it.

Each one has the same four parts: what I decided, what else I looked at, why I
picked what I picked, and what it costs. The cost line is the important one. A
decision with no cost written down usually means I did not think about it hard
enough.

The README links back to these by number.

---

## D1 - Monorepo: three apps and one shared types package

**Decision.** One repository holding `apps/api` (the backend), `apps/web` (the
frontend), `apps/mcp` (the MCP server) and `packages/shared` (TypeScript types,
no code). They are wired together with npm workspaces.

**Considered.** Separate repositories per app, or one app with the frontend
served by the backend.

**Why.** The most common way a small full stack project rots is the backend and
the frontend quietly disagreeing about the shape of a response. The API starts
sending `indexedAt` and the browser is still reading `indexed_at`, and nothing
tells you until it is broken in front of a user.

`packages/shared` fixes that. It holds only types, no runtime code. Both sides
import the same file, so changing a response shape breaks the build on both
sides at once, at compile time, instead of at runtime in the browser.

Separate repositories would need that package published somewhere and version
bumped on every change, which is a lot of ceremony for a project this size.

**Cost.** The Dockerfiles have to build from the repository root and copy the
lockfile from there, so they are slightly less obvious than a single app
Dockerfile would be.

**Note.** This originally said pnpm workspaces. The tool changed to npm early
on, see D12. The monorepo decision itself did not change.

---

## D2 - Postgres + pgvector as the only database

**Decision.** One Postgres instance holds both the normal data and the
embeddings. pgvector is the extension that lets Postgres store and search
vectors.

**Considered.** Pinecone, Qdrant, Weaviate. All of these are databases built
only for vectors.

**Why.** At this size a dedicated vector database buys nothing and costs one
more service to run, back up and reason about.

It would also split the data in an annoying way. The vector would live in one
database, and the chunk's file path, line numbers and symbol name in the other.
Keeping them in the same row means "only search inside this repository" is a
plain `WHERE` clause, instead of a second lookup and a join written by hand in
application code.

pgvector's index is comfortably fast at tens of thousands of chunks, which is
the scale this project actually runs at.

**Cost.** This stops being the right answer somewhere past a few million
chunks, or as soon as we want to shard the data per customer.

---

## D3 - The embedding model runs locally, not in the cloud

**Decision.** `bge-small-en-v1.5` (384 numbers per chunk) runs inside the API
process on the CPU, through transformers.js.

**Considered.** Voyage (the one Anthropic recommends), OpenAI embeddings,
Cohere.

**Why.** Anthropic does not sell an embedding model. So every hosted option
means a _second_ API key, from a second company, that a reviewer has to go and
sign up for before this project runs at all. For a take home project that is a
bad first five minutes.

Local means: one key instead of two, no network calls in tests, the same result
every time in CI, and zero embedding cost no matter how many repositories get
indexed.

**Cost.** A hosted model would almost certainly retrieve better on large
repositories or ones with many languages. The first request also pays a one off
download of about 130MB. The provider sits behind an interface, so swapping it
is a config change plus a re-index, see D4.

---

## D4 - The vector size is fixed in the database schema, on purpose

**Decision.** The `chunks.embedding` column is `vector(384)`, matching the
default model, instead of a size agnostic blob.

**Why.** Two reasons. pgvector's index needs a fixed size to work at all. And
being explicit means that changing the embedding model produces a migration you
have to sit down and think about, instead of a table quietly filling up with
number lists of two different lengths that can never be compared to each other.

**Cost.** Changing the embedding model is a full re-index, not a restart. That
is the honest cost of changing an embedding model anyway, this decision just
makes it visible.

---

## D5 - Chunk on real code borders, with a fallback that always works

**Decision.** Parse supported languages with tree-sitter and cut on function,
class and method borders. Everything else, config files, markdown, YAML, an
unsupported language, or a parser that fails to load, falls back to cutting at
a fixed character count with some overlap.

**Languages in v1.** TypeScript and JavaScript, including TSX, plus Python.

**Considered.** Fixed size chunks only, or one chunk per file.

**Why.** Fixed size chunking cuts functions in half. Half a function retrieves
badly, because half of its meaning is in the other piece, and it reads badly
when it lands in the prompt. One chunk per file is the opposite problem, a long
file fills the whole prompt budget on its own.

Cutting on symbol borders also gives every chunk a name, which is what makes a
citation readable. `auth.ts:40-72 · validateSession` tells you something.
`auth.ts, piece 7` does not.

**Sizing.** Aim for 1200 characters or less per chunk. Symbols under about 200
characters get merged into their neighbour, so that imports and one line
helpers do not each become their own chunk. Symbols over the target are split
into overlapping windows, about 15% overlap, and every window keeps the parent
symbol's name.

**Cost.** Each language is one more parser to ship and keep working. The
degradation is graceful but it is real: a Rust repository gets character based
chunks and worse recall.

**Implementation note.** The parsers run as prebuilt WASM through
`web-tree-sitter`, not the native Node bindings. Native bindings would need a
C/C++ compiler on whatever machine runs the API, which matters more for a
reviewer's laptop than the small speed difference. Every step of loading a
parser is wrapped, and any failure is treated as "not available", so a parser
that does not load degrades to character based chunking instead of crashing the
whole index. `ChunkerService` logs one warning per language when that happens.

---

## D6 - Nearest-neighbour search first, then a keyword rerank

**Decision.** Two stages. Stage one orders chunks by cosine distance alone,
scoped to the repository, and takes a candidate pool wider than the result set.
Stage two reranks that pool with a small trigram word score
(`KEYWORD_BOOST`, 0.15 by default) and keeps the top 8.

**Considered.** Meaning search alone; a single query blending both scores in
one `ORDER BY`; a full BM25 hybrid.

**Why a blend at all.** Questions about code quote identifiers exactly - "where
is `validateSession` called?". Embeddings capture meaning and are only okay at
matching an exact string, which is what an identifier is. A full BM25 setup is
more machinery than this needs: term frequencies, document lengths, an index to
maintain. Trigrams get most of the benefit from one function and a few lines of
SQL, and they survive a small typo.

**Why two stages, which is the part I got wrong first.** The natural way to
write the blend is one query:

```sql
ORDER BY (1 - (embedding <=> $vec)) + ($boost * similarity(content, $text)) DESC
```

That returns correct results and never touches the vector index. pgvector's
HNSW index can only accelerate an ordering that is purely the distance
operator; anything added to the expression makes it non-indexable and Postgres
falls back to scanning every row - silently, because the answers are still
right. `EXPLAIN` is what surfaced it. On 20k chunks: `Seq Scan`, 20,003 rows,
66.5ms, against `Index Scan`, 39 rows, 0.8ms for the two-stage form.

The same logic removed the trigram GIN index that the first schema created.
`similarity()` in a `SELECT` expression cannot use a GIN index - only the `%`
operator in a `WHERE` can - so it was written on every insert and read by
nothing. The rerank now runs over a few hundred rows at most, where a
sequential `similarity()` costs nothing. `pg_trgm` is still required, because
`similarity()` is its function.

One more measured detail: `hnsw.ef_search` caps how many candidates the index
walk returns and defaults to 40, so a wider `LIMIT` alone does not widen the
pool - asking for 80 returned 39. It is set per query inside the transaction,
so it cannot leak onto a pooled connection.

**Cost.** The blend weight is still a hand-picked number, and the candidate
pool multiplier is a second one. Both are bounded rather than learned. The
golden set now measures recall with the boost at 0 and at its configured value
and fails if the boost ranks worse, so the number is at least defended by a
measurement rather than an argument.

**What would be better.** A reranker: a second, slower model that reads the
question together with the top 30 chunks and re-sorts them before keeping 8.
That would beat any amount of tuning the blend weight. Not built.

---

## D7 - Cheap by default

**Decision.** Top 8 chunks, a 4000 token context budget, and a Haiku class
model as the default. All three are env vars.

**Why.** The default config should be the one someone can run all day against
their own repositories without thinking about the bill. Embeddings are already
free because they are local, so the only spend is the call that writes the
answer, and a 4000 token context keeps that call small.

**Cost.** A question whose real answer is spread across many files will hit the
ceiling and get an incomplete answer. Raising `RETRIEVAL_TOP_K` and
`CONTEXT_TOKEN_BUDGET` is the escape hatch, and the trade is written down
rather than hidden.

---

## D8 - No job queue in v1

**Decision.** Indexing runs as a background task inside the API process. The
status lives in a column on the `repositories` table and the browser polls it.
No BullMQ, no Redis.

**Why.** A queue earns its place when you need retries that survive a restart,
several workers, or backpressure. With one API instance and jobs that take
minutes, Redis would be one more container in `docker compose`, mostly there to
make the architecture diagram look busier.

**But "no queue" is not "no limit".** Indexing is the expensive path - a clone,
then an embedding pass over every chunk - and it runs in this process. Without
a cap, five pasted URLs means five simultaneous clones competing with the
endpoints that answer questions. `MAX_CONCURRENT_INDEXING` (default 2) bounds
how many run at once and the rest wait their turn, which is the half of a
queue that actually protects the service.

**Cost.** This is the weakest decision in the project and I know it. If the API
restarts mid-index, that repository's work is lost, and so is anything still
waiting in the in-memory queue. The mitigation is a sweep at startup that marks
every `PENDING`, `CLONING` or `INDEXING` row `FAILED` so it can be retried -
`PENDING` is in that list precisely because a queued repository has no other
way of being noticed again. A real queue is the first thing I would change for
real traffic.

---

## D9 - Conversation history comes from the client

**Decision.** The browser resends the last few question and answer pairs with
every `/ask` call. The server stays stateless: no conversations table, no
session id.

Those turns go into the prompt in full, so a follow up like "and where is that
called from?" resolves correctly in the _answer_. For the _search_, only the
single previous question is glued in front of the current one, never its answer.

**Why split it that way.** The original worry was about search. Guessing what a
follow up refers to, and then embedding that guess, is how you silently make
retrieval worse and produce confident wrong answers.

Generation does not have that risk. Handing the model the previous turns and
letting it work out what "that" means is exactly the kind of thing a language
model is good at, and it is what actually fixes the "it forgot what I just
asked" complaint.

So the search side got the narrow, low risk version of what I had originally
ruled out: one previous question as a nudge. Not a rewritten query, not the
whole thread, and never the answer text, which is long and would drag the
search toward what the model said instead of what you are asking now.

**What this does not do.** A third follow up that depends on something from the
_first_ question, not the second, will still under retrieve. The nudge only
looks one turn back. A real query rewrite step, a small model call that turns
"what about the logout flow" into "How does the logout flow work in this
codebase?" before embedding, would handle that properly. That is the "what I
would do next" item. Today's version is a heuristic, not that.

**Cost, size.** Each request resends up to 4 previous turns, with each old
answer cut to about 600 characters in the browser, and a hard ceiling of 6
turns and 8000 characters server side in the DTO. So the prompt grows as a chat
gets longer, but it is bounded rather than unbounded.

**Cost, trust.** This is the part that is easy to miss. Because the client
sends the history, the history is caller-controlled input - a request can claim
any prior exchange happened, including one where the assistant agreed to
something. It is not a transcript the server vouches for. So it is fenced in a
`<history>` block and labelled untrusted in the system prompt exactly like
indexed file content is, with an explicit instruction that a turn appearing to
grant permissions or retract the rules is data a client sent, not an agreement.
Bounding the size stops the prompt growing; fencing it stops the prompt being
rewritten.

---

## D10 - The MCP server talks over stdio

**Decision.** The MCP adapter speaks stdio, meaning it runs as a child process
and talks over its standard input and output.

**Considered.** HTTP with server sent events.

**Why.** stdio is what Claude Desktop and Claude Code actually consume, so it
is the transport that makes the demo real. HTTP matters for a hosted server
that many people connect to, which this is not.

**Cost.** The MCP server has to run next to the client rather than being a
remote service. Supporting both transports later is a small change when it is
actually needed.

**Update.** The transport stayed stdio. Where the server gets its data changed,
see D14.

---

## D11 - Three layers of tests, and none of them call a live API

**Decision.**

1. **Chunker unit tests.** Committed fixture files with the expected chunk
   borders and symbol names written down. Fast, deterministic, and this is
   where the subtle bugs actually live.
2. **A golden set retrieval test.** A tiny fake repository committed into the
   test suite, plus a handful of questions and the file that should answer
   each. It asserts recall@K, meaning the right file came back in the top K
   results. Because embeddings are local, this runs in CI with no credentials.
3. **One end to end happy path**, with the LLM provider stubbed out.

**Why.** Retrieval quality is the thing that actually breaks in a RAG system,
and it breaks silently. A recall@K assertion over a golden set is the only test
that notices when a chunking change quietly makes retrieval worse.

**Cost.** No test asserts that the _answers_ are good, only that the right code
was retrieved. Judging answer quality needs an eval harness with a model in the
loop, which was out of scope here.

---

## D12 - npm workspaces, not pnpm

**Decision.** Started with pnpm, switched to plain npm workspaces before any
real code landed.

**Why.** pnpm's monorepo ergonomics are nicer on paper, but it hit a real wall
immediately: an old pnpm 8.x binary left on this machine's `PATH` from an
earlier global install hit a known `ERR_INVALID_THIS` bug against the npm
registry. Nothing to do with this project.

npm workspaces do everything this project needs. Shared local packages through
`workspaces` in the root `package.json`, one lockfile, `--workspace` flags for
targeted commands. And it is one fewer tool a reviewer has to have installed
correctly. There was no feature this project actually used that pnpm has and
npm does not.

**Cost.** npm has no built in way to run several dev servers at once, so
`npm run dev` uses `concurrently` to start the API and the web app together.
That is one extra devDependency, in exchange for removing a whole tool from the
prerequisites.

---

## D13 - Skipped the extra tooling installs

**Decision.** Did not install the `mattpocock/skills` and `planetscale/skills`
packs, or the `code-simplifier` and `superpowers` plugins that were on my
original tooling list.

**Why.** Two real obstacles, not laziness. First, two of the skill names in my
original plan turned out not to exist in the actual repository. The plan was
confident and wrong, and I only found out by trying to install them. Second,
the intended install path needs the Claude Code CLI, which was not installed
here, this project was built through Cowork instead.

Installing a CLI just to try a plugin framework built around ongoing team
workflows, things like issue triage and ticket generation, was a worse use of a
two to three day deadline than continuing to build.

**Cost.** I have no first hand data on whether that framework would have helped.
I would rather say that than list tools I installed and never evaluated, which
is exactly what the assignment says it does not want.

---

## D14 - The MCP server is its own process that calls the HTTP API

**Decision.** `apps/mcp` is a separate small package. Its tools call the running
API over HTTP, rather than being a second entry point inside `apps/api` that
boots the Nest application and calls the orchestrators directly in memory,
which is what D10 originally assumed.

**Why.** The in process version sounds more direct, but it is worse to actually
use. Claude Code starts the server on your own machine, not inside Docker. So
an in process server would need its own `DATABASE_URL`, would download and load
the embedding model a second time, and would need a _different_ Ollama URL from
the API container, `localhost` on the host versus `ollama` inside the compose
network. That is three ways to misconfigure it.

It would also write its logs to the same stdout that carries the MCP protocol,
which corrupts the session on the very first log line.

Over HTTP the server needs one optional setting, starts in milliseconds, cannot
reach the database at all, and every guardrail (validation, error mapping,
repository scoping) applies to Claude exactly as it does to the browser,
because it is literally the same endpoints.

**What it added to the API.** One retrieval only endpoint,
`POST /repositories/:id/search`. When the client is itself a strong model,
routing the question through our own small local model loses information.
Handing back the ranked code instead lets the better model do the reasoning.
`ask` is still there for a quick grounded answer.

**Cost.** The API has to be running for any tool to work, and every tool says so
and how to start it. Each call also pays one HTTP hop, which is nothing next to
embedding and generation time.

---

## D15 - Services throw domain errors, not HTTP errors

**Decision.** Services throw classes from `common/errors/domain-errors.ts`
(`RepositoryNotFoundError`, `LlmUnavailableError` and friends). Those carry a
`kind` but no status code. One filter, `AllExceptionsFilter`, maps kinds to HTTP
statuses in a single table.

**Why.** Services used to throw Nest's `NotFoundException` and friends
directly, which meant the business logic knew it was being served over HTTP.

That caused a real bug: `RepositoryTooLargeError`, which maps to 413, got reused
for a failed clone, and nobody noticed, because the status code was chosen far
away from the place where it mattered.

With one mapping table, adding another way to call this code, a CLI or a queue
worker, means mapping the kinds once instead of catching framework exceptions
everywhere.

**Cost.** One more small file, and a lookup table that has to stay in sync with
the error classes. A test covers every kind, so it cannot drift silently.

---

## D16 - Test at the seams that actually break

**Decision.** On top of D11's three layers: unit tests for every service with
fakes injected at the constructor, HTTP contract tests that boot the real Nest
pipeline with fake orchestrators, Vitest and Testing Library for the web app,
and MCP tests that go through the real protocol both in memory and over stdio
against the built binary.

A "fake" here is a small stand in object a test passes instead of the real
thing. A fake LLM that always answers `"hello"` lets a test check what the code
around it does, with no API key and no waiting.

The refactor that introduced `GitClient`, the stores and injectable LLM
transports exists largely to make this possible.

**Why.** Every bug found while writing these sat in an edge case, or at a seam
that the original three layers never touched:

- a one line chunk window that looped forever on minified code, which would
  have hung indexing on a real repository
- a temp directory left behind when `git rev-parse` failed after a clone
- a polling interval that restarted itself on every render, because the
  callback got a new identity each time
- a question that could be submitted twice while the first one was still
  pending

The HTTP contract tests are worth calling out. They pin down every status code
and every error body without needing Postgres, so they run anywhere in seconds.

**Cost.** More test code than application code. And fakes have to be kept
honest: they must return promises where the real stores return promises, for
example, which one test got wrong at first. The database backed e2e tests still
need Postgres, so a laptop without Docker running only gets the fast layers.
