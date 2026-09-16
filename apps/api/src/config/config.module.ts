import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';

@Global()
@Module({
  // A factory rather than a class provider: AppConfig takes the raw
  // environment as a constructor argument (so tests can pass their own),
  // which Nest's constructor-based injection cannot resolve by type.
  providers: [{ provide: AppConfig, useFactory: () => new AppConfig(process.env) }],
  exports: [AppConfig],
})
export class AppConfigModule {}
