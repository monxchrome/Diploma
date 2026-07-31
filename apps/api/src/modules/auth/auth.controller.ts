import type { AuthSessionSummary, AuthTokensResponse, SafeUser } from "@dip/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import type {
  AuthenticatedSession,
  AuthenticatedUser,
} from "../../common/auth/authenticated-request";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { AuthService, type AuthResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RefreshTokenService } from "./services/refresh-token.service";
import { CsrfGuard } from "../../common/guards/csrf.guard";

@Controller("auth")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RefreshTokenService) private readonly refreshTokenService: RefreshTokenService,
    @Inject(SessionsService) private readonly sessionsService: SessionsService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  @Post("register")
  @SkipThrottle({ authLogin: true, authRefresh: true, authRegister: false })
  @Throttle({ authRegister: {} })
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensResponse> {
    return this.attachRefreshCookie(await this.authService.register(body, request), response);
  }

  @Post("login")
  @HttpCode(200)
  @SkipThrottle({ authLogin: false, authRefresh: true, authRegister: true })
  @Throttle({ authLogin: {} })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensResponse> {
    return this.attachRefreshCookie(await this.authService.login(body, request), response);
  }

  @Post("refresh")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @SkipThrottle({ authLogin: true, authRefresh: false, authRegister: true })
  @Throttle({ authRefresh: {} })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensResponse> {
    return this.attachRefreshCookie(await this.authService.refresh(request), response);
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request);
    this.refreshTokenService.clearCookie(response);
  }

  @Post("logout-all")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessionsService.revokeAllUserSessions(user.id, getRequestId(request));
    this.refreshTokenService.clearCookie(response);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<SafeUser> {
    return this.usersService.getMe(user.id);
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  getSessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<AuthSessionSummary[]> {
    return this.sessionsService.listUserSessions(user.id, session.id);
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() currentSession: AuthenticatedSession,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessionsService.revokeUserSession({
      actorUserId: user.id,
      requestId: getRequestId(request),
      sessionId,
    });

    if (sessionId === currentSession.id) {
      this.refreshTokenService.clearCookie(response);
    }
  }

  private attachRefreshCookie(result: AuthResult, response: Response): AuthTokensResponse {
    this.refreshTokenService.setCookie(response, result.refreshToken, result.refreshExpiresAt);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }
}
