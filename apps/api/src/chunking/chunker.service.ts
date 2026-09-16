import { Injectable } from '@nestjs/common';
import { TREE_SITTER_LANGUAGES } from '../ingest/language';
import { AppLogger } from '../common/logging/logger.service';
import type { ChunkCandidate } from './chunk.types';
import { chunkByLines } from './line-chunker';
import { chunkWithTreeSitter } from './tree-sitter-chunker';

/**
 * Single entry point for turning one file into chunks: symbol-aware for
 * languages with a grammar, line-based for everything else - including a
 * supported language whose grammar failed to load (D5).
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
      this.warnGrammarUnavailableOnce(language);
    }
    return chunkByLines(content, null);
  }

  /** One warning per language per process, not one per file. */
  private warnGrammarUnavailableOnce(language: string): void {
    if (this.warnedLanguages.has(language)) return;
    this.warnedLanguages.add(language);
    this.logger.warn(
      { language },
      'tree-sitter grammar unavailable - falling back to line-based chunking',
    );
  }
}
