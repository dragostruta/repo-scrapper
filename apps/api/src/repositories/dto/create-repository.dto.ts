import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateRepositoryDto {
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url!: string;
}
