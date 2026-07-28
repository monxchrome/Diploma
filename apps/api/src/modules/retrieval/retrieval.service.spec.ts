import { describe, expect, it, vi } from "vitest";

import { RetrievalService } from "./retrieval.service";

describe("RetrievalService", () => {
  it("adds the protected project id only on the server request", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      citations: [],
      evidence: [],
      insufficientEvidence: false,
      normalizedQuery: "contract",
      timingsMs: {},
    });
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: "20335a03-971b-4c8e-bb92-c20c7651af2f" }),
      },
      retrievalRun: {
        create: vi.fn().mockResolvedValue({ id: "e3d9a5f0-5ced-4a27-8b6a-ec58b4daa044" }),
      },
    };
    const service = new RetrievalService(prisma as never, { retrieve } as never);
    await service.search({
      body: { query: "contract" },
      projectId: "20335a03-971b-4c8e-bb92-c20c7651af2f",
      requestId: "test",
      userId: "37bb419e-9af2-48a0-8be8-c4f5189e215e",
    });
    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "20335a03-971b-4c8e-bb92-c20c7651af2f" }),
    );
  });
});
