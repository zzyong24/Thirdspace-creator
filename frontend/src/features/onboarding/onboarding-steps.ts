/**
 * onboarding-steps — 纯逻辑:把「各能力已配 state」派生成一份 OnboardingStep[]。
 *
 * [T-131a] 新用户首次引导 checklist 的判定核心(SPEC 2026-07-05 §4 / §C)。
 * 完成态 100% 从现网 state 派生(零新后端、零 progress 真值表);每一步 `done`
 * 只由传入的 capability state 决定 —— 配了→done、没配→未完成、读失败→未完成
 * (读失败在 overlay 装配层降级成「该 state 缺席」,这里一律当未完成,绝不假打勾)。
 *
 * 本模块是**纯函数 + 静态配置数组**,不 import 任何 client / React —— 好单测、
 * 好复用。overlay 壳(onboarding-overlay.tsx)负责并行拉真值填 OnboardingState,
 * 再喂给 deriveSteps。
 */

export type OnboardingGroup = "required" | "optional";

/** 单步判定后的视图数据。overlay 直接渲染这个形状。 */
export interface OnboardingStep {
  /** 稳定 key(测试与 data-slot 定位用),同时是 step-set 配置的主键。 */
  readonly key: string;
  readonly group: OnboardingGroup;
  /** 中文标题(要做什么)。 */
  readonly title: string;
  /** 一句话「为什么」(动机)。 */
  readonly why: string;
  /** 完成态 —— 纯派生自 state,未配 / 读失败一律 false。 */
  readonly done: boolean;
  /** 「去配置 →」深链(到对应设置 / 页面路由)。 */
  readonly href: string;
}

/**
 * 各能力的已配 state —— overlay 挂载后并行拉各读 op 填这个形状。
 *
 * 关键:每个字段都可能 `undefined`,表示**该 state 尚未加载 / 读失败**
 * (诚实降级)。deriveSteps 把 undefined 与「读到但为空」都当未完成 —— 只有
 * 明确读到「已配」才 done。
 *
 * - `configuredCapabilities`:已配的模型 capability 集合(来自 `client.listModels`,
 *   每行取 `capability`,provider/modelName 非空才算已配)。读失败 → undefined。
 * - `hasPositioningProfile`:定位母版是否存在(`client.getProfile` 成功 resolve →
 *   true;404 / 读失败 → false via undefined 或 false)。
 * - `projectCount`:项目数(`client.listProjects` 长度)。读失败 → undefined。
 * - `hasStorageRoot`:存储根目录是否已由用户设定(`client.getStorage` 成功且
 *   rootPath 非空)。⚠️ 见 storage-root step 注释:后端对未配用户也返回默认根,
 *   故这里的信号只能表达「存储配置可读」,不能真区分「用户显式设过」——本切片
 *   据此 done=true(读到即算),把「显式设过 vs 默认」的强区分留 SPEC 切片 d。
 *   读失败 → undefined → 未完成。
 */
export interface OnboardingState {
  readonly configuredCapabilities?: ReadonlySet<string>;
  readonly hasPositioningProfile?: boolean;
  readonly projectCount?: number;
  readonly hasStorageRoot?: boolean;
}

/**
 * step-set —— 易调的配置数组(SPEC §C 推荐默认 scope)。每条声明一步的静态
 * 元数据 + 一个纯判定函数 `isDone(state)`。要增删步 / 调必备-可选划分,只改这个
 * 数组,deriveSteps 逻辑不用动。
 *
 * done 判定只用「能从现有 client 读 op 廉价得到」的信号(SPEC 范围约束):
 * - required:文本模型(default capability)/ 定位母版 / 首个项目。
 * - optional:生图 / 生视频 / 审核 / ASR 模型 / 联网搜索 provider / 存储根目录。
 *   （抖音登录、违禁词表无现成浏览器 client 读 op → 本切片不纳入,留 SPEC 切片 d。）
 */
interface StepSpec {
  readonly key: string;
  readonly group: OnboardingGroup;
  readonly title: string;
  readonly why: string;
  readonly href: string;
  readonly isDone: (state: OnboardingState) => boolean;
}

/** 某个 model capability 是否已配(读到集合且含该 capability)。读失败(集合 undefined)→ 未完成。 */
function hasCapability(state: OnboardingState, capability: string): boolean {
  return state.configuredCapabilities?.has(capability) ?? false;
}

