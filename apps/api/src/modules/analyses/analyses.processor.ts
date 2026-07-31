import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import type { Job } from "bullmq";

import { AnalysesService } from "./analyses.service";

@Processor("analysis", { lockDuration: 120_000 })
@Injectable()
export class AnalysesProcessor extends WorkerHost {
  constructor(@Inject(AnalysesService) private readonly analyses: AnalysesService) {
    super();
  }
  async process(job: Job<{ analysisRunId: string; requestId: string }>): Promise<void> {
    await this.analyses.execute(job.data.analysisRunId, job.data.requestId);
  }
}
