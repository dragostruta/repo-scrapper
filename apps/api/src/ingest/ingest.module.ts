import { Module } from '@nestjs/common';
import { FileWalkerService } from './file-walker.service';
import { GitClient } from './git.client';
import { GithubClonerService } from './github-cloner.service';

@Module({
  providers: [GitClient, GithubClonerService, FileWalkerService],
  exports: [GithubClonerService, FileWalkerService],
})
export class IngestModule {}
