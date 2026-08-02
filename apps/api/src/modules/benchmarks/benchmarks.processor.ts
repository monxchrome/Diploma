import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import type { Job } from "bullmq";

import { BenchmarksService } from "./benchmarks.service";

@Processor("benchmarks")
@Injectable()
export class BenchmarksProcessor extends WorkerHost {
  constructor(@Inject(BenchmarksService) private readonly benchmarks: BenchmarksService) {
    super();
  }

  async process(job: Job<{ benchmarkRunId: string; requestId: string }>): Promise<void> {
    await this.benchmarks.execute(job.data.benchmarkRunId, job.data.requestId);
  }
}
