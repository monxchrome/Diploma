import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BenchmarksService } from "./benchmarks.service";

@Controller()
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
@UseGuards(JwtAuthGuard)
export class BenchmarksController {
  constructor(@Inject(BenchmarksService) private readonly benchmarks: BenchmarksService) {}

  @Get("model-profiles")
  listModelProfiles(@CurrentUser() user: AuthenticatedUser) {
    return this.benchmarks.listModelProfiles(user);
  }

  @Post("model-profiles")
  createModelProfile(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.benchmarks.createModelProfile(user, body, getRequestId(request));
  }

  @Patch("model-profiles/:id")
  updateModelProfile(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.updateModelProfile(user, id, body, getRequestId(request));
  }

  @Post("model-profiles/:id/health-check")
  healthCheckModelProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.healthCheckModelProfile(user, id, getRequestId(request));
  }

  @Get("health/model-providers")
  modelProviderHealth(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.benchmarks.modelProviderHealth(user, getRequestId(request));
  }

  @Get("benchmark-datasets")
  listDatasets(@CurrentUser() user: AuthenticatedUser) {
    return this.benchmarks.listDatasets(user);
  }

  @Post("benchmark-datasets")
  createDataset(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.benchmarks.createDataset(user, body, getRequestId(request));
  }

  @Post("benchmark-datasets/:id/versions")
  addDatasetVersion(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.benchmarks.addDatasetVersion(user, id, body);
  }

  @Get("benchmark-dataset-versions/:id/cases")
  listDatasetCases(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.listDatasetCases(user, id);
  }

  @Post("benchmark-dataset-versions/:id/cases")
  addDatasetCase(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.benchmarks.addDatasetCase(user, id, body);
  }

  @Post("benchmark-dataset-versions/:id/freeze")
  freezeDatasetVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.freezeDatasetVersion(user, id, getRequestId(request));
  }

  @Post("benchmark-cases/:id/evidence-packages")
  addEvidencePackage(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.benchmarks.addEvidencePackage(user, id, body);
  }

  @Get("benchmark-suites")
  listSuites(@CurrentUser() user: AuthenticatedUser) {
    return this.benchmarks.listSuites(user);
  }

  @Get("benchmark-variant-templates")
  listVariantTemplates() {
    return this.benchmarks.listVariantTemplates();
  }

  @Post("benchmark-suites")
  createSuite(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.benchmarks.createSuite(user, body, getRequestId(request));
  }

  @Get("benchmark-suites/:id")
  getSuite(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.getSuite(user, id);
  }

  @Patch("benchmark-suites/:id")
  updateSuite(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.benchmarks.updateSuite(user, id, body);
  }

  @Post("benchmark-suites/:id/variants")
  addVariant(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.addVariant(user, id, body, getRequestId(request));
  }

  @Post("benchmark-suites/:id/freeze")
  freezeSuite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.freezeSuite(user, id, getRequestId(request));
  }

  @Post("benchmark-suites/:id/clone")
  cloneSuite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.cloneSuite(user, id, getRequestId(request));
  }

  @Post("benchmark-runs/estimate")
  estimateRun(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.benchmarks.estimateRun(user, body, getRequestId(request));
  }

  @Post("benchmark-runs")
  createRun(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.benchmarks.createRun(user, body, getRequestId(request));
  }

  @Get("benchmark-runs")
  listRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.benchmarks.listRuns(user);
  }

  @Get("benchmark-runs/:id")
  getRun(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.getRun(user, id);
  }

  @Post("benchmark-runs/:id/pause")
  pauseRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.pauseRun(user, id, getRequestId(request));
  }

  @Post("benchmark-runs/:id/resume")
  resumeRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.resumeRun(user, id, getRequestId(request));
  }

  @Post("benchmark-runs/:id/cancel")
  cancelRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.cancelRun(user, id, getRequestId(request));
  }

  @Post("benchmark-runs/:id/retry-failed")
  retryFailed(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.retryFailed(user, id, getRequestId(request));
  }

  @Get("benchmark-runs/:id/case-runs")
  listCaseRuns(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.listCaseRuns(user, id);
  }

  @Get("benchmark-runs/:id/results")
  results(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.results(user, id);
  }

  @Get("benchmark-runs/:id/statistics")
  statistics(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.statisticsForRun(user, id);
  }

  @Get("benchmarks/compare")
  compare(@CurrentUser() user: AuthenticatedUser, @Query("runId", ParseUUIDPipe) runId: string) {
    return this.benchmarks.results(user, runId);
  }

  @Get("human-evaluation-tasks")
  listHumanTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.benchmarks.listHumanTasks(user);
  }

  @Post("human-evaluation-tasks/:id/start")
  startHumanTask(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.startHumanTask(user, id);
  }

  @Post("human-evaluation-tasks/:id/submit")
  submitHumanTask(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.submitHumanTask(user, id, body, getRequestId(request));
  }

  @Post("human-evaluation-tasks/:id/skip")
  skipHumanTask(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.benchmarks.skipHumanTask(user, id);
  }

  @Post("human-evaluation-tasks/:id/invalidate")
  invalidateHumanTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.invalidateHumanTask(user, id, getRequestId(request));
  }

  @Post("human-evaluation-tasks/:id/assign")
  assignHumanTask(
    @Body("evaluatorId", ParseUUIDPipe) evaluatorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.assignHumanTask(user, id, evaluatorId, getRequestId(request));
  }

  @Post("benchmark-runs/:id/reproducibility")
  requestReproducibilityExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.benchmarks.requestReproducibilityExport(user, id, getRequestId(request));
  }

  @Get("benchmark-runs/:id/reproducibility/manifest")
  reproducibilityManifest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.benchmarks.getReproducibilityManifest(user, id);
  }

  @Get("benchmark-runs/:runId/reproducibility/:artifactId/download")
  reproducibilityDownload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("runId", ParseUUIDPipe) runId: string,
    @Param("artifactId", ParseUUIDPipe) artifactId: string,
  ) {
    return this.benchmarks.getReproducibilityDownload(user, runId, artifactId);
  }
}
