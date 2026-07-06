/**
 * onboarding-steps — [T-161] 有序引导流的纯逻辑核心(取代 T-131a/T-132 的扁平三档)。
 *
 * 新用户引导从「并列打勾清单」重构为**有序引导流**:按新用户真实旅程一步步带,
 * 含前置门(未满足则后续步锁/灰)+ 从零/有存量分支(origin)。流程(SPEC
 * `2026-07-06-onboarding-guided-flow-design.md` §3.1):
 *   1. 配置文本模型(前置门 —— 所有 AI 能力地基)
 *   2. 确认起点(你之前在抖音发过作品吗?→ fresh / existing)
 *   3. 扫码导入抖音号            (仅 existing;复用 T-136§D 扫码链)
 *   4. 后台数据初始化           (仅 existing;复用 T-151 一键初始化三定时任务)
 *   5. 创建定位                 (existing 基于导入作品预设,复用 positioning.generate;fresh 手动)
 *   6. 创建首个项目
 * fresh 分支跳过 3/4;existing 走全程。
 *
 * 本模块是**纯函数 + 静态配置数组**,不 import 任何 client / React —— 好单测、好复用。
 * 装配层(onboarding-data.ts)并行拉真值填 OnboardingState,再喂 deriveGuidedSteps。
 * done 判定诚实降级:配了→done、没配/读失败(state 字段 undefined)→未完成,绝不假打勾。
 *
 * 清理(T-159/T-160 联动,SPEC §3.4):删「配置联网搜索」步(T-159 已删设置卡 → href
 * 死链)、删「配置 ASR」步(T-160 本地 Whisper 回退 → ASR 选配,不再当必走引导步)。
 * 生图/视频/审核/存储/违禁词等仍是设置页可选增益,不挤这条有序主流程(移出引导流)。
 */

/** 起点选择:fresh=从零新人 / existing=有存量老创作者 / null=尚未选。 */
export type OnboardingOrigin = "fresh" | "existing" | null;

/** 分支:all=全员步 / existing=仅有存量分支专属步(扫码导入 / 后台初始化)。 */
export type StepBranch = "all" | "existing";

/**
 * 各能力/起点的已配 state —— 装配层(onboarding-data.ts)并行拉各读 op 填这个形状。
 *
 * 关键:每个字段都可能 `undefined`,表示**该 state 尚未加载 / 读失败**(诚实降级)。
 * deriveGuidedSteps 把 undefined 与「读到但为空」都当未完成 —— 只有明确读到「已配」才 done。
 *
 * - `configuredCapabilities`:已配的模型 capability 集合(`client.listModels`,
 *   provider 非空且 hasSecret 才算真配)。读失败 → undefined。
 * - `origin`:起点选择(localStorage `creatoros:onboarding:origin`)。undefined=未加载、
 *   null=已加载但未选。步2 done 判据 = origin ∈ {fresh, existing}。
 * - `douyinLoggedIn`:抖音扫码登录态(`client.statusDouyin` → {loggedIn})。读失败 → undefined。
 * - `hasImportedWorks`:是否已有 ≥1 个 source==="imported" 的项目(推断「后台初始化跑过一轮」,
 *   SPEC §3.1 importInitialized)。读失败 → undefined。
 * - `hasPositioningProfile`:定位母版是否存在(`client.getProfile` 成功 resolve → true)。
 * - `projectCount`:项目数(`client.listProjects` 长度)。读失败 → undefined。
 */
export interface OnboardingState {
  readonly configuredCapabilities?: ReadonlySet<string>;
  readonly origin?: OnboardingOrigin;
  readonly douyinLoggedIn?: boolean;
  readonly hasImportedWorks?: boolean;
  readonly hasPositioningProfile?: boolean;
  readonly projectCount?: number;
}

