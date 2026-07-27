import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage, RegisterPage } from "./auth-pages";

const authMock = vi.hoisted(() => ({
  login: vi.fn<(email: string, password: string) => Promise<void>>(),
  register: vi.fn<(email: string, password: string, displayName: string) => Promise<void>>(),
  status: "anonymous",
}));

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => authMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

describe("auth pages", () => {
  beforeEach(() => {
    authMock.login.mockReset();
    authMock.register.mockReset();
    authMock.status = "anonymous";
    routerMock.push.mockReset();
    routerMock.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("validates the login form before submit", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    });
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it("validates the register form password policy", async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: {
        value: "Ada",
      },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: {
        value: "ada@example.com",
      },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: {
        value: "password",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Add an uppercase letter")).toBeInTheDocument();
    });
    expect(authMock.register).not.toHaveBeenCalled();
  });
});
