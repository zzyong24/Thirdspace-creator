import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {articleTextCandidates} from "../../schema/articles";
import {accountGroups} from '../../schema/account-groups';
import {z} from 'zod';
import {articleCandidateSection} from '@creatoros/contract';
import {articleSection} from '@creatoros/contract';
import { describe, expect, it } from "vitest";
import { createDb, aiTasks,eq, type Db, articleAnchors, contentOutputs, artifacts, projects as projectRows } from "@creatoros/backend";
import type { RequestContext, ArticleCandidateProposal } from "@creatoros/contract";
import { createProjectRepository, createProjectsService } from "../projects";
import { createArtifactsService } from "../artifacts";
import { createArticlesService,type ArticlePeerPorts } from "./articles.service";
import { createArticleTextResultsService } from "./articles.text-results";

const now = "2026-09-30T12:00:00.000Z";
const ctx = (accountId: string): RequestContext => ({userId: "user", accountId, requestId: "req", source: "user"});
const proposal: ArticleCandidateProposal = {
  proposedTitle: "候选标题", proposedTitleSourceRefs: [], proposedSummary: "候选摘要", proposedSummarySourceRefs: [],
  proposedFactItems: [{id: "fact-1", text: "需确认的数值", sourceRefs: [], reviewState: "needs_confirmation"}],
  proposedSections: [articleCandidateSection.parse({op: "insert", sectionId: "s1", afterSectionId: null, order: 0, heading: "开头", body: "这是正文。", sourceRefs: []})],
  proposedVisualBriefs: [{sectionId: "s1", brief: "待配的示意图"}], sourceRefs: [],
};

async function fixture(assertAssetFile: (ctx: RequestContext, assetId: string, assetFileId: string, active: boolean) => Promise<void> = async () => {},
  resolveDocumentSource: (ctx: RequestContext, projectId: string, assetId: string, assetFileId: string) => Promise<{label: string; text: string} | null> = async () => null,
  extraPorts:Partial<ArticlePeerPorts>={}, beforeVersion:()=>Promise<void>=async()=>{}, store?:{db:Db;client:{close:()=>Promise<void>}}) {
  const opened = store ?? await createDb();
  const db = opened.db;
  let seq = 0;
  const deps = {now: () => now, nextId: (prefix: string) => `${prefix}-${++seq}`};
  const projects = (store: Db) => createProjectsService(createProjectRepository(store), deps);
  const artifactsFor = (store: Db) => { const actual = createArtifactsService({db: store, ...deps,
    assertProjectOwned: (c, id) => projects(store).getProject(c, id),
    resolveOutputProjectId: (c, id) => projects(store).getProjectIdByOutput(c, id),
  }); return {...actual, createVersion: async (...args:Parameters<typeof actual.createVersion>)=>{await beforeVersion();return actual.createVersion(...args);}}; };
  const results = new Map<string, {taskType: string; status: string; inputData: Record<string, unknown>; results: Array<{resultType: string; resultData: Record<string, unknown>}>}>();
  const service = createArticlesService(db, {...deps, projects, artifacts: artifactsFor,
    assertAssetFile,
    resolveDocumentSource,
    resolveSelectedBrand: async (c, versionId) => c.accountId === "a" && versionId === "brand-version-a"
      ? {profileId: "brand-profile-a", versionId, guidance: "明确选择的品牌样式"} : null,
    async submitGeneration(_c, input) {
      const id = `task-${++seq}`;
      results.set(id, {taskType: "wechat.article-draft", status: "awaiting_confirmation", inputData: input.inputData,
        results: [{resultType: "wechat_article_candidate", resultData: {proposal}}]});
      return {id, status: "queued"};
    },
    async readGeneration(_c, id) { const row = results.get(id); if (!row) throw new Error("no task"); return row; },
    ...extraPorts,
  });
  const project = await projects(db).createProject(ctx("a"), {title: "文章项目", brief: "说明一个方法", briefDetail: {targetPlatforms: ["wechatOfficialAccount"]}});
  return {opened, db, service, project, artifactsFor, projects, results};
}

