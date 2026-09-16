/**
 * Types shared between the API and the web client.
 *
 * This package deliberately contains no runtime logic - it is the contract
 * between the two apps, so that a change to a response shape breaks the build
 * on both sides at once instead of at runtime in the browser.
 */

export type RepositoryStatus = 'PENDING' | 'CLONING' | 'INDEXING' | 'INDEXED' | 'FAILED';

export type RepositorySource = 'GITHUB' | 'UPLOAD';

export interface RepositorySummary {
  id: string;
  source: RepositorySource;
  /** Canonical https URL for GITHUB sources, null for uploads. */
  url: string | null;
  /** owner/name for GitHub, or the uploaded archive name. */
  name: string;
  /** Full commit sha for GitHub sources (the UI truncates it for display), content hash for uploads. */
  revision: string;
  status: RepositoryStatus;
  /** Human-readable failure reason, only set when status is FAILED. */
  error: string | null;
  fileCount: number;
  chunkCount: number;
  /** Set once indexing has finished. */
  indexedAt: string | null;
  createdAt: string;
}

export interface Citation {
  /** The chunk this citation came from - fetch its content via
   * GET /repositories/:id/chunks/:chunkId. */
  chunkId: string;
  /** Path relative to the repository root, e.g. "src/auth/guard.ts". */
  path: string;
  startLine: number;
  endLine: number;
  /** Enclosing function/class name when the chunker could determine one. */
  symbol: string | null;
  language: string;
  /** Cosine similarity in [0, 1] after any lexical boost. */
  score: number;
}

/** The actual code behind a citation, fetched on demand rather than sent
 * with every answer (keeps AskResponse small when an answer cites many
 * chunks the user never expands). */
export interface ChunkExcerpt {
  path: string;
  startLine: number;
  endLine: number;
  symbol: string | null;
  language: string;
  content: string;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  /** Per-stage milliseconds - surfaced in the UI and logged. */
  timings: {
    embedQuestion: number;
    retrieve: number;
    generate: number;
    total: number;
  };
  /** Correlates this answer with the structured logs on the server. */
  traceId: string;
}

export interface ConversationTurn {
  question: string;
  answer: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
