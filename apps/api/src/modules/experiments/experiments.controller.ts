import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentProjectAccess } from "../projects/current-project-access.decorator";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import type { ProjectAccess } from "../projects/project-request";
import {
  parseCreateExperiment,
  parseExperimentCase,
  parseExperimentVariant,
  parseHumanEvaluation,
} from "./dto/experiment.dto";
import { ExperimentsService } from "./experiments.service";

@Controller("projects/:projectId/experiments")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class ExperimentsController {
  constructor(@Inject(ExperimentsService) private readonly experiments: ExperimentsService) {}

  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ) {
    return this.experiments.create({
      body: parseCreateExperiment(body),
      projectId,
      userId: user.id,
      role: access.role,
      requestId: getRequestId(request),
    });
  }

  @Get()
  list(@Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.experiments.list(projectId);
  }

  @Get(":experimentId")
  get(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.get(projectId, experimentId);
  }

  @Patch(":experimentId")
  update(
    @Body() body: { description?: string | null; name?: string },
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.update({ body, projectId, experimentId, role: access.role });
  }

  @Delete(":experimentId")
  remove(
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.remove(projectId, experimentId, access.role);
  }

  @Post(":experimentId/variants")
  addVariant(
    @Body() body: unknown,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.addVariant({
      body: parseExperimentVariant(body),
      projectId,
      experimentId,
      role: access.role,
    });
  }

  @Post(":experimentId/cases")
  addCase(
    @Body() body: unknown,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.addCase({
      body: parseExperimentCase(body),
      projectId,
      experimentId,
      role: access.role,
    });
  }

  @Post(":experimentId/run")
  run(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
    @Req() request: Request,
  ) {
    return this.experiments.run({
      projectId,
      experimentId,
      userId: user.id,
      role: access.role,
      requestId: getRequestId(request),
    });
  }

  @Post(":experimentId/cancel")
  cancel(
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.cancel(projectId, experimentId, access.role);
  }

  @Get(":experimentId/runs")
  runs(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.listRuns(projectId, experimentId);
  }

  @Get(":experimentId/metrics")
  metrics(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.metrics(projectId, experimentId);
  }

  @Get(":experimentId/report")
  report(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.report(projectId, experimentId);
  }

  @Post(":experimentId/runs/:runId/evaluation")
  evaluate(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    const evaluation = parseHumanEvaluation(body);
    return this.experiments.evaluate({
      experimentId,
      projectId,
      runId,
      userId: user.id,
      scores: evaluation.scores,
      notes: evaluation.notes,
    });
  }

  @Get(":experimentId/export.json")
  exportJson(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.exportJson(projectId, experimentId);
  }

  @Get(":experimentId/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  exportCsv(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.experiments.exportCsv(projectId, experimentId);
  }
}