describe("T-1023 公众号文章完整持久链", () => {
  it("封面独立于正文段落，新增文件走账号 Asset 核验与版本 CAS", async () => {
    const checked:string[]=[];
    const f=await fixture(async (c,assetId,fileId,active)=>{
      if(c.accountId!=="a"||assetId!=="cover-asset"||fileId!=="cover-file"||!active)throw new Error("cover not owned");
      checked.push(`${assetId}/${fileId}`);
    });
    try {
      const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"公众号文章",clientRequestId:"cover-output-001"});
      const initial=await f.service.getArticle(ctx("a"),output.id);
      expect(initial.current.coverImageUse).toBeNull();
      const document={...initial.current,coverImageUse:{assetId:"cover-asset",assetFileId:"cover-file",
        sourceKind:"generated" as const,reviewState:"selected" as const}};
      const saved=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,
        clientRequestId:"cover-version-001",document});
      expect(saved.document.coverImageUse).toMatchObject({assetId:"cover-asset"});
      expect(saved.document.sections).toEqual([]);
      expect(checked).toEqual(["cover-asset/cover-file"]);
      await expect(f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,
        clientRequestId:"cover-version-stale",document})).rejects.toThrow();
      await expect(f.service.createVersion(ctx("b"),output.id,{expectedCurrentVersionId:saved.versionId,
        clientRequestId:"cover-version-cross",document})).rejects.toThrow();
    } finally {await f.opened.client.close();}
  });
  it("单项标题、摘要和正文是真候选，跨账号拒读，采纳只改所选字段且旧版本 CAS", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "article-single-fields-001"});
      let seq = 0;
      const tasks = new Map<string, {taskType: string; status: string; inputData: Record<string, unknown>;
        results: Array<{resultType: string; resultData: Record<string, unknown>}>}>();
      const results = createArticleTextResultsService(f.db, {articles: f.service, projects: f.projects(f.db),
        now: () => now, nextId: prefix => `${prefix}-${++seq}`,
        submitGeneration: async (_c, input) => {
          const id = `article-field-${++seq}`;
          const kind = input.inputData.kind as "title" | "summary" | "body";
          tasks.set(id, {taskType: "wechat.article-text", status: "awaiting_confirmation", inputData: input.inputData,
            results: [{resultType: "wechat_article_text_candidate", resultData: {kind, value: `${kind} 生成值`}}]});
          return {id, status: "awaiting_confirmation"};
        },
        readGeneration: async (_c, id) => {const task = tasks.get(id); if (!task) throw new Error("missing task"); return task;},
      });
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const title = await results.generate(ctx("a"), {outputId: output.id, kind: "title", clientRequestId: "article-title-request-001"});
      expect(title.value).toBe("title 生成值");
      expect((await f.service.getArticle(ctx("a"), output.id)).currentVersionId).toBe(initial.currentVersionId);
      await expect(results.getCandidate(ctx("b"), title.candidateId)).rejects.toThrow();
      const savedTitle = await results.adopt(ctx("a"), {candidateId: title.candidateId, kind: "title",
        expectedCurrentVersionId: initial.currentVersionId, editedValue: "人工标题", clientRequestId: "article-adopt-title-001"});
      expect(savedTitle.document).toMatchObject({title: "人工标题", summary: "", sections: []});
      const summary = await results.generate(ctx("a"), {outputId: output.id, kind: "summary", clientRequestId: "article-summary-request-001"});
      await expect(results.adopt(ctx("a"), {candidateId: summary.candidateId, kind: "summary",
        expectedCurrentVersionId: initial.currentVersionId, editedValue: "错版", clientRequestId: "article-adopt-stale-001"}))
        .rejects.toMatchObject({code: "VERSION_CONFLICT"});
      const savedSummary = await results.adopt(ctx("a"), {candidateId: summary.candidateId, kind: "summary",
        expectedCurrentVersionId: savedTitle.versionId, editedValue: "人工摘要", clientRequestId: "article-adopt-summary-001"});
      expect(savedSummary.document).toMatchObject({title: "人工标题", summary: "人工摘要", sections: []});
      const body = await results.generate(ctx("a"), {outputId: output.id, kind: "body", clientRequestId: "article-body-request-001"});
      const savedBody = await results.adopt(ctx("a"), {candidateId: body.candidateId, kind: "body",
        expectedCurrentVersionId: savedSummary.versionId, editedValue: "人工正文", clientRequestId: "article-adopt-body-001"});
      expect(savedBody.document).toMatchObject({title: "人工标题", summary: "人工摘要", sections: [{body: "人工正文"}]});
    } finally { await f.opened.client.close(); }
  });
  it("文章 output 与空稿锚点原子创建、请求幂等，旧视频 output 仍可并存", async () => {
    const f = await fixture();
    try {
      const video = await f.projects(f.db).createOutput(ctx("a"), f.project.id, {title: "视频"});
      expect(video.contentType).toBe("video");
      const article = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-001"});
      expect(article.contentType).toBe("article");
      expect((await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-001"})).id).toBe(article.id);
      await expect(f.service.createOutput(ctx("a"), f.project.id, {title: "重复请求的新标题", clientRequestId: "create-article-001"})).rejects.toMatchObject({code:"ConflictError"});
      const read = await f.service.getArticle(ctx("a"), article.id);
      expect(read.current).toMatchObject({schemaVersion: 1, title: "", sections: []});
      expect(read.versions).toHaveLength(1);
      expect((await f.db.select().from(articleAnchors)).length).toBe(1);
      expect((await f.db.select().from(contentOutputs)).length).toBe(2);
      expect((await f.db.select().from(artifacts)).length).toBe(1);
      await expect(f.service.getArticle(ctx("b"), article.id)).rejects.toThrow();
    } finally { await f.opened.client.close(); }
  });

  it("候选生成不改当前稿；按用户选区采纳并保留历史，幂等和 stale CAS", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-002"});
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const generated = await f.service.generateCandidate(ctx("a"), output.id, "generate-article-001");
      expect((await f.service.getArticle(ctx("a"), output.id)).currentVersionId).toBe(initial.currentVersionId);
      const candidate = await f.service.getCandidate(ctx("a"), generated.candidateId);
      expect(candidate.proposedSections).toHaveLength(1);
      await expect(f.service.getCandidate(ctx("b"), generated.candidateId)).rejects.toThrow();
      const adopted = await f.service.adoptCandidate(ctx("a"), generated.candidateId, {
        expectedCurrentVersionId: initial.currentVersionId, selectedSectionIds: ["s1"], selectedMetadataFields: ["title", "summary", "factItems"], clientRequestId: "adopt-article-001",
      });
      expect(adopted.document).toMatchObject({title: "候选标题", sections: [{sectionId: "s1", body: "这是正文。"}], factItems: [{reviewState: "needs_confirmation"}]});
      expect((await f.service.getVersion(ctx("a"), output.id, initial.currentVersionId)).document.sections).toHaveLength(0);
      expect((await f.service.adoptCandidate(ctx("a"), generated.candidateId, {
        expectedCurrentVersionId: initial.currentVersionId, selectedSectionIds: ["s1"], selectedMetadataFields: ["title", "summary", "factItems"], clientRequestId: "adopt-article-001",
      })).versionId).toBe(adopted.versionId);
      await expect(f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "edit-article-001", document: adopted.document})).rejects.toThrow();
      const edited = await f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: adopted.versionId,
        clientRequestId: "edit-article-002", document: {...adopted.document, summary: "人工修改后的摘要"}});
      expect(edited.document.summary).toBe("人工修改后的摘要");
      expect((await f.service.getArticle(ctx("a"), output.id)).versions).toHaveLength(3);
    } finally { await f.opened.client.close(); }
  });

  it("跨账号不能改稿或采纳；无效选区和段落引用不能写入版本", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-003"});
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const task = await f.service.generateCandidate(ctx("a"), output.id, "generate-article-003");
      await expect(f.service.createVersion(ctx("b"), output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "foreign-edit", document: initial.current})).rejects.toThrow();
      await expect(f.service.adoptCandidate(ctx("b"), task.candidateId, {expectedCurrentVersionId: initial.currentVersionId,
        selectedSectionIds: ["s1"], selectedMetadataFields: [], clientRequestId: "foreign-adopt"})).rejects.toThrow();
      await expect(f.service.adoptCandidate(ctx("a"), task.candidateId, {expectedCurrentVersionId: initial.currentVersionId,
        selectedSectionIds: ["not-in-proposal"], selectedMetadataFields: [], clientRequestId: "bad-selection"})).rejects.toThrow();
      await expect(f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "bad-section", document: {...initial.current, sections: [articleSection.parse({sectionId: "s1", order: 3,
          heading: "无效顺序", body: "正文", sourceRefs: []})]}})).rejects.toThrow();
      expect((await f.service.getArticle(ctx("a"), output.id)).versions).toHaveLength(1);
    } finally { await f.opened.client.close(); }
  });

  it("既有配图失效仍允许编辑文字，但新配图必须是账号内可用文件", async () => {
    const calls: Array<{assetId: string; assetFileId: string; active: boolean}> = [];
    let available = true;
    const f = await fixture(async (_ctx, assetId, assetFileId, active) => {
      calls.push({assetId, assetFileId, active});
      if (!available) throw new Error("FILE_UNAVAILABLE");
    });
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-004"});
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const selected = await f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "select-image", document: {...initial.current,
          sections: [articleSection.parse({sectionId: "s1", order: 0, heading: "配图段", body: "初稿", sourceRefs: []})],
          imageUses: [{sectionId: "s1", assetId: "image-a", assetFileId: "file-a", sourceKind: "existing", reviewState: "selected"}]}});
      expect(calls).toEqual([{assetId: "image-a", assetFileId: "file-a", active: true}]);
      available = false;
      const edited = await f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: selected.versionId,
        clientRequestId: "edit-with-stale-image", document: {...selected.document,
          sections: selected.document.sections.map((section) => ({...section, body: "图片失效后仍能修改文字"}))}});
      expect(edited.document.sections[0]?.body).toBe("图片失效后仍能修改文字");
      await expect(f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: edited.versionId,
        clientRequestId: "select-unavailable-image", document: {...edited.document,
          imageUses: [{sectionId: "s1", assetId: "image-b", assetFileId: "file-b", sourceKind: "existing", reviewState: "selected"}]}})).rejects.toThrow("FILE_UNAVAILABLE");
      expect((await f.service.getArticle(ctx("a"), output.id)).versions).toHaveLength(3);
    } finally { await f.opened.client.close(); }
  });

  it("品牌只在显式选取当前账号版本后进入冻结任务输入", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-005"});
      const neutral = await f.service.generateCandidate(ctx("a"), output.id, "generate-neutral-005");
      expect((await f.service.getCandidate(ctx("a"), neutral.candidateId)).brandProfileVersionId).toBeNull();
      const branded = await f.service.generateCandidate(ctx("a"), output.id, "generate-branded-005", "brand-version-a");
      expect((await f.service.getCandidate(ctx("a"), branded.candidateId)).brandProfileVersionId).toBe("brand-version-a");
      expect(f.results.get(branded.taskId)?.inputData).toMatchObject({brandProfileVersionId: "brand-version-a",
        brandProfile: {profileId: "brand-profile-a", versionId: "brand-version-a", guidance: "明确选择的品牌样式"}});
      await expect(f.service.generateCandidate(ctx("a"), output.id, "generate-wrong-brand-005", "brand-version-b"))
        .rejects.toThrow("当前账号不可用");
      expect((await f.service.getArticle(ctx("a"), output.id)).versions).toHaveLength(1);
    } finally { await f.opened.client.close(); }
  });

  it("后续候选只落实选中段落与元数据，同锚点插入保留候选顺序", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-006"});
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const base = await f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "base-article-006", document: {...initial.current, title: "保留标题", summary: "保留摘要",
          sections: [articleSection.parse({sectionId: "s0", order: 0, heading: "旧段", body: "旧正文", sourceRefs: []})]}});
      const task = await f.service.generateCandidate(ctx("a"), output.id, "generate-article-006");
      const result = f.results.get(task.taskId)!;
      result.results[0]!.resultData.proposal = {...proposal, proposedTitle: "未选标题", proposedSummary: "选中摘要",
        proposedSections: [
          articleCandidateSection.parse({op: "replace", sectionId: "s0", afterSectionId: null, order: 0, heading: "替换段", body: "新正文", sourceRefs: []}),
          articleCandidateSection.parse({op: "insert", sectionId: "s1", afterSectionId: "s0", order: 1, heading: "插入一", body: "第一段", sourceRefs: []}),
          articleCandidateSection.parse({op: "insert", sectionId: "s2", afterSectionId: "s0", order: 2, heading: "插入二", body: "第二段", sourceRefs: []}),
        ], proposedVisualBriefs: []} satisfies ArticleCandidateProposal;
      const candidate = await f.service.getCandidate(ctx("a"), task.candidateId);
      const adopted = await f.service.adoptCandidate(ctx("a"), candidate.candidateId, {expectedCurrentVersionId: base.versionId,
        selectedSectionIds: ["s0", "s1", "s2"], selectedMetadataFields: ["summary"], clientRequestId: "adopt-article-006"});
      expect(adopted.document.title).toBe("保留标题");
      expect(adopted.document.summary).toBe("选中摘要");
      expect(adopted.document.sections.map(section => section.sectionId)).toEqual(["s0", "s1", "s2"]);
      expect(adopted.document.sections.map(section => section.body)).toEqual(["新正文", "第一段", "第二段"]);
      expect((await f.service.getVersion(ctx("a"), output.id, base.versionId)).document.sections[0]?.body).toBe("旧正文");
    } finally { await f.opened.client.close(); }
  });

  it("仅显式选择且关联本项目的可读文档版本进入冻结模型来源", async () => {
    const requested: Array<{projectId: string; assetId: string; assetFileId: string}> = [];
    const f = await fixture(async () => {}, async (c, projectId, assetId, assetFileId) => {
      requested.push({projectId, assetId, assetFileId});
      if (c.accountId !== "a" || projectId !== f.project.id || assetId !== "document-a" || assetFileId !== "file-v2") return null;
      return {label: "项目资料", text: "可核验的抽取正文"};
    });
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-007"});
      const neutral = await f.service.generateCandidate(ctx("a"), output.id, "generate-brief-only-007");
      expect(f.results.get(neutral.taskId)?.inputData.sourceRefs).toHaveLength(1);
      const selected = await f.service.generateCandidate(ctx("a"), output.id, "generate-source-007", undefined,
        [{assetId: "document-a", assetFileId: "file-v2"}]);
      expect(requested).toEqual([{projectId: f.project.id, assetId: "document-a", assetFileId: "file-v2"}]);
      expect(f.results.get(selected.taskId)?.inputData).toMatchObject({
        sourceRefs: [expect.any(Object), {kind: "asset", id: "document-a", versionId: "file-v2"}],
        sourceMaterials: [expect.any(Object), {ref: {kind: "asset", id: "document-a", versionId: "file-v2"},
          label: "项目资料", text: "可核验的抽取正文"}],
      });
      await expect(f.service.generateCandidate(ctx("a"), output.id, "generate-wrong-source-007", undefined,
        [{assetId: "another-project-document", assetFileId: "file-v2"}])).rejects.toThrow("不存在或未完成文本提取");
      await expect(f.service.generateCandidate(ctx("a"), output.id, "generate-duplicate-source-007", undefined,
        [{assetId: "document-a", assetFileId: "file-v2"}, {assetId: "document-a", assetFileId: "file-v2"}])).rejects.toThrow("重复");
    } finally { await f.opened.client.close(); }
  });

  it("Brief 更新后保留原位置旧引用仍可编辑，新增或采纳旧引用必须重新核验", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-008"});
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const oldRef = {kind: "project" as const, id: f.project.id, versionId: f.project.updatedAt};
      const saved = await f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "old-ref-008", document: {...initial.current, title: "旧标题", titleSourceRefs: [oldRef],
          sections: [articleSection.parse({sectionId: "s0", order: 0, heading: "旧段", body: "旧正文", sourceRefs: [oldRef]})]}});
      const newVersion = "2026-09-30T13:00:00.000Z";
      await f.db.update(projectRows).set({updatedAt: newVersion, brief: "已更新的 Brief"}).where(eq(projectRows.id, f.project.id));
      const edited = await f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: saved.versionId,
        clientRequestId: "edit-old-ref-008", document: {...saved.document, sections: saved.document.sections.map((section) => ({...section, body: "纯正文修改"}))}});
      expect(edited.document.sections[0]?.sourceRefs).toEqual([oldRef]);
      await expect(f.service.createVersion(ctx("a"), output.id, {expectedCurrentVersionId: edited.versionId,
        clientRequestId: "add-stale-ref-008", document: {...edited.document,
          sections: [...edited.document.sections, articleSection.parse({sectionId: "s1", order: 1, heading: "新增", body: "新段", sourceRefs: [oldRef]})]}}))
        .rejects.toThrow("项目引用版本已变化");
      const task = await f.service.generateCandidate(ctx("a"), output.id, "generate-after-brief-008");
      const result = f.results.get(task.taskId)!;
      result.results[0]!.resultData.proposal = {...proposal, proposedSections: [articleCandidateSection.parse({op: "replace", sectionId: "s0",
        afterSectionId: null, order: 0, heading: "候选替换", body: "新文", sourceRefs: [oldRef]})], proposedVisualBriefs: []};
      await expect(f.service.adoptCandidate(ctx("a"), task.candidateId, {expectedCurrentVersionId: edited.versionId,
        selectedSectionIds: ["s0"], selectedMetadataFields: [], clientRequestId: "adopt-stale-008"}))
        .rejects.toThrow("项目引用版本已变化");
      result.results[0]!.resultData.proposal = {...proposal, proposedSections: [articleCandidateSection.parse({op: "replace", sectionId: "s0",
        afterSectionId: null, order: 0, heading: "候选替换", body: "新文", sourceRefs: [{...oldRef, versionId: newVersion}]})], proposedVisualBriefs: []};
      // A distinct task models a new candidate; the previous result is immutable once read.
      const currentTask = await f.service.generateCandidate(ctx("a"), output.id, "generate-current-ref-008");
      f.results.get(currentTask.taskId)!.results[0]!.resultData.proposal = result.results[0]!.resultData.proposal;
      const adopted = await f.service.adoptCandidate(ctx("a"), currentTask.candidateId, {expectedCurrentVersionId: edited.versionId,
        selectedSectionIds: ["s0"], selectedMetadataFields: [], clientRequestId: "adopt-current-008"});
      expect(adopted.document.sections[0]?.sourceRefs).toEqual([{...oldRef, versionId: newVersion}]);
      expect(adopted.document.titleSourceRefs).toEqual([oldRef]);
    } finally { await f.opened.client.close(); }
  });

  it("采纳与手工保存的同键重放先读账号内回执，Brief 变化后仍返回原版且拒绝改参", async () => {
    const f = await fixture();
    try {
      const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "公众号文章", clientRequestId: "create-article-009"});
      const initial = await f.service.getArticle(ctx("a"), output.id);
      const oldRef = {kind: "project" as const, id: f.project.id, versionId: f.project.updatedAt};
      const manualInput = {expectedCurrentVersionId: initial.currentVersionId, clientRequestId: "manual-idempotent-009",
        document: {...initial.current, title: "手写标题", titleSourceRefs: [oldRef]}};
      const manual = await f.service.createVersion(ctx("a"), output.id, manualInput);
      const task = await f.service.generateCandidate(ctx("a"), output.id, "generate-idempotent-009");
      f.results.get(task.taskId)!.results[0]!.resultData.proposal = {...proposal, proposedSections: [{...proposal.proposedSections[0]!, sourceRefs: [oldRef]}]};
      const adoptInput = {expectedCurrentVersionId: manual.versionId, selectedSectionIds: ["s1"],
        selectedMetadataFields: [] as Array<"title" | "summary" | "factItems">, clientRequestId: "adopt-idempotent-009"};
      const adopted = await f.service.adoptCandidate(ctx("a"), task.candidateId, adoptInput);
      await f.db.update(projectRows).set({updatedAt: "2026-09-30T14:00:00.000Z", brief: "已更新的 Brief"})
        .where(eq(projectRows.id, f.project.id));
      expect((await f.service.adoptCandidate(ctx("a"), task.candidateId, adoptInput)).versionId).toBe(adopted.versionId);
      expect((await f.service.createVersion(ctx("a"), output.id, manualInput)).versionId).toBe(manual.versionId);
      await expect(f.service.adoptCandidate(ctx("a"), task.candidateId, {...adoptInput, selectedMetadataFields: ["title"]}))
        .rejects.toThrow("采纳来源与原请求不一致");
      await expect(f.service.createVersion(ctx("a"), output.id, {...manualInput, document: {...manualInput.document, title: "篡改标题"}}))
        .rejects.toThrow("采纳来源与原请求不一致");
      expect((await f.service.getArticle(ctx("a"), output.id)).versions).toHaveLength(3);
    } finally { await f.opened.client.close(); }
  });
});


