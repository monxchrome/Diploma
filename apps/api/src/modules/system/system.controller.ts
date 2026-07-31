import type { AiEchoResponse, SystemStatusResponse } from "@dip/contracts";
import { Controller, Get, Inject, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";

import { getRequestId } from "../../common/logging/request-id";
import { SystemService } from "./system.service";

@Controller("system")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
export class SystemController {
  constructor(@Inject(SystemService) private readonly systemService: SystemService) {}

  @Get("status")
  @SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true, default: true })
  getStatus(@Req() request: Request): Promise<SystemStatusResponse> {
    return this.systemService.getStatus(getRequestId(request));
  }

  @Get("ai-check")
  getAiCheck(@Req() request: Request): Promise<AiEchoResponse> {
    return this.systemService.getAiCheck(getRequestId(request));
  }
}
