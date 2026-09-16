import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { AskResponse, ChunkExcerpt, RepositorySummary, SearchResponse } from '@app/shared';
import { IngestOrchestratorService } from '../orchestrator/ingest-orchestrator.service';
import { QueryOrchestratorService } from '../orchestrator/query-orchestrator.service';
import { AskDto } from './dto/ask.dto';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { SearchDto } from './dto/search.dto';

/**
 * Thin HTTP adapter: every handler validates its input (via the DTO) and
 * delegates to an orchestrator. No business logic lives here.
 */
@Controller('repositories')
export class RepositoriesController {
  constructor(
    private readonly ingest: IngestOrchestratorService,
    private readonly query: QueryOrchestratorService,
  ) {}

  @Post()
  create(@Body() dto: CreateRepositoryDto): Promise<RepositorySummary> {
    return this.ingest.ingestGithubRepo(dto.url);
  }

  @Get()
  list(): Promise<RepositorySummary[]> {
    return this.ingest.listRepositories();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<RepositorySummary> {
    return this.ingest.getRepository(id);
  }

  @Post(':id/ask')
  ask(@Param('id') id: string, @Body() dto: AskDto): Promise<AskResponse> {
    return this.query.ask(id, dto.question, dto.history ?? []);
  }

  @Post(':id/search')
  @HttpCode(HttpStatus.OK)
  search(@Param('id') id: string, @Body() dto: SearchDto): Promise<SearchResponse> {
    return this.query.search(id, dto.query, dto.limit);
  }

  @Get(':id/chunks/:chunkId')
  getChunk(@Param('id') id: string, @Param('chunkId') chunkId: string): Promise<ChunkExcerpt> {
    return this.query.getChunkExcerpt(id, chunkId);
  }
}
