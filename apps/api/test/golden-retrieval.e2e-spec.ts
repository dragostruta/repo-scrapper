import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppConfig } from '../src/config/app-config';
import { AppConfigModule } from '../src/config/config.module';
import { LoggingModule } from '../src/common/logging/logging.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../src/embedding/embedding-provider';
import { FileWalkerService } from '../src/ingest/file-walker.service';
import { OrchestratorModule } from '../src/orchestrator/orchestrator.module';
import { FileIndexerService } from '../src/orchestrator/file-indexer.service';
import { ChunkStore } from '../src/persistence/chunk.store';
import { RepositoryStore } from '../src/persistence/repository.store';
import { RetrievalService } from '../src/retrieval/retrieval.service';

// Needs a real Postgres + pgvector (docker-compose.yml's `db` service). This
// test never calls an LLM, but AppConfig validates the provider settings at
// construction, so it is pinned to the stub rather than whatever .env says.
process.env.LLM_PROVIDER = 'stub';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'golden-repo');
const RECALL_AT = 3;

/**
 * The retrieval quality gate (D11). A tiny fixture repository is indexed
 * through the real production pipeline - walker, chunker, local embeddings,
 * pgvector - and then queried with questions whose answer file is known.
 *
 * Retrieval is the part of a RAG system that degrades silently: nothing
 * crashes, no unit test goes red, the answer just quietly starts citing the
 * wrong file. This is the test that notices.
 *
 * Two deliberate near-miss pairs live in the fixture, because a question set
 * where every answer is lexically obvious measures nothing:
 *   - auth.ts (verifying a person's password) vs webhook-verify.ts
 *     (verifying a machine's HMAC signature)
 *   - http-client.ts (retrying a network request) vs job-queue.py (retrying
 *     a background job)
 */
describe('golden-set retrieval', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let retrieval: RetrievalService;
  let chunkStore: ChunkStore;
  let embeddings: EmbeddingProvider;
  let config: AppConfig;
  let repositoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, LoggingModule, PrismaModule, OrchestratorModule],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    retrieval = moduleRef.get(RetrievalService);
    chunkStore = moduleRef.get(ChunkStore);
    embeddings = moduleRef.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
    config = moduleRef.get(AppConfig);
    const repositories = moduleRef.get(RepositoryStore);

    const repository = await repositories.createGithub({
      url: 'https://example.invalid/golden-repo.git',
      name: 'test/golden-repo',
      revision: `golden-${randomUUID()}`,
    });
    repositoryId = repository.id;

    const files = await moduleRef.get(FileWalkerService).walk(FIXTURE_DIR);
    const fileIndexer = moduleRef.get(FileIndexerService);
    let chunkCount = 0;
    for (const file of files) {
      chunkCount += await fileIndexer.indexFile(repositoryId, file);
    }
    await repositories.markIndexed(repositoryId, { fileCount: files.length, chunkCount });
  }, 120_000);

  afterAll(async () => {
    if (repositoryId) {
      // Cascades to `chunks` (Chunk.repository has onDelete: Cascade).
      await prisma.repository.delete({ where: { id: repositoryId } }).catch(() => undefined);
    }
    await moduleRef.close();
  });

  const GOLDEN_SET: { question: string; expectedFile: string }[] = [
    {
      question: 'How does user login work, and what happens if the password is wrong?',
      expectedFile: 'src/auth.ts',
    },
    {
      question: 'How do we check that an incoming webhook really came from the provider?',
      expectedFile: 'src/webhook-verify.ts',
    },
    { question: 'How do I calculate the area of a circle?', expectedFile: 'src/geometry.py' },
    {
      question: 'Does the HTTP client retry failed network requests?',
      expectedFile: 'src/http-client.ts',
    },
    {
      question: 'What happens to a background job that keeps failing?',
      expectedFile: 'src/job-queue.py',
    },
    {
      question: 'How is request throttling implemented?',
      expectedFile: 'src/rate-limiter.ts',
    },
    {
      question: 'When does a cached entry get evicted?',
      expectedFile: 'src/cache.py',
    },
    {
      question: 'How are fields with commas or quotes escaped when exporting?',
      expectedFile: 'src/csv-export.ts',
    },
    {
      question: 'How does paging through a long list of results work?',
      expectedFile: 'src/pagination.ts',
    },
    {
      question: 'How do we roll a feature out to a percentage of users?',
      expectedFile: 'src/feature-flags.ts',
    },
    {
      question: 'What order should migrations and the new image be deployed in?',
      expectedFile: 'docs/deployment.md',
    },
    {
      question: 'How do worker log lines let us detect a crashed worker?',
      expectedFile: 'src/logging.ts',
    },
    {
      question: 'What prevents a timing attack when checking the webhook signature?',
      expectedFile: 'src/webhook-verify.ts',
    },
    {
      question: 'How is exponential backoff between attempts calculated?',
      expectedFile: 'src/job-queue.py',
    },
  ];

  /** Share of questions whose answer file appears in the top `topK`. */
  async function recall(topK: number, keywordBoost: number): Promise<number> {
    let hits = 0;
    for (const { question, expectedFile } of GOLDEN_SET) {
      const [embedding] = await embeddings.embed([question]);
      const chunks = await chunkStore.search(repositoryId, {
        embedding,
        text: question,
        topK,
        keywordBoost,
      });
      if (chunks.some((chunk) => chunk.filePath === expectedFile)) hits++;
    }
    return hits / GOLDEN_SET.length;
  }

  it.each(GOLDEN_SET)(
    `recall@${RECALL_AT}: retrieves $expectedFile for "$question"`,
    async ({ question, expectedFile }) => {
      const { chunks } = await retrieval.search(repositoryId, question, RECALL_AT);
      expect(chunks.map((c) => c.filePath)).toContain(expectedFile);
    },
    60_000,
  );

  it('holds an aggregate recall floor, so a broad regression fails the build', async () => {
    const { keywordBoost } = config.retrieval;
    const [atOne, atThree] = await Promise.all([
      recall(1, keywordBoost),
      recall(RECALL_AT, keywordBoost),
    ]);

    // Floors, not targets: they exist to catch a change that makes retrieval
    // broadly worse, without going red on one question drifting by a rank.
    expect(atThree).toBeGreaterThanOrEqual(0.85);
    expect(atOne).toBeGreaterThanOrEqual(0.5);
  }, 120_000);

  /**
   * D6 blends a trigram keyword score into the ranking, and the weight
   * (KEYWORD_BOOST) was chosen by hand. This is the measurement that keeps
   * that honest: if the boost ever ranks worse than not having it, the number
   * to change is in the config, not in an argument.
   *
   * It asserts "no worse", not "better", because on a fixture this small the
   * difference is often zero - the useful signal is the printed pair, and a
   * regression if the weight is ever raised to something harmful.
   */
  it('keeps the keyword boost at a weight that does not hurt ranking', async () => {
    const { keywordBoost } = config.retrieval;
    const withoutBoost = await recall(RECALL_AT, 0);
    const withBoost = await recall(RECALL_AT, keywordBoost);

    console.log(
      `recall@${RECALL_AT}: ${withoutBoost.toFixed(3)} without the keyword boost, ` +
        `${withBoost.toFixed(3)} at KEYWORD_BOOST=${keywordBoost}`,
    );

    expect(withBoost).toBeGreaterThanOrEqual(withoutBoost);
  }, 120_000);
});