async function singleTextFixture(duplicateSources = false) {
  const f = await fixture();
  let seq = 0;
  const tasks = new Map<string, {taskType: string; status: string; inputData: Record<string, unknown>;
    results: Array<{resultType: string; resultData: Record<string, unknown>}>}>();
  const results = createArticleTextResultsService(f.db, {articles: f.service, projects: f.projects(f.db),
    now: () => now, nextId: prefix => `${prefix}-${++seq}`,
    submitGeneration: async (_c, input) => {
      const id = `single-task-${++seq}`;
      const kind = input.inputData.kind as "title" | "summary" | "body";
      const refs = input.inputData.sourceRefs as Array<{kind: string; id: string; versionId: string}>;
      const ref = refs[0]!;
      const inputData = duplicateSources ? {...input.inputData, sourceRefs: [{versionId: ref.versionId, id: ref.id, kind: ref.kind}, ref]} : input.inputData;
      tasks.set(id, {taskType: "wechat.article-text", status: "awaiting_confirmation", inputData,
        results: [{resultType: "wechat_article_text_candidate", resultData: {kind, value: `${kind} 候选`}}]});
      return {id, status: "awaiting_confirmation"};
    },
    readGeneration: async (_c, id) => {const task = tasks.get(id); if (!task) throw new Error("missing task"); return task;},
  });
  const output = await f.service.createOutput(ctx("a"), f.project.id, {title: "文章", clientRequestId: "single-output-1031"});
  return {...f, results, output};
}

