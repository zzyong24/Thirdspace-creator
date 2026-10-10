import { readPagedRows } from "@/features/knowledge/knowledge-library-data";
import "server-only";
import {publicationVisualNoteSchema,type PublicationVisualNote} from "@creatoros/contract";

import { client as defaultClient } from "@/lib/contract-client.server";
import {
  loadThesisSkeleton,
  loadScriptEditorData,
  resolveScriptArtifactIdFromDb,
  type ScriptDataClient,
  type ThesisSkeleton,
} from "@/features/script/script-editor-data";
import type { ProjectBriefDetail, ProjectStageName } from "@/types/domain";
import type { ScriptSectionView, ScriptViewModel } from "@/types/view-models";
import type { ScriptReviewReportResource } from "@creatoros/contract";
import { isBlindPredictionStale } from "./script-result-freshness";
import {
  hasCurrentTranscriptForAweme,
  type TranscriptArtifactSummary,
  type TranscriptArtifactVersion,
} from "@/server/project-transcript-artifact";

/**
 * 稿面工作台读侧装配(T-055a,SPEC §3/§4)。
 *
 * 稿面 = 纯视图层重组,零新实体(SPEC §4):
 *   - 选题区   ← projects.get(title/brief/briefDetail/currentStage/source)
 *   - 脚本区   ← 既有 resolveScriptArtifactIdFromDb + loadScriptEditorData
 *               (T-050 的 DB 解析 + T-019/T-024 的编辑器往返,原样复用)
 *   - 发布包区 ← projects.outputs.list → outputs.publications.list → 当前 revision
 *   - 弹药区   ← materialLinks.list → knowledge/assets fan-out
 *               (research/production 数据装配的同款模式)
 *
 * 全部读失败按区降级(诚实空,不 fixture 兜底——T-050 全站惯例)。
 */

// ---------------------------------------------------------------------------
// DTO(窄投影,只取要渲染的字段)
// ---------------------------------------------------------------------------

interface ProjectDto {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly currentStage: ProjectStageName;
  readonly source?: string;
  readonly briefDetail?: ProjectBriefDetail | null;
  // [T-374] 平台锚(projects.get 随行带;默认空形状 {platform:"",externalId:""})。
  //   douyin + 非空 externalId → 顶条渲「立即抓取逐字稿」按钮。
  readonly platformRef?: {
    readonly platform?: string;
    readonly externalId?: string;
  } | null;
}

interface OutputDto {
  readonly id: string;
  readonly contentType?: string;
}

interface PublicationDto {
  readonly id: string;
  readonly platform: string;
  readonly status: string;
  readonly currentRevisionId: string;
  readonly publishedAt: string | null;
  readonly updatedAt?: string;
}

interface RevisionDto {
  readonly platformSettings?: Record<string,unknown>;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly platformTags?: ReadonlyArray<string>;
  readonly coverAssetId?: string | null;
}

interface MaterialLinkDto {
  /** [T-109] material_link 行自身 id —— 解绑(deleteMaterialLink)的目标,非 entityId。 */
  readonly id: string;
  readonly entityType: "knowledge" | "asset";
  readonly entityId: string;
  readonly role?: string;
  readonly stage?: string;
}

interface KnowledgeDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly source?: string;
  readonly sourceType?: string;
  readonly sourceUrl?: string | null;
  readonly sourceMetadata?: Record<string, unknown> | null;
}

/**
 * [T-055g SPEC §8.1] 知识弹药的来源链 label:
 *   sourceMetadata.projectTitle → 「来自你的作品《…》」(采集链路写入的作品指向);
 *   sourceUrl → 域名;sourceType=manual → 「手记」;都没有 → 「来源未记录」(诚实)。
 */
