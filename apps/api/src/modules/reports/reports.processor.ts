import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import type { Job } from "bullmq";

import { ReportsService } from "./reports.service";

@Processor("report-export", { lockDuration: 120_000 })
@Injectable()
export class ReportsProcessor extends WorkerHost {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<{ exportJobId: string; requestId: string }>): Promise<void> {
    await this.reports.executeExport(job.data);
  }
}
