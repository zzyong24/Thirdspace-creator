import * as React from "react";
import { act, render, cleanup } from "@testing-library/react";
import { it, expect, afterEach } from "vitest";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "./draft-chat-request";
let api: ReturnType<typeof useDraftChatRequest>;
function Consumer() {
  api = useDraftChatRequest();
  return null;
}
afterEach(cleanup);
it("编辑器注册令牌防止旧卸载清除新端口，并在等待保存期间核对generation", async () => {
  render(
    <DraftChatRequestProvider>
      <Consumer />
    </DraftChatRequestProvider>,
  );
  let generation = 1;
  let done: () => void = () => {};
  const target = {
    schemaVersion: 1,
    projectId: "p",
    outputId: "o",
    owner: "wechat_article",
    contentType: "article",
    savedBase: { kind: "artifact", artifactId: "a", versionId: "v" },
    documentDigest: "sha256:" + "a".repeat(64),
    selection: { kind: "article" },
  };
  const port = {
    readState: () => ({ target, generation, dirty: false }),
    prepareForTurn: () =>
      new Promise<any>((r) => {
        done = () => r(target);
      }),
    previewCandidate: async () => null,
    adoptCandidate: async () => ({ status: "saved-not-synced" }),
  };
  const old = api.registerEditor(port as any);
  const fresh = api.registerEditor(port as any);
  old();
  let pending!: Promise<unknown>;
  act(() => {
    pending = api.prepareEditorTurn();
  });
  const rejected = expect(pending).rejects.toThrow(/改变/);
  generation++;
  await act(async () => done());
  await rejected;
  fresh();
  await expect(api.prepareEditorTurn()).resolves.toBeUndefined();
});
it("脚本严格端口未注册和旧token不得发送联合创作；方法稳定", async () => {
  render(
    <DraftChatRequestProvider>
      <Consumer />
    </DraftChatRequestProvider>,
  );
  const fn = api.prepareScriptForCreation;
  await expect(fn()).rejects.toThrow(/脚本/);
  let generation = 1;
  const ref = { kind: "project_script", id: "script-a", versionId: "script-v" };
  const old = api.registerScript({
    readState: () => ({ generation }),
    prepareForCreation: async () => ref,
  } as any);
  const fresh = api.registerScript({
    readState: () => ({ generation }),
    prepareForCreation: async () => ref,
  } as any);
  old();
  await expect(fn()).resolves.toEqual(ref);
  act(() => api.openChat({ prefill: "微调" }));
  expect(api.prepareScriptForCreation).toBe(fn);
  fresh();
});
