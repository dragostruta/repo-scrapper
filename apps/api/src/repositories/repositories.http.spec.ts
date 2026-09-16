import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { aRepository } from '../../test/helpers/builders';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import { configureApp } from '../app.setup';
import {
  ChunkNotFoundError,
  InvalidRepositorySourceError,
  LlmUnavailableError,
  RepositoryNotFoundError,
  RepositoryNotReadyError,
} from '../common/errors/domain-errors';
import { AppLogger } from '../common/logging/logger.service';
import { AppConfig } from '../config/app-config';
import { HealthController } from '../health/health.controller';
import { IngestOrchestratorService } from '../orchestrator/ingest-orchestrator.service';
import { QueryOrchestratorService } from '../orchestrator/query-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RepositoriesController } from './repositories.controller';

const ASK_RESPONSE = {
  answer: 'It hashes the password.',
  citations: [],
  timings: { embedQuestion: 1, retrieve: 2, generate: 3, total: 6 },
  traceId: 'from-orchestrator',
};

/**
 * The HTTP contract, end to end through the real Nest pipeline (validation
 * pipe, exception filter, trace middleware - exactly what main.ts applies)
 * with the orchestrators faked. No database needed, so it runs everywhere.
 */
describe('HTTP API contract', () => {
  let app: INestApplication;
  const ingest = {
    ingestGithubRepo: jest.fn(),
    listRepositories: jest.fn(),
    getRepository: jest.fn(),
  };
  const query = { ask: jest.fn(), search: jest.fn(), getChunkExcerpt: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RepositoriesController, HealthController],
      providers: [
        { provide: IngestOrchestratorService, useValue: ingest },
        { provide: QueryOrchestratorService, useValue: query },
        { provide: AppLogger, useValue: createFakeLogger() },
        { provide: PrismaService, useValue: { ping: jest.fn().mockResolvedValue(true) } },
        {
          provide: AppConfig,
          useValue: { llm: { provider: 'stub' }, embedding: { model: 'test-model' } },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const http = () => request(app.getHttpServer());

  describe('POST /repositories', () => {
    it('201 with the created repository', async () => {
      ingest.ingestGithubRepo.mockResolvedValue(aRepository({ status: 'CLONING' }));

      const res = await http()
        .post('/repositories')
        .send({ url: 'https://github.com/acme/widgets' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CLONING');
      expect(ingest.ingestGithubRepo).toHaveBeenCalledWith('https://github.com/acme/widgets');
    });

    it.each([
      ['a missing url', {}],
      ['a non-https url', { url: 'http://github.com/a/b' }],
      ['a non-URL string', { url: 'not a url' }],
      ['an overlong url', { url: `https://github.com/${'a'.repeat(500)}` }],
      ['an unexpected extra field', { url: 'https://github.com/a/b', admin: true }],
    ])('400 for %s, without calling the orchestrator', async (_label, body) => {
      const res = await http().post('/repositories').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400, message: expect.any(String) });
      expect(ingest.ingestGithubRepo).not.toHaveBeenCalled();
    });

    it('400 with the guardrail message when the orchestrator rejects the source', async () => {
      ingest.ingestGithubRepo.mockRejectedValue(
        new InvalidRepositorySourceError('"gitlab.com" is not an allowed repository host.'),
      );
      const res = await http().post('/repositories').send({ url: 'https://gitlab.com/a/b' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('"gitlab.com" is not an allowed repository host.');
    });
  });

  describe('GET /repositories', () => {
    it('200 with the list', async () => {
      ingest.listRepositories.mockResolvedValue([
        aRepository({ id: 'a' }),
        aRepository({ id: 'b' }),
      ]);
      const res = await http().get('/repositories');
      expect(res.status).toBe(200);
      expect(res.body.map((r: { id: string }) => r.id)).toEqual(['a', 'b']);
    });

    it('200 with an empty list', async () => {
      ingest.listRepositories.mockResolvedValue([]);
      expect((await http().get('/repositories')).body).toEqual([]);
    });
  });

  describe('GET /repositories/:id', () => {
    it('200 with the repository', async () => {
      ingest.getRepository.mockResolvedValue(aRepository({ id: 'r1' }));
      const res = await http().get('/repositories/r1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('r1');
    });

    it('404 in the standard error shape, with the trace id in body and header', async () => {
      ingest.getRepository.mockRejectedValue(new RepositoryNotFoundError('nope'));

      const res = await http().get('/repositories/nope').set('x-trace-id', 'my-trace');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        message: 'Repository nope not found',
        traceId: 'my-trace',
      });
      expect(res.headers['x-trace-id']).toBe('my-trace');
    });
  });

  describe('POST /repositories/:id/ask', () => {
    it('201 with the answer; history defaults to an empty list', async () => {
      query.ask.mockResolvedValue(ASK_RESPONSE);

      const res = await http()
        .post('/repositories/r1/ask')
        .send({ question: 'How does login work?' });

      expect(res.status).toBe(201);
      expect(res.body.answer).toBe('It hashes the password.');
      expect(query.ask).toHaveBeenCalledWith('r1', 'How does login work?', []);
    });

    it('passes validated conversation history through', async () => {
      query.ask.mockResolvedValue(ASK_RESPONSE);
      const history = [{ question: 'q1', answer: 'a1' }];

      await http().post('/repositories/r1/ask').send({ question: 'q2', history }).expect(201);

      expect(query.ask).toHaveBeenCalledWith('r1', 'q2', history);
    });

    const turn = { question: 'q', answer: 'a' };
    it.each([
      ['an empty question', { question: '' }],
      ['a missing question', {}],
      ['a non-string question', { question: 42 }],
      ['a question over 2000 characters', { question: 'x'.repeat(2001) }],
      ['more than 6 history turns', { question: 'q', history: Array(7).fill(turn) }],
      ['a history turn without an answer', { question: 'q', history: [{ question: 'q' }] }],
      [
        'a history answer over 8000 characters',
        { question: 'q', history: [{ question: 'q', answer: 'a'.repeat(8001) }] },
      ],
      ['history that is not a list', { question: 'q', history: 'nope' }],
    ])('400 for %s', async (_label, body) => {
      const res = await http().post('/repositories/r1/ask').send(body);
      expect(res.status).toBe(400);
      expect(query.ask).not.toHaveBeenCalled();
    });

    it('accepts the edge values: 2000-character question, 6 turns, 8000-character answers', async () => {
      query.ask.mockResolvedValue(ASK_RESPONSE);
      const history = Array(6).fill({ question: 'q', answer: 'a'.repeat(8000) });
      await http()
        .post('/repositories/r1/ask')
        .send({ question: 'x'.repeat(2000), history })
        .expect(201);
    });

    it('409 while the repository is still indexing', async () => {
      query.ask.mockRejectedValue(new RepositoryNotReadyError('INDEXING'));
      const res = await http().post('/repositories/r1/ask').send({ question: 'q' });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not ready/);
    });

    it('503 with an actionable message when the LLM is unavailable', async () => {
      query.ask.mockRejectedValue(
        new LlmUnavailableError('Could not reach Ollama at http://ollama:11434.'),
      );
      const res = await http().post('/repositories/r1/ask').send({ question: 'q' });
      expect(res.status).toBe(503);
      expect(res.body.message).toContain('Could not reach Ollama');
    });

    it('500 with a generic message for an unexpected failure', async () => {
      query.ask.mockRejectedValue(new Error('secret internal detail'));
      const res = await http().post('/repositories/r1/ask').send({ question: 'q' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Internal server error');
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });
  });

  describe('POST /repositories/:id/search', () => {
    it('200 with ranked results', async () => {
      query.search.mockResolvedValue({ results: [], timings: { embedQuestion: 1, retrieve: 2 } });

      const res = await http().post('/repositories/r1/search').send({ query: 'hashing', limit: 5 });

      expect(res.status).toBe(200);
      expect(query.search).toHaveBeenCalledWith('r1', 'hashing', 5);
    });

    it('passes no limit when the client sends none', async () => {
      query.search.mockResolvedValue({ results: [], timings: { embedQuestion: 1, retrieve: 2 } });
      await http().post('/repositories/r1/search').send({ query: 'hashing' }).expect(200);
      expect(query.search).toHaveBeenCalledWith('r1', 'hashing', undefined);
    });

    it.each([
      ['an empty query', { query: '' }],
      ['a zero limit', { query: 'q', limit: 0 }],
      ['a limit over 20', { query: 'q', limit: 21 }],
      ['a fractional limit', { query: 'q', limit: 2.5 }],
      ['a string limit', { query: 'q', limit: '5' }],
    ])('400 for %s', async (_label, body) => {
      expect((await http().post('/repositories/r1/search').send(body)).status).toBe(400);
      expect(query.search).not.toHaveBeenCalled();
    });

    it('accepts the edge limits 1 and 20', async () => {
      query.search.mockResolvedValue({ results: [], timings: { embedQuestion: 1, retrieve: 2 } });
      await http().post('/repositories/r1/search').send({ query: 'q', limit: 1 }).expect(200);
      await http().post('/repositories/r1/search').send({ query: 'q', limit: 20 }).expect(200);
    });

    it('409 while the repository is still indexing', async () => {
      query.search.mockRejectedValue(new RepositoryNotReadyError('INDEXING'));
      expect((await http().post('/repositories/r1/search').send({ query: 'q' })).status).toBe(409);
    });
  });

  describe('GET /repositories/:id/chunks/:chunkId', () => {
    it('200 with the excerpt', async () => {
      query.getChunkExcerpt.mockResolvedValue({ path: 'a.ts', content: 'code' });
      const res = await http().get('/repositories/r1/chunks/c1');
      expect(res.status).toBe(200);
      expect(query.getChunkExcerpt).toHaveBeenCalledWith('r1', 'c1');
    });

    it('404 for a chunk outside the repository', async () => {
      query.getChunkExcerpt.mockRejectedValue(new ChunkNotFoundError('c1'));
      expect((await http().get('/repositories/r1/chunks/c1')).status).toBe(404);
    });
  });

  describe('cross-cutting', () => {
    it('mints and echoes a trace id when the client sends none', async () => {
      ingest.listRepositories.mockResolvedValue([]);
      const res = await http().get('/repositories');
      expect(res.headers['x-trace-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('allows cross-origin requests from the web app and exposes the trace header', async () => {
      ingest.listRepositories.mockResolvedValue([]);
      const res = await http().get('/repositories').set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-expose-headers']).toContain('x-trace-id');
    });

    it('404 for an unknown route', async () => {
      const res = await http().get('/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.statusCode).toBe(404);
    });

    it('GET /health reports ok', async () => {
      const res = await http().get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    });
  });
});
