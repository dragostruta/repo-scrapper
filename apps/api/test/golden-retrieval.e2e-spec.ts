import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../src/config/config.module';
import { LoggingModule } from '../src/common/logging/logging.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { IngestModule } from '../src/ingest/ingest.module';
import { FileWalkerService } from '../src/ingest/file-walker.service';
import { ChunkingModule } from '../src/chunking/chunking.module';
import { ChunkerService } from '../src/chunking/chunker.service';
import { EmbeddingModule } from '../src/embedding/embedding.module';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../src/embedding/embedding-provider';
import { RetrievalModule } from '../src/retrieval/retrieval.module';
import { ChunkRepository, type ChunkToInsert } from '../src/retrieval/chunk-repository.service';

// This test needs a real Postgres + pgvector (see docker-compose.yml's `db`
// service) - `npm test` loads DATABASE_URL from the repo-root .env for a
// local run; CI injects it directly as a service container (see D11). This
// test never touches the LLM, but AppConfig validates LLM_PROVIDER /
// ANTHROPIC_API_KEY unconditionally at construction, so it's forced to
// 'stub' here rather than left to whatever a developer's local .env has.
process.env.LLM_PROVIDER = 'stub';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'golden-repo');

/**
 * D11's "golden-set retrieval test": ingest a tiny fixture repo through the
 * real chunking + local-embedding + pgvector pipeline (no git clone, no live
 * LLM call - FileWalkerService.walk() runs directly against the fixture
 * directory), then assert recall@2 for a handful of questions with a known
 * answer file. This is the only test that would notice a chunking or
 * retrieval change quietly making search worse - see D11's "why".
 */
describe('golden-set retrieval', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let walker: FileWalkerService;
  let chunker: ChunkerService;
  let embeddings: EmbeddingProvider;
  let chunkRepository: ChunkRepository;
  let repositoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        PrismaModule,
        IngestModule,
        ChunkingModule,
        EmbeddingModule,
        RetrievalModule,
      ],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    walker = moduleRef.get(FileWalkerService);
    chunker = moduleRef.get(ChunkerService);
    embeddings = moduleRef.get(EMBEDDING_PROVIDER);
    chunkRepository = moduleRef.get(ChunkRepository);

    const repository = await prisma.repository.create({
      data: {
        source: 'GITHUB',
        url: 'https://example.invalid/golden-repo.git',
        name: 'test/golden-repo',
        revision: `golden-${randomUUID()}`,
        status: 'INDEXING',
      },
    });
    repositoryId = repository.id;

    const files = await walker.walk(FIXTURE_DIR);
    for (const file of files) {
      const candidates = await chunker.chunkFile(file.content, file.language);
      if (candidates.length === 0) continue;

      const vectors = await embeddings.embed(candidates.map((c) => c.content));
      const toInsert: ChunkToInsert[] = candidates.map((c, i) => ({
        filePath: file.relativePath,
        language: file.language,
        symbol: c.symbol,
        startLine: c.startLine,
        endLine: c.endLine,
        content: c.content,
        tokenCount: Math.ceil(c.content.length / 4),
        embedding: vectors[i],
      }));
      await chunkRepository.insertMany(repositoryId, toInsert);
    }

    await prisma.repository.update({ where: { id: repositoryId }, data: { status: 'INDEXED' } });
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
    {
      question: 'How do I calculate the area of a circle?',
      expectedFile: 'src/geometry.py',
    },
    {
      question: 'Does the HTTP client retry failed requests?',
      expectedFile: 'src/http-client.ts',
    },
  ];

  it.each(GOLDEN_SET)(
    'recall@2: retrieves $expectedFile for "$question"',
    async ({ question, expectedFile }) => {
      const [queryEmbedding] = await embeddings.embed([question]);
      const results = await chunkRepository.search(repositoryId, queryEmbedding, question, 2, 0.15);
      expect(results.map((r) => r.filePath)).toContain(expectedFile);
    },
  );
});