describe("T-1031 文章单项字段独立采纳", () => {
  it("同基准标题、摘要、正文依次采纳，并可重放每个历史请求", async () => {
    const f = await singleTextFixture();
    try {
      const initial = await f.service.getArticle(ctx("a"), f.output.id);
      const candidates = await Promise.all((["title", "summary", "body"] as const).map(kind =>
        f.results.generate(ctx("a"), {outputId: f.output.id, kind, clientRequestId: `generate-${kind}-1031`})));
      let versionId = initial.currentVersionId;
      const requests = [];
      for (let index = 0; index < candidates.length; index++) {
        const kind = (["title", "summary", "body"] as const)[index]!;
        const input = {candidateId: candidates[index]!.candidateId, kind, expectedCurrentVersionId: versionId,
          editedValue: `人工${kind}`, clientRequestId: `adopt-${kind}-1031`};
        const saved = await f.results.adopt(ctx("a"), input);
        requests.push({input, saved});
        versionId = saved.versionId;
      }
      const current = await f.service.getArticle(ctx("a"), f.output.id);
      expect(current.current).toMatchObject({title: "人工title", summary: "人工summary", sections: [{body: "人工body"}]});
      expect(current.current.sections[0]!.sourceRefs).toHaveLength(1);
      expect(current.versions).toHaveLength(4);
      for (const request of requests) {
        expect((await f.results.adopt(ctx("a"), request.input)).versionId).toBe(request.saved.versionId);
      }
      expect((await f.service.getArticle(ctx("a"), f.output.id)).versions).toHaveLength(4);
      await expect(f.results.adopt(ctx("a"), {...requests[0]!.input, editedValue: "篡改请求"})).rejects.toThrow();
    } finally {await f.opened.client.close();}
  });

  it("空正文首次采纳的段落 ID 在同请求回放时稳定", async () => {
    const f = await singleTextFixture();
    try {
      const initial = await f.service.getArticle(ctx("a"), f.output.id);
      const body = await f.results.generate(ctx("a"), {outputId: f.output.id, kind: "body", clientRequestId: "generate-empty-body-1031"});
      const input = {candidateId: body.candidateId, kind: "body" as const, expectedCurrentVersionId: initial.currentVersionId,
        editedValue: "正文", clientRequestId: "adopt-empty-body-1031"};
      const saved = await f.results.adopt(ctx("a"), input);
      const replay = await f.results.adopt(ctx("a"), input);
      expect(replay).toEqual(saved);
      expect((await f.service.getArticle(ctx("a"), f.output.id)).versions).toHaveLength(2);
    } finally {await f.opened.client.close();}
  });

  it.each(["title", "summary", "body"] as const)("%s 字段变化、旧 expected、跨账号不覆盖当前文章", async (kind) => {
    const f = await singleTextFixture();
    try {
      const initial = await f.service.getArticle(ctx("a"), f.output.id);
      const title = await f.results.generate(ctx("a"), {outputId: f.output.id, kind, clientRequestId: "generate-conflict-title-1031"});
      const edited = await f.service.createVersion(ctx("a"), f.output.id, {expectedCurrentVersionId: initial.currentVersionId,
        document: kind === "body" ? {...initial.current, sections: [articleSection.parse({sectionId: "manual-section", order: 0, heading: "", body: "已手工改正文", sourceRefs: []})]} : {...initial.current, [kind]: "已手工改字段"}, clientRequestId: "manual-title-1031"});
      const input = {candidateId: title.candidateId, kind, expectedCurrentVersionId: edited.versionId,
        editedValue: "生成标题", clientRequestId: "adopt-conflict-title-1031"};
      await expect(f.results.adopt(ctx("a"), input)).rejects.toThrow();
      await expect(f.results.adopt(ctx("a"), {...input, expectedCurrentVersionId: initial.currentVersionId})).rejects.toThrow();
      await expect(f.results.adopt(ctx("b"), input)).rejects.toThrow();
      const current = (await f.service.getArticle(ctx("a"), f.output.id)).current;
      expect(kind === "body" ? current.sections[0]?.body : current[kind]).toBe(kind === "body" ? "已手工改正文" : "已手工改字段");
      expect((await f.service.getArticle(ctx("a"), f.output.id)).versions).toHaveLength(2);
    } finally {await f.opened.client.close();}
  });
  it("相同真实 ID/版本的候选来源按字段去重，不受对象键序影响", async () => {
    const f = await singleTextFixture(true);
    try {
      const initial = await f.service.getArticle(ctx("a"), f.output.id);
      const title = await f.results.generate(ctx("a"), {outputId: f.output.id, kind: "title", clientRequestId: "generate-dedup-title-1031"});
      const saved = await f.results.adopt(ctx("a"), {candidateId: title.candidateId, kind: "title", expectedCurrentVersionId: initial.currentVersionId,
        editedValue: "来源标题", clientRequestId: "adopt-dedup-title-1031"});
      expect(saved.document.titleSourceRefs).toHaveLength(1);
    } finally {await f.opened.client.close();}
  });
});

describe("T-1043 结构候选逐项采用",()=>{
  it("先采用标题再采用正文，保留无关手工摘要；原请求刷新重放不新建版本",async()=>{
    const f=await fixture();
    try{
      const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"连续采用",clientRequestId:"partial-create"});
      const initial=await f.service.getArticle(ctx("a"),output.id);
      const task=await f.service.generateCandidate(ctx("a"),output.id,"partial-generate");
      const titleInput={expectedCurrentVersionId:initial.currentVersionId,selectedSectionIds:[],
        selectedMetadataFields:["title" as const],clientRequestId:"partial-title"};
      const title=await f.service.adoptCandidate(ctx("a"),task.candidateId,titleInput);
      const manual=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:title.versionId,
        clientRequestId:"partial-manual-summary",document:{...title.document,summary:"用户独立保存的摘要"}});
      const body=await f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:manual.versionId,
        selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"partial-body"});
      expect(body.document).toMatchObject({title:proposal.proposedTitle,summary:"用户独立保存的摘要",
        sections:[{sectionId:"s1",body:"这是正文。"}]});
      const before=await f.service.getArticle(ctx("a"),output.id);
      expect((await f.service.adoptCandidate(ctx("a"),task.candidateId,titleInput)).versionId).toBe(title.versionId);
      const after=await f.service.getArticle(ctx("a"),output.id);
      expect(after.currentVersionId).toBe(body.versionId);
      expect(after.versions).toHaveLength(before.versions.length);
    }finally{await f.opened.client.close();}
  });
  it.each([false,true])("同锚点段落分次采用仍按候选顺序，当前目标同字段修改会拒绝（逆序：%s）",async(reverse)=>{
    const f=await fixture();
    try{
      const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"分次插入",clientRequestId:"insert-create"});
      const initial=await f.service.getArticle(ctx("a"),output.id);
      const task=await f.service.generateCandidate(ctx("a"),output.id,"insert-generate");
      f.results.get(task.taskId)!.results[0]!.resultData.proposal={...proposal,proposedSections:[
        {...proposal.proposedSections[0]!,sectionId:"s1",heading:"先",body:"第一段"},
        {...proposal.proposedSections[0]!,sectionId:"s2",heading:"后",body:"第二段"}]};
      const first=await f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:initial.currentVersionId,
        selectedSectionIds:[reverse?"s2":"s1"],selectedMetadataFields:[],clientRequestId:"insert-first"});
      const second=await f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:first.versionId,
        selectedSectionIds:[reverse?"s1":"s2"],selectedMetadataFields:[],clientRequestId:"insert-second"});
      expect(second.document.sections.map(s=>s.sectionId)).toEqual(["s1","s2"]);
      const manual=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:second.versionId,
        clientRequestId:"insert-manual-title",document:{...second.document,title:"用户修改的标题"}});
      await expect(f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:manual.versionId,
        selectedSectionIds:[],selectedMetadataFields:["title"],clientRequestId:"insert-title-conflict"})).rejects.toThrow();
      expect((await f.service.getArticle(ctx("a"),output.id)).current.title).toBe("用户修改的标题");
    }finally{await f.opened.client.close();}
  });
});

it("T-1043 替换只写明确触点：保护修改后的视觉简报，保留当前段落位置",async()=>{
 const f=await fixture();
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"视觉简报保护",clientRequestId:"brief-create"});
  const initial=await f.service.getArticle(ctx("a"),output.id);
  const base=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,
   clientRequestId:"brief-base",document:{...initial.current,sections:[
    articleSection.parse({sectionId:"s1",order:0,heading:"旧",body:"原正文",sourceRefs:[]}),
    articleSection.parse({sectionId:"other",order:1,heading:"不动",body:"无关正文",sourceRefs:[]})],visualBriefs:[{sectionId:"s1",brief:"原简报"}]}});
  const task=await f.service.generateCandidate(ctx("a"),output.id,"brief-generate");
  f.results.get(task.taskId)!.results[0]!.resultData.proposal={...proposal,
   proposedSections:[{...proposal.proposedSections[0]!,op:"replace",body:"替换正文"}],
   proposedVisualBriefs:[{sectionId:"s1",brief:"候选简报"}]};
  const changed=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:base.versionId,
   clientRequestId:"brief-manual",document:{...base.document,visualBriefs:[{sectionId:"s1",brief:"用户独立修改的简报"}]}});
  await expect(f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:changed.versionId,
   selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"brief-reject"})).rejects.toThrow(/配图简报/);
  const moved=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:changed.versionId,
   clientRequestId:"brief-moved",document:{...base.document,summary:"保留摘要",
    sections:[{...base.document.sections[1]!,order:0},{...base.document.sections[0]!,order:1}]}});
  const adopted=await f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:moved.versionId,
   selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"brief-adopt"});
  expect(adopted.document.sections.map(section=>[section.sectionId,section.order,section.body]))
   .toEqual([["other",0,"无关正文"],["s1",1,"替换正文"]]);
  expect(adopted.document.summary).toBe("保留摘要");
  expect(adopted.document.visualBriefs).toEqual([{sectionId:"s1",brief:"候选简报"}]);
 }finally{await f.opened.client.close();}
});
it("T-1043 局部插入锚点已删除时不落到文首",async()=>{
 const f=await fixture();
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"插入锚点保护",clientRequestId:"anchor-create"});
  const initial=await f.service.getArticle(ctx("a"),output.id);
  const base=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,
   clientRequestId:"anchor-base",document:{...initial.current,sections:[articleSection.parse({sectionId:"anchor",order:0,heading:"锚点",body:"正文",sourceRefs:[]})]}});
  const task=await f.service.generateCandidate(ctx("a"),output.id,"anchor-generate");
  f.results.get(task.taskId)!.results[0]!.resultData.proposal={...proposal,
   proposedSections:[{...proposal.proposedSections[0]!,afterSectionId:"anchor"}]};
  const removed=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:base.versionId,
   clientRequestId:"anchor-delete",document:{...base.document,sections:[]}});
  await expect(f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:removed.versionId,
   selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"anchor-reject"})).rejects.toThrow(/锚点/);
  expect((await f.service.getArticle(ctx("a"),output.id)).currentVersionId).toBe(removed.versionId);
 }finally{await f.opened.client.close();}
});

