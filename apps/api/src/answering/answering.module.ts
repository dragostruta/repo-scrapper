import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { LLM_PROVIDER, type LlmProvider } from './llm-provider';
import { AnthropicProvider } from './anthropic.provider';
import { OllamaProvider } from './ollama.provider';
import { StubLlmProvider } from './stub.provider';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      useFactory: (config: AppConfig, logger: AppLogger): LlmProvider => {
        switch (config.llm.provider) {
          case 'anthropic':
            return new AnthropicProvider(config, logger);
          case 'ollama':
            return new OllamaProvider(config, logger);
          case 'stub':
            return new StubLlmProvider();
        }
      },
      inject: [AppConfig, AppLogger],
    },
  ],
  exports: [LLM_PROVIDER],
})
export class AnsweringModule {}
