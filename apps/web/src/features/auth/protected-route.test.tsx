import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "./protected-route";

const authMock = vi.hoisted(() => ({
  status: "anonymous",
}));

const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => authMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => routerMock,
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    authMock.status = "anonymous";
    routerMock.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects anonymous users to login", async () => {
    render(
      <ProtectedRoute>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith("/login?next=%2Fprojects");
    });
  });

  it("renders children for authenticated users", () => {
    authMock.status = "authenticated";

    render(
      <ProtectedRoute>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Secret")).toBeInTheDocument();
  });
});