it("文章单项标题文字未变但来源已变时，旧候选不能覆盖来源触点",async()=>{
 const f=await singleTextFixture();try{
  const initial=await f.service.getArticle(ctx("a"),f.output.id);
  const candidate=await f.results.generate(ctx("a"),{outputId:f.output.id,kind:"title",clientRequestId:"title-source-touch-generate"});
  const project=await f.projects(f.db).getProject(ctx("a"),f.project.id);
  const changed=await f.service.createVersion(ctx("a"),f.output.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"title-source-touch-change",
   document:{...initial.current,titleSourceRefs:[{kind:"project",id:project.id,versionId:project.updatedAt}]}});
  await expect(f.results.adopt(ctx("a"),{candidateId:candidate.candidateId,kind:"title",expectedCurrentVersionId:changed.versionId,
   editedValue:"旧候选标题",clientRequestId:"title-source-touch-adopt"})).rejects.toMatchObject({code:"VERSION_CONFLICT"});
  expect((await f.service.getArticle(ctx("a"),f.output.id)).currentVersionId).toBe(changed.versionId);
 }finally{await f.opened.client.close();}
});


it("文章转换沿原结构候选提交选区并恢复原任务，不采样今日背景",async()=>{
 const conversion={request:{sourceOutputId:"image",sourceVersionId:"image-v",targetType:"article" as const,mode:"whole" as const,clientRequestId:"article-convert-request",reuseImages:[]},
  sourceAnchor:{kind:"output_version" as const,sourceOutputId:"image",artifactId:"graphic",versionId:"image-v",sourceType:"image" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 let f:Awaited<ReturnType<typeof fixture>>,stored:{id:string;status:string;inputData:Record<string,unknown>}|null=null,resolved=0;
 f=await fixture(undefined,undefined,{
  findGenerationByAttempt:async()=>stored,
  resolveConversionSource:async()=>{resolved++;if(resolved>1)throw Error("不能重采样");return {projectId:f.project.id,sourceAnchor:conversion.sourceAnchor,
    content:{fields:{body:"仅冻结正文"},sections:[]},constraints:{factItems:[],sourceRefs:[],ruleSnapshotRef:null}};},
  submitGeneration:async(_c,input)=>{stored={id:"conversion-task",status:"queued",inputData:input.inputData};return {id:"conversion-task",status:"queued"};},
 } as Partial<ArticlePeerPorts>);
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"文章",clientRequestId:"conversion-article-output"});
  const first=await f.service.generateCandidate(ctx("a"),output.id,"stable-article-conversion",undefined,[],conversion);
  const frozenInput=(stored as {inputData:Record<string,unknown>}|null)?.inputData;
  expect(frozenInput?.sourceRefs).toEqual([conversion.sourceAnchor]);
  expect(JSON.stringify(frozenInput?.sourceMaterials)).toContain("仅冻结正文");
  expect(JSON.stringify(frozenInput?.sourceMaterials)).not.toContain("说明一个方法");
  await f.db.update(projectRows).set({brief:"今日已改背景"}).where(eq(projectRows.id,f.project.id));
  expect(await f.service.generateCandidate(ctx("a"),output.id,"stable-article-conversion",undefined,[],conversion)).toEqual(first);
  expect(resolved).toBe(1);
  await expect(f.service.generateCandidate(ctx("a"),output.id,"stable-article-conversion",undefined,[],{...conversion,request:{...conversion.request,reuseImages:[{assetId:"a",assetFileId:"f"}]}})).rejects.toThrow();
 }finally{await f.opened.client.close();}
});

it("模型省略所有引用仍不能绕过局部字段授权；合法采用由owner保留冻结来源",async()=>{
 const f=await fixture(undefined,undefined,{assertOutputVersionSource:async()=>{}});
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"文章",clientRequestId:"conversion-authority-output"});
  const initial=await f.service.getArticle(ctx("a"),output.id);
  const candidate=await f.service.generateCandidate(ctx("a"),output.id,"conversion-authority-task");
  const anchor={kind:"output_version" as const,sourceOutputId:"image",artifactId:"graphic",versionId:"image-v",sourceType:"image" as const,selectionDigest:"a".repeat(64),
   selection:{mode:"selected" as const,sourceSectionIds:[],sourceFields:["body" as const],textRanges:[]}};
  f.results.get(candidate.taskId)!.inputData.conversion={sourceAnchor:anchor,request:{sourceOutputId:"image",sourceVersionId:"image-v",targetType:"article",mode:"selected",
   sourceSectionIds:[],sourceFields:["body"],textRanges:[],targetFields:["title"],clientRequestId:"conversion-authority-request",reuseImages:[]}};
  const adopt={expectedCurrentVersionId:initial.currentVersionId,selectedSectionIds:["s1"],selectedMetadataFields:[] as Array<"title"|"summary"|"factItems">,clientRequestId:"conversion-authority-bad"};
  await expect(f.service.adoptCandidate(ctx("a"),candidate.candidateId,adopt)).rejects.toThrow("授权");
  expect((await f.service.getArticle(ctx("a"),output.id)).currentVersionId).toBe(initial.currentVersionId);
  const saved=await f.service.adoptCandidate(ctx("a"),candidate.candidateId,{...adopt,selectedSectionIds:[],selectedMetadataFields:["title"],clientRequestId:"conversion-authority-good"});
  expect(saved.document.titleSourceRefs).toEqual([anchor]);expect(saved.document.sections).toEqual([]);
 }finally{await f.opened.client.close();}
});

it("同一结构候选依次采用人工标题和人工段落，未采用字段与原提案保持",async()=>{
 const f=await fixture();try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"结构候选编辑",clientRequestId:"edited-structure-create"});
  const initial=await f.service.getArticle(ctx("a"),output.id);
  const generated=await f.service.generateCandidate(ctx("a"),output.id,"edited-structure-generation");
  const candidate=await f.service.getCandidate(ctx("a"),generated.candidateId);
  const titleInput={expectedCurrentVersionId:initial.currentVersionId,selectedSectionIds:[],selectedMetadataFields:["title" as const],clientRequestId:"edited-title-adoption",editedMetadata:{title:"人工修订标题"}};
  const title=await f.service.adoptCandidate(ctx("a"),candidate.candidateId,titleInput);
  expect(title.document).toMatchObject({title:"人工修订标题",summary:"",sections:[]});
  expect(await f.service.adoptCandidate(ctx("a"),candidate.candidateId,titleInput)).toEqual(title);
  await expect(f.service.adoptCandidate(ctx("a"),candidate.candidateId,{...titleInput,editedMetadata:{title:"同请求改值"}})).rejects.toThrow();
  const sections=candidate.proposedSections.map(s=>({...s,heading:"人工段落标题",body:"人工修订正文"}));
  await expect(f.service.adoptCandidate(ctx("a"),candidate.candidateId,{expectedCurrentVersionId:title.versionId,selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"edited-anchor-forgery",editedSections:sections.map(s=>({...s,afterSectionId:"forged"}))})).rejects.toThrow();
  const adopted=await f.service.adoptCandidate(ctx("a"),candidate.candidateId,{expectedCurrentVersionId:title.versionId,selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"edited-sections-adoption",editedSections:sections});
  expect(adopted.document).toMatchObject({title:"人工修订标题",summary:"",sections:[{sectionId:"s1",heading:"人工段落标题",body:"人工修订正文"}]});
  expect((await f.service.getCandidate(ctx("a"),candidate.candidateId)).proposedSections).toEqual(candidate.proposedSections);
 }finally{await f.opened.client.close();}
},20000);

