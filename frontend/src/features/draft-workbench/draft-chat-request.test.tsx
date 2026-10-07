import * as React from "react";
import { act, render, cleanup, screen } from "@testing-library/react";
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
it("刷新后原候选使用已加载作品身份预览和采纳，不要求再发送模型初始化target", async () => {
  render(<DraftChatRequestProvider><Consumer /></DraftChatRequestProvider>);
  let outputId = "o", prepared = 0, previews = 0, adoptions = 0;
  api.registerEditor({
    readState: () => ({ target: null, outputId, generation: 1, dirty: false }),
    prepareForTurn: async () => { prepared++; throw Error("本轮不能重新发送"); },
    previewCandidate: async () => { previews++; return {blob: new Blob(["预览"]), fileName: "候选.mp4"}; },
    adoptCandidate: async () => { adoptions++; return {status: "adopted"}; },
  } as any);
  const candidate: any = {kind: "work.editor.candidate", target: {outputId: "o"}};
  expect(await api.previewEditorCandidate(candidate)).toMatchObject({fileName: "候选.mp4"});
  expect(await api.adoptEditorCandidate(candidate, "原采纳请求")).toEqual({status: "adopted"});
  outputId = "other";
  expect(await api.previewEditorCandidate(candidate)).toBeNull();
  expect(await api.adoptEditorCandidate(candidate, "原采纳请求")).toBeNull();
  expect([prepared, previews, adoptions]).toEqual([0, 1, 1]);
});
it("首次严格读回成功后通知同栏当前作品，方法保持稳定且不改变generation", async () => {
  let target: any = null;
  const savedTarget = {
    schemaVersion: 1, projectId: "p", outputId: "o", owner: "wechat_article",
    contentType: "article", savedBase: { kind: "artifact", artifactId: "a", versionId: "v" },
    documentDigest: "sha256:" + "a".repeat(64), selection: { kind: "article" },
  };
  function CurrentWork() {
    const chat = useDraftChatRequest();
    return <p role="status">{chat.readEditorState()?.target?.contentType ?? "等待读回"}</p>;
  }
  render(<DraftChatRequestProvider><Consumer /><CurrentWork /></DraftChatRequestProvider>);
  const prepare = api.prepareEditorTurn;
  act(() => { api.registerEditor({
    readState: () => ({ target, generation: 1, dirty: false }),
    prepareForTurn: async () => { target = savedTarget; return target; },
    previewCandidate: async () => null,
    adoptCandidate: async () => ({ status: "adopted" }),
  }); });
  expect(screen.getByRole("status")).toHaveTextContent("等待读回");
  await act(async () => { expect(await prepare()).toEqual(savedTarget); });
  expect(screen.getByRole("status")).toHaveTextContent("article");
  expect(api.prepareEditorTurn).toBe(prepare);
  expect(api.readEditorState()?.generation).toBe(1);
});
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
