import { IsString, Length } from 'class-validator';

export class AskDto {
  @IsString()
  @Length(1, 2000)
  question!: string;
}