it("结构候选轮询真实排队/运行状态，目标改稿后保持原基准且跨账号拒读",async()=>{
 const f=await fixture();try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"候选轮询",clientRequestId:"candidate-state-create"});
  const initial=await f.service.getArticle(ctx("a"),output.id);
  const generated=await f.service.generateCandidate(ctx("a"),output.id,"candidate-state-generation");
  const task=f.results.get(generated.taskId)!;task.status="queued";
  expect(await f.service.readCandidateState(ctx("a"),generated.candidateId)).toMatchObject({status:"queued",candidate:null,baseVersionId:initial.currentVersionId,errorCode:null});
  task.status="running";expect((await f.service.readCandidateState(ctx("a"),generated.candidateId)).status).toBe("running");
  await expect(f.service.readCandidateState(ctx("b"),generated.candidateId)).rejects.toThrow();
  await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,document:{...initial.current,summary:"后来人工摘要"},clientRequestId:"candidate-state-save"});
  task.status="awaiting_confirmation";
  expect(await f.service.readCandidateState(ctx("a"),generated.candidateId)).toMatchObject({status:"succeeded",baseVersionId:initial.currentVersionId,candidate:{candidateId:generated.candidateId,proposedSections:proposal.proposedSections}});
 }finally{await f.opened.client.close();}
},20000);

it("结构候选失败重试只提交原冻结输入，丢回执和重复请求找回原任务",async()=>{
 let f:Awaited<ReturnType<typeof fixture>>,retrySubmits=0;
 f=await fixture(undefined,undefined,{findGenerationByAttempt:async(_c,key)=>[...f.results.entries()].map(([id,t])=>({id,status:t.status,inputData:t.inputData})).find(t=>(t.inputData as {retryAttempt?:string}).retryAttempt===key)??null});
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"结构失败重试",clientRequestId:"structure-retry-create"});
  const original=await f.service.generateCandidate(ctx("a"),output.id,"structure-retry-generate");
  const task=f.results.get(original.taskId)!;task.status="failed";
  const oldInput=structuredClone(task.inputData);
  // retry attempt 身份在原 task owner 的独立回执中，不混入模型输入。
  const receipts=new Map<string,{id:string;status:string;inputData:Record<string,unknown>;retryOfTaskId?:string}>();
  const articles=createArticlesService(f.db,{now:()=>now,nextId:p=>`${p}-retry`,projects:f.projects,artifacts:f.artifactsFor,assertAssetFile:async()=>{},resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,
    findGenerationByAttempt:async(_c,key)=>receipts.get(key)??null,
    readGeneration:async(_c,id)=>{const row=f.results.get(id);if(!row)throw Error("原任务不存在");return row;},
    submitGeneration:async(_c,input)=>{retrySubmits++;const id="structure-retried-task";receipts.set(input.attemptId,{id,status:"queued",inputData:structuredClone(input.inputData),retryOfTaskId:input.retryOfTaskId});f.results.set(id,{taskType:"wechat.article-draft",status:"queued",inputData:input.inputData,results:[]});expect(input.retryOfTaskId).toBe(original.taskId);expect(input.inputData).toEqual(oldInput);throw Error("已提交但回执丢失");}});
  const initial=await articles.getArticle(ctx("a"),output.id);
  await articles.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"structure-retry-unrelated-save",document:{...initial.current,summary:"重试前人工摘要"}});
  const retried=await articles.retryFrozenCandidate(ctx("a"),original.taskId,"structure-retry-attempt");
  expect(retried).toMatchObject({candidateId:"structure-retried-task",taskId:"structure-retried-task",baseVersionId:initial.currentVersionId,status:"queued"});
  expect(await articles.retryFrozenCandidate(ctx("a"),original.taskId,"structure-retry-attempt")).toEqual(retried);expect(retrySubmits).toBe(1);
  await expect(articles.retryFrozenCandidate(ctx("b"),original.taskId,"structure-retry-cross")).rejects.toThrow();
 }finally{await f.opened.client.close();}
},20000);
it("已绑定真实持久执行的结构重试恢复原任务，丢回复沿原控制回执，不复制预算",async()=>{
 const f=await fixture();let serial=0,submits=0;
 const {createPersistentTaskService}=await import("../execution/persistent-task.service");
 const execution=createPersistentTaskService(f.db,{now:()=>now,nextId:p=>`${p}-article-control-${++serial}`});
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"原执行结构重试",clientRequestId:"bound-structure-create"});
  const original=await f.service.generateCandidate(ctx("a"),output.id,"bound-structure-generate");
  const frozen=f.results.get(original.taskId)!;
  const task=await execution.enqueue(ctx("a"),{kind:"ai_task",ownerType:"ai_task",ownerId:original.taskId,idempotencyKey:"bound-original-execution",payload:{modelInput:{kind:"model.structured",input:frozen.inputData}},maxAttempts:3});
  const claim=await execution.claimNext({workerId:"article-worker"});if(!claim)throw Error("没有原执行");
  await execution.finish({taskId:task.id,workerId:"article-worker",attempt:claim.task.attempt,status:"failed",errorCode:"UPSTREAM_ERROR",errorMessage:"真实执行失败"});
  const owner=createArticlesService(f.db,{now:()=>now,nextId:p=>`${p}-bound`,projects:f.projects,artifacts:f.artifactsFor,assertAssetFile:async()=>{},resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,
   readGeneration:async(c,id)=>{expect(id).toBe(original.taskId);const live=await execution.get(c,task.id);return {...frozen,status:live.status,executionTaskId:task.id};},
   submitGeneration:async()=>{submits++;throw Error("禁止复制已绑定任务");},
   resumeGeneration:async(c,input)=>{await execution.command(c,{taskIds:[task.id],command:"retry",idempotencyKey:`article-retry:${input.clientRequestId}`});return {id:original.taskId};},
  });
  const recovered=await owner.retryFrozenCandidate(ctx("a"),original.taskId,"bound-retry-request");
  expect(recovered).toMatchObject({taskId:original.taskId,candidateId:original.taskId,status:"queued"});expect(submits).toBe(0);
  expect(await owner.retryFrozenCandidate(ctx("a"),original.taskId,"bound-retry-request")).toEqual(recovered);
  await expect(owner.retryFrozenCandidate(ctx("b"),original.taskId,"bound-retry-request")).rejects.toThrow();
  expect((await execution.get(ctx("a"),task.id)).attempt).toBe(1);
 }finally{await f.opened.client.close();}
},20000);
it("文章单字段已绑定恢复沿原文字候选，迟到请求不走旧 submit",async()=>{
 const f=await fixture();let sequence=0,submits=0,status="failed";
 try{
  const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"单字段原执行",clientRequestId:"bound-text-create"});const article=await f.service.getArticle(ctx("a"),output.id);
  const original={taskType:"wechat.article-text",status:"failed",executionTaskId:"original-text-execution",inputData:{projectId:f.project.id,outputId:output.id,artifactId:article.artifactId,baseVersionId:article.currentVersionId,kind:"title",targetPlatform:null,current:article.current,sourceRefs:[],sourceMaterials:[],ruleSnapshotRef:null},results:[]};
  const owner=createArticleTextResultsService(f.db,{articles:f.service,projects:f.projects(f.db),nextId:()=>`bound-text-${++sequence}`,now:()=>now,
   readGeneration:async()=>({...original,status}),submitGeneration:async()=>{submits++;throw Error("禁止复制文字任务");},
   resumeGeneration:async(_c,input)=>{expect(input).toEqual({taskId:"original-text-task",clientRequestId:"bound-text-retry"});status="queued";return {id:"original-text-task"};},
  });
  expect(await owner.retryFrozen(ctx("a"),"original-text-task","bound-text-retry")).toMatchObject({candidateId:"original-text-task",taskId:"original-text-task",status:"queued"});
  expect(await owner.retryFrozen(ctx("a"),"original-text-task","bound-text-retry")).toMatchObject({candidateId:"original-text-task"});expect(submits).toBe(0);
  await expect(owner.retryFrozen(ctx("b"),"original-text-task","bound-text-retry")).rejects.toThrow();
 }finally{await f.opened.client.close();}
},20000);

it('T1052 NoteRelay 排版沿文章保存、幂等、历史与 CAS 保留正文和旧版式',async()=>{
 const f=await fixture();try{
 const output=await f.service.createOutput(ctx('a'),f.project.id,{title:'衍生文章',clientRequestId:'noterelay-output'});const initial=await f.service.getArticle(ctx('a'),output.id);
 const nativeLayout={schemaVersion:1 as const,editor:'noterelay' as const,editorVersion:'0.1.8' as const,themeId:'moyu-green',authorName:'真实署名',authorBio:'用户简介',variables:{栏目名:'实测'},fontSize:16,splitHeading:2 as const,templateId:'default' as const,imageWidths:{},imageRadii:{}};
 const document={...initial.current,title:'已编辑文章',sections:[{sectionId:'s',order:0,heading:'要点',headingLevel:2,body:'保存确定脚本后的衍生正文',sourceRefs:[]}],nativeLayout};const input={expectedCurrentVersionId:initial.currentVersionId,clientRequestId:'noterelay-save',document};
 const saved=await f.service.createVersion(ctx('a'),output.id,input);expect((await f.service.getArticle(ctx('a'),output.id)).current).toEqual(document);expect((await f.service.getVersion(ctx('a'),output.id,saved.versionId)).document.nativeLayout).toEqual(nativeLayout);expect((await f.service.getVersion(ctx('a'),output.id,initial.currentVersionId)).document.nativeLayout).toBeUndefined();expect((await f.service.createVersion(ctx('a'),output.id,input)).versionId).toBe(saved.versionId);
 await expect(f.service.createVersion(ctx('a'),output.id,{...input,clientRequestId:'noterelay-stale'})).rejects.toThrow();expect((await f.service.getArticle(ctx('a'),output.id)).current).toEqual(document);
 }finally{await f.opened.client.close();}
});