export const ONBOARDING_STEP_SET: readonly StepSpec[] = [
  // ── 必备组 ────────────────────────────────────────────────────────────
  {
    key: "text-model",
    group: "required",
    title: "配置文本模型",
    why: "所有 AI 能力(选题、写稿、审核)的地基,不配无法跑通任何生成。",
    href: "/settings",
    isDone: (s) => hasCapability(s, "default"),
  },
  {
    key: "positioning-profile",
    group: "required",
    title: "建立定位母版",
    why: "账号定位是下游选题 / 评分的约束源 —— 先定位,选题写稿才不跑偏。",
    href: "/positioning",
    isDone: (s) => s.hasPositioningProfile === true,
  },
  {
    key: "first-project",
    group: "required",
    title: "创建首个项目",
    why: "把一个选题落地为项目,才能进入脚本 → 发布 → 复盘的创作飞轮。",
    href: "/projects/new",
    isDone: (s) => (s.projectCount ?? 0) >= 1,
  },
  // ── 可选组(增益,配了体验更完整)────────────────────────────────────
  {
    key: "image-model",
    group: "optional",
    title: "配置生图模型",
    why: "给内容自动配封面 / 隐喻图,省去手动找图。",
    href: "/settings",
    isDone: (s) => hasCapability(s, "image.generate"),
  },
  {
    key: "video-model",
    group: "optional",
    title: "配置生视频模型",
    why: "生成 B-roll / 分镜画面,补齐视频素材。",
    href: "/settings",
    isDone: (s) => hasCapability(s, "video.generate"),
  },
  {
    key: "review-model",
    group: "optional",
    title: "配置审核模型",
    why: "用专用模型跑文案审核,不配则退回默认模型(报告会标注非专用)。",
    href: "/settings",
    isDone: (s) => hasCapability(s, "script.review"),
  },
  {
    key: "asr-model",
    group: "optional",
    title: "配置 ASR 模型",
    why: "把音视频转逐字稿,复盘 / 二创才有文字底稿。",
    href: "/settings",
    isDone: (s) => hasCapability(s, "transcribe.audio"),
  },
  {
    key: "web-search",
    group: "optional",
    title: "配置联网搜索",
    why: "素材搜集前置真检索,不配则素材来自模型记忆(需人工核实)。",
    href: "/settings",
    isDone: (s) => hasCapability(s, "web.search"),
  },
  {
    key: "storage-root",
    group: "optional",
    title: "设置存储根目录",
    why: "指定素材落盘位置,统一管理图片 / 视频 / 音频。",
    href: "/settings",
    // ⚠️ 弱信号:后端对未配用户也返回默认根,故 done 只表达「存储配置可读」,
    // 不能真区分用户是否显式设过(留 SPEC 切片 d 补强判定端口)。读失败 → 未完成。
    isDone: (s) => s.hasStorageRoot === true,
  },
];

/**
 * deriveSteps —— 纯函数:吃各能力 state → 产 OnboardingStep[]。
 *
 * 每步的 `done` 由 step-set 里各自的 `isDone` 从 state 派生:配了→done、
 * 没配→false、读失败(state 字段 undefined)→false(诚实降级,绝不假打勾)。
 * 返回顺序与 step-set 声明顺序一致(必备在前、可选在后)。
 */
export function deriveSteps(state: OnboardingState): OnboardingStep[] {
  return ONBOARDING_STEP_SET.map((spec) => ({
    key: spec.key,
    group: spec.group,
    title: spec.title,
    why: spec.why,
    href: spec.href,
    done: spec.isDone(state),
  }));
}

/** 必备步是否全部完成(→ 不自动弹)。 */
export function allRequiredDone(steps: readonly OnboardingStep[]): boolean {
  const required = steps.filter((s) => s.group === "required");
  // 无必备步(理论不会) → 视为已完成(不自动弹),防空数组误判。
  return required.every((s) => s.done);
}

/** 进度:已完成步数 / 总步数(全组一起算,顶部「已完成 N/总 M」用)。 */
export function progressOf(steps: readonly OnboardingStep[]): {
  readonly done: number;
  readonly total: number;
} {
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
  };
}
