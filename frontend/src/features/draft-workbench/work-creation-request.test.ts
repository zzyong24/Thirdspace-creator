import { it, expect, vi } from "vitest";
import { prepareWorkCreationRequest } from "./work-creation-request";
it("组合中途未知只恢复原请求/body，明确两真实成员而不是first output", async () => {
  const source = {
    kind: "project_script",
    id: "script-real",
    versionId: "script-version",
  };
  const current = {
    compositionId: "comp-real",
    projectId: "p",
    currentRevision: 1,
    current: { members: [] },
    memberCurrent: [],
  };
  const state: any = {
    clientRequestId: "request-original",
    projectId: "p",
    source,
  };
  let lost = true;
  const c: any = {
    createWorkComposition: vi.fn(async () => ({ composition: current })),
    createWorkCompositionMember: vi.fn(async ({ body }: any) => {
      if (body.memberInput.kind === "article" && lost) {
        lost = false;
        throw Error("unknown");
      }
      const kind = body.memberInput.kind;
      const outputId = kind + "-real";
      current.currentRevision++;
      current.current.members.push({ member: { kind, outputId } } as never);
      current.memberCurrent.push({
        availability: "available",
        member: { kind, outputId },
        currentVersion: {
          kind: "artifact",
          artifactId: kind + "-artifact",
          versionId: kind + "-base",
        },
      } as never);
      return { composition: structuredClone(current) };
    }),
    getWorkComposition: vi.fn(async () => structuredClone(current)),
    getWorkCompositionMemberReservation: vi.fn(async () => ({
      status: "reserved",
    })),
  };
  await expect(prepareWorkCreationRequest(c, state, () => {})).rejects.toThrow(
    "unknown",
  );
  const body = c.createWorkCompositionMember.mock.calls[0][0].body;
  const result = await prepareWorkCreationRequest(c, state, () => {});
  expect(c.createWorkComposition).toHaveBeenCalledTimes(1);
  expect(c.createWorkCompositionMember.mock.calls[1][0].body).toEqual(body);
  expect(result).toMatchObject({
    compositionId: "comp-real",
    articleMember: {
      outputId: "article-real",
      artifactId: "article-artifact",
      baseVersionId: "article-base",
    },
    graphicMember: { outputId: "image-real" },
    scriptSourceRef: source,
  });
});
