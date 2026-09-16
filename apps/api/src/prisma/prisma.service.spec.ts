import { createFakeLogger } from '../../test/helpers/fake-logger';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  // Constructing PrismaClient does not open a connection, so no database is needed here.
  const build = () => {
    const logger = createFakeLogger();
    return { service: new PrismaService(logger), logger };
  };

  it('ping is true when the database answers', async () => {
    const { service } = build();
    jest.spyOn(service, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as never);
    expect(await service.ping()).toBe(true);
  });

  it('ping is false, not an exception, when the database is down', async () => {
    const { service } = build();
    jest.spyOn(service, '$queryRaw').mockRejectedValue(new Error('ECONNREFUSED') as never);
    expect(await service.ping()).toBe(false);
  });

  it('connects on module init and disconnects on destroy', async () => {
    const { service, logger } = build();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(logger.logs.info).toHaveBeenCalledWith('database connection established');
  });
});