describe("T-1055 文章主稿metadata与语义配图候选",()=>{
 it("get兼容sourceContext，新metadataSource经属主验证；辅助失败不影响正式稿读取",async()=>{
  let allowed=true;
  const source={kind:"publication_revision" as const,projectId:"",sourceOutputId:"video",publicationId:"pub",revisionId:"revision"};
  const f=await fixture(undefined,undefined,{
   readProjectScriptContext:async()=>({state:"ready",scriptRef:null,scriptText:"保存正文",metadata:{title:"脚本标题",summary:"脚本简介",tags:["脚本标签"]},metadataSource:source}),
   assertScriptMetadataSource:async()=>{if(!allowed)throw new Error("归属错误");},
  } as never);
  try{
   source.projectId=f.project.id;
   const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"文章"});
   const current=await f.service.getArticle(ctx("a"),output.id);
   expect(current).toMatchObject({scriptContext:{metadata:{title:"脚本标题"}}});
   const saved=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:current.currentVersionId,clientRequestId:"metadata-derived-save",document:{...current.current,title:"脚本标题",summary:"脚本简介",tags:["脚本标签"],metadataSource:source}});
   allowed=false;
   // 已存历史引用保留，人工编辑不重新采样发布包。
   expect((await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:saved.versionId,clientRequestId:"metadata-manual-after",document:{...saved.document,title:"二次编辑"}})).document.title).toBe("二次编辑");
   await expect(f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:saved.versionId,clientRequestId:"metadata-forgery-save",document:{...saved.document,metadataSource:{...source,revisionId:"wrong"}}})).rejects.toThrow();
  }finally{await f.opened.client.close();}
 });
 it.each(["selected","expired","existing","byte_missing"] as const)("真实冻结pair采用到指定段落：%s，正文/metadata与旧图保留",async mode=>{
  const image={assetId:"real-image",assetFileId:"real-file",name:"实际图",description:"真实描述"};
  let isExpired=false;
  const f=await fixture(async(_c,id,file)=>{if(id===image.assetId&&(file!==image.assetFileId||isExpired))throw new Error("图片不可用");},undefined,{readProjectImageLibrary:async()=>({state:"ready",images:[image]}),...(mode==="byte_missing"?{assertProjectImageFile:async()=>{throw new Error("冻结文件字节已不可读取");}}:{})} as never);
  try{
   const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"文章"});const initial=await f.service.getArticle(ctx("a"),output.id);
   const old={sectionId:"old",order:0,heading:"旧段",headingLevel:2,body:"旧正文",sourceRefs:[]};
   const manual=await f.service.createVersion(ctx("a"),output.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"image-manual-before",document:{...initial.current,title:"沿用标题",summary:"沿用简介",tags:["沿用标签"],sections:mode==="existing"?[old]:[],imageUses:mode==="existing"?[{sectionId:"old",assetId:"old-image",assetFileId:"old-file",sourceKind:"existing",reviewState:"selected"}]:[]}});
   const generated=await f.service.generateCandidate(ctx("a"),output.id,"image-generation-request");
   const task=f.results.get(generated.taskId)!;
   expect(task.inputData.imageLibrary).toEqual([image]);
   const candidate={...proposal,proposedSections:[{...proposal.proposedSections[0]!,...(mode==="existing"?{sectionId:"old",op:"replace",afterSectionId:null}:{})}],proposedVisualBriefs:[{sectionId:mode==="existing"?"old":"s1",brief:"匹配原图",proposedAssetId:image.assetId,proposedAssetFileId:image.assetFileId}]};
   task.results[0]!.resultData={proposal:candidate};
   isExpired=mode==="expired";
   const saved=await f.service.adoptCandidate(ctx("a"),generated.candidateId,{expectedCurrentVersionId:manual.versionId,selectedSectionIds:[mode==="existing"?"old":"s1"],selectedMetadataFields:[],clientRequestId:"image-candidate-adopt"});
   expect(saved.document).toMatchObject({title:"沿用标题",summary:"沿用简介",tags:["沿用标签"]});
   expect(saved.document.sections[0]?.body).toBe("这是正文。");
   if(mode==="selected")expect(saved.document.imageUses[0]).toMatchObject({sectionId:"s1",assetId:image.assetId,assetFileId:image.assetFileId});
   if(mode==="expired"||mode==="byte_missing"){expect(saved.document.imageUses).toEqual([]);expect(saved.document.imageMatchWarnings?.length).toBeGreaterThan(0);}
   if(mode==="existing")expect(saved.document.imageUses[0]).toMatchObject({assetId:"old-image",assetFileId:"old-file"});
   expect((await f.service.getVersion(ctx("a"),output.id,saved.versionId)).document).toEqual(saved.document);
  }finally{await f.opened.client.close();}
 });
 it("候选编造文件pair被backend拒绝；目录辅助失败仍生成可采用正文",async()=>{
  const f=await fixture(undefined,undefined,{readProjectImageLibrary:async()=>{throw Error("图库失败");}} as never);
  try{
   const output=await f.service.createOutput(ctx("a"),f.project.id,{title:"文章"});const initial=await f.service.getArticle(ctx("a"),output.id);
   const generated=await f.service.generateCandidate(ctx("a"),output.id,"image-directory-failed");
   const task=f.results.get(generated.taskId)!;
   expect(task.inputData.imageLibrary).toEqual([]);
   task.results[0]!.resultData={proposal:{...proposal,proposedVisualBriefs:[{sectionId:"s1",brief:"图",proposedAssetId:"fake",proposedAssetFileId:"fake-file"}]}};
   await expect(f.service.getCandidate(ctx("a"),generated.candidateId)).rejects.toThrow();
   task.results[0]!.resultData={proposal};
   const saved=await f.service.adoptCandidate(ctx("a"),generated.candidateId,{expectedCurrentVersionId:initial.currentVersionId,selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"image-failed-text-adopt"});
   expect(saved.document.sections).toHaveLength(1);expect(saved.document.imageUses).toEqual([]);
   expect(saved.document.imageMatchWarnings?.length).toBeGreaterThan(0);
  }finally{await f.opened.client.close();}
 });
});


describe("T1062 文章真实父归档与旧回执",()=>{
 it("归档后保留旧保存回执和历史，拒绝新保存且版本完全不变",async()=>{
  const f=await fixture();try{
   const out=await f.service.createOutput(ctx("a"),f.project.id,{title:"归档文章",clientRequestId:"archive-article-output"});
   const old=await f.service.getArticle(ctx("a"),out.id);
   const input={expectedCurrentVersionId:old.currentVersionId,clientRequestId:"archive-article-save",document:{...old.current,title:"归档前保存"}};
   const saved=await f.service.createVersion(ctx("a"),out.id,input);
   await f.projects(f.db).archiveProject(ctx("a"),f.project.id);
   const before=await f.service.getArticle(ctx("a"),out.id);
   expect(await f.service.createVersion(ctx("a"),out.id,input)).toEqual(saved);
   const receipt=(await f.artifactsFor(f.db).listVersions(ctx("a"),before.artifactId)).find(v=>v.id===saved.versionId)!;
   expect((await f.artifactsFor(f.db).createVersion(ctx("a"),before.artifactId,{expectedCurrentVersionId:old.currentVersionId,
    contentData:z.record(z.string(),z.unknown()).parse(receipt.contentData),contentText:receipt.contentText,adoptionKey:receipt.adoptionKey!,adoptionSourceDigest:receipt.adoptionSourceDigest!})).id).toBe(receipt.id);
   await expect(f.service.createVersion(ctx("a"),out.id,{...input,document:{...input.document,title:"改旧请求"}})).rejects.toThrow();
   await expect(f.service.createVersion(ctx("a"),out.id,{expectedCurrentVersionId:saved.versionId,clientRequestId:"archive-article-new-save",document:{...saved.document,title:"归档后新写"}})).rejects.toThrow("归档");
   expect(await f.service.getArticle(ctx("a"),out.id)).toEqual(before);
   expect((await f.service.getVersion(ctx("a"),out.id,old.currentVersionId)).document).toEqual(old.current);
  }finally{await f.opened.client.close();}
 },180000);
 it("整稿采用到达真实repo前项目归档先提交，拒绝追加且候选保留",async()=>{
  let hold=false;let arrived!:()=>void;let release!:()=>void;
  const reached=new Promise<void>(r=>arrived=r),resume=new Promise<void>(r=>release=r);
  const f=await fixture(undefined,undefined,{},async()=>{if(hold){arrived();await resume;}});
  try{
   const out=await f.service.createOutput(ctx("a"),f.project.id,{title:"竞争文章",clientRequestId:"archive-race-article-output"});
   const before=await f.service.getArticle(ctx("a"),out.id);
   const task=await f.service.generateCandidate(ctx("a"),out.id,"archive-race-article-generate");
   const candidate=await f.service.getCandidate(ctx("a"),task.candidateId);
   hold=true;
   const attempt=f.service.adoptCandidate(ctx("a"),task.candidateId,{expectedCurrentVersionId:before.currentVersionId,selectedSectionIds:["s1"],selectedMetadataFields:[],clientRequestId:"archive-race-article-adopt"});
   const assertion=expect(attempt).rejects.toThrow("归档");
   await reached;await f.projects(f.db).archiveProject(ctx("a"),f.project.id);release();await assertion;
   expect(await f.service.getArticle(ctx("a"),out.id)).toEqual(before);
   expect(await f.service.getCandidate(ctx("a"),task.candidateId)).toEqual(candidate);
  }finally{release();await f.opened.client.close();}
 },180000);
});


