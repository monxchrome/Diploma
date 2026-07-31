import {
  Body,
  Controller,
  Delete,
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

import { getRequestId } from "../../common/logging/request-id";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentProjectAccess } from "../projects/current-project-access.decorator";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import type { ProjectAccess } from "../projects/project-request";
import { CreateKnowledgeBaseDto } from "./dto/create-knowledge-base.dto";
import { CreateUploadIntentDto } from "./dto/create-upload-intent.dto";
import { UpdateKnowledgeBaseDto } from "./dto/update-knowledge-base.dto";
import { KnowledgeBasesService } from "./knowledge-bases.service";

@Controller("projects/:projectId/knowledge-bases")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class KnowledgeBasesController {
  constructor(@Inject(KnowledgeBasesService) private readonly service: KnowledgeBasesService) {}
  @Get() list(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Query("status") status?: "active" | "archived" | "all",
  ) {
    return this.service.list(projectId, status);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() body: CreateKnowledgeBaseDto,
    @Req() request: Request,
  ) {
    return this.service.create({
      ...body,
      projectId,
      userId: user.id,
      requestId: getRequestId(request),
    });
  }
  @Get(":knowledgeBaseId") get(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) id: string,
  ) {
    return this.service.get(projectId, id);
  }
  @Get(":knowledgeBaseId/documents") documents(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) knowledgeBaseId: string,
  ) {
    return this.service.listDocuments(projectId, knowledgeBaseId);
  }
  @Patch(":knowledgeBaseId") update(
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) id: string,
    @Body() body: UpdateKnowledgeBaseDto,
  ) {
    return this.service.update({ ...body, id, projectId, role: access.role });
  }
  @Delete(":knowledgeBaseId") archive(
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.service.archive({
      archived: true,
      id,
      projectId,
      requestId: getRequestId(request),
      role: access.role,
    });
  }
  @Post(":knowledgeBaseId/restore") restore(
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.service.archive({
      archived: false,
      id,
      projectId,
      requestId: getRequestId(request),
      role: access.role,
    });
  }
  @Post(":knowledgeBaseId/documents/upload-intent") intent(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) knowledgeBaseId: string,
    @Body() body: CreateUploadIntentDto,
    @Req() request: Request,
  ) {
    return this.service.createUploadIntent({
      ...body,
      knowledgeBaseId,
      projectId,
      requestId: getRequestId(request),
      role: access.role,
      userId: user.id,
    });
  }
  @Post(":knowledgeBaseId/documents/:documentId/complete-upload") complete(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) knowledgeBaseId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Req() request: Request,
  ) {
    return this.service.completeUpload({
      documentId,
      knowledgeBaseId,
      projectId,
      requestId: getRequestId(request),
      role: access.role,
      userId: user.id,
    });
  }
  @Get(":knowledgeBaseId/documents/:documentId") document(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) knowledgeBaseId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    return this.service.getDocument(projectId, knowledgeBaseId, documentId);
  }
  @Delete(":knowledgeBaseId/documents/:documentId") deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("knowledgeBaseId", ParseUUIDPipe) knowledgeBaseId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Req() request: Request,
  ) {
    return this.service.archiveDocument({
      documentId,
      knowledgeBaseId,
      projectId,
      requestId: getRequestId(request),
      role: access.role,
      userId: user.id,
    });
  }
}
