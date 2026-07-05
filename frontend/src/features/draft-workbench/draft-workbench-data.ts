import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import {
  loadScriptEditorData,
  loadThesisSkeleton,
  resolveScriptArtifactIdFromDb,
  type ScriptDataClient,
  type ThesisSkeletonNode,
} from "@/features/script/script-editor-data";
import type { ProjectBriefDetail, ProjectStageName } from "@/types/domain";
import type { ScriptSectionView } from "@/types/view-models";
import type { ScriptReviewReportResource } from "@creatoros/contract";

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
}

interface OutputDto {
  readonly id: string;
}

interface PublicationDto {
  readonly id: string;
  readonly platform: string;
  readonly status: string;
  readonly currentRevisionId: string;
  readonly publishedAt: string | null;
}

interface RevisionDto {
  readonly id: string;
  readonly title: string;
  readonly platformTags?: ReadonlyArray<string>;
  readonly coverAssetId?: string | null;
}

interface MaterialLinkDto {
  /** [T-109] material_link 行自身 id —— 解绑(deleteMaterialLink)的目标,非 entityId。 */
  readonly id: string;
  readonly entityType: "knowledge" | "asset";
  readonly entityId: string;
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
}

export interface DraftWorkbenchClient extends ScriptDataClient {
  getProject(input: {
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
}

// ---------------------------------------------------------------------------
// 稿面 VM
// ---------------------------------------------------------------------------

export interface DraftWorkbenchVm {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly brief: string;
    readonly currentStage: ProjectStageName;
    readonly imported: boolean;
    readonly briefDetail: ProjectBriefDetail | null;
  };
  /** 脚本区:DB 解析的 artifactId(null=还没有,首存/AI 起草时 ensure)。 */
  readonly scriptArtifactId: string | null;
  readonly script: {
    readonly editorHtml: string | null;
    readonly sections: ReadonlyArray<ScriptSectionView>;
    readonly versionCount: number;
  };
  /**
   * [T-055h③] 项目的第一个 ContentOutput id(登记已发布的挂点);null = 还没有
   * (登记表单提交时先 createOutput 铸一个)。
   */
  readonly outputId: string | null;
  /** 发布包:null = 还没有发布行(锁定态用引导文案)。 */
  readonly publishPack: {
    readonly publicationId: string;
    readonly platform: string;
    readonly status: string;
    readonly publishedAt: string | null;
    readonly title: string;
    readonly tags: ReadonlyArray<string>;
    readonly hasCover: boolean;
    /** [T-078] 真封面 asset id(采集回填/手选);null → 「封面待生成」占位。 */
    readonly coverAssetId: string | null;
  } | null;
  /** 发布包解锁:脚本已有版本(SPEC §4.3;transition 门在主行动按钮上)。 */
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
  } | null;
  readonly ammo: ReadonlyArray<{
    /**
     * [T-109] material_link 行自身 id —— 稿面「移除」解绑(deleteMaterialLink)的目标。
     * 注意:这不是 knowledge/asset 的 id(那是 entityId),删链接必须用它。
     */
    readonly linkId: string;
    readonly id: string;
    readonly kind: "knowledge" | "asset";
    readonly title: string;
    readonly sourceLabel: string;
    /** [T-058④] 图片素材的签名预览 URL(非图片/取不到 → null,卡片退回类型徽标)。 */
    readonly previewUrl: string | null;
  }>;
  /**
   * [T-086] 稿面审核门首屏报告(scriptReviews.getLatest;null = 未审)。稿面客户端岛
   * 用它渲染 verdict/命中列表 + 软门提示(报告版本 < script.versionCount → 提示重审)。
   */
  readonly scriptReview: ScriptReviewReportResource | null;
  /**
   * [T-127] 项目已采纳的论点骨架(thesis_tree 当前版本 nodes:核心论点 + 支撑/证据/反驳分支);
   * null = 还没立论点(稿面「论点骨架」面板渲染诚实空态 + 立论点 CTA)。让原本埋在 Copilot、
   * 稿面看不到的论点显性化 —— 用户「不知道要先立论点」的根因。
   */
  readonly thesis: ReadonlyArray<ThesisSkeletonNode> | null;
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
    const outputs = (Array.isArray(outputsRaw) ? outputsRaw : []) as OutputDto[];
    // [T-055h③] outputId 单独浮出:没有发布行时登记表单也要知道挂点在哪。
    const outputId = outputs[0]?.id ?? null;
    if (!outputId) return { outputId: null, publishPack: null };
    const pubsRaw = await client.listPublications({
      params: { outputId },
      query: { page: 1, pageSize: 10 },
      body: undefined,
    });
    const pubs = (Array.isArray(pubsRaw) ? pubsRaw : []) as PublicationDto[];
    const pub = pubs[0];
    if (!pub) return { outputId, publishPack: null };
    let revision: RevisionDto | null = null;
    try {
      const revsRaw = await client.listPublicationRevisions({
        params: { publicationId: pub.id },
        query: { page: 1, pageSize: 20 },
        body: undefined,
      });
      const revs = (Array.isArray(revsRaw) ? revsRaw : []) as RevisionDto[];
      revision = revs.find((r) => r.id === pub.currentRevisionId) ?? revs[0] ?? null;
    } catch {
      revision = null;
    }
    return {
      outputId,
      publishPack: {
        publicationId: pub.id,
        platform: pub.platform,
        status: pub.status,
        publishedAt: pub.publishedAt,
        title: revision?.title?.trim() || "",
        tags: revision?.platformTags ?? [],
        hasCover: Boolean(revision?.coverAssetId),
        coverAssetId: revision?.coverAssetId ?? null,
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
    };
  } catch {
    return null;
  }
}

