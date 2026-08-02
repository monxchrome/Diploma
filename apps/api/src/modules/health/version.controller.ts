import type { ReleaseVersionResponse } from "@dip/contracts";
import { ConfigService } from "@nestjs/config";
import { Controller, Get, Inject } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

@Controller("version")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true, default: true })
export class VersionController {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  @Get()
  getVersion(): ReleaseVersionResponse {
    return {
      apiSchemaVersion: this.configService.getOrThrow<string>("release.apiSchemaVersion"),
      buildTimestamp: this.configService.getOrThrow<string>("release.buildTimestamp"),
      commitSha: this.configService.getOrThrow<string>("release.commitSha"),
      databaseSchemaVersion: this.configService.getOrThrow<string>("release.databaseSchemaVersion"),
      dirty: this.configService.getOrThrow<boolean>("release.dirty"),
      environment: this.configService.getOrThrow<string>("app.environment"),
      featureSetVersion: this.configService.getOrThrow<string>("release.featureSetVersion"),
      version: this.configService.getOrThrow<string>("app.version"),
    };
  }
}
