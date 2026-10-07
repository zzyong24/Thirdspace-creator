import {
  workCreationTarget,
  type WorkCreationTarget,
  type WorkCompositionResource,
} from "@creatoros/contract";
import type { CreationClient } from "@/lib/creation-workspace-scope";
import type { ScriptSourceRef } from "./draft-chat-request";
export type WorkCreationRequestState = {
  clientRequestId: string;
  projectId: string;
  source: ScriptSourceRef;
  compositionId?: string;
  createBody?: { projectId: string; title: string; clientRequestId: string };
  memberBodies?: Partial<
    Record<
      "article" | "image",
      Parameters<CreationClient["createWorkCompositionMember"]>[0]["body"]
    >
  >;
  completed?: boolean;
  creationTarget?: WorkCreationTarget;
  submission?: "preparing" | "not-submitted" | "submitted-unknown";
  prefill?: string;
};
/** Reversible UI reservation orchestration: each original owner request remains frozen. */
export async function prepareWorkCreationRequest(
  client: CreationClient,
  state: WorkCreationRequestState,
  persist: () => void,
): Promise<WorkCreationTarget> {
  let composition: WorkCompositionResource;
  if (!state.compositionId) {
    state.createBody ??= {
      projectId: state.projectId,
      title: "文章和图文",
      clientRequestId: state.clientRequestId,
    };
    persist();
    const created = await client.createWorkComposition({
      params: undefined,
      query: undefined,
      body: state.createBody,
    });
    state.compositionId = created.composition.compositionId;
    persist();
    composition = created.composition;
  } else
    composition = await client.getWorkComposition({
      params: { compositionId: state.compositionId },
      query: undefined,
      body: undefined,
    });
  if (composition.projectId !== state.projectId)
    throw Error("原组合不属于当前项目。");
  for (const kind of ["article", "image"] as const) {
    const member = composition.current.members.find(
      (row) => row.member.kind === kind,
    );
    if (member) continue;
    state.memberBodies ??= {};
    if (!state.memberBodies[kind]) {
      state.memberBodies[kind] = {
        expectedRevision: composition.currentRevision,
        clientRequestId: `${state.clientRequestId}:${kind}`,
        memberInput:
          kind === "article"
            ? {
                kind,
                title: "文章",
                targetPlatform: "wechatOfficialAccount",
                contentRole: null,
              }
            : { kind, title: "图文", targetPlatform: "xiaohongshu" },
      };
      persist();
    }
    const body = state.memberBodies[kind]!;
    const created = await client.createWorkCompositionMember({
      params: { compositionId: state.compositionId },
      query: undefined,
      body,
    });
    composition = created.composition;
  }
  composition = await client.getWorkComposition({
    params: { compositionId: state.compositionId },
    query: undefined,
    body: undefined,
  });
  function freeze(kind: "article" | "image") {
    const binding = composition.current.members.find(
      (row) => row.member.kind === kind,
    );
    if (!binding || binding.member.kind === "moments")
      throw Error("原组合成员尚未确认，请恢复原预约。");
    const outputId = binding.member.outputId;
    const current = composition.memberCurrent.find(
      (row) =>
        row.member.kind === kind &&
        "outputId" in row.member &&
        row.member.outputId === outputId,
    );
    if (
      !current ||
      current.availability !== "available" ||
      current.currentVersion.kind !== "artifact"
    )
      throw Error("原作品版本尚未读到，请恢复原预约。");
    return {
      kind,
      outputId: binding.member.outputId,
      artifactId: current.currentVersion.artifactId,
      baseVersionId: current.currentVersion.versionId,
    };
  }
  return workCreationTarget.parse({
    schemaVersion: 1,
    clientRequestId: state.clientRequestId,
    projectId: state.projectId,
    compositionId: state.compositionId,
    compositionRevision: composition.currentRevision,
    scriptSourceRef: state.source,
    scriptConfirmation: { confirmedBy: "user", source: "current-click" },
    articleMember: freeze("article"),
    graphicMember: freeze("image"),
  });
}
