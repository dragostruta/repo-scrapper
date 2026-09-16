import { Module } from '@nestjs/common';
import { GithubClonerService } from './github-cloner.service';
import { FileWalkerService } from './file-walker.service';

@Module({
  providers: [GithubClonerService, FileWalkerService],
  exports: [GithubClonerService, FileWalkerService],
})
export class IngestModule {}
