import { Injectable } from '@nestjs/common';
import { TREE_SITTER_LANGUAGES } from '../ingest/language';
import { AppLogger } from '../common/logging/logger.service';
import type { ChunkCandidate } from './chunk.types';
import { chunkByLines } from './line-chunker';
import { chunkWithTreeSitter } from './tree-sitter-chunker';

/**
 * Single entry point for turning one file's text into chunks. Tries the
 * code-aware path for languages with a grammar, falls back to line-based
 * chunking for everything else - including a tree-sitter language whose
 * grammar failed to load, which is why the fallback path is exercised even
 * when a language "should" be supported (D5).
 */
@Injectable()
export class ChunkerService {
  private readonly logger;
  private readonly warnedLanguages = new Set<string>();

  constructor(logger: AppLogger) {
    this.logger = logger.forContext('ChunkerService');
  }

  async chunkFile(content: string, language: string): Promise<ChunkCandidate[]> {
    if (TREE_SITTER_LANGUAGES.has(language)) {
      const chunks = await chunkWithTreeSitter(content, language);
      if (chunks) return chunks;

      if (!this.warnedLanguages.has(language)) {
        this.warnedLanguages.add(language);
        this.logger.warn(
          { language },
          'tree-sitter grammar unavailable for this language - falling back to line-based chunking',
        );
      }
    }

    return chunkByLines(content, null);
  }
}
