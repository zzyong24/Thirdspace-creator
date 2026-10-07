import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { articleDocument, graphicPostDocument } from "@creatoros/contract";
import { ChatWorkCreationCard } from "./chat-work-creation-card";
const api = vi.hoisted(() => ({
  createArticleVersion: vi.fn(),
  getArticleVersion: vi.fn(),
  getArticle: vi.fn(),
  createGraphicPostVersion: vi.fn(),
  getGraphicPostVersion: vi.fn(),
  getGraphicPost: vi.fn(),
}));
// Only React/owner operation boundary; actual NoteRelay PNG/ZIP and owner service CAS remain integration evidence.
vi.mock("@/lib/creation-workspace-scope", () => ({
  useCreationClient: () => api,
  useCreationScope: () => ({ groupId: "g", accountId: null }),
  creationScopeKey: () => "group:g",
}));
vi.mock("@/features/reference-editors/noterelay/noterelay-editor", () => ({
  NoteRelayEditor: (props: any) => {
    React.useEffect(() => {
      props.onPreviewReady?.({ pageCount: 3, pageIndex: 0 });
    }, []);
    return (
      <div
        data-testid={props.platform + "-preview"}
        data-readonly={String(props.readOnlyCandidate)}
      >
        {props.value.title}
      </div>
    );
  },
}));
const source = {
  kind: "project_script",
  id: "script-real",
  versionId: "script-version",
};
const article = articleDocument.parse({
  schemaVersion: 1,
  title: "文章",
  summary: "",
  sections: [
    {
      sectionId: "s-real",
      order: 0,
      heading: "要点",
      headingLevel: 2,
      body: "同源文章正文",
      sourceRefs: [source],
    },
  ],
  factItems: [],
  visualBriefs: [],
  imageUses: [],
});
const graphic = graphicPostDocument.parse({
  schemaVersion: 1,
  title: "图文",
  body: "同源图文正文",
  summary: "",
  tags: [],
  sourceRefs: [source],
  imageUses: [],
  ruleSnapshotRef: null,
  cardBriefs: [
    {
      cardId: "card-real",
      title: "真实图卡",
      body: "图卡正文",
      sourceRefs: [source],
    },
  ],
});
const result = {
  kind: "work.creation.propose",
  schemaVersion: 1,
  target: {
    schemaVersion: 1,
    clientRequestId: "request-real",
    projectId: "p",
    compositionId: "composition-real",
    compositionRevision: 3,
    scriptSourceRef: source,
    scriptConfirmation: { confirmedBy: "user", source: "current-click" },
    articleMember: {
      kind: "article",
      outputId: "article-real",
      artifactId: "article-artifact",
      baseVersionId: "article-base",
    },
    graphicMember: {
      kind: "image",
      outputId: "image-real",
      artifactId: "graphic-artifact",
      baseVersionId: "graphic-base",
    },
  },
  targetDigest: "a".repeat(64),
  article,
  graphic,
  articleDigest: "b".repeat(64),
  graphicDigest: "c".repeat(64),
  scriptSourceRef: source,
  error: null,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("两候选分别预览/独立采纳：文章成功后图文未知不回滚；恢复同body/key而不冒充旧candidateId", async () => {
  api.createArticleVersion.mockResolvedValue({ versionId: "article-saved" });
  api.getArticleVersion.mockResolvedValue({
    versionId: "article-saved",
    document: article,
  });
  api.getArticle.mockResolvedValue({
    currentVersionId: "article-saved",
    current: article,
  });
  api.createGraphicPostVersion
    .mockRejectedValueOnce(Error("图文回执未知"))
    .mockResolvedValue({ versionId: "graphic-saved" });
  api.getGraphicPostVersion.mockResolvedValue({
    versionId: "graphic-saved",
    document: graphic,
  });
  api.getGraphicPost.mockResolvedValue({
    currentVersionId: "graphic-saved",
    current: graphic,
  });
  const { container } = render(
    <ChatWorkCreationCard result={result} toolCallId="tool-real" />,
  );
  const rows = container.querySelectorAll("article"),
    a = within(rows[0]),
    g = within(rows[1]);
  expect(a.getByRole("button", { name: "采纳文章" })).toBeDisabled();
  fireEvent.click(a.getByRole("button", { name: "预览候选" }));
  expect(await screen.findByRole('dialog',{name:'文章候选预览'})).toBeVisible();
  expect(screen.getByTestId('wechat-preview')).toHaveAttribute('data-readonly','true');
  expect(api.createArticleVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(g.getByRole("button", { name: "预览候选" }));
  expect(await screen.findByRole('dialog',{name:'图文候选预览'})).toBeVisible();
  expect(screen.getByTestId("rednote-preview")).toHaveAttribute(
    "data-readonly",
    "true",
  );
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(a.getByRole("button", { name: "采纳文章" })).not.toBeDisabled();
  fireEvent.click(a.getByRole("button", { name: "采纳文章" }));
  await a.findByRole("status");
  fireEvent.click(g.getByRole("button", { name: "采纳图文" }));
  await g.findByRole("alert");
  expect(a.getByRole("status")).toHaveTextContent("已保存");
  const original = api.createGraphicPostVersion.mock.calls[0][0];
  fireEvent.click(g.getByRole("button", { name: "恢复原采纳请求" }));
  await g.findByRole("status");
  expect(api.createGraphicPostVersion.mock.calls[1][0]).toEqual(original);
  expect(original.body).toMatchObject({
    expectedCurrentVersionId: "graphic-base",
    document: { sourceRefs: [source], cardBriefs: [{ cardId: "card-real" }] },
  });
  expect(original.body).not.toHaveProperty("candidateId");
  expect(a.getByRole("link", { name: "打开文章" })).toHaveAttribute(
    "href",
    "/projects/p/article?outputId=article-real",
  );
});