/** 单步判定后的视图数据。onboarding-card 直接渲染这个形状。 */
export interface GuidedStep {
  /** 稳定 key(测试与 data-slot 定位用),同时是 step-set 配置的主键。 */
  readonly key: string;
  /** 步序(1 起,决定竖向编号与门控链)。 */
  readonly order: number;
  /** 分支归属(all=全员 / existing=仅有存量)。 */
  readonly branch: StepBranch;
  /** 中文标题(要做什么)。 */
  readonly title: string;
  /** 一句话「为什么」(动机)。 */
  readonly why: string;
  /** 完成态 —— 纯派生自 state,未配 / 读失败一律 false。 */
  readonly done: boolean;
  /** 前置未满足 → true(该步置灰 + 锁提示,推荐序,不硬锁导航)。 */
  readonly blocked: boolean;
  /** blocked 时的锁提示(为什么现在还不能做);未 blocked → 空串。 */
  readonly blockedReason: string;
  /** 「去做 →」深链(到对应页 / 触发起点选择)。 */
  readonly href: string;
}

/** step-set 静态配置:每步声明元数据 + `isDone` 纯判定函数。要增删/调序只改此数组。 */
interface GuidedStepSpec {
  readonly key: string;
  readonly order: number;
  readonly branch: StepBranch;
  readonly title: string;
  readonly why: string;
  readonly href: string;
  readonly isDone: (state: OnboardingState) => boolean;
  /** 前置未满足时的锁提示(为什么现在还不能做)。第一步无前置 → 空串。 */
  readonly blockedReason: string;
}

/** 某个 model capability 是否已配(读到集合且含该 capability)。读失败(集合 undefined)→ 未完成。 */
function hasCapability(state: OnboardingState, capability: string): boolean {
  return state.configuredCapabilities?.has(capability) ?? false;
}

/**
 * 有序引导流的 step-set(SPEC §3.1 六步)。branch=existing 的两步只在 origin=existing 时可见。
 * href 深链:
 *   - text-model → 设置页高亮文本模型卡。
 *   - confirm-origin → 特殊值 `#origin`:卡内二选一,不跳页(onboarding-card 拦截)。
 *   - import-account → `/accounts`(扫码绑号,account-manager「扫码绑定新抖音号」主操作)。
 *   - init-data → `/automations`(用模板一键建三采集任务 + 立即运行,复用 T-151 链)。
 *   - positioning-profile → `/positioning`(existing 走 positioning.generate 基于导入作品预设,
 *     深链由 card 在 existing 场景带 prefill,见 onboarding-card)。
 *   - first-project → `/projects/new`。
 */
export const GUIDED_STEP_SET: readonly GuidedStepSpec[] = [
  {
    key: "text-model",
    order: 1,
    branch: "all",
    title: "配置文本模型",
    why: "这是所有 AI 能力(选题、写稿、定位、审核)的地基。先配好它,后面的步骤才能用起来。",
    // [T-132] href 带 ?highlight=<key>:settings 页据此滚动 + 高亮对应配置卡。
    href: "/settings?highlight=text-model",
    isDone: (s) => hasCapability(s, "default"),
    blockedReason: "",
  },
  {
    key: "confirm-origin",
    order: 2,
    branch: "all",
    title: "确认你的起点",
    why: "你之前在抖音发过作品吗?告诉我们是「从零开始」还是「已有存量」,后面的引导会为你量身安排。",
    // 特殊深链:卡内二选一,不跳页(onboarding-card 据 `#origin` 拦截,渲染起点选择 UI)。
    href: "#origin",
    isDone: (s) => s.origin === "fresh" || s.origin === "existing",
    blockedReason: "先配好文本模型,再来确认起点。",
  },
  {
    key: "import-account",
    order: 3,
    branch: "existing",
    title: "扫码导入你的抖音号",
    why: "扫码绑定后,我们就能把你已发布的作品、指标、评论同步进来,让定位和复盘立足你的真实数据。",
    href: "/accounts",
    isDone: (s) => s.douyinLoggedIn === true,
    blockedReason: "先确认起点(有存量),再扫码导入。",
  },
  {
    key: "init-data",
    order: 4,
    branch: "existing",
    title: "后台初始化你的数据",
    why: "一键跑三个采集任务(作品指标 + 逐字稿 + 明细),把你的历史创作沉淀成可分析的底座。后台自动跑,不用一直盯着。",
    href: "/automations",
    isDone: (s) => s.hasImportedWorks === true,
    blockedReason: "先扫码导入抖音号,才能拉取你的作品数据。",
  },
  {
    key: "positioning-profile",
    order: 5,
    branch: "all",
    title: "创建你的定位",
    // why 文案在 card 里按 origin 微调(existing 强调「基于已导入作品」);此处给通用底。
    why: "账号定位是下游选题 / 评分的约束源 —— 先定位,选题写稿才不跑偏。",
    href: "/positioning",
    isDone: (s) => s.hasPositioningProfile === true,
    blockedReason: "先完成前面的步骤,再来创建定位。",
  },
  {
    key: "first-project",
    order: 6,
    branch: "all",
    title: "创建首个项目",
    why: "把一个选题落地为项目,才能进入脚本 → 发布 → 复盘的创作飞轮。",
    href: "/projects/new",
    isDone: (s) => (s.projectCount ?? 0) >= 1,
    blockedReason: "先建立定位,再落地首个项目。",
  },
];