export function knowledgeSourceLabel(k: KnowledgeDto): string {
  const meta = k.sourceMetadata ?? {};
  const projectTitle =
    typeof meta.projectTitle === "string" ? meta.projectTitle.trim() : "";
  if (projectTitle) return `来自你的作品《${projectTitle.slice(0, 18)}》`;
  if (k.sourceUrl) {
    try {
      return `来源:${new URL(k.sourceUrl).hostname}`;
    } catch {
      return `来源:${k.sourceUrl.slice(0, 30)}`;
    }
  }
  if (k.sourceType === "manual") return "手记";
  if (k.sourceType) return `来源:${k.sourceType}`;
  if (k.source) return `来源:${k.source}`;
  return "来源未记录";
}

interface AssetDto {
  readonly id: string;
  readonly name: string;
  readonly assetType: string;
  // [T-146] 文档抽取投影(assetResource 随行带;仅 document 有值)——弹药双击预览显要点/全文。
  readonly extractStatus?: string | null;
  readonly materialSummary?: {
    readonly keyPoints?: ReadonlyArray<string>;
    readonly facts?: ReadonlyArray<string>;
    readonly sellingPoints?: ReadonlyArray<string>;
  } | null;
  readonly extractedText?: string | null;
  readonly sourceUrl?: string | null;
}

