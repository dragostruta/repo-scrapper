import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export const MAX_SEARCH_LIMIT = 20;

export class SearchDto {
  @IsString()
  @Length(1, 2000)
  query!: string;

  /** How many chunks to return; defaults to RETRIEVAL_TOP_K. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_LIMIT)
  limit?: number;
}
