import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ConversationTurn } from '@app/shared';

export class ConversationTurnDto implements ConversationTurn {
  @IsString()
  @Length(1, 2000)
  question!: string;

  @IsString()
  @MaxLength(8000)
  answer!: string;
}

export class AskDto {
  @IsString()
  @Length(1, 2000)
  question!: string;

  /** Prior turns the client wants considered for this answer. Capped here so
   * a misbehaving client can't inflate the prompt or the request body - see
   * D9 for why this stays a client-supplied list rather than server state. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  history?: ConversationTurnDto[];
}