/**
 * 某步在给定 origin 下是否可见。
 *   - branch=all → 恒可见。
 *   - branch=existing → 仅 origin=existing 可见(fresh 跳过;null 未分叉时也不显)。
 */
function isVisible(spec: GuidedStepSpec, origin: OnboardingOrigin): boolean {
  return spec.branch === "all" || origin === "existing";
}

/**
 * deriveGuidedSteps —— 吃 state → 产**当前 origin 下可见的**有序 GuidedStep[]。
 *
 * - 显隐:按 origin 过滤 existing 专属步(fresh / null → 只留全员步)。
 * - done:各步 isDone 从 state 派生(诚实降级)。
 * - blocked:该步的**前一个可见步**未 done → blocked(前置未满足 → 灰/锁)。第一步永不 blocked。
 *   门控沿「可见步链」逐级传导:existing 时步5 的前置是步4;fresh 时步5 的前置是步2(3/4 已隐)。
 * 返回顺序 = order 升序(声明序已如此)。
 */
export function deriveGuidedSteps(state: OnboardingState): GuidedStep[] {
  const origin = state.origin ?? null;
  const visible = GUIDED_STEP_SET.filter((spec) => isVisible(spec, origin));
  const out: GuidedStep[] = [];
  let prevDone = true; // 第一个可见步无前置 → 视为「前置已满足」。
  for (const spec of visible) {
    const done = spec.isDone(state);
    const blocked = !prevDone;
    out.push({
      key: spec.key,
      order: spec.order,
      branch: spec.branch,
      title: spec.title,
      why: spec.why,
      done,
      blocked,
      blockedReason: blocked ? spec.blockedReason : "",
      href: spec.href,
    });
    prevDone = done;
  }
  return out;
}

/**
 * [T-161] onboarding 是否「已完成」—— **当前 origin 下所有可见步全部 done**。常驻卡据此决定
 * 是否隐藏(全走完 → 卡自动消失)。fresh 只看 4 步、existing 看 6 步(deriveGuidedSteps 已按
 * origin 过滤,这里只需全 done)。
 *
 * 无可见步(空数组)→ 视为 true,防空数组误判成「永不完成」。
 */
export function isOnboardingComplete(steps: readonly GuidedStep[]): boolean {
  return steps.every((s) => s.done);
}

/** 进度:已完成步数 / 可见总步数(顶部「已完成 N/M」用;M 随 origin 分支变)。 */
export function progressOf(steps: readonly GuidedStep[]): {
  readonly done: number;
  readonly total: number;
} {
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
  };
}
