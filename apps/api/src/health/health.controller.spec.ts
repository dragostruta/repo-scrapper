import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app-config';

describe('HealthController', () => {
  const buildController = async (dbUp: boolean) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { ping: jest.fn().mockResolvedValue(dbUp) } },
        {
          provide: AppConfig,
          useValue: {
            llm: { provider: 'stub' },
            embedding: { model: 'Xenova/bge-small-en-v1.5' },
          },
        },
      ],
    }).compile();

    return moduleRef.get(HealthController);
  };

  it('reports ok when the database answers', async () => {
    const result = await (await buildController(true)).check();
    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('up');
  });

  it('reports degraded rather than throwing when the database is down', async () => {
    const result = await (await buildController(false)).check();
    expect(result.status).toBe('degraded');
    expect(result.checks.database).toBe('down');
  });
});