async function readAmmo(
  client: DraftWorkbenchClient,
  projectId: string,
): Promise<DraftWorkbenchVm["ammo"]> {
  try {
    const linksRaw = await client.listMaterialLinks({
      params: undefined,
      query: { projectId, page: 1, pageSize: 30 },
      body: undefined,
    });
    const links = (Array.isArray(linksRaw) ? linksRaw : []) as MaterialLinkDto[];
    const resolved = await Promise.all(
      links.slice(0, 12).map(async (link) => {
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
            title: a.name,
            sourceLabel: `素材 · ${a.assetType}`,
            previewUrl,
          };
        } catch {
          return null;
        }
      }),
    );
    return resolved.filter((x): x is NonNullable<typeof x> => x !== null);
  } catch {
    return [];
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

  const scriptArtifactId = await resolveScriptArtifactIdFromDb(
    project.id,
    client,
  );
  const scriptData = await loadScriptEditorData(scriptArtifactId, client);

  const [{ outputId, publishPack }, ammo, thesis] = await Promise.all([
    readPublishPack(client, project.id),
    readAmmo(client, project.id),
    // [T-127] 读已采纳论点骨架(无 → null,面板显诚实空态)。与 script/ammo 并行。
    loadThesisSkeleton(project.id, client),
  ]);

  // [T-063e] 盲预测读依赖 outputId,故在发布包读之后串行。
  const blindPrediction = await readBlindPrediction(client, outputId);

  // [T-086] 稿面审核门首屏报告(404=未审吞成 null,桩不带 op → null,诚实)。
  const scriptReview = await readScriptReview(client, project.id);

  return {
    project: {
      id: project.id,
      title: project.title,
      brief: project.brief,
      currentStage: project.currentStage,
      imported: project.source === "imported",
      briefDetail: project.briefDetail ?? null,
    },
    scriptArtifactId,
    outputId,
    script: {
      editorHtml: scriptData?.editorHtml ?? null,
      sections: scriptData?.sections ?? [],
      versionCount: scriptData?.versions.length ?? 0,
    },
    publishPack,
    publishUnlocked: (scriptData?.versions.length ?? 0) > 0,
    blindPrediction,
    ammo,
    scriptReview,
    thesis,
  };
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
