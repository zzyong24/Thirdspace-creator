import type { RequestContext } from "@creatoros/contract";

// T-030-D3(逐字稿存量回填 + 可复用绑定 helper)—— SPEC §4.3 + §5.4。
//
// `ensureTranscriptArtifact` 把「一条逐字稿」按 `aweme_id` 绑到已导入的 imported 作品:
// 找到对应 imported 项目 → 建/复用一个 `script` 类 artifact,其当前版本 `content_data`
// 存 `{ transcript, source, awemeId }`,作 `script` 阶段的交付物(§4.3)。
//
// 设计成「通用 + 端口注入」:本 helper 之后 D2(直连 ASR 转写 runner)会复用同一个
// 绑定语义,所以它不直接依赖 projects/artifacts 的 repo/service 具体实现,而是收窄成
// 几个注入端口(同本仓 IngestionPorts 的套路)。回填脚本(backfill-transcripts.ts)与
// 单测都把真实 service 适配到这些端口。
//
// 幂等(§4.3 / F8):同一 project 下,若已存在一个 `artifact_type='script'` 且当前版本
// `content_data.awemeId === awemeId` 的 artifact,则跳过(不重复建)。先按 project +
// artifactType='script' 过滤(小集合),再做 JSON 匹配 —— 与 SPEC 的「先收窄再 JSON 内查」
// 一致。
//
// 找不到对应 imported 作品 → 跳过 + 记 warn(不抛)——回填是尽力而为的批处理,单条
// 无锚不该拖垮整批(DATA-3 由用户/我在运行时核对重叠)。

/** 逐字稿绑定的 script artifact 里 content_data 的规范形状(§4.3)。 */
export interface TranscriptContentData {
  transcript: string;
  /** 逐字稿来源:存量回填 = "transcribed";D2 直连 ASR 亦复用此 helper,可传别的来源标记。 */
  source: string;
  awemeId: string;
}

/** ensureTranscriptArtifact 的入参:一条逐字稿 + 其 aweme_id + 来源标记。 */
export interface EnsureTranscriptArtifactInput {
  awemeId: string;
  transcript: string;
  /** 默认 "transcribed"(存量回填)。 */
  source?: string;
}

/** 单条绑定的结果:bound=新建了 artifact;skipped=已存在或无对应作品(带 reason)。 */
export type EnsureTranscriptArtifactResult =
  | {
      status: "bound";
      projectId: string;
      artifactId: string;
      awemeId: string;
    }
  | {
      status: "skipped";
      reason: "already-exists" | "no-imported-project";
      awemeId: string;
      /** already-exists 时带上命中的既有 artifact / project id(便于回填汇总/排障)。 */
      projectId?: string;
      artifactId?: string;
    };

// —— 注入端口(窄接口,便于 fake / 适配真 service)——

/** 按 aweme_id 找 imported 作品的项目 id(命中返回 projectId,否则 null)。
 *  适配点:projectsRepo.findImportedByRef(ctx, { platform:"douyin", externalId: awemeId })。 */
export type FindImportedProjectByAwemeId = (
  ctx: RequestContext,
  awemeId: string,
) => Promise<string | null>;

/** 该 project 下的 artifact 列表(用于幂等前置过滤)。适配点:artifactsService.listProjectArtifacts。
 *  仅取 helper 需要的三个字段,保持端口最窄。 */
export interface TranscriptArtifactSummary {
  id: string;
  artifactType: string;
  currentVersionId: string | null;
}
export type ListProjectArtifacts = (
  ctx: RequestContext,
  projectId: string,
) => Promise<TranscriptArtifactSummary[]>;

/** 取某 artifact 版本的 content_data(用于 script artifact 的 JSON 幂等匹配)。
 *  适配点:artifactsService.listVersions 里挑当前版本的 contentData(或直接 getVersion)。 */
export type GetVersionContentData = (
  ctx: RequestContext,
  artifactVersionId: string,
) => Promise<Record<string, unknown> | null>;

/** 建一个 artifact(此处固定 artifactType='script'、stage='script')。适配点:artifactsService.createArtifact。 */
export type CreateScriptArtifact = (
  ctx: RequestContext,
  input: {
    projectId: string;
    title: string;
    artifactType: string;
    stage: string;
  },
) => Promise<{ id: string }>;

