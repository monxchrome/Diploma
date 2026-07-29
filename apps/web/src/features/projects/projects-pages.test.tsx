import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisRunViewPage } from "./analysis-detail-page";
import { NewProjectPage } from "./project-form-page";
import { ProjectsListPage } from "./projects-list-page";

const apiRequestMock = vi.hoisted(() => vi.fn());
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));
const projectsApiMock = vi.hoisted(() => ({
  archiveProject: vi.fn(),
  createProject: vi.fn(),
  fetchAnalysis: vi.fn(),
  fetchProjects: vi.fn(),
  runAnalysis: vi.fn(),
  restoreProject: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    apiRequest: apiRequestMock,
    status: "authenticated",
  }),
}));

vi.mock("@/features/shell/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("./projects-api", () => projectsApiMock);

describe("project pages", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    routerMock.push.mockReset();
    projectsApiMock.archiveProject.mockReset();
    projectsApiMock.createProject.mockReset();
    projectsApiMock.fetchAnalysis.mockReset();
    projectsApiMock.fetchProjects.mockReset();
    projectsApiMock.restoreProject.mockReset();
    projectsApiMock.runAnalysis.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the projects empty state", async () => {
    projectsApiMock.fetchProjects.mockResolvedValue({
      data: [],
      meta: {
        limit: 20,
        page: 1,
        total: 0,
        totalPages: 0,
      },
    });

    renderWithQuery(<ProjectsListPage />);

    expect(await screen.findByText("No projects match this view.")).toBeInTheDocument();
  });

  it("renders projects loading and error states", async () => {
    projectsApiMock.fetchProjects.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderWithQuery(<ProjectsListPage />);

    expect(screen.getByRole("status", { name: /loading projects/i })).toBeInTheDocument();
    unmount();

    projectsApiMock.fetchProjects.mockRejectedValue(new Error("boom"));
    renderWithQuery(<ProjectsListPage />);

    expect(await screen.findByText("Unable to load projects")).toBeInTheDocument();
  });

  it("submits the create project flow", async () => {
    projectsApiMock.createProject.mockResolvedValue({
      archivedAt: null,
      createdAt: new Date().toISOString(),
      description: null,
      id: "00000000-0000-4000-8000-000000000010",
      name: "Plan",
      ownerId: "00000000-0000-4000-8000-000000000001",
      role: "OWNER",
      settings: {},
      updatedAt: new Date().toISOString(),
    });

    renderWithQuery(<NewProjectPage />);
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: {
        value: "Plan",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() => {
      expect(projectsApiMock.createProject).toHaveBeenCalledWith(
        apiRequestMock,
        expect.objectContaining({
          name: "Plan",
        }),
      );
    });
    expect(routerMock.push).toHaveBeenCalledWith("/projects/00000000-0000-4000-8000-000000000010");
  });

  it("shows a prominent warning for a report that failed the quality gate", async () => {
    const timestamp = new Date().toISOString();
    projectsApiMock.fetchAnalysis.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000020",
      projectId: "00000000-0000-4000-8000-000000000010",
      title: "Spain expansion",
      decisionQuestion: "Should we expand?",
      objectives: [],
      constraints: [],
      assumptions: [],
      timeHorizon: null,
      targetMarket: "Spain",
      currency: "EUR",
      knowledgeBaseIds: [],
      documentIds: [],
      mode: "MULTI_AGENT",
      requestedSpecialists: [],
      additionalContext: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      runs: [
        {
          id: "00000000-0000-4000-8000-000000000030",
          status: "COMPLETED_WITH_LIMITATIONS",
          progress: 100,
          currentStage: "finalize_report",
          errorMessage: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          startedAt: timestamp,
          completedAt: timestamp,
          agentRuns: [],
          report: {
            citations: [],
            report: {
              recommendation: "Use staged expansion.",
              executiveSummary: "Quality remains below the configured threshold.",
              sections: [],
              qualityScore: 0.25,
              groundingScore: 1,
              insufficientEvidence: true,
              qualityGatePassed: false,
              limitations: ["Quality 0.25 is below the configured minimum 0.70."],
            },
          },
        },
      ],
    });

    renderWithQuery(
      <AnalysisRunViewPage
        analysisId="00000000-0000-4000-8000-000000000020"
        projectId="00000000-0000-4000-8000-000000000010"
        view="report"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Quality gate warning");
    expect(screen.getByText("Completed with limitations")).toBeInTheDocument();
    expect(screen.getByText("Quality: 25%")).toBeInTheDocument();
  });
});

function renderWithQuery(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}
