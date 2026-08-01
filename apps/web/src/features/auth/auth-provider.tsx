"use client";

import {
  ApiErrorSchema,
  AuthTokensResponseSchema,
  type AuthTokensResponse,
  type SafeUser,
} from "@dip/contracts";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import { getWebConfig } from "@/lib/config";

type AuthStatus = "anonymous" | "authenticated" | "loading";

type ApiRequestOptions = {
  auth?: boolean;
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
};

type AuthContextValue = {
  apiRequest: <ResponseSchema extends z.ZodType>(
    path: string,
    schema: ResponseSchema,
    options?: ApiRequestOptions,
  ) => Promise<z.infer<ResponseSchema>>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  setUser: (user: SafeUser) => void;
  status: AuthStatus;
  user: SafeUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const config = getWebConfig();
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUserState] = useState<SafeUser | null>(null);

  const applyAuthResult = useCallback((result: AuthTokensResponse) => {
    accessTokenRef.current = result.accessToken;
    setUserState(result.user);
    setStatus("authenticated");
  }, []);

  const clearAuthState = useCallback(() => {
    accessTokenRef.current = null;
    setUserState(null);
    setStatus("anonymous");
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = fetch(`${config.apiBaseUrl}/api/auth/refresh`, {
      credentials: "include",
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok) {
          clearAuthState();
          return false;
        }

        const payload: unknown = await response.json();
        applyAuthResult(AuthTokensResponseSchema.parse(payload));
        return true;
      })
      .catch(() => {
        clearAuthState();
        return false;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    return refreshPromiseRef.current;
  }, [applyAuthResult, clearAuthState, config.apiBaseUrl]);

  const apiRequest = useCallback(
    async <ResponseSchema extends z.ZodType>(
      path: string,
      schema: ResponseSchema,
      options: ApiRequestOptions = {},
    ): Promise<z.infer<ResponseSchema>> => {
      return requestWithAuth({
        accessToken: () => accessTokenRef.current,
        apiBaseUrl: config.apiBaseUrl,
        options,
        path,
        refreshSession,
        schema,
        setAccessToken: (token) => {
          accessTokenRef.current = token;
        },
        setUser: setUserState,
      });
    },
    [config.apiBaseUrl, refreshSession],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await unauthenticatedRequest(config.apiBaseUrl, "/api/auth/login", {
        email,
        password,
      });
      applyAuthResult(result);
      router.push("/home");
    },
    [applyAuthResult, config.apiBaseUrl, router],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await unauthenticatedRequest(config.apiBaseUrl, "/api/auth/register", {
        displayName,
        email,
        password,
      });
      applyAuthResult(result);
      router.push("/home");
    },
    [applyAuthResult, config.apiBaseUrl, router],
  );

  const logout = useCallback(async () => {
    await fetch(`${config.apiBaseUrl}/api/auth/logout`, {
      credentials: "include",
      method: "POST",
    }).catch(() => undefined);
    clearAuthState();
    router.push("/login");
  }, [clearAuthState, config.apiBaseUrl, router]);

  const logoutAll = useCallback(async () => {
    await apiRequest("/api/auth/logout-all", z.void(), {
      method: "POST",
    }).catch(() => undefined);
    clearAuthState();
    router.push("/login");
  }, [apiRequest, clearAuthState, router]);

  useEffect(() => {
    void refreshSession().then((refreshed) => {
      if (!refreshed) {
        setStatus("anonymous");
      }
    });
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      apiRequest,
      login,
      logout,
      logoutAll,
      refreshSession,
      register,
      setUser: setUserState,
      status,
      user,
    }),
    [apiRequest, login, logout, logoutAll, refreshSession, register, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

async function unauthenticatedRequest(
  apiBaseUrl: string,
  path: string,
  body: unknown,
): Promise<AuthTokensResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(parseApiError(payload));
  }

  return AuthTokensResponseSchema.parse(payload);
}

export async function requestWithAuth<ResponseSchema extends z.ZodType>(data: {
  accessToken: () => string | null;
  apiBaseUrl: string;
  options: ApiRequestOptions;
  path: string;
  refreshSession: () => Promise<boolean>;
  schema: ResponseSchema;
  setAccessToken: (token: string | null) => void;
  setUser: (user: SafeUser | null) => void;
}): Promise<z.infer<ResponseSchema>> {
  const response = await sendApiRequest(data);

  if (response.status !== 401 || data.options.auth === false) {
    return parseApiResponse(response, data.schema);
  }

  const refreshed = await data.refreshSession();

  if (!refreshed) {
    data.setAccessToken(null);
    data.setUser(null);
    throw new Error("Authentication required");
  }

  return parseApiResponse(await sendApiRequest(data), data.schema);
}

async function sendApiRequest<ResponseSchema extends z.ZodType>(data: {
  accessToken: () => string | null;
  apiBaseUrl: string;
  options: ApiRequestOptions;
  path: string;
  refreshSession: () => Promise<boolean>;
  schema: ResponseSchema;
  setAccessToken: (token: string | null) => void;
  setUser: (user: SafeUser | null) => void;
}): Promise<Response> {
  const headers = new Headers();

  if (data.options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const accessToken = data.accessToken();

  if (data.options.auth !== false && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(`${data.apiBaseUrl}${data.path}`, {
    body: data.options.body === undefined ? undefined : JSON.stringify(data.options.body),
    credentials: "include",
    headers,
    method: data.options.method ?? "GET",
  });
}

async function parseApiResponse<ResponseSchema extends z.ZodType>(
  response: Response,
  schema: ResponseSchema,
): Promise<z.infer<ResponseSchema>> {
  if (response.status === 204) {
    return schema.parse(undefined);
  }

  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(parseApiError(payload));
  }

  return schema.parse(payload);
}

function parseApiError(payload: unknown): string {
  const parsed = ApiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error.message : "Request failed";
}
