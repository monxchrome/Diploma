import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { ResearchService } from "./research.service";

@Controller("projects/:projectId")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class ResearchController {
  constructor(@Inject(ResearchService) private readonly research: ResearchService) {}

  @Get("research/policy")
  getPolicy() {
    return this.research.policy();
  }

  @Get("analyses/:analysisId/runs/:runId/research")
  getRun(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    return this.research.getRun(projectId, analysisId, runId);
  }

  @Get("analyses/:analysisId/runs/:runId/research/queries")
  getQueries(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    return this.research.getQueries(projectId, analysisId, runId);
  }

  @Get("analyses/:analysisId/runs/:runId/research/sources")
  getSources(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    return this.research.getSources(projectId, analysisId, runId);
  }

  @Get("analyses/:analysisId/runs/:runId/research/conflicts")
  getConflicts(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    return this.research.getConflicts(projectId, analysisId, runId);
  }

  @Get("research/sources/:sourceId")
  getSource(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("sourceId", ParseUUIDPipe) sourceId: string,
  ) {
    return this.research.getSource(projectId, sourceId);
  }

  @Get("research/sources/:sourceId/snapshots/:snapshotId")
  getSnapshot(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("sourceId", ParseUUIDPipe) sourceId: string,
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
  ) {
    return this.research.getSnapshot(projectId, sourceId, snapshotId);
  }
}