// 真PG随机库：raw blocker仅调度锁顺序，归档和保存仍走真实公共service。
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../../test-fixtures/owned-postgres';
import {randomUUID} from "node:crypto";
import {createRuntimeDb} from "@creatoros/backend";
const isolatedPgUrl=process.env.CREATOROS_TEST_POSTGRES_URL;
it.skipIf(!isolatedPgUrl)("T1062 真实PG项目归档先提交，公共保存等待父锁后零写",async()=>{
 const url=new URL(isolatedPgUrl!);assertOwnedPostgresUrl(url.toString());
 const name="t1062_archive_"+randomUUID().replaceAll("-","");
 const admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE DATABASE ${name}`);url.pathname="/"+name;
 const runtime=await createRuntimeDb({connectionString:url.toString()});
 const blocker=await runtime.pool.connect();let locked=false;
 try{
  const f=await fixture(undefined,undefined,{},undefined,{db:runtime.db,client:{close:async()=>{}}});
  const out=await f.service.createOutput(ctx("a"),f.project.id,{title:"真实PG文章",clientRequestId:"pg-archive-output"});
  const before=await f.service.getArticle(ctx("a"),out.id);
  await blocker.query("BEGIN");locked=true;await blocker.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE",[f.project.id]);
  const waitForLocks=async(count:number)=>{for(let i=0;i<200;i++){
   const result=await runtime.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'",[name]);
   if(result.rows[0].n>=count)return;await new Promise(r=>setTimeout(r,10));
  }throw Error("未观察到真实PG父锁等待");};
  const archive=f.projects(f.db).archiveProject(ctx("a"),f.project.id);await waitForLocks(1);
  const write=f.service.createVersion(ctx("a"),out.id,{expectedCurrentVersionId:before.currentVersionId,document:{...before.current,title:"归档后不得写"},clientRequestId:"pg-archive-save"});
  const checked=expect(write).rejects.toThrow("归档");await waitForLocks(2);
  await blocker.query("COMMIT");locked=false;await archive;await checked;
  expect(await f.service.getArticle(ctx("a"),out.id)).toEqual(before);
 }finally{if(locked)await blocker.query("ROLLBACK");blocker.release();await runtime.pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();}
},180000);


it("T1062 窄文章归档守卫保留trend_analysis既有已开始结算的版本端口",async()=>{
 const f=await fixture();try{
  const repo=f.artifactsFor(f.db);
  const artifact=await repo.createArtifact(ctx("a"),{projectId:f.project.id,title:"已开始重建结果",artifactType:"trend_analysis",stage:"analysis",initialContentText:"初稿"});
  await f.projects(f.db).archiveProject(ctx("a"),f.project.id);
  const version=await repo.createVersion(ctx("a"),artifact.id,{expectedCurrentVersionId:artifact.currentVersionId!,contentText:"模型已结算结果",createdByType:"ai"});
  expect(version.contentText).toBe("模型已结算结果");
  expect((await repo.getArtifact(ctx("a"),artifact.id)).currentVersionId).toBe(version.id);
 }finally{await f.opened.client.close();}
},180000);

describe('T1062 组归档后的原artifact采用回执',()=>{
 it('精确原回执可回读，改digest/跨组/新append仍拒绝且版本不变',async()=>{
  const f=await fixture(),groupCtx:RequestContext={...ctx('a'),accountId:null,groupId:'receipt-group'};
  try{
   await f.db.insert(accountGroups).values({id:'receipt-group',userId:groupCtx.userId,name:'原组',status:'active',version:1,createdAt:now,updatedAt:now});
   const project=await f.projects(f.db).createProject(groupCtx,{title:'组归档历史文章',brief:''}),output=await f.service.createOutput(groupCtx,project.id,{title:'历史文章',clientRequestId:'group-history-output'});
   const old=await f.service.getArticle(groupCtx,output.id),saved=await f.service.createVersion(groupCtx,output.id,{expectedCurrentVersionId:old.currentVersionId,clientRequestId:'group-history-save',document:{...old.current,title:'原事实'}});
   const repo=f.artifactsFor(f.db),versions=await repo.listVersions(groupCtx,old.artifactId),receipt=versions.find(v=>v.id===saved.versionId);if(!receipt?.adoptionKey||!receipt.adoptionSourceDigest)throw Error('缺少真实保存回执');
   const exact={expectedCurrentVersionId:old.currentVersionId,contentData:z.record(z.string(),z.unknown()).parse(receipt.contentData),contentText:receipt.contentText,adoptionKey:receipt.adoptionKey,adoptionSourceDigest:receipt.adoptionSourceDigest};
   await f.db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,groupCtx.groupId!));
   expect(await repo.createVersion(groupCtx,old.artifactId,exact)).toEqual(receipt);
   await expect(repo.createVersion(groupCtx,old.artifactId,{...exact,adoptionSourceDigest:'sha256:'+'f'.repeat(64)})).rejects.toThrow('原候选');
   await expect(repo.createVersion({...groupCtx,groupId:'foreign'},old.artifactId,exact)).rejects.toThrow();
   await expect(repo.createVersion(groupCtx,old.artifactId,{...exact,adoptionKey:'new-after-group-archive'})).rejects.toThrow();
   expect(await repo.listVersions(groupCtx,old.artifactId)).toEqual(versions);expect((await f.service.getArticle(groupCtx,output.id)).currentVersionId).toBe(saved.versionId);
  }finally{await f.opened.client.close();}
 },180000);
});

it.each(['owned','foreign','missing'] as const)('T1062 单项首次投影必须原冻结任务/父归属：%s',async source=>{
 const f=await fixture();try{
  const owner:RequestContext={userId:'user',accountId:null,groupId:'text-group-a',requestId:'projection',source:'user'};
  await f.db.insert(accountGroups).values(['text-group-a','text-group-b'].map(id=>({id,userId:owner.userId,name:id,status:'active',version:1,createdAt:now,updatedAt:now})));
  const parent=await f.projects(f.db).createProject(owner,{title:'空组文章父'}),output=await f.service.createOutput(owner,parent.id,{title:'文章',clientRequestId:'text-projection-output'}),article=await f.service.getArticle(owner,output.id);
  const inputData={projectId:parent.id,outputId:output.id,artifactId:article.artifactId,baseVersionId:article.currentVersionId,kind:'title',targetPlatform:null,sourceRefs:[]};
  if(source!=='missing')await f.db.insert(aiTasks).values({id:'projection-task',userId:owner.userId,accountId:null,groupId:source==='owned'?owner.groupId:'text-group-b',groupVersion:1,projectId:parent.id,taskType:'wechat.article-text',status:'awaiting_confirmation',idempotencyKey:'projection-task',inputData,requestedAt:now});
  const unused=async():Promise<never>=>{throw Error('仅候选投影，不能新paid');};
  const text=createArticleTextResultsService(f.db,{articles:f.service,projects:f.projects(f.db),now:()=>now,nextId:()=>{throw Error('不造另候选ID');},submitGeneration:unused,readGeneration:async()=>({taskType:'wechat.article-text',status:'awaiting_confirmation',inputData,results:[{resultType:'wechat_article_text_candidate',resultData:{kind:'title',value:'原冻结候选'}}]})});
  if(source==='owned'){expect(await text.getCandidate(owner,'projection-task')).toMatchObject({value:'原冻结候选'});expect(await text.getCandidate({...owner,accountId:'platform-filter-only'},'projection-task')).toMatchObject({value:'原冻结候选'});const [row]=await f.db.select().from(articleTextCandidates).where(eq(articleTextCandidates.id,'projection-task'));expect(row).toMatchObject({groupId:owner.groupId,accountId:null});}
  else{await expect(text.getCandidate(owner,'projection-task')).rejects.toThrow();expect(await f.db.select().from(articleTextCandidates).where(eq(articleTextCandidates.id,'projection-task'))).toEqual([]);}
 }finally{await f.opened.client.close();}
},180000);
