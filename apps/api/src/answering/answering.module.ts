import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { LLM_PROVIDER } from './llm-provider';
import { createLlmProvider } from './llm-provider.factory';

@Module({
  providers: [
    { provide: LLM_PROVIDER, useFactory: createLlmProvider, inject: [AppConfig, AppLogger] },
  ],
  exports: [LLM_PROVIDER],
})
export class AnsweringModule {}