/** 给 artifact 追加一个带 content_data 的版本(逐字稿事实写在这里)。适配点:artifactsService.createVersion。 */
export type CreateArtifactVersion = (
  ctx: RequestContext,
  artifactId: string,
  input: {
    contentText?: string;
    changeSummary?: string;
    contentData?: Record<string, unknown>;
  },
) => Promise<unknown>;

/** 一个可选的告警回调(找不到对应 imported 作品时记 warn)。默认 console.warn。 */
export type WarnFn = (message: string) => void;

export interface TranscriptArtifactPorts {
  findImportedProjectByAwemeId: FindImportedProjectByAwemeId;
  listProjectArtifacts: ListProjectArtifacts;
  getVersionContentData: GetVersionContentData;
  createScriptArtifact: CreateScriptArtifact;
  createArtifactVersion: CreateArtifactVersion;
  warn?: WarnFn;
}

const SCRIPT_ARTIFACT_TYPE = "output_script";
const SCRIPT_STAGE = "script";

// [Bug-5 T-018] master_script(口播脚本)是稿面区头部真正展示的 artifact;output_script
// 存的是 transcript 事实。两者不是一回事 —— fixture 里它们并存(douyin-real.ts),但真链路上
// createImportedPublication 只建 publication 行,**没建任何 artifact**,导致稿面「口播脚本」
// 永远空。本 helper 在 ensureTranscriptArtifact 同步建一份 master_script,初始内容=transcript:
//   - 用户没动过 master_script → 用 transcript 填充(给他一个起点,可在编辑器自由改)
//   - 用户已编辑过(artifactType=master_script 已存在) → **不动**(避免覆盖人工内容)
// 双 idempotent:runs 多次同 awemeId 不重复建,跨作品也不互相覆盖。
const MASTER_SCRIPT_ARTIFACT_TYPE = "master_script";
const MASTER_SCRIPT_TITLE = "口播脚本";

/**
 * 把一条逐字稿按 aweme_id 绑到已导入的 imported 作品,灌进 script 阶段。
 *
 * 流程:
 *  1. 按 awemeId 找对应 imported 项目。找不到 → 记 warn、返回 skipped(no-imported-project),不抛。
 *  2. 幂等:该项目下已有「script artifact 且当前版本 content_data.awemeId === awemeId」→ 返回 skipped(already-exists)。
 *  3. 否则建一个 script artifact,并给它追加一版,content_data = { transcript, source, awemeId }。
 *
 * 之后 D2 直连 ASR 时复用同一签名(只是 transcript 来自实时转写、source 传别的标记)。
 */