export interface DraftWorkbenchClient extends ScriptDataClient {
  getProject(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  getProjectIntelligence?(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listPublications(input: {
    params: { outputId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listPublicationRevisions(input: {
    params: { publicationId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks(input: {
    params: undefined;
    query: { projectId: string; page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getKnowledge(input: {
    params: { knowledgeId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  getAsset(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  getDownloadUrl(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // [T-063e] 盲预测入口移稿面:读本项目产出上的盲预测(calibration.predictions.list)。
  // optional —— 旧测试桩不带它时该区诚实降级为 null(不渲染预测分,入口照常给)。
  listPredictions?(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  // [T-086] 稿面审核门:读本项目最新审核报告(scriptReviews.getLatest;404=未审吞成 null)。
  // optional —— 旧测试桩不带它时诚实降级 null(稿面显「未审」)。
  getLatestScriptReview?(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // [T-505] 刷新恢复逐字稿任务状态。optional 兼容旧测试桩；生产 client 恒有此 op。
  listAITasks?(input: {
    params: undefined;
    query: {
      page: number;
      pageSize: number;
      taskType?: string;
    };
    body: undefined;
  }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// 稿面 VM
// ---------------------------------------------------------------------------

export type ProjectTranscriptState =
  "idle" | "queued" | "running" | "done" | "failed";

export interface DraftWorkbenchVm {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly brief: string;
    readonly currentStage: ProjectStageName;
    readonly imported: boolean;
    readonly briefDetail: ProjectBriefDetail | null;
    /**
     * [T-374] 项目关联的抖音作品 aweme_id(platformRef.platform=douyin 且 externalId 非空
     * 时才有);null = 无抖音锚 → 顶条不渲「立即抓取逐字稿」按钮(诚实,无锚无法抓)。
     */
    readonly douyinExternalId: string | null;
    /**
     * [T-505] 持久逐字稿状态。done 时顶条不再提供二次抓取；queued/running
     * 从 ai_tasks 恢复，刷新不会重置为可提交。
     */
    readonly transcriptState: ProjectTranscriptState;
  };
  /** 脚本区:DB 解析的 artifactId(null=还没有,首存/AI 起草时 ensure)。 */
  readonly scriptArtifactId: string | null;
  /** 可选论点骨架；历史无采用标记仍可见，但不会被生成式写稿读取。 */
  readonly thesis: ThesisSkeleton | null;
  readonly script: {
    readonly editorHtml: string | null;
    readonly sections: ReadonlyArray<ScriptSectionView>;
    readonly versionCount: number;
    readonly currentVersionId?: string | null;
    readonly versions?: ScriptViewModel["versions"];
  };
  /** [T-642] 尚无正式 output_script 时，内容雷达已确认口播稿的直接初值。 */
  readonly radarDraftSeed: string | null;
  /**
   * [T-055h③] 项目的第一个 ContentOutput id(登记已发布的挂点);null = 还没有
   * (登记表单提交时先 createOutput 铸一个)。
   */
  readonly outputId: string | null;
  /** 发布包:null = 还没有发布行(锁定态用引导文案)。 */
  readonly publishPack: {
    readonly publicationId: string;
    readonly revisionId?: string;
    readonly visualNote?: PublicationVisualNote | null;
    readonly platform: string;
    readonly status: string;
    readonly publishedAt: string | null;
    readonly title: string;
    readonly description: string;
    readonly tags: ReadonlyArray<string>;
    readonly hasCover: boolean;
    /** [T-078] 真封面 asset id(采集回填/手选);null → 「封面待生成」占位。 */
    readonly coverAssetId: string | null;
    /** 同一 output 下是否另有已发布事实；与当前展示哪条物料 revision 正交。 */
    readonly outputPublished?: boolean;
    /** 同一 output 下已发布事实的时间；仅用于稿面状态回显。 */
    readonly latestPublishedAt?: string | null;
  } | null;
  /** 当前项目有效封面:发布 revision 优先，否则取项目已采纳的封面素材。 */
  readonly projectCoverAssetId: string | null;
  /** 发布包解锁:正式脚本版本或已确认雷达稿任一存在。 */
  readonly publishUnlocked: boolean;
  /**
   * [T-063e] 本项目产出(content_output = outputId)上最新的盲预测;null = 还没有
   * (稿面发布包区显「先盲预测」入口)。predictedScore 由服务端派生(变现加权)。
   */
  readonly blindPrediction: {
    readonly predictionId: string;
    readonly status: "draft" | "locked";
    readonly predictedScore: number;
    readonly lockedAt: string | null;
    readonly createdAt: string;
    /** true = 预测早于当前脚本版本，只作为历史结果，不锁当前稿。 */
    readonly stale: boolean;
  } | null;
  readonly ammoReadError?: string | null;
  readonly ammo: ReadonlyArray<{
    /**
     * [T-109] material_link 行自身 id —— 稿面「移除」解绑(deleteMaterialLink)的目标。
     * 注意:这不是 knowledge/asset 的 id(那是 entityId),删链接必须用它。
     */
    readonly linkId: string;
    readonly id: string;
    readonly kind: "knowledge" | "asset";
    /** 用料链角色；cover 用于识别已采纳项目封面。 */
    readonly role?: string;
    readonly title: string;
    readonly sourceLabel: string;
    /** [T-058④] 图片素材的签名预览 URL(非图片/取不到 → null,卡片退回类型徽标)。 */
    readonly previewUrl: string | null;
    /** [T-146] 双击预览用:素材类型 + 文档抽取投影(资料要点/全文);knowledge 项均为空。 */
    readonly assetType?: string | null;
    readonly extractStatus?: string | null;
    readonly materialSummary?: {
      readonly keyPoints?: ReadonlyArray<string>;
      readonly facts?: ReadonlyArray<string>;
      readonly sellingPoints?: ReadonlyArray<string>;
    } | null;
    readonly extractedText?: string | null;
    readonly sourceUrl?: string | null;
  }>;
  /**
   * [T-086] 稿面审核门首屏报告(scriptReviews.getLatest;null = 未审)。稿面客户端岛
   * 用它渲染 verdict/命中列表 + 软门提示(报告版本 < script.versionCount → 提示重审)。
   */
  readonly scriptReview: ScriptReviewReportResource | null;
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------

async function readPublishPack(
  client: DraftWorkbenchClient,
  projectId: string,
): Promise<{
  outputId: string | null;
  publishPack: DraftWorkbenchVm["publishPack"];
}> {
  try {
    const outputsRaw = await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    });
    const outputs = (
      Array.isArray(outputsRaw) ? outputsRaw : []
    ) as OutputDto[];
    // [T-055h③] outputId 单独浮出:没有发布行时登记表单也要知道挂点在哪。
    // 同项目可同时有图文、文章和视频；视频稿面只绑定视频 output。
    // 旧窄桩缺 contentType 时保留兼容，真实已标注的非视频不能误选。
    const outputId = (outputs.find((item) => item.contentType === "video")
      ?? outputs.find((item) => !item.contentType))?.id ?? null;
    if (!outputId) return { outputId: null, publishPack: null };
    const pubsRaw = await client.listPublications({
      params: { outputId },
      query: { page: 1, pageSize: 10 },
      body: undefined,
    });
    const pubs = (Array.isArray(pubsRaw) ? pubsRaw : []) as PublicationDto[];
    if (pubs.length === 0) return { outputId, publishPack: null };
    const packages = await Promise.all(
      pubs.map(async (pub) => {
        let revision: RevisionDto | null = null;
        try {
          const revsRaw = await client.listPublicationRevisions({
            params: { publicationId: pub.id },
            query: { page: 1, pageSize: 20 },
            body: undefined,
          });
          const revs = (Array.isArray(revsRaw) ? revsRaw : []) as RevisionDto[];
          revision =
            revs.find((r) => r.id === pub.currentRevisionId) ?? null;
        } catch {
          revision = null;
        }
        return { pub, revision };
      }),
    );
    // 一个 output 可能同时有「平台采集/登记的发布事实」与「AI 生成的发布物料」。
    // 前者常只有标题，后者才有简介与标签；查看发布物料应优先选真实含内容的 revision，
    // 而发布状态仍由同 output 下的 published 行独立回显。
    const selected =
      [...packages].sort((a,b)=>(b.pub.updatedAt??"").localeCompare(a.pub.updatedAt??"")).find(({ revision }) => {
        const description = revision?.description?.trim() ?? "";
        const tags = revision?.platformTags ?? [];
        return description.length > 0 || tags.length > 0 || Boolean(revision?.coverAssetId);
      }) ?? packages[0]!;
    const { pub, revision } = selected;
    const visualNote = publicationVisualNoteSchema.safeParse(revision?.platformSettings?.visualNote).data ?? null;
    const published = pubs.find((candidate) => candidate.status === "published");
    return {
      outputId,
      publishPack: {
        publicationId: pub.id,
        revisionId: revision?.id,
        visualNote,
        platform: pub.platform,
        status: pub.status,
        publishedAt: pub.publishedAt,
        title: revision?.title?.trim() || "",
        description: (visualNote ? revision?.description?.trim() : revision?.description?.replace(/\s+/gu, " ").trim()) || "",
        tags: revision?.platformTags ?? [],
        hasCover: Boolean(revision?.coverAssetId),
        coverAssetId: revision?.coverAssetId ?? null,
        outputPublished: Boolean(published),
        latestPublishedAt: published?.publishedAt ?? null,
      },
    };
  } catch {
    return { outputId: null, publishPack: null };
  }
}

// [T-063e] 读本项目产出上最新的盲预测(subjectType=content_output, subjectId=outputId)。
// 列表 createdAt desc → 第一条命中即最新。读失败 / 无 outputId / 桩不带 op → null(诚实)。
async function readBlindPrediction(
  client: DraftWorkbenchClient,
  outputId: string | null,
): Promise<DraftWorkbenchVm["blindPrediction"]> {
  if (!outputId || !client.listPredictions) return null;
  try {
    const raw = await client.listPredictions({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    });
    const rows = (Array.isArray(raw) ? raw : []) as Array<{
      id: string;
      subjectType: string;
      subjectId: string;
      status: string;
      predictedScore: number;
      lockedAt: string | null;
      createdAt: string;
    }>;
    const hit = rows.find(
      (p) => p.subjectType === "content_output" && p.subjectId === outputId,
    );
    if (!hit) return null;
    return {
      predictionId: hit.id,
      status: hit.status === "locked" ? "locked" : "draft",
      predictedScore: hit.predictedScore,
      lockedAt: hit.lockedAt,
      createdAt: hit.createdAt,
      // 当前脚本时间在 buildDraftWorkbenchVm 拿到后再派生。
      stale: false,
    };
  } catch {
    return null;
  }
}

export async function readAmmo(
  client: DraftWorkbenchClient,
  projectId: string,
  onReadError?: (message: string) => void,
): Promise<DraftWorkbenchVm["ammo"]> {
  try {
    const links = await readPagedRows<MaterialLinkDto>((page) =>
      client.listMaterialLinks({
        params: undefined,
        query: { projectId, page, pageSize: 100 },
        body: undefined,
      }),
    );
    let failedEntities = 0;
    async function resolveAmmo(link: MaterialLinkDto) {
      try {
        if (link.entityType === "knowledge") {
          const k = (await client.getKnowledge({
            params: { knowledgeId: link.entityId },
            query: undefined,
            body: undefined,
          })) as KnowledgeDto;
          return {
            // [T-109] linkId = material_link 行 id(解绑目标),与 entity id 区分开。
            linkId: link.id,
            id: k.id,
            kind: "knowledge" as const,
            role: link.role,
            title: k.title,
            // [T-055g] 来源链:sourceMetadata 作品指向 > sourceUrl > 手记 > 未记录。
            sourceLabel: knowledgeSourceLabel(k),
            previewUrl: null,
          };
        }
        const a = (await client.getAsset({
          params: { assetId: link.entityId },
          query: undefined,
          body: undefined,
        })) as AssetDto;
        // [T-058④] 图片素材带签名预览 URL(用户反馈:上传的素材要能看到)。
        let previewUrl: string | null = null;
        if (a.assetType === "image") {
          try {
            const dl = (await client.getDownloadUrl({
              params: { assetId: a.id },
              query: undefined,
              body: undefined,
            })) as { url?: string };
            previewUrl = dl.url ?? null;
          } catch {
            previewUrl = null; // 文件缺失/存储不可用 → 退回类型徽标,不摆坏图。
          }
        }
        return {
          // [T-109] linkId = material_link 行 id(解绑目标),与 asset id 区分开。
          linkId: link.id,
          id: a.id,
          kind: "asset" as const,
          role: link.role,
          title: a.name,
          sourceLabel: `素材 · ${a.assetType}`,
          previewUrl,
          // [T-146] 双击预览投影:类型 + 文档抽取(资料要点/全文)。
          assetType: a.assetType,
          extractStatus: a.extractStatus ?? null,
          materialSummary: a.materialSummary ?? null,
          extractedText: a.extractedText ?? null,
          sourceUrl: a.sourceUrl ?? null,
        };
      } catch {
        failedEntities++;
        return null;
      }
    }
    const resolved: Array<Awaited<ReturnType<typeof resolveAmmo>>> = [];
    for (let start = 0; start < links.length; start += 8) {
      resolved.push(
        ...(await Promise.all(links.slice(start, start + 8).map(resolveAmmo))),
      );
    }

    if (failedEntities > 0)
      onReadError?.(
        `${failedEntities}份项目资料暂时无法读取；可继续使用已读到的资料，或重新读取。`,
      );
    return resolved.filter((x): x is NonNullable<typeof x> => x !== null);
  } catch {
    throw new Error("项目资料读取失败，请重新读取。");
  }
}

/**
 * 项目用料链中的显式封面。独立读取全部近期链接，独立于稿面资料的分页 UI
 * 投影；这样封面选定后即使又添加了很多素材，刷新也不会重新退回“待生成”。
 */
async function readLinkedProjectCoverAssetId(
  client: DraftWorkbenchClient,
  projectId: string,
): Promise<string | null> {
  try {
    const linksRaw = await client.listMaterialLinks({
      params: undefined,
      query: { projectId, page: 1, pageSize: 100 },
      body: undefined,
    });
    const links = (
      Array.isArray(linksRaw) ? linksRaw : []
    ) as MaterialLinkDto[];
    return (
      links.find((link) => link.entityType === "asset" && link.role === "cover")
        ?.entityId ?? null
    );
  } catch {
    return null;
  }
}

/**
 * 稿面工作台 VM 装配。项目读失败向上抛(路由 notFound 处理,与旧总览页一致);
 * 其余区各自降级为空。
 */
export async function buildDraftWorkbenchVm(
  projectId: string,
  client: DraftWorkbenchClient = defaultClient as unknown as DraftWorkbenchClient,
): Promise<DraftWorkbenchVm> {
  const project = (await client.getProject({
    params: { projectId },
    query: undefined,
    body: undefined,
  })) as ProjectDto;
  const douyinExternalId =
    project.platformRef?.platform === "douyin" &&
    (project.platformRef.externalId ?? "").trim()
      ? project.platformRef.externalId!.trim()
      : null;

  const scriptArtifactId = await resolveScriptArtifactIdFromDb(
    project.id,
    client,
  );
  const [scriptData, thesis] = await Promise.all([
    loadScriptEditorData(scriptArtifactId, client),
    loadThesisSkeleton(project.id, client),
  ]);
  const radarEvidence = project.briefDetail?.contentRadarEvidence;
  let radarDraftSeed =
    radarEvidence?.adaptedDraftSeed.contentText.trim() || null;
  // 存量兼容：若旧版 transport 曾丢 briefDetail 扩展字段，从不可变雷达引用只恢复
  // 已确认改写稿。来源逐字稿继续保留为后台证据，不再进入 Project 稿面 UI。
  if (!radarDraftSeed && client.getProjectIntelligence) {
    try {
      const contexts = (await client.getProjectIntelligence({
        params: { projectId: project.id },
        query: undefined,
        body: undefined,
      })) as Array<{
        item: { title: string; canonicalUrl: string };
        transcript: { text: string };
        adaptedDraft?: string | null;
      }>;
      radarDraftSeed = contexts[0]?.adaptedDraft?.trim() || null;
    } catch {
      // 证据读失败时保留真实空态；不影响已有正式 output_script。
    }
  }

  let ammoReadError: string | null = null;
  const [
    { outputId, publishPack },
    ammo,
    linkedProjectCoverAssetId,
    transcriptState,
  ] = await Promise.all([
    readPublishPack(client, project.id),
    readAmmo(client, project.id, (message) => {
      ammoReadError = message;
    }).catch(() => {
      ammoReadError = "项目资料读取失败，请重新读取。";
      return [];
    }),
    readLinkedProjectCoverAssetId(client, project.id),
    readProjectTranscriptState(client, project.id, douyinExternalId),
  ]);

  // [T-063e] 盲预测读依赖 outputId,故在发布包读之后串行。
  const blindPrediction = await readBlindPrediction(client, outputId);
  const currentScriptVersionCreatedAt =
    scriptData?.versions.find(
      (version) => version.id === scriptData.currentVersionId,
    )?.createdAt ?? null;
  const currentBlindPrediction = blindPrediction
    ? {
        ...blindPrediction,
        stale: isBlindPredictionStale(
          blindPrediction.createdAt,
          currentScriptVersionCreatedAt,
        ),
      }
    : null;

  // [T-086] 稿面审核门首屏报告(404=未审吞成 null,桩不带 op → null,诚实)。
  const scriptReview = await readScriptReview(client, project.id);

  // 发布 revision 是最终发布真值；尚未创建发布行时，直接识别项目用料链中采纳的
  // cover。兼容旧版把 cover.generate 错绑成 clip 的存量数据：生成器命名固定为
  // “…… · 封面”/“AI 封面”，且只在图片素材 + clip 角色下兜底，避免误判普通素材。
  const adoptedCover =
    ammo.find((item) => item.kind === "asset" && item.role === "cover") ??
    ammo.find(
      (item) =>
        item.kind === "asset" &&
        item.role === "clip" &&
        item.assetType === "image" &&
        (item.title === "AI 封面" || item.title.endsWith(" · 封面")),
    );
  const projectCoverAssetId =
    publishPack?.coverAssetId ??
    linkedProjectCoverAssetId ??
    adoptedCover?.id ??
    null;

  return {
    project: {
      id: project.id,
      title: project.title,
      brief: project.brief,
      currentStage: project.currentStage,
      imported: project.source === "imported",
      briefDetail: project.briefDetail ?? null,
      // [T-374] 抖音锚:douyin + 非空 externalId 才算(手动项目为空形状 → null)。
      douyinExternalId,
      transcriptState,
    },
    scriptArtifactId,
    thesis,
    outputId,
    script: {
      editorHtml: scriptData?.editorHtml ?? null,
      sections: scriptData?.sections ?? [],
      versionCount: scriptData?.versions.length ?? 0,
      currentVersionId: scriptData?.currentVersionId ?? null,
      versions: scriptData?.versions ?? [],
    },
    radarDraftSeed,
    publishPack,
    projectCoverAssetId,
    // 雷达改写稿已在上游由用户确认并持久化，进入项目后不应要求用户再敲一个
    // 空格制造“第一个版本”才能继续。正式版本存在时仍由正式稿接管。
    publishUnlocked:
      (scriptData?.versions.length ?? 0) > 0 || Boolean(radarDraftSeed),
    blindPrediction: currentBlindPrediction,
    ammo,
    ammoReadError,
    scriptReview,
  };
}

interface TranscriptTaskDto {
  readonly projectId?: string | null;
  readonly status?: string;
  readonly inputData?: Record<string, unknown>;
}

/**
 * [T-505] 首屏恢复项目逐字稿状态。
 *
 * 先按 runner 的真实落点判 done；否则从持久 ai_tasks 找同项目/同 aweme 最近任务。
 * 查询不强制 projectId，是为了恢复修复前创建的旧任务（旧行 project_id 为 null，
 * 但 inputData.awemeIds 仍有稳定作品锚）。任一读失败诚实降级 idle，不在读路径写任务。
 */
export async function readProjectTranscriptState(
  client: DraftWorkbenchClient,
  projectId: string,
  awemeId: string | null,
): Promise<ProjectTranscriptState> {
  if (!awemeId) return "idle";

  let hasTranscript = false;
  if (client.listArtifacts) {
    try {
      hasTranscript = await hasCurrentTranscriptForAweme(
        {
          async listProjectArtifacts(id) {
            const listed = await client.listArtifacts!({
              params: { projectId: id },
              query: { page: 1, pageSize: 200 },
              body: undefined,
            });
            return (
              Array.isArray(listed) ? listed : []
            ) as TranscriptArtifactSummary[];
          },
          async listArtifactVersions(artifactId) {
            const listed = await client.listArtifactVersions({
              params: { artifactId },
              query: { page: 1, pageSize: 200 },
              body: undefined,
            });
            return (
              Array.isArray(listed) ? listed : []
            ) as TranscriptArtifactVersion[];
          },
        },
        projectId,
        awemeId,
      );
    } catch {
      hasTranscript = false;
    }
  }
  if (hasTranscript) return "done";
  if (!client.listAITasks) return "idle";

  try {
    const listed = await client.listAITasks({
      params: undefined,
      query: {
        page: 1,
        pageSize: 100,
        taskType: "transcribe.douyin",
      },
      body: undefined,
    });
    const tasks = (Array.isArray(listed) ? listed : []) as TranscriptTaskDto[];
    const latest = tasks.find((task) => {
      const awemeIds = task.inputData?.awemeIds;
      return (
        task.projectId === projectId ||
        (Array.isArray(awemeIds) && awemeIds.includes(awemeId))
      );
    });
    if (!latest) return "idle";
    if (latest.status === "queued") return "queued";
    if (
      latest.status === "running" ||
      latest.status === "awaiting_confirmation"
    ) {
      return "running";
    }
    if (latest.status === "succeeded") return "done";
    if (latest.status === "failed" || latest.status === "cancelled") {
      return "failed";
    }
    return "idle";
  } catch {
    return "idle";
  }
}

// [T-086] 读本项目最新审核报告。404(未审)/ 桩不带 op / 读失败 → null(诚实显未审)。
async function readScriptReview(
  client: DraftWorkbenchClient,
  projectId: string,
): Promise<ScriptReviewReportResource | null> {
  if (!client.getLatestScriptReview) return null;
  try {
    const raw = await client.getLatestScriptReview({
      params: { projectId },
      query: undefined,
      body: undefined,
    });
    return (raw ?? null) as ScriptReviewReportResource | null;
  } catch {
    return null;
  }
}
