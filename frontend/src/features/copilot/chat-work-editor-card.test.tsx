import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  ChatWorkEditorCard,
  saveWorkEditorCandidate,
} from "./chat-work-editor-card";
import { articleDocument } from "@creatoros/contract";
const api = vi.hoisted(() => ({
  createArticleVersion: vi.fn(),
  getArticleVersion: vi.fn(),
  getArticle: vi.fn(),
}));
// Only owner/component port boundaries; native rendering and real CAS are separate integration checks.
vi.mock("@/lib/creation-workspace-scope", () => ({
  useCreationClient: () => api,
  useCreationScope: () => ({ groupId: "g", accountId: null }),
  creationScopeKey: () => "group:g",
}));
vi.mock("@/features/reference-editors/noterelay/noterelay-editor", () => ({
  NoteRelayEditor: (props: any) => {
    React.useEffect(() => {
      props.onPreviewReady?.({ pageCount: 1, pageIndex: 0 });
    }, []);
    return (
      <div
        data-testid="preview"
        data-readonly={String(props.readOnlyCandidate)}
      >
        {props.value.title}
      </div>
    );
  },
}));
const document = articleDocument.parse({
  schemaVersion: 1,
  title: "候选标题",
  summary: "",
  sections: [
    {
      sectionId: "section-real",
      order: 0,
      heading: "标题",
      headingLevel: 2,
      body: "保留完整正文",
      sourceRefs: [
        {
          kind: "project_script",
          id: "script-real",
          versionId: "script-version",
        },
      ],
    },
  ],
  factItems: [],
  visualBriefs: [],
  imageUses: [],
});
const result: any = {
  kind: "work.editor.candidate",
  schemaVersion: 1,
  target: {
    schemaVersion: 1,
    projectId: "p",
    outputId: "article-real",
    owner: "wechat_article",
    contentType: "article",
    savedBase: {
      kind: "artifact",
      artifactId: "artifact-real",
      versionId: "base-real",
    },
    documentDigest: "sha256:" + "a".repeat(64),
    selection: { kind: "article_sections", sectionIds: ["section-real"] },
  },
  base: {
    kind: "artifact",
    artifactId: "artifact-real",
    versionId: "base-real",
  },
  baseDigest: "sha256:" + "a".repeat(64),
  candidateDigest: "sha256:" + "b".repeat(64),
  summary: "修改标题",
  candidate: { kind: "article", document },
  changes: [
    {
      path: "title",
      objectId: "article-real",
      label: "标题",
      before: "原题",
      after: "候选标题",
    },
  ],
  apply: {
    operation: "createArticleVersion",
    outputId: "article-real",
    body: { expectedCurrentVersionId: "base-real", document },
  },
  imageRequest: null,
  failureCode: null,
  error: null,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("收起候选不装重预览；实际预览就绪后才可采用，完整document和真实CAS基准保真", async () => {
  api.createArticleVersion.mockResolvedValue({ versionId: "saved-real" });
  api.getArticleVersion.mockResolvedValue({
    versionId: "saved-real",
    document,
  });
  api.getArticle.mockResolvedValue({
    currentVersionId: "saved-real",
    current: document,
  });
  render(<ChatWorkEditorCard result={result} toolCallId="tool-real" />);
  expect(screen.queryByTestId("preview")).toBeNull();
  expect(screen.getByRole("button", { name: "采纳到当前作品" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "预览改动" }));
  expect(await screen.findByRole('dialog',{name:'文章改动预览'})).toBeVisible();
  expect(screen.getByTestId("preview")).toHaveAttribute(
    "data-readonly",
    "true",
  );
  expect(api.createArticleVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button',{name:'采纳到当前作品'})).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "采纳到当前作品" }));
  await screen.findByText("已保存并采用。可继续微调。");
  expect(api.createArticleVersion.mock.calls[0][0]).toMatchObject({
    params: { outputId: "article-real" },
    body: {
      expectedCurrentVersionId: "base-real",
      document,
      clientRequestId: expect.stringMatching(/^sha256:/),
    },
  });
});
it("原owner回执丢失重放同body/key，current漂移只报告已保存未同步", async () => {
  const owner = {
    createArticleVersion: vi
      .fn()
      .mockRejectedValueOnce(Error("响应未知"))
      .mockResolvedValue({ versionId: "saved-real" }),
    getArticleVersion: vi
      .fn()
      .mockResolvedValue({ versionId: "saved-real", document }),
    getArticle: vi
      .fn()
      .mockResolvedValue({
        currentVersionId: "later-real",
        current: { ...document, title: "后来的稿" },
      }),
  };
  await expect(
    saveWorkEditorCandidate(owner, result, "stable-request"),
  ).rejects.toThrow("响应未知");
  const restored = await saveWorkEditorCandidate(
    owner,
    result,
    "stable-request",
  );
  expect(owner.createArticleVersion.mock.calls[1][0]).toEqual(
    owner.createArticleVersion.mock.calls[0][0],
  );
  expect(restored.currentMatches).toBe(false);
  expect(restored.exact.document.sections[0].sourceRefs).toEqual(
    document.sections[0].sourceRefs,
  );
});
