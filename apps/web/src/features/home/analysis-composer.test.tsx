import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisComposer } from "./analysis-composer";

const apiRequestMock = vi.hoisted(() => vi.fn());
const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const projectsApiMock = vi.hoisted(() => ({
  completeUpload: vi.fn(),
  createAnalysis: vi.fn(),
  createKnowledgeBase: vi.fn(),
  createProject: vi.fn(),
  createUploadIntent: vi.fn(),
  fetchBillingUsage: vi.fn(),
  fetchDocuments: vi.fn(),
  fetchKnowledgeBases: vi.fn(),
  fetchProjects: vi.fn(),
  runAnalysis: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ apiRequest: apiRequestMock, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/features/projects/projects-api", () => projectsApiMock);

describe("AnalysisComposer", () => {
  beforeEach(() => {
    localStorage.clear();
    apiRequestMock.mockReset();
    routerMock.push.mockReset();
    Object.values(projectsApiMock).forEach((mock) => mock.mockReset());
    projectsApiMock.fetchBillingUsage.mockResolvedValue({
      limits: { externalResearchAvailable: false },
    });
    projectsApiMock.fetchKnowledgeBases.mockResolvedValue([]);
    projectsApiMock.fetchDocuments.mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it("keeps the primary action disabled until a question is provided", () => {
    projectsApiMock.fetchProjects.mockResolvedValue({ data: [], meta: {} });
    renderWithQuery(<AnalysisComposer />);
    expect(screen.getByRole("button", { name: /analyze decision/i })).toBeDisabled();
  });

  it("keeps Advanced closed by default and lets a new user create a project inline", async () => {
    projectsApiMock.fetchProjects.mockResolvedValue({ data: [], meta: {} });
    renderWithQuery(<AnalysisComposer />);
    expect(screen.getByText("Advanced").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(await screen.findByRole("button", { name: /create project/i }));
    expect(screen.getByLabelText(/name this project/i)).toBeInTheDocument();
  });

  it("submits the saved question with the existing auto preset", async () => {
    const project = { id: "project-1", name: "Market entry", role: "OWNER" };
    projectsApiMock.fetchProjects.mockResolvedValue({ data: [project], meta: {} });
    projectsApiMock.createKnowledgeBase.mockResolvedValue({ id: "base-1" });
    projectsApiMock.createAnalysis.mockResolvedValue({ id: "analysis-1" });
    projectsApiMock.runAnalysis.mockResolvedValue({ id: "run-1" });
    renderWithQuery(<AnalysisComposer />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveDisplayValue(/market entry/i));
    const input = screen.getByLabelText(/what decision/i);
    fireEvent.change(input, { target: { value: "Should we expand?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(projectsApiMock.createAnalysis).toHaveBeenCalledWith(
        apiRequestMock,
        "project-1",
        expect.objectContaining({
          decisionQuestion: "Should we expand?",
          evidenceMode: "INTERNAL_ONLY",
          mode: "MULTI_AGENT",
        }),
      );
    });
    expect(projectsApiMock.runAnalysis).toHaveBeenCalledWith(
      apiRequestMock,
      "project-1",
      "analysis-1",
    );
  });

  it("does not submit when Shift+Enter adds a new line", async () => {
    projectsApiMock.fetchProjects.mockResolvedValue({ data: [], meta: {} });
    renderWithQuery(<AnalysisComposer />);
    const input = screen.getByLabelText(/what decision/i);
    fireEvent.change(input, { target: { value: "Should we expand?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    await waitFor(() => expect(screen.getByDisplayValue("Should we expand?")).toBeInTheDocument());
    expect(projectsApiMock.createAnalysis).not.toHaveBeenCalled();
  });

  it("restores a locally saved draft after reload", async () => {
    localStorage.setItem(
      "dip:analysis-composer-draft",
      JSON.stringify({
        ...{
          documentIds: [],
          mode: "AUTO",
          projectId: null,
          useAllSources: true,
          useWebResearch: false,
        },
        question: "Saved decision",
      }),
    );
    projectsApiMock.fetchProjects.mockResolvedValue({ data: [], meta: {} });
    renderWithQuery(<AnalysisComposer />);
    expect(await screen.findByDisplayValue("Saved decision")).toBeInTheDocument();
  });
});

function renderWithQuery(children: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>,
  );
}
