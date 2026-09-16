import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AskResponse, RepositorySummary } from '@app/shared';
import { IngestOrchestratorService, requireRepository } from '../orchestrator/ingest-orchestrator.service';
import { QueryOrchestratorService } from '../orchestrator/query-orchestrator.service';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { AskDto } from './dto/ask.dto';

/**
 * Thin HTTP adapter over the orchestrator (see architecture note in README).
 * No business logic lives here - every method is parse-DTO, call
 * orchestrator, return its result.
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
    return requireRepository(this.ingest, id);
  }

  @Post(':id/ask')
  ask(@Param('id') id: string, @Body() dto: AskDto): Promise<AskResponse> {
    return this.query.ask(id, dto.question);
  }
}
