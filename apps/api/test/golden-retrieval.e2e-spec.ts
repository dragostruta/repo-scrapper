import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../src/config/config.module';
import { LoggingModule } from '../src/common/logging/logging.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FileWalkerService } from '../src/ingest/file-walker.service';
import { OrchestratorModule } from '../src/orchestrator/orchestrator.module';
import { FileIndexerService } from '../src/orchestrator/file-indexer.service';
import { RepositoryStore } from '../src/persistence/repository.store';
import { RetrievalService } from '../src/retrieval/retrieval.service';

// Needs a real Postgres + pgvector (docker-compose.yml's `db` service). This
// test never calls an LLM, but AppConfig validates the provider settings at
// construction, so it is pinned to the stub rather than whatever .env says.
process.env.LLM_PROVIDER = 'stub';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'golden-repo');
const RECALL_AT = 2;

/**
 * D11's golden-set retrieval test: index a tiny fixture repository through
 * the real production pipeline (walker -> FileIndexerService -> pgvector,
 * with local embeddings), then assert recall@2 for questions with a known
 * answer file. This is the test that notices when a chunking or retrieval
 * change quietly makes search worse.
 */
describe('golden-set retrieval', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let retrieval: RetrievalService;
  let repositoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, LoggingModule, PrismaModule, OrchestratorModule],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    retrieval = moduleRef.get(RetrievalService);
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
  });

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
    { question: 'How do I calculate the area of a circle?', expectedFile: 'src/geometry.py' },
    { question: 'Does the HTTP client retry failed requests?', expectedFile: 'src/http-client.ts' },
  ];

  it.each(GOLDEN_SET)(
    `recall@${RECALL_AT}: retrieves $expectedFile for "$question"`,
    async ({ question, expectedFile }) => {
      const { chunks } = await retrieval.search(repositoryId, question, RECALL_AT);
      expect(chunks.map((c) => c.filePath)).toContain(expectedFile);
    },
  );
});
