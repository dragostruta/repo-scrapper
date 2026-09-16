import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GithubClonerService, type ClonedRepo } from '../src/ingest/github-cloner.service';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.LLM_PROVIDER = 'stub';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'golden-repo');

/**
 * D11's "one end-to-end happy path": a real HTTP request through the full
 * Nest app (real DB, real chunker, real local embeddings, stubbed LLM) from
 * repo creation through to an answered question. The one thing faked is
 * GithubClonerService - swapped for a copy of the fixture repo - so the test
 * needs no network access to GitHub and is deterministic in CI (D11's "no
 * live API calls", extended to "no live network deps" for the same reason).
 */
describe('POST /repositories -> ask (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repositoryId: string | undefined;

  const fakeCloner: Pick<GithubClonerService, 'clone' | 'resolveHeadSha' | 'cleanup'> = {
    // Always null: skips the cache-hit path so this test always exercises a
    // fresh ingest, regardless of what earlier test runs left in the DB.
    resolveHeadSha: async () => null,
    clone: async (): Promise<ClonedRepo> => {
      const dir = await mkdtemp(join(tmpdir(), 'ask-e2e-fixture-'));
      await cp(FIXTURE_DIR, dir, { recursive: true });
      return { dir, revision: `e2e-${randomUUID()}` };
    },
    cleanup: async (clonedDir: string) => {
      await rm(clonedDir, { recursive: true, force: true });
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GithubClonerService)
      .useValue(fakeCloner)
      .compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts's global pipe so this test exercises the same request
    // validation behaviour as the real server, not Nest's defaults.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (repositoryId) {
      await prisma.repository.delete({ where: { id: repositoryId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('ingests a repo end to end and answers a question about it', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/repositories')
      .send({ url: `https://github.com/test-fixtures/golden-repo-${randomUUID()}` })
      .expect(201);

    repositoryId = createRes.body.id;
    expect(repositoryId).toEqual(expect.any(String));
    expect(['PENDING', 'CLONING']).toContain(createRes.body.status);

    // Indexing runs as a detached background task (D8) - poll the same way
    // the web UI does rather than assuming it finished by the time we get here.
    const deadline = Date.now() + 60_000;
    let status = createRes.body.status;
    while (status !== 'INDEXED' && status !== 'FAILED' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const getRes = await request(app.getHttpServer())
        .get(`/repositories/${repositoryId}`)
        .expect(200);
      status = getRes.body.status;
    }
    expect(status).toBe('INDEXED');

    const askRes = await request(app.getHttpServer())
      .post(`/repositories/${repositoryId}/ask`)
      .send({ question: 'How does login work in this codebase?' })
      .expect(201);

    expect(typeof askRes.body.answer).toBe('string');
    expect(askRes.body.answer.length).toBeGreaterThan(0);
    expect(Array.isArray(askRes.body.citations)).toBe(true);
    expect(askRes.body.timings).toMatchObject({
      embedQuestion: expect.any(Number),
      retrieve: expect.any(Number),
      generate: expect.any(Number),
      total: expect.any(Number),
    });
    expect(typeof askRes.body.traceId).toBe('string');
  });
});