export async function ensureTranscriptArtifact(
  ctx: RequestContext,
  input: EnsureTranscriptArtifactInput,
  ports: TranscriptArtifactPorts,
): Promise<EnsureTranscriptArtifactResult> {
  const awemeId = input.awemeId;
  const source = input.source ?? "transcribed";
  const warn = ports.warn ?? ((m: string) => console.warn(m));

  // 1. 找对应 imported 作品。
  const projectId = await ports.findImportedProjectByAwemeId(ctx, awemeId);
  if (!projectId) {
    warn(
      `[ensureTranscriptArtifact] 跳过 awemeId=${awemeId}:找不到对应的 imported 作品`,
    );
    return { status: "skipped", reason: "no-imported-project", awemeId };
  }

  // 2. 幂等前置:先按 project + artifactType='script' 收窄,再 JSON 匹配 awemeId。
  const artifacts = await ports.listProjectArtifacts(ctx, projectId);
  const scriptArtifacts = artifacts.filter(
    (a) => a.artifactType === SCRIPT_ARTIFACT_TYPE,
  );
  for (const artifact of scriptArtifacts) {
    if (!artifact.currentVersionId) continue;
    const contentData = await ports.getVersionContentData(
      ctx,
      artifact.currentVersionId,
    );
    if (contentData && contentData.awemeId === awemeId) {
      return {
        status: "skipped",
        reason: "already-exists",
        awemeId,
        projectId,
        artifactId: artifact.id,
      };
    }
  }

  // 3. 建 script artifact + 带 content_data 的版本(逐字稿是事实,非重建,origin 不适用)。
  const created = await ports.createScriptArtifact(ctx, {
    projectId,
    title: "逐字稿",
    artifactType: SCRIPT_ARTIFACT_TYPE,
    stage: SCRIPT_STAGE,
  });
  const contentData: TranscriptContentData = { transcript: input.transcript, source, awemeId };
  await ports.createArtifactVersion(ctx, created.id, {
    contentText: input.transcript,
    changeSummary: "逐字稿绑定(transcribed)",
    contentData: contentData as unknown as Record<string, unknown>,
  });

  // [Bug-5 T-018] 同步建 master_script(口播脚本),初始内容=transcript。
  // [Bug-5 T-018] 「用户已编辑过 master_script」= 已存在 master_script artifact → **不动**;
  // 否则按 transcript 建一份,让它在稿面非空,用户可自由编辑。幂等:同 project 多次调不重复建。
  // [Bug-5 T-018] Note:本步失败(网络/库瞬时错)仅记 warn,**不**把 transcript 整批翻 failed
  // —— transcript 自身已成功落地,master_script 是锦上添花。
  const existingMaster = artifacts.find(
    (a) => a.artifactType === MASTER_SCRIPT_ARTIFACT_TYPE,
  );
  if (existingMaster) {
    warn(
      `[ensureTranscriptArtifact] master_script 已存在(已由用户/其它路径编辑),不覆盖 ` +
        `(projectId=${projectId}, artifactId=${existingMaster.id})`,
    );
  } else {
    try {
      const master = await ports.createScriptArtifact(ctx, {
        projectId,
        title: MASTER_SCRIPT_TITLE,
        artifactType: MASTER_SCRIPT_ARTIFACT_TYPE,
        stage: SCRIPT_STAGE,
      });
      await ports.createArtifactVersion(ctx, master.id, {
        contentText: input.transcript,
        // [Bug-5 T-018] contentData 用 html 包原文,sectionsFromVersion 见 html 缺失回退
        // contentText → 单段「脚本正文」,这里显式存好让编辑器有起点。
        changeSummary: "从逐字稿初始化口播脚本",
        contentData: { transcript: input.transcript, source, awemeId },
      });
    } catch (masterErr) {
      warn(
        `[ensureTranscriptArtifact] master_script 同步建失败(transcript 已落,口播脚本暂缺) ` +
          `(projectId=${projectId}): ${
            masterErr instanceof Error ? masterErr.message : String(masterErr)
          }`,
      );
    }
  }

  return { status: "bound", projectId, artifactId: created.id, awemeId };
}

// —— 逐字稿正文解析(§5.4)——
// 每条 `<aweme_id>.md` 是「frontmatter 头(`# 标题` + 若干 `- 元信息` 行)+ `---` 分隔 + 正文」。
// 取 `---` 之后的正文作 transcript;若无 `---`,则去掉开头的 markdown 头(`#` 标题行 +
// `-`/`*` 列表元信息行 + 空行),把剩余当正文。纯函数,便于确定性单测(不读真文件)。

/**
 * 从一条逐字稿 .md 的原文中抽出正文(transcript)。
 *  - 有 `---` 分隔行:返回第一个 `---` 之后的全部内容(去首尾空白)。
 *  - 无 `---`:跳过开头连续的 markdown 头行(`#` 开头的标题 / `-`、`*` 开头的元信息 / 空行),
 *    返回其后的正文(去首尾空白)。
 */
export function extractTranscriptBody(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  // 有 `---` 分隔行:取第一个之后的所有内容。
  const sepIdx = lines.findIndex((l) => l.trim() === "---");
  if (sepIdx !== -1) {
    return lines
      .slice(sepIdx + 1)
      .join("\n")
      .trim();
  }

  // 无 `---`:跳过开头的 markdown 头(标题 / 列表元信息 / 空行),取第一段正文起。
  let i = 0;
  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (t === "" || t.startsWith("#") || t.startsWith("- ") || t.startsWith("* ")) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").trim();
}
