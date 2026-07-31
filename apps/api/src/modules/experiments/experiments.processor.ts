import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import type { Job } from "bullmq";

import { ExperimentsService } from "./experiments.service";

@Processor("experiments")
@Injectable()
export class ExperimentsProcessor extends WorkerHost {
  constructor(@Inject(ExperimentsService) private readonly experiments: ExperimentsService) {
    super();
  }

  async process(job: Job<{ experimentId: string; requestId: string }>): Promise<void> {
    await this.experiments.execute(job.data.experimentId);
  }
}
