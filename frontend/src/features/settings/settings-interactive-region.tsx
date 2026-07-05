"use client";

/**
 * `settings-interactive-region.tsx` — Client island for the Settings
 * page (Task 25 / page-specs §17).
 *
 * The Settings page exposes several interactive form controls
 * (Switch toggles, Select dropdowns, Inputs) — and the spec requires
 * these to follow the "label + control" compact pattern with
 * fixture-only local state. No team / permission / subscription /
 * server persistence affordances are added (D-001 + page-specs §17
 * "禁止改变").
 *
 * The island exports two column components:
 *  - `SettingsMainColumn` (the left column of SettingsGrid) — host
 *    AccountInformationCard → PreferenceSettingsCard →
 *    SystemSettingsCard, each with `SettingsFormRow` rows that
 *    hold local Switch / Select / Input controls.
 *  - `SettingsRailColumn` (the right column of SettingsGrid) — host
 *    StorageUsageCard → ModelConfigurationCard.
 *
 * The page-level `SettingsPage` Server Component is responsible for
 * laying out the columns inside `SettingsGrid`. This island keeps
 * the page itself as a Server Component while only the interactive
 * form controls run on the client.
 *
 * Determinism: every visible value comes from the canonical fixture
 * or a hard-coded default. No `Date.now`/`Math.random`/network.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/project/progress-bar";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { cn } from "@/lib/utils";
import {
  UserRound,
  SlidersHorizontal,
  Palette,
  Cpu,
  HardDrive,
  Link2,
  QrCode,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Trash2,
  Plus,
  ChevronDownIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReviewRuleResource } from "@creatoros/contract";

import type {
  DouyinAccountState,
  MultimodalModelState,
  SettingsViewModel,
} from "./settings-page";
// T-077a 技能页签:列表/详情组件 + 可序列化条目类型(route server 侧投影传入)。
import { SkillsSection } from "./skills-section";
import type { SkillItem } from "./skills-data";
import { clearOnboardingFlags } from "@/features/onboarding/onboarding-card";

// ---------------------------------------------------------------------------
// useSettingsMutation — the shared island mutation seam (plan Step 5)
// ---------------------------------------------------------------------------
//
// Every needs-backend control optimistically flips its local state, fires the
// mapped Settings op, then `router.refresh()` so the server re-reads the seeded
// repo (mirrors `project-overview/project-actions.tsx`). A `pending` guard blocks
// concurrent writes. The optimistic value is the source of truth in the control
// while the refresh round-trips; the server read confirms it on the next render.
function useSettingsMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

// The model card configures the GLOBAL DEFAULT model (capability "default"). All
// AI nodes resolve against it (resolve.ts: per-capability row → "default" row →
// env → built-in). Per-capability overrides stay an advanced surface (the
// contract + resolve already support them); the card pins to "default".
const MODEL_CAPABILITY = "default";

// ---------------------------------------------------------------------------
// Local appearance persistence (GAP-SET-1 — theme/density made真持久)
// ---------------------------------------------------------------------------
//
// The `settings.preferences.patch` contract op has NO theme/density field, so
// these two appearance controls persist client-side via localStorage and apply
// real `document.documentElement` classes. This is真持久 (survives reload), not
// inert, and touches no shared contract surface. (Locale stays identity-derived
// display only.)
const THEME_STORAGE_KEY = "creatoros.settings.theme";
const DENSITY_STORAGE_KEY = "creatoros.settings.density";

type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";

const THEME_VALUES: ReadonlyArray<Theme> = ["system", "light", "dark"];
const DENSITY_VALUES: ReadonlyArray<Density> = ["comfortable", "compact"];

function readStored<T extends string>(
  key: string,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && (allowed as ReadonlyArray<string>).includes(raw)) {
      return raw as T;
    }
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to default.
  }
  return fallback;
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence; ignore quota / disabled-storage errors.
  }
}

/** Apply the resolved theme as a `.dark` / no-`.dark` class on <html>. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", prefersDark);
  root.dataset.theme = theme;
}

/** Apply density as a `data-density` attribute on <html> for layout hooks. */
function applyDensity(density: Density): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}

// ---------------------------------------------------------------------------
// SettingsDialog — 居中大弹窗 + 左竖 Tab 栏 + 右框内滚动
// ---------------------------------------------------------------------------
//
// 设置从「一屏全部铺满的整页」改为弹窗式:打开 /settings 即弹出一个居中大弹窗
// (max-w-4xl / h-[85vh] 固定高度),左侧竖向 Tab 栏分组(账户 / 偏好 / 外观 /
// 模型配置 / 存储),右侧内容区按选中的 Tab 各自 `overflow-y-auto` 框内滚动——
// 不再一屏塞满。关闭(点 X / Esc / 点遮罩)→ router.back() 回上一页。
//
// 每个 Tab panel 用 forceMount + data-[state=inactive]:hidden 全部挂载:这样
// 各卡里的本地草稿/受控态在切 Tab 时不丢,同时结构测试也能一次看到所有卡的
// data-slot(account-information-card / model-configuration-card 等)。

interface SettingsTabDef {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

const SETTINGS_DIALOG_TABS: ReadonlyArray<SettingsTabDef> = [
  { id: "account", label: "账户", icon: UserRound },
  { id: "preferences", label: "偏好", icon: SlidersHorizontal },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "models", label: "模型配置", icon: Cpu },
  // T-077a:技能管理页签(SPEC 2026-07-03 §1.1)—— 列出 REGISTRY 全部 Skill,查看/定制
  // system/template(settings.prompts.put 热生效)。
  { id: "skills", label: "技能", icon: Sparkles },
  { id: "storage", label: "存储", icon: HardDrive },
];

// [T-132] onboarding 深链 stepKey → 该卡所在设置页签。settings 类步骤点「去配置」跳
// /settings?highlight=<stepKey>,弹窗据此先切到对应页签、再滚动+高亮那张卡。未列出的
// stepKey(或缺省 highlight)→ 无副作用(不切页签、不报错)。
const HIGHLIGHT_TAB: Record<string, string> = {
  "text-model": "models",
  "image-model": "models",
  "video-model": "models",
  "review-model": "models",
  "asr-model": "models",
  "web-search": "models",
  "review-rules": "models",
  "storage-root": "storage",
};

export function SettingsDialog({
  viewModel,
  skills = [],
}: {
  viewModel: SettingsViewModel;
  /**
   * T-077a:技能清单(route server 侧经 ai-worker listTemplates + settings.prompts.list
   * 投影)。单测/无 server 数据时缺省空数组 → SkillsSection 渲诚实空态。
   */
  skills?: readonly SkillItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlight = searchParams?.get("highlight") ?? null;
  const [open, setOpen] = React.useState(true);
  const [tab, setTab] = React.useState<string>(SETTINGS_DIALOG_TABS[0]!.id);

  // 关闭弹窗:回上一页(回到打开设置之前的位置),没有历史时兜底回首页。
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }
    },
    [router],
  );

  // [T-132] ?highlight=<stepKey> 深链落地定位(非逐步 tour,只是把 onboarding「去配置」
  // 的深链滚到对应卡)。先切到该卡所在页签,下一帧找 [data-highlight=<key>] 元素滚到
  // 视野中央 + 临时加高亮 ring,2s 后移除。highlight 缺省 / 找不到对应卡 → 无副作用。
  React.useEffect(() => {
    if (!highlight) return;
    const targetTab = HIGHLIGHT_TAB[highlight];
    if (!targetTab) return; // 未知 stepKey → 不切页签、不报错。
    setTab(targetTab);
    // 切页签后延一帧,让目标 panel 由 hidden 转可见再滚动 + 高亮。
    const raf = requestAnimationFrame(() => {
      if (typeof document === "undefined") return;
      const el = document.querySelector(
        `[data-highlight="${CSS.escape(highlight)}"]`,
      );
      if (!(el instanceof HTMLElement)) return; // 找不到对应卡 → 无副作用。
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // 高亮 ring(2s 后移除)—— 用与卡片 focus 同调性的 brand ring。
      el.classList.add("ring-2", "ring-brand", "ring-offset-2", "rounded-card");
      const timer = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-brand", "ring-offset-2");
      }, 2000);
      // 保存 timer 到 dataset 以便卸载时清(避免组件卸载后 setTimeout 触发 DOM 访问)。
      el.dataset.highlightTimer = String(timer);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [highlight]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        data-slot="settings-dialog"
        className="flex h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        {/* sticky header — 标题 + 描述 (关闭按钮由 DialogContent 自带的 X 提供). */}
        <div className="flex shrink-0 flex-col gap-1 border-b border-border/70 px-6 py-4">
          <DialogTitle className="text-lg">设置</DialogTitle>
          <DialogDescription>账号、偏好与系统</DialogDescription>
        </div>

        {/* 主体:左竖 Tab 栏 + 右内容区 (各自框内滚动). */}
        <div className="flex min-h-0 flex-1">
          {/* 左侧竖向 Tab 栏. */}
          <nav
            data-slot="settings-tabs"
            aria-label="设置分类导航"
            className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/70 bg-surface-subtle/40 p-2"
          >
            {SETTINGS_DIALOG_TABS.map((t) => {
              const TabIcon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-tab-id={t.id}
                  data-active={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-soft text-brand"
                      : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                  )}
                >
                  <TabIcon className="size-4 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* 右侧内容区:每个 Tab panel 各自框内滚动 (不是一屏铺满). */}
          <div
            data-slot="settings-panels"
            className="min-w-0 flex-1 overflow-y-auto px-6 py-5"
          >
            <SettingsPanel tabId="account" active={tab}>
              <div data-slot="main-settings" className="flex flex-col gap-card-gap">
                <AccountInformationCard viewModel={viewModel} />
                <AccountBindingCard douyinAccount={viewModel.douyinAccount} />
              </div>
            </SettingsPanel>
            <SettingsPanel tabId="preferences" active={tab}>
              <PreferenceSettingsCard viewModel={viewModel} />
            </SettingsPanel>
            <SettingsPanel tabId="appearance" active={tab}>
              <SystemSettingsCard viewModel={viewModel} />
            </SettingsPanel>
            <SettingsPanel tabId="models" active={tab}>
              <div data-slot="settings-rail" className="flex flex-col gap-card-gap">
                {/* ① 必配块:文本模型是 AI 写字 / 对话的地基,配这一个就能用。 */}
                <div data-slot="models-required-group" className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">必配</span>
                    <span className="text-xs text-muted-foreground">
                      AI 写字 / 对话的地基,配这一个就能用;不配时有官方兜底。
                    </span>
                  </div>
                  <ModelConfigurationCard model={viewModel.model} />
                </div>

                {/* ② 折叠块「更多能力」:5 张按需卡,默认收起(不配也能用,各自诚实降级)。
                    highlight 命中组内某张卡时初始展开,保证 ?highlight 深链能滚到它。 */}
                <CollapsibleModelGroup
                  title="更多能力(按需,不配也能用)"
                  highlight={highlight}
                  highlightKeys={[
                    "review-model",
                    "image-model",
                    "video-model",
                    "asr-model",
                  ]}
                >
                  {/* [T-086 SPEC §2] 文案审核模型(豆包/火山方舟预设;未配 → 默认模型+标注非专用)。 */}
                  <MultimodalModelCard
                    kind="review"
                    state={viewModel.multimodalModels.review}
                  />
                  <MultimodalModelCard
                    kind="image"
                    state={viewModel.multimodalModels.image}
                  />
                  <MultimodalModelCard
                    kind="video"
                    state={viewModel.multimodalModels.video}
                  />
                  <MultimodalModelCard
                    kind="audio"
                    state={viewModel.multimodalModels.audio}
                  />
                  {/* [T-093] 知识库语义搜索 embedding(未配 → AI 搜索诚实降级关键词)。 */}
                  <MultimodalModelCard
                    kind="embed"
                    state={viewModel.multimodalModels.embed}
                  />
                </CollapsibleModelGroup>

                {/* ③ 联网搜索单独块:这不是模型 API,是找素材的检索方式(rss / browser 免 key)。 */}
                <div data-slot="models-search-group" className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      联网搜索(免 key 检索)
                    </span>
                    <span className="text-xs text-muted-foreground">
                      这不是模型 API,是找素材的检索方式;rss / browser 免 key。
                    </span>
                  </div>
                  {/* [T-084a SPEC §1.1] 联网搜索(素材搜集前置真检索;未配 → 素材来自记忆+需核实)。 */}
                  <MultimodalModelCard
                    kind="search"
                    state={viewModel.multimodalModels.search}
                  />
                </div>

                {/* [T-086 SPEC §4] 审核规则库管理(候选态复盘回流采纳门;禁新增一级导航)。 */}
                <ReviewRulesCard />
              </div>
            </SettingsPanel>
            <SettingsPanel tabId="skills" active={tab}>
              <SkillsSection skills={skills} />
            </SettingsPanel>
            <SettingsPanel tabId="storage" active={tab}>
              <StorageUsageCard storage={viewModel.storage} />
            </SettingsPanel>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 单个 Tab panel:所有 panel 都挂载 (草稿不丢 + 结构测试可一次看到全部卡),
// 仅非选中态用 hidden 视觉隐藏。
function SettingsPanel({
  tabId,
  active,
  children,
}: {
  tabId: string;
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      data-slot="settings-panel"
      data-tab-id={tabId}
      data-active={active === tabId}
      hidden={active !== tabId}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountInformationCard
// ---------------------------------------------------------------------------

function AccountInformationCard({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  // 昵称 is now REAL: it edits the identity-owned `users.displayName` via the
  // `identity.profile.patch` op (`PATCH /me`) — a真持久 server write, not a
  // read-only桩. The input is a controlled draft; saving fires the op and
  // refreshes the server read so the chips/avatar reflect the new name. 邮箱
  // stays read-only (it is the login identifier + unique key — out of the
  // editable surface this wave).
  const initialName = viewModel.account.displayName;
  const [draftName, setDraftName] = React.useState<string>(initialName);
  const { pending, run } = useSettingsMutation();

  // Re-sync the draft when the server read changes the identity (post-refresh).
  React.useEffect(() => {
    setDraftName(initialName);
  }, [initialName]);

  const trimmed = draftName.trim();
  const dirty = trimmed.length > 0 && trimmed !== initialName;

  const saveName = React.useCallback(() => {
    if (!dirty) return;
    run(() =>
      client.patchProfile({
        params: undefined,
        query: undefined,
        body: { displayName: trimmed },
      }),
    );
  }, [dirty, run, trimmed]);

  return (
    <SectionCard
      title="账户信息"
      description="账号基本信息与登录状态"
      action={
        <span
          data-slot="account-status-badge"
          className="inline-flex h-6 items-center rounded-md bg-success-soft px-2 text-xs font-medium text-success"
        >
          已验证
        </span>
      }
    >
      <div data-slot="account-information-card" className="flex flex-col gap-3">
        <div
          data-slot="account-identity"
          className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {viewModel.account.initials}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium text-foreground">
              {viewModel.account.displayName}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {viewModel.account.email}
            </span>
            <div className="flex flex-wrap gap-1">
              {/* 计划 chip is intentionally inert (decorative) — no billing
                  entity exists in Wave 0 (Module 00, Task 12). */}
              <TagChip
                label={`计划：${viewModel.account.planLabel}`}
                tone="brand"
                size="sm"
              />
              {/* 时区 / 语言 chips bind to the REAL identity
                  (`userResource.timezone` / `.locale`). */}
              <TagChip
                label={`时区：${viewModel.account.timezone}`}
                tone="neutral"
                size="sm"
              />
              <TagChip
                label={`语言：${viewModel.account.locale}`}
                tone="neutral"
                size="sm"
              />
            </div>
          </div>
        </div>
        <SettingsFormRow
          label="昵称"
          controlId="account-nickname"
          help="显示名称，保存后立即生效（PATCH /me，真持久）。"
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="account-nickname"
              data-slot="account-nickname-input"
              value={draftName}
              disabled={pending}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                }
              }}
              aria-label="账户昵称"
            />
            <Button
              type="button"
              data-slot="account-nickname-save"
              variant="outline"
              size="sm"
              disabled={!dirty || pending}
              onClick={saveName}
            >
              保存
            </Button>
          </div>
        </SettingsFormRow>
        <SettingsFormRow
          label="邮箱"
          controlId="account-email"
          help="邮箱是登录标识与唯一键，暂不支持在此修改。"
        >
          {/* 邮箱 stays read-only: it is the login identifier + users_email_uk
              unique key. Editing it needs a re-auth / uniqueness flow with no
              route yet — shown as a read-only field. */}
          <Input
            id="account-email"
            type="email"
            data-slot="account-email-input"
            value={viewModel.account.email}
            readOnly
            aria-readonly="true"
          />
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// AccountBindingCard — 账号绑定 / 抖音扫码登录入口 + 连接状态徽标 (T-032a)
// ---------------------------------------------------------------------------
//
// 用户真机测的头号缺口:此前唯一的抖音登录入口在 automations 页的 needs_reconnect 行,
// 没有主动的初次绑定入口。本卡在设置页给一个显式的「连接抖音(扫码)」按钮 + 连接状态徽标。
//
// 徽标据被动探针 `ingestion.douyin.status`(headless 查 sessionid cookie,不弹窗)的
// loggedIn:
//   - true  → 「已连接」(绿)+ 按钮「重新扫码」
//   - false → 「未连接」(灰)+ 按钮「连接抖音(扫码)」;.auth/ profile 存在≠有效登录
//             (cookie 失效即 false),故 false 同时是「登录态已过期,请重新扫码」的载体。
//
// 点击扫码 → `client.loginDouyin({})`(复用 automations 现成 headed 扫码链,零新 op):
//   期间显 loading 态「扫码中…请在弹出的 Chrome 窗口扫码(最多 4 分钟)」(仿 automations
//   loginPhase);返回 {loggedIn:true} → 重新拉 `ingestion.douyin.status` → 徽标转「已连接」+
//   成功提示;{loggedIn:false}(超时)→ 提示「未检测到登录,请重试」。
//
// 诚实(铁律):headed 扫码是真弹本机 Chromium,前端只发起 + 据结果推进,绝不假装登录过。真扫码
// 端到端(DATA-2)卡用户;此卡的 UI/dispatch 接线已就绪,单测用 mock client 覆盖点击→拉态闭环。

type BindingPhase = "idle" | "scanning" | "refreshing";
type BindingFeedback =
  | { kind: "none" }
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

function AccountBindingCard({
  douyinAccount,
}: {
  douyinAccount: DouyinAccountState;
}) {
  const router = useRouter();
  // 初始徽标取 SSR 默认(未连接);挂载后客户端拉真 status 覆盖。放到客户端而非 SSR 是刻意的:
  // status 是 headless 起 Chromium 的被动探针,SSR 读会让每次开设置页都 spawn 浏览器 + 阻塞
  // 渲染,故挪到 useEffect 异步拉,徽标先显 SSR 兜底再翻真。
  const [loggedIn, setLoggedIn] = React.useState<boolean>(douyinAccount.loggedIn);
  const [phase, setPhase] = React.useState<BindingPhase>("idle");
  const [feedback, setFeedback] = React.useState<BindingFeedback>({
    kind: "none",
  });

  // SSR 值变化(切账号 / 首次水合)时同步徽标。
  React.useEffect(() => {
    setLoggedIn(douyinAccount.loggedIn);
  }, [douyinAccount.loggedIn]);

  // 挂载后拉一次真 status(不弹窗,headless 探针),把 SSR 兜底徽标翻真。探针失败(无
  // 浏览器 / transport race)静默保持 SSR 值(未连接),不误显已连接。
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const status = (await client.statusDouyin({
          params: undefined,
          query: undefined,
          body: undefined,
        })) as { loggedIn?: boolean };
        if (alive && typeof status.loggedIn === "boolean") {
          setLoggedIn(status.loggedIn);
        }
      } catch {
        // 探针失败 → 保持 SSR 兜底(未连接),诚实不误报。
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const busy = phase !== "idle";

  // 点击扫码:弹 headed Chromium 让用户扫码 → 成功后重拉 status 刷新徽标。
  const connect = React.useCallback(() => {
    if (busy) return;
    setPhase("scanning");
    setFeedback({ kind: "none" });
    void (async () => {
      try {
        const res = (await client.loginDouyin({
          params: undefined,
          query: undefined,
          body: {},
        })) as { loggedIn?: boolean };
        if (res.loggedIn) {
          // 登录成功 → 重新拉被动 status 确认徽标(以探针为准,不盲信 login 返回)。
          setPhase("refreshing");
          let confirmed = true;
          try {
            const status = (await client.statusDouyin({
              params: undefined,
              query: undefined,
              body: undefined,
            })) as { loggedIn?: boolean };
            confirmed = status.loggedIn ?? true;
          } catch {
            // status 探针失败(transport race)→ 信任 login 的成功返回。
            confirmed = true;
          }
          setLoggedIn(confirmed);
          setFeedback({
            kind: "success",
            text: confirmed
              ? "抖音已连接。"
              : "已扫码,但未检测到有效登录态,请重试。",
          });
          router.refresh();
        } else {
          // 超时(240s 内未扫)→ 明确提示重试,徽标保持未连接。
          setFeedback({
            kind: "error",
            text: "未检测到登录,请重试(需在弹出的 Chrome 窗口内扫码)。",
          });
        }
      } catch {
        setFeedback({
          kind: "error",
          text: "扫码登录失败,请重试。",
        });
      } finally {
        setPhase("idle");
      }
    })();
  }, [busy, router]);

  const buttonLabel = busy
    ? phase === "scanning"
      ? "扫码中…"
      : "确认登录态…"
    : loggedIn
      ? "重新扫码"
      : "连接抖音(扫码)";

  return (
    <SectionCard
      title="账号绑定"
      description="连接平台账号,供采集作品数据 / 评论使用"
      action={
        loggedIn ? (
          <Badge
            data-slot="douyin-binding-status"
            data-connected="true"
            variant="outline"
            className="border-success/40 bg-success-soft text-success"
          >
            已连接
          </Badge>
        ) : (
          <Badge
            data-slot="douyin-binding-status"
            data-connected="false"
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            未连接
          </Badge>
        )
      }
    >
      <div
        data-slot="account-binding-card"
        className="flex flex-col gap-3"
      >
        <div
          data-slot="douyin-binding-row"
          className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <Link2 className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">抖音</span>
            <span
              data-slot="douyin-binding-hint"
              className={cn(
                "text-xs",
                loggedIn ? "text-success" : "text-muted-foreground",
              )}
            >
              {loggedIn
                ? "登录态有效,可采集你的作品数据与评论。"
                : "登录态已过期或未连接,请扫码登录以采集数据。"}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={loggedIn ? "outline" : "default"}
            data-slot="douyin-binding-action"
            disabled={busy}
            onClick={connect}
            title={
              loggedIn
                ? "重新扫码登录抖音(弹本机 Chrome 窗口)"
                : "连接抖音 —— 点此弹本机 Chrome 窗口扫码登录"
            }
          >
            {busy ? (
              <Loader2
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin"
              />
            ) : (
              <QrCode aria-hidden="true" className="size-4 shrink-0" />
            )}
            {buttonLabel}
          </Button>
        </div>

        {/* [T-052 裁决⑤] 账号管理并入设置:多账号矩阵页此前全站无入口(孤儿页)。 */}
        <a
          href="/accounts"
          data-slot="accounts-manager-link"
          className="text-xs font-medium text-brand hover:underline"
        >
          管理多账号矩阵 →
        </a>

        {/* 扫码进行中的引导态(仿 automations loginPhase):真弹本机 Chrome,前端不假装。 */}
        {phase === "scanning" ? (
          <p
            data-slot="douyin-binding-scanning"
            className="text-xs text-muted-foreground"
          >
            扫码中…请在弹出的 Chrome 窗口扫码(最多 4 分钟)。
          </p>
        ) : null}

        {/* 结果反馈(成功 / 失败),就地显示(本仓无 toast 系统,沿用 automations 内联相位反馈)。 */}
        {feedback.kind === "success" ? (
          <p
            data-slot="douyin-binding-feedback"
            data-tone="success"
            className="flex items-center gap-1.5 text-xs text-success"
          >
            <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
            {feedback.text}
          </p>
        ) : feedback.kind === "error" ? (
          <p
            data-slot="douyin-binding-feedback"
            data-tone="error"
            className="flex items-center gap-1.5 text-xs text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            {feedback.text}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// PreferenceSettingsCard
// ---------------------------------------------------------------------------

type CreationMode = "guided" | "flexible" | "freeform";
type Visibility = "private" | "unlisted" | "public";

function PreferenceSettingsCard({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  const initial = viewModel.preferences;
  const [defaultHome, setDefaultHome] = React.useState<string>(
    initial.defaultHome,
  );
  const [defaultCreationMode, setDefaultCreationMode] =
    React.useState<CreationMode>(initial.defaultCreationMode);
  const [defaultVisibility, setDefaultVisibility] = React.useState<Visibility>(
    initial.defaultVisibility,
  );
  const [autosaveEnabled, setAutosaveEnabled] = React.useState<boolean>(
    initial.autosaveEnabled,
  );
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState<boolean>(
    initial.analyticsEnabled,
  );
  const { pending, run } = useSettingsMutation();

  // Each preference control optimistically updates local state, then PATCHes only
  // its own key (op `settings.preferences.patch`) and refreshes the server read.
  const patch = React.useCallback(
    (
      body: Parameters<typeof client.patchPreferences>[0]["body"],
    ) =>
      run(() =>
        client.patchPreferences({ params: undefined, query: undefined, body }),
      ),
    [run],
  );
  return (
    <SectionCard
      title="偏好设置"
      description="新建项目与编辑流程的默认行为"
    >
      <div data-slot="preference-settings-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="默认主页"
          controlId="pref-default-home"
          help="登录后跳转的第一个页面。"
        >
          <Select
            value={defaultHome}
            onValueChange={(value) => {
              const next = String(value);
              setDefaultHome(next);
              patch({ defaultHome: next });
            }}
          >
            <SelectTrigger
              id="pref-default-home"
              data-slot="pref-default-home-trigger"
              size="sm"
              className="w-40"
              disabled={pending}
            >
              <SelectValue placeholder="选择主页" />
            </SelectTrigger>
            <SelectContent data-slot="pref-default-home-content">
              {HOME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="默认创作模式"
          controlId="pref-creation-mode"
          help="新建项目时套用的流程强度。"
        >
          <Select
            value={defaultCreationMode}
            onValueChange={(value) => {
              const next = value as CreationMode;
              setDefaultCreationMode(next);
              patch({ defaultCreationMode: next });
            }}
          >
            <SelectTrigger
              id="pref-creation-mode"
              data-slot="pref-creation-mode-trigger"
              size="sm"
              className="w-40"
              disabled={pending}
            >
              <SelectValue placeholder="选择模式" />
            </SelectTrigger>
            <SelectContent data-slot="pref-creation-mode-content">
              {CREATION_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="默认可见性"
          controlId="pref-visibility"
          help="新建内容的默认分享范围（个人产品，无团队）。"
        >
          <Select
            value={defaultVisibility}
            onValueChange={(value) => {
              const next = value as Visibility;
              setDefaultVisibility(next);
              patch({ defaultVisibility: next });
            }}
          >
            <SelectTrigger
              id="pref-visibility"
              data-slot="pref-visibility-trigger"
              size="sm"
              className="w-40"
              disabled={pending}
            >
              <SelectValue placeholder="选择可见性" />
            </SelectTrigger>
            <SelectContent data-slot="pref-visibility-content">
              {VISIBILITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="自动保存"
          controlId="pref-autosave"
          help="每 30 秒保存一次草稿。"
        >
          <Switch
            id="pref-autosave"
            data-slot="pref-autosave-switch"
            size="sm"
            checked={autosaveEnabled}
            disabled={pending}
            onCheckedChange={(value) => {
              const next = Boolean(value);
              setAutosaveEnabled(next);
              patch({ autosaveEnabled: next });
            }}
            aria-label="启用自动保存"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="使用情况分析"
          controlId="pref-analytics"
          help="帮助我们改进产品；不会上传个人内容。"
        >
          <Switch
            id="pref-analytics"
            data-slot="pref-analytics-switch"
            size="sm"
            checked={analyticsEnabled}
            disabled={pending}
            onCheckedChange={(value) => {
              const next = Boolean(value);
              setAnalyticsEnabled(next);
              patch({ analyticsEnabled: next });
            }}
            aria-label="启用使用情况分析"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="新手引导"
          controlId="pref-reopen-onboarding"
          help="重新打开新手清单引导（即使之前在清单上点过「不再显示」）。"
        >
          <Button
            id="pref-reopen-onboarding"
            type="button"
            variant="outline"
            size="sm"
            data-slot="pref-reopen-onboarding"
            onClick={() => {
              // 清「不再显示」/「session-dismiss」两 flag,再 full-reload 回首页:
              // 关掉设置 modal(避免两 modal 叠加把引导弹窗挤坏),首页 overlay 全新
              // 挂载 → 因 dismissed 已清 + 必备未配全会自动弹 + 常驻卡重现。
              clearOnboardingFlags();
              window.location.href = "/";
            }}
          >
            重新打开新手引导
          </Button>
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

const HOME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "dashboard", label: "首页" },
  { value: "projects", label: "项目" },
  { value: "knowledge", label: "知识库" },
  { value: "publishing", label: "发布中心" },
];

const CREATION_MODE_OPTIONS: ReadonlyArray<{
  value: CreationMode;
  label: string;
}> = [
  { value: "guided", label: "向导模式" },
  { value: "flexible", label: "灵活模式" },
  { value: "freeform", label: "自由模式" },
];

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: Visibility; label: string }> =
  [
    { value: "private", label: "仅自己" },
    { value: "unlisted", label: "不公开列出" },
    { value: "public", label: "公开" },
  ];

// ---------------------------------------------------------------------------
// SystemSettingsCard
// ---------------------------------------------------------------------------

function SystemSettingsCard({ viewModel }: { viewModel: SettingsViewModel }) {
  // Theme / density are真持久 via localStorage (no contract field exists). We
  // lazy-init from the fixture/identity default, then overwrite from storage on
  // mount (avoids an SSR/CSR hydration mismatch — the server can't read
  // localStorage). Every change writes back AND applies real <html> classes.
  //
  // 语言/locale: i18n 本期不落地 → 切换 locale 没有任何可见效果(界面始终中文)。
  // 一个切了没反应的下拉 = 假控件,本期移除(铁律:真实有效或删除)。当前 locale
  // 仍在账户卡作只读 chip 展示(读自真实 identity)。等 i18n 落地后再加回可切换控件。
  const [theme, setTheme] = React.useState<Theme>(viewModel.system.theme);
  const [density, setDensity] = React.useState<Density>(
    viewModel.system.density,
  );

  React.useEffect(() => {
    const storedTheme = readStored(
      THEME_STORAGE_KEY,
      THEME_VALUES,
      viewModel.system.theme,
    );
    const storedDensity = readStored(
      DENSITY_STORAGE_KEY,
      DENSITY_VALUES,
      viewModel.system.density,
    );
    setTheme(storedTheme);
    setDensity(storedDensity);
    applyTheme(storedTheme);
    applyDensity(storedDensity);
    // Run once on mount; the fixture defaults are stable so deps are intentionally
    // limited to the initial identity-derived values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onThemeChange = React.useCallback((next: Theme) => {
    setTheme(next);
    writeStored(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  const onDensityChange = React.useCallback((next: Density) => {
    setDensity(next);
    writeStored(DENSITY_STORAGE_KEY, next);
    applyDensity(next);
  }, []);

  return (
    <SectionCard
      title="外观"
      description="主题与界面密度(本地持久,刷新后保持)"
    >
      <div data-slot="system-settings-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="主题"
          controlId="sys-theme"
          help="跟随系统或手动切换浅色/深色（已本地持久，刷新后保持）。"
        >
          <Select
            value={theme}
            onValueChange={(value) => onThemeChange(value as Theme)}
          >
            <SelectTrigger
              id="sys-theme"
              data-slot="sys-theme-trigger"
              size="sm"
              className="w-40"
            >
              <SelectValue placeholder="选择主题" />
            </SelectTrigger>
            <SelectContent data-slot="sys-theme-content">
              {THEME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="密度"
          controlId="sys-density"
          help="列表与卡片的间距（已本地持久，刷新后保持）。"
        >
          <Select
            value={density}
            onValueChange={(value) => onDensityChange(value as Density)}
          >
            <SelectTrigger
              id="sys-density"
              data-slot="sys-density-trigger"
              size="sm"
              className="w-40"
            >
              <SelectValue placeholder="选择密度" />
            </SelectTrigger>
            <SelectContent data-slot="sys-density-content">
              {DENSITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const DENSITY_OPTIONS: ReadonlyArray<{ value: Density; label: string }> = [
  { value: "comfortable", label: "舒适" },
  { value: "compact", label: "紧凑" },
];

// ---------------------------------------------------------------------------
// StorageUsageCard
// ---------------------------------------------------------------------------

// Format bytes as a GB string with one decimal (decimal GB, 1e9). Real values.
function gb(bytes: number): string {
  return (bytes / 1e9).toFixed(1);
}

// item B — StorageUsageCard 做真. Shows the REAL backend + media root (editable +
// 保存 → settings.storage.put), the real used-vs-disk-capacity progress bar, and
// the per-asset-type breakdown (real bytes). The path edit persists through the
// op + router.refresh() (via useSettingsMutation), then the server re-reads
// settings.storage.get.
function StorageUsageCard({
  storage,
}: {
  storage: SettingsViewModel["storage"];
}) {
  const [rootPath, setRootPath] = React.useState<string>(storage.rootPath);
  const { pending, run } = useSettingsMutation();

  // Re-sync the draft path when a server refresh changes the stored config.
  React.useEffect(() => {
    setRootPath(storage.rootPath);
  }, [storage.rootPath]);

  const canSave = rootPath.trim().length > 0 && rootPath !== storage.rootPath && !pending;

  const save = React.useCallback(() => {
    if (!canSave) return;
    run(() =>
      client.putStorage({
        params: undefined,
        query: undefined,
        body: { rootPath: rootPath.trim() },
      }),
    );
  }, [canSave, run, rootPath]);

  // GB display via /1e9 (decision: (bytes/1e9).toFixed(1)). totalBytes 0 = unknown
  // capacity → the bar uses usedBytes as its own max so it still renders.
  const usedGb = gb(storage.usedBytes);
  const totalGb = storage.totalBytes > 0 ? gb(storage.totalBytes) : null;

  const backendLabel = storage.backend === "s3" ? "云存储 (S3)" : "本地磁盘";

  return (
    <SectionCard title="存储空间" description="素材、知识库与导出文件">
      <div
        data-slot="storage-usage-card"
        data-highlight="storage-root"
        className="flex flex-col gap-3"
      >
        <SettingsFormRow
          label="存储后端"
          controlId="storage-backend"
          help="当前媒体字节落地的位置。"
        >
          <Badge
            id="storage-backend"
            data-slot="storage-backend"
            variant="outline"
            className="border-brand/40 bg-brand-soft text-brand"
          >
            {backendLabel}
          </Badge>
        </SettingsFormRow>
        <SettingsFormRow
          label="媒体路径"
          controlId="storage-root-path"
          help="素材落盘的根目录;支持 ~ 展开。修改后点保存生效(settings.storage.put)。"
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="storage-root-path"
              data-slot="storage-root-path-input"
              value={rootPath}
              disabled={pending}
              placeholder="~/CreatorOS/media"
              onChange={(event) => setRootPath(event.target.value)}
              aria-label="媒体存储路径"
            />
            <Button
              type="button"
              size="sm"
              data-slot="storage-save-button"
              disabled={!canSave}
              onClick={save}
            >
              保存
            </Button>
          </div>
        </SettingsFormRow>
        <ProgressBar
          value={storage.usedBytes}
          max={storage.totalBytes > 0 ? storage.totalBytes : storage.usedBytes || 1}
          label={
            totalGb
              ? `已用 ${usedGb} GB / ${totalGb} GB`
              : `已用 ${usedGb} GB`
          }
          showValue
          tone="brand"
        />
        <ul
          data-slot="storage-breakdown"
          className="flex flex-col gap-1.5 text-sm"
          aria-label="存储分布"
        >
          {storage.breakdown.map((row) => (
            <li
              key={row.assetType}
              data-slot="storage-breakdown-row"
              data-storage-asset-type={row.assetType}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2 text-foreground">
                <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                {row.label}
              </span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {gb(row.bytes)} GB
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// ModelConfigurationCard
// ---------------------------------------------------------------------------

type ApiFormat = "anthropic" | "openai_chat";

const API_FORMAT_OPTIONS: ReadonlyArray<{ value: ApiFormat; label: string }> = [
  { value: "anthropic", label: "Anthropic 兼容" },
  { value: "openai_chat", label: "OpenAI Chat 兼容" },
];

// Free-form provider suggestions — the input is NOT restricted to these (bind any
// vendor: an Anthropic relay, MiniMax, an OpenAI-compatible gateway, etc.).
const PROVIDER_SUGGESTIONS: ReadonlyArray<string> = [
  "anthropic",
  "minimax",
  "openai",
  "google",
  "deepseek",
];

// cc-switch-style configurable provider binding. provider / model / baseUrl /
// apiFormat are free-form; the API key is stored in the LOCAL db (masked to
// `hasSecret` on read — the raw key is never echoed back). A single 保存 upserts
// the "default" capability via `settings.models.put`; resolve.ts then reads it
// (stored key preferred over env-ref) with a global-default fallback.
function ModelConfigurationCard({
  model,
}: {
  model: SettingsViewModel["model"];
}) {
  const [provider, setProvider] = React.useState<string>(model.provider);
  const [modelName, setModelName] = React.useState<string>(model.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(model.baseUrl);
  const [apiFormat, setApiFormat] = React.useState<ApiFormat>(model.apiFormat);
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  const [temperature, setTemperature] = React.useState<number>(
    model.temperature,
  );
  const { pending, run } = useSettingsMutation();

  // Re-sync drafts when a server refresh changes the stored config.
  React.useEffect(() => {
    setProvider(model.provider);
    setModelName(model.modelName);
    setBaseUrl(model.baseUrl);
    setApiFormat(model.apiFormat);
    setTemperature(model.temperature);
    setSecret("");
  }, [model]);

  const canSave =
    provider.trim().length > 0 && modelName.trim().length > 0 && !pending;

  // One PUT upserts the whole "default" config; an empty secret is omitted so a
  // re-save without re-typing the key preserves the stored one.
  const save = React.useCallback(() => {
    if (!canSave) return;
    run(() =>
      client
        .putModel({
          params: { capability: MODEL_CAPABILITY },
          query: undefined,
          body: {
            provider: provider.trim(),
            modelName: modelName.trim(),
            baseUrl: baseUrl.trim() || undefined,
            apiFormat,
            secret: secret.length > 0 ? secret : undefined,
            settings: { temperature },
          },
        })
        .then(() => setSecret("")),
    );
  }, [canSave, run, provider, modelName, baseUrl, apiFormat, secret, temperature]);

  return (
    <SectionCard
      title="模型配置"
      description="自定义绑定厂商 / 模型 / 接口地址 / 密钥;修改后点保存生效"
    >
      <div
        data-slot="model-configuration-card"
        data-highlight="text-model"
        className="flex flex-col gap-3"
      >
        <SettingsFormRow
          label="提供商"
          controlId="model-provider"
          help="任意厂商名,可自定义。"
        >
          <Input
            id="model-provider"
            data-slot="model-provider-input"
            list="model-provider-suggestions"
            value={provider}
            disabled={pending}
            onChange={(event) => setProvider(event.target.value)}
            aria-label="模型提供商"
          />
          <datalist id="model-provider-suggestions">
            {PROVIDER_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </SettingsFormRow>
        <SettingsFormRow
          label="模型"
          controlId="model-name"
          help="模型 id,如 claude-opus-4-8 / MiniMax-M3。"
        >
          <Input
            id="model-name"
            data-slot="model-name-input"
            value={modelName}
            disabled={pending}
            onChange={(event) => setModelName(event.target.value)}
            aria-label="模型名称"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="接口地址"
          controlId="model-base-url"
          help="自定义 baseUrl(中转 / MiniMax);留空走官方默认。"
        >
          <Input
            id="model-base-url"
            data-slot="model-base-url-input"
            value={baseUrl}
            disabled={pending}
            placeholder="https://api.anthropic.com(留空=默认)"
            onChange={(event) => setBaseUrl(event.target.value)}
            aria-label="接口地址"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="接口格式"
          controlId="model-api-format"
          help="鉴权与请求体格式。"
        >
          <Select
            value={apiFormat}
            onValueChange={(value) => setApiFormat(value as ApiFormat)}
          >
            <SelectTrigger
              id="model-api-format"
              data-slot="model-api-format-trigger"
              size="sm"
              className="w-44"
              disabled={pending}
            >
              <SelectValue placeholder="选择格式" />
            </SelectTrigger>
            <SelectContent data-slot="model-api-format-content">
              {API_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="密钥"
          controlId="model-secret"
          help={
            model.hasSecret
              ? "已配置;留空保持不变,填入则覆盖。"
              : "粘贴 API Key(存于本地库)。"
          }
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="model-secret"
              type="password"
              data-slot="model-secret-input"
              value={secret}
              disabled={pending}
              placeholder={model.hasSecret ? "已配置(留空不变)" : "粘贴 API Key"}
              onChange={(event) => setSecret(event.target.value)}
              aria-label="模型密钥"
            />
            {model.hasSecret ? (
              <Badge
                data-slot="model-secret-status"
                variant="outline"
                className="border-success/40 bg-success-soft text-success"
              >
                已配置
              </Badge>
            ) : null}
          </div>
        </SettingsFormRow>
        <SettingsFormRow
          label="温度"
          controlId="model-temperature"
          help="较高的温度会让回答更发散。"
        >
          <Input
            id="model-temperature"
            type="number"
            min={0}
            max={1}
            step={0.1}
            data-slot="model-temperature-input"
            className="w-24"
            value={temperature}
            disabled={pending}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isNaN(next)) setTemperature(next);
            }}
            aria-label="模型温度"
          />
        </SettingsFormRow>
        <div className="flex justify-end">
          <Button
            type="button"
            data-slot="model-save"
            variant="outline"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            保存模型配置
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// CollapsibleModelGroup — [T-140] 「更多能力(按需)」折叠容器
// ---------------------------------------------------------------------------
//
// 把按需的多模态卡收进一个默认折叠的分组,让 models 页签不再一屏平铺 8 张卡吓人。
// 折叠范式照 onboarding-card(useState collapsed + Chevron 图标 + 点击切换,本仓无
// ui/collapsible 原语)。关键:children 始终挂载(不做 collapsed ? null),折叠只用
// `hidden` 属性隐藏 body —— 这样 ?highlight=<stepKey> 深链的 scrollIntoView(见
// SettingsDialog highlight effect)与既有测按 data-slot 直取卡都不受折叠影响。
// 若当前 highlight 命中组内某张卡(highlightKeys),初始即展开,保证深链能滚到它。
function CollapsibleModelGroup({
  title,
  highlight,
  highlightKeys,
  children,
}: {
  title: string;
  /** 当前 ?highlight 值(SettingsDialog 透传);命中 highlightKeys 时初始展开。 */
  highlight: string | null;
  /** 组内各卡的 highlight stepKey;highlight 命中其一 → 初始展开。 */
  highlightKeys: readonly string[];
  children: React.ReactNode;
}) {
  const shouldOpenForHighlight =
    highlight != null && highlightKeys.includes(highlight);
  const [collapsed, setCollapsed] = React.useState(!shouldOpenForHighlight);
  const count = React.Children.count(children);

  return (
    <div data-slot="models-more-group" className="flex flex-col gap-2">
      <button
        type="button"
        data-slot="models-more-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 text-left",
          "rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {collapsed ? (
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        ) : (
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span
          data-slot="models-more-count"
          className="text-xs text-muted-foreground"
        >
          {count} 项
        </span>
      </button>
      {/* body 始终挂载,折叠时仅 hidden(保深链/测可达);展开时纵向排列各卡。 */}
      <div
        data-slot="models-more-body"
        hidden={collapsed}
        className="flex flex-col gap-card-gap"
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultimodalModelCard — 文生图 / 文生视频 (SPEC 2026-07-01 §2.1 / M3)
// ---------------------------------------------------------------------------
//
// Two extra capabilities — `image.generate` (文生图) and `video.generate`
// (文生视频) — bound with the SAME cc-switch form + `settings.models.put` op as
// the text ModelConfigurationCard above. `capability` is a free-form contract
// string, so these reuse `putModel`/`listModels` with ZERO contract change.
//
// Difference vs the text card: NO apiFormat / temperature. `resolveMultimodalSpec`
// (server/ai/multimodal/resolve.ts) dispatches purely on `provider` and reads only
// provider / baseUrl / model / secret — so the form surfaces exactly those four
// fields (no dead controls). The API key is stored in the LOCAL db and masked to
// `hasSecret` on read (raw key never echoed back). minimax is the only provider
// with a shipped adapter today (M1), but the provider input is free-form and
// extensible — it is NOT locked to minimax.
//
// Honesty (铁律): an unconfigured capability leaves provider/model/key blank and
// hasSecret=false. The card says so ("未配置 → 录制页 AI 生成禁用"); it never
// pretends generation works before a key is bound.

const MULTIMODAL_META = {
  image: {
    capability: "image.generate" as const,
    title: "文生图模型",
    icon: Palette,
    description:
      "录制阶段 AI 生成图片素材用;不配则录制页「AI 生成图」禁用。",
    providerSuggestions: ["minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "minimax",
    providerHelp: "多模态厂商名,可自定义(当前已适配 minimax)。",
    modelHelp: "文生图模型 id,如 image-01(MiniMax)。",
    modelPlaceholder: "",
    baseUrlPlaceholder: "https://api.minimaxi.com/v1(留空=provider 默认)",
    disabledHint: "未配 → 录制页 AI 生成禁用。",
  },
  video: {
    capability: "video.generate" as const,
    title: "文生视频模型",
    icon: Cpu,
    description:
      "录制阶段 AI 生成视频素材用;不配则录制页「AI 生成视频」禁用。",
    providerSuggestions: ["minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "minimax",
    providerHelp: "多模态厂商名,可自定义(当前已适配 minimax)。",
    modelHelp: "文生视频模型 id,如 video-01(MiniMax / Hailuo)。",
    modelPlaceholder: "",
    baseUrlPlaceholder: "https://api.minimaxi.com/v1(留空=provider 默认)",
    disabledHint: "未配 → 录制页 AI 生成禁用。",
  },
  // 逐字稿 ASR(T-030-D1,SPEC §5.1)—— 与图/视频同款 cc-switch 表单,provider 走 OpenAI 兼容
  // ASR(SiliconFlow/OpenAI/Groq);建议值给 SiliconFlow(skill 已验)但不锁死。
  audio: {
    capability: "transcribe.audio" as const,
    title: "语音转文字",
    icon: Cpu,
    description:
      "把视频里的话转成文字稿(复盘 / 二创的底稿);不配则语音转文字功能禁用。",
    providerSuggestions: ["siliconflow", "openai", "groq"] as ReadonlyArray<string>,
    providerPlaceholder: "siliconflow",
    providerHelp:
      "OpenAI 兼容 ASR 厂商,可自定义(SiliconFlow / OpenAI / Groq 同形状)。",
    modelHelp: "ASR 模型 id,如 FunAudioLLM/SenseVoiceSmall(SiliconFlow)。",
    modelPlaceholder: "FunAudioLLM/SenseVoiceSmall",
    baseUrlPlaceholder: "https://api.siliconflow.cn/v1(留空=provider 默认)",
    disabledHint: "未配 → 语音转文字功能禁用。",
  },
  // [T-093] 知识库语义搜索 embedding —— OpenAI 兼容 embedding 端点(SiliconFlow/OpenAI
  // 同形状);未配 → 知识库 AI 搜索诚实降级纯关键词。apiFormat 显式存 openai_chat
  // (embedding 无 anthropic 协议;resolveEmbedSpec 只认专配行)。
  embed: {
    capability: "knowledge.search.embed" as const,
    title: "语义搜索模型",
    icon: Cpu,
    description:
      "知识库 AI 搜索用(embedding 语义召回);不配则搜索为纯关键词匹配。",
    providerSuggestions: ["siliconflow", "openai"] as ReadonlyArray<string>,
    providerPlaceholder: "siliconflow",
    providerHelp:
      "OpenAI 兼容 embedding 厂商,可自定义(SiliconFlow / OpenAI 同形状)。",
    modelHelp: "embedding 模型 id,如 BAAI/bge-m3(SiliconFlow)。",
    modelPlaceholder: "BAAI/bge-m3",
    baseUrlPlaceholder: "https://api.siliconflow.cn/v1(留空=provider 默认)",
    disabledHint: "未配 → 知识库搜索为纯关键词。",
  },
  // [T-055h SPEC §6.2 第二层] 素材 AI 归类 —— VLM 看图打用途标签+一句话描述(倾倒场
  // 上传后异步跑;未配置只跑确定性第一层,诚实不假装)。OpenAI 兼容 chat vision。
  vision: {
    capability: "asset.classify" as const,
    title: "素材归类模型",
    icon: Cpu,
    description:
      "倾倒场素材 AI 归类用(视觉模型看图打标签+描述);不配则只按文件名/类型归类。",
    providerSuggestions: ["siliconflow", "openai", "minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "siliconflow",
    providerHelp: "OpenAI 兼容视觉模型厂商,可自定义。",
    modelHelp: "视觉模型 id,如 Qwen/Qwen2.5-VL-72B-Instruct(SiliconFlow)。",
    modelPlaceholder: "",
    baseUrlPlaceholder: "https://api.siliconflow.cn/v1(留空=provider 默认)",
    disabledHint: "未配 → 素材归类只跑确定性第一层。",
  },
  // [T-086 SPEC §2] 文案审核模型 —— 编导文案发布前 L2 语义审专用。豆包/火山方舟(Ark =
  // OpenAI 兼容端点)为预设,用户可整卡改成任何端点(绝不写死)。apiFormat 显式存
  // openai_chat(Ark 走 OpenAI 兼容协议);未配 → 用默认模型审核,报告标注非专用。
  review: {
    capability: "script.review" as const,
    title: "文案审核模型",
    icon: Cpu,
    description:
      "编导文案发布前合规审核用(L2 语义审);未配则用默认模型并标注非专用审核模型。",
    providerSuggestions: ["doubao"] as ReadonlyArray<string>,
    providerPlaceholder: "doubao",
    providerHelp:
      "火山方舟 Ark = OpenAI 兼容端点,provider 可自定义。",
    modelHelp:
      "豆包模型 id 或 Ark 推理接入点,如 doubao-seed-1-6-* 或 ep-*。",
    modelPlaceholder: "",
    baseUrlPlaceholder:
      "https://ark.cn-beijing.volces.com/api/v3(留空=provider 默认)",
    disabledHint: "未配 → 用默认模型审核,报告标注非专用。",
  },
  // [T-084a SPEC §1.1] 联网搜索 —— 素材搜集(material.gather)前置真检索用。provider 用户可配
  // (博查/Tavily/SerpApi 首发);未配 → 素材来自模型记忆(卡片黄条 + 需核实徽标 + honestyBlock
  // 声明非实时检索)。model 对搜索多选填(serpapi 用它当 engine,默认 google)。
  search: {
    capability: "web.search" as const,
    title: "联网搜索",
    icon: Cpu,
    description:
      "素材搜集(找素材/搜资料)前置真联网检索用;不配则素材来自模型训练记忆、来源需核实。rss / browser 免 key。",
    providerSuggestions: ["rss", "browser", "bocha", "tavily", "serpapi"] as ReadonlyArray<string>,
    providerPlaceholder: "rss",
    providerHelp:
      "免 key:rss(baseUrl 填 RSS/Atom feed 网址,逗号分隔多个)/ browser(真开无头浏览器搜 Bing,自截图存证,较慢较脆弱)。付费需 key:bocha(博查,中文优)/ tavily / serpapi。任意模型都能真联网。",
    modelHelp:
      "多数搜索无「模型」概念可留空;serpapi 用它当 engine(默认 google,可填 bing 等);rss/browser 留空。",
    modelPlaceholder: "",
    baseUrlPlaceholder:
      "rss=feed URL(逗号分隔);browser=搜索 URL 模板(留空=Bing,{q} 占位查询词);留空=provider 默认(bocha=api.bochaai.com 等)",
    disabledHint: "未配 → 素材来自模型记忆,标注需核实。",
  },
} as const;

// [T-132] 多模态卡 kind → onboarding stepKey(?highlight=<stepKey> 深链落地定位)。
// 只映射 onboarding 清单里有对应步的 kind;embed/vision 无 onboarding 步 → undefined
// (不加 data-highlight,不影响定位)。
const MULTIMODAL_HIGHLIGHT_KEY: Record<
  "image" | "video" | "audio" | "embed" | "vision" | "review" | "search",
  string | undefined
> = {
  image: "image-model",
  video: "video-model",
  audio: "asr-model",
  review: "review-model",
  search: "web-search",
  embed: undefined,
  vision: undefined,
};

function MultimodalModelCard({
  kind,
  state,
}: {
  kind: "image" | "video" | "audio" | "embed" | "vision" | "review" | "search";
  state: MultimodalModelState;
}) {
  const meta = MULTIMODAL_META[kind];
  const [provider, setProvider] = React.useState<string>(state.provider);
  const [modelName, setModelName] = React.useState<string>(state.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(state.baseUrl);
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  const { pending, run } = useSettingsMutation();

  // Re-sync drafts when a server refresh changes the stored config.
  React.useEffect(() => {
    setProvider(state.provider);
    setModelName(state.modelName);
    setBaseUrl(state.baseUrl);
    setSecret("");
  }, [state]);

  // 多数档要 provider + model 齐全;搜索档(web.search)model 选填,只需 provider(serpapi 用
  // model 当 engine、留空默认 google;bocha/tavily 无模型概念)。
  const configured =
    kind === "search"
      ? provider.trim().length > 0
      : provider.trim().length > 0 && modelName.trim().length > 0;
  const canSave = configured && !pending;

  // One PUT upserts the whole capability row; an empty secret is omitted so a
  // re-save without re-typing the key preserves the stored one. NO apiFormat /
  // settings — the multimodal resolver ignores them.
  const save = React.useCallback(() => {
    if (!canSave) return;
    run(() =>
      client
        .putModel({
          params: { capability: meta.capability },
          query: undefined,
          body: {
            provider: provider.trim(),
            modelName: modelName.trim(),
            baseUrl: baseUrl.trim() || undefined,
            secret: secret.length > 0 ? secret : undefined,
            // [T-093/T-086] embedding 与文案审核卡显式存 openai_chat(缺省会被落成
            // anthropic;embedding 无 anthropic 协议,火山方舟 Ark 走 OpenAI 兼容协议)。
            // 其余多模态卡不带 apiFormat 不变。
            ...(kind === "embed" || kind === "review"
              ? { apiFormat: "openai_chat" as const }
              : {}),
          },
        })
        .then(() => setSecret("")),
    );
  }, [canSave, run, meta.capability, provider, modelName, baseUrl, secret]);

  const Icon = meta.icon;
  const providerListId = `multimodal-${kind}-provider-suggestions`;

  return (
    <SectionCard
      title={meta.title}
      description={meta.description}
      action={
        state.hasSecret ? (
          <Badge
            data-slot={`multimodal-${kind}-status`}
            variant="outline"
            className="border-success/40 bg-success-soft text-success"
          >
            已配置
          </Badge>
        ) : (
          <Badge
            data-slot={`multimodal-${kind}-status`}
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            未配置
          </Badge>
        )
      }
    >
      <div
        data-slot={`multimodal-${kind}-card`}
        data-capability={meta.capability}
        // [T-132] onboarding 深链高亮锚点(?highlight=<stepKey>)。stepKey 与卡 kind
        // 不完全同名(asr-model→audio、web-search→search),故显式映射。
        data-highlight={MULTIMODAL_HIGHLIGHT_KEY[kind]}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>
            provider / model / 接口地址 / 密钥(与文本模型同款配置;密钥存本地库)
          </span>
        </div>
        <SettingsFormRow
          label="提供商"
          controlId={`multimodal-${kind}-provider`}
          help={meta.providerHelp}
        >
          <Input
            id={`multimodal-${kind}-provider`}
            data-slot={`multimodal-${kind}-provider-input`}
            list={providerListId}
            value={provider}
            disabled={pending}
            placeholder={meta.providerPlaceholder}
            onChange={(event) => setProvider(event.target.value)}
            aria-label={`${meta.title}提供商`}
          />
          <datalist id={providerListId}>
            {meta.providerSuggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </SettingsFormRow>
        <SettingsFormRow
          label="模型"
          controlId={`multimodal-${kind}-model`}
          help={meta.modelHelp}
        >
          <Input
            id={`multimodal-${kind}-model`}
            data-slot={`multimodal-${kind}-model-input`}
            value={modelName}
            disabled={pending}
            placeholder={meta.modelPlaceholder}
            onChange={(event) => setModelName(event.target.value)}
            aria-label={`${meta.title}名称`}
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="接口地址"
          controlId={`multimodal-${kind}-base-url`}
          help="自定义 baseUrl;留空走 provider 默认。"
        >
          <Input
            id={`multimodal-${kind}-base-url`}
            data-slot={`multimodal-${kind}-base-url-input`}
            value={baseUrl}
            disabled={pending}
            placeholder={meta.baseUrlPlaceholder}
            onChange={(event) => setBaseUrl(event.target.value)}
            aria-label={`${meta.title}接口地址`}
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="密钥"
          controlId={`multimodal-${kind}-secret`}
          help={
            state.hasSecret
              ? "已配置;留空保持不变,填入则覆盖。"
              : `粘贴 API Key(存于本地库)。${meta.disabledHint}`
          }
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id={`multimodal-${kind}-secret`}
              type="password"
              data-slot={`multimodal-${kind}-secret-input`}
              value={secret}
              disabled={pending}
              placeholder={state.hasSecret ? "已配置(留空不变)" : "粘贴 API Key"}
              onChange={(event) => setSecret(event.target.value)}
              aria-label={`${meta.title}密钥`}
            />
            {state.hasSecret ? (
              <Badge
                data-slot={`multimodal-${kind}-secret-status`}
                variant="outline"
                className="border-success/40 bg-success-soft text-success"
              >
                已配置
              </Badge>
            ) : null}
          </div>
        </SettingsFormRow>
        <div className="flex justify-end">
          <Button
            type="button"
            data-slot={`multimodal-${kind}-save`}
            variant="outline"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            保存{meta.title}配置
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// ReviewRulesCard — 审核规则库管理(T-086 SPEC §4 切片 d)
// ---------------------------------------------------------------------------
//
// 就近挂在设置页 models 面板下(禁止新增一级导航,§10.5 教训)。列出 reviewRules.list,
// 按 tier 分组渲规则(category/matchType/pattern/replacement/note/status)。
//
// 确认门(铁律):candidate 态规则(T-087 复盘回流落点)单独分区「待采纳」,只有用户点
// 「采纳」(patch status→active)才让 candidate→active —— UI 是 candidate→active 的唯一
// 路径,AI 绝不自动写 active。启停走 patch status,增走 create(source 默认 manual),
// 删走 delete。
const TIER_META: Record<
  ReviewRuleResource["tier"],
  { readonly label: string; readonly hint: string }
> = {
  official_hard: { label: "官方硬规则", hint: "公约条文的确定性投影" },
  empirical: { label: "经验限流", hint: "实测限流/降权词" },
  doudplus: { label: "doud+ 投放", hint: "投放特有规则" },
};

function statusBadgeClass(status: ReviewRuleResource["status"]): string {
  if (status === "active") return "border-success/40 bg-success-soft text-success";
  if (status === "candidate") return "border-warning/40 bg-warning-soft text-warning";
  return "border-border bg-surface-subtle text-muted-foreground";
}

function ReviewRulesCard() {
  const [rules, setRules] = React.useState<ReviewRuleResource[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = useSettingsMutation();
  // 新建表单草稿。
  const [draftTier, setDraftTier] =
    React.useState<ReviewRuleResource["tier"]>("empirical");
  const [draftCategory, setDraftCategory] = React.useState("");
  const [draftMatchType, setDraftMatchType] =
    React.useState<ReviewRuleResource["matchType"]>("word");
  const [draftPattern, setDraftPattern] = React.useState("");
  const [draftReplacement, setDraftReplacement] = React.useState("");
  const [draftNote, setDraftNote] = React.useState("");

  const reload = React.useCallback(() => {
    void (async () => {
      try {
        // isList op:client 静态返回类型是单项(z.infer<response>),运行时 listEnvelope
        // 落成数组 —— 与既有 listProjects 消费惯例一致,经 unknown 转数组。
        const list = (await client.listReviewRules({
          params: undefined,
          query: undefined,
          body: undefined,
        })) as unknown as ReviewRuleResource[];
        setRules(list);
        setError(null);
      } catch {
        setError("审核规则加载失败,请刷新重试。");
        setRules([]);
      }
    })();
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // 启停/采纳/否决 —— 都走 patch status(candidate→active 是采纳的唯一路径)。
  const patchStatus = React.useCallback(
    (ruleId: string, status: ReviewRuleResource["status"]) => {
      run(async () => {
        await client.patchReviewRule({
          params: { ruleId },
          query: undefined,
          body: { status },
        });
        reload();
      });
    },
    [run, reload],
  );

  const removeRule = React.useCallback(
    (ruleId: string) => {
      run(async () => {
        await client.deleteReviewRule({
          params: { ruleId },
          query: undefined,
          body: undefined,
        });
        reload();
      });
    },
    [run, reload],
  );

  const createRule = React.useCallback(() => {
    if (!draftCategory.trim() || !draftPattern.trim()) return;
    run(async () => {
      await client.createReviewRule({
        params: undefined,
        query: undefined,
        body: {
          tier: draftTier,
          category: draftCategory.trim(),
          matchType: draftMatchType,
          pattern: draftPattern.trim(),
          replacement: draftReplacement.trim() || null,
          note: draftNote.trim(),
          // 手动建规则缺省 manual + active(用户显式建的即生效;SPEC §1/§4d:
          // candidate 是 T-087 复盘回流预留态,不走手动建表单)。
          source: "manual",
          status: "active",
        },
      });
      setDraftCategory("");
      setDraftPattern("");
      setDraftReplacement("");
      setDraftNote("");
      reload();
    });
  }, [
    run,
    reload,
    draftTier,
    draftCategory,
    draftMatchType,
    draftPattern,
    draftReplacement,
    draftNote,
  ]);

  const candidates = (rules ?? []).filter((r) => r.status === "candidate");
  const nonCandidates = (rules ?? []).filter((r) => r.status !== "candidate");

  return (
    <SectionCard
      title="审核规则库"
      description="编导文案发布前的 L1 违禁词/模式 lint 规则;candidate 态由复盘回流,须你采纳才生效。"
      action={
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
      }
    >
      <div
        data-slot="review-rules-card"
        data-highlight="review-rules"
        className="flex flex-col gap-4"
      >
        {error ? (
          <p className="text-[12px] text-destructive">{error}</p>
        ) : null}

        {/* 待采纳分区(复盘回流的用户确认门)。 */}
        {candidates.length > 0 ? (
          <div
            data-slot="review-rules-candidates"
            className="rounded-md border border-warning/30 bg-warning-soft/40 p-3"
          >
            <p className="mb-2 text-[12px] font-semibold text-warning">
              待采纳(来自复盘)· {candidates.length}
            </p>
            <ul className="flex flex-col gap-2">
              {candidates.map((rule) => (
                <li
                  key={rule.id}
                  data-slot="review-rule-candidate"
                  data-rule-id={rule.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 bg-background px-2.5 py-2"
                >
                  <RuleSummary rule={rule} />
                  <span className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-slot="review-rule-adopt"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={pending}
                      onClick={() => patchStatus(rule.id, "active")}
                    >
                      采纳
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-slot="review-rule-reject"
                      className="h-7 px-2.5 text-[11px] text-muted-foreground"
                      disabled={pending}
                      onClick={() => patchStatus(rule.id, "disabled")}
                    >
                      否决
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 已有规则(按 tier 分组;启停/删除)。 */}
        {rules === null ? (
          <p className="text-[12px] text-muted-foreground">加载中…</p>
        ) : nonCandidates.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            暂无规则。可在下方手动新增,或等复盘回流候选规则。
          </p>
        ) : (
          (Object.keys(TIER_META) as ReviewRuleResource["tier"][]).map((tier) => {
            const group = nonCandidates.filter((r) => r.tier === tier);
            if (group.length === 0) return null;
            return (
              <div key={tier} data-slot="review-rules-tier" data-tier={tier}>
                <p className="mb-1.5 text-[12px] font-semibold text-foreground">
                  {TIER_META[tier].label}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {TIER_META[tier].hint}
                  </span>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {group.map((rule) => (
                    <li
                      key={rule.id}
                      data-slot="review-rule-item"
                      data-rule-id={rule.id}
                      data-status={rule.status}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2.5 py-2"
                    >
                      <RuleSummary rule={rule} />
                      <span className="flex items-center gap-1.5">
                        <Switch
                          data-slot="review-rule-toggle"
                          checked={rule.status === "active"}
                          disabled={pending}
                          aria-label={`启停规则 ${rule.pattern}`}
                          onCheckedChange={(next) =>
                            patchStatus(rule.id, next ? "active" : "disabled")
                          }
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          data-slot="review-rule-delete"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          disabled={pending}
                          aria-label={`删除规则 ${rule.pattern}`}
                          onClick={() => removeRule(rule.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}

        {/* 手动新增规则(source=manual;显式建即 active)。 */}
        <div
          data-slot="review-rule-create"
          className="flex flex-col gap-2 border-t border-border/60 pt-3"
        >
          <p className="text-[12px] font-semibold text-foreground">新增规则</p>
          <div className="flex flex-wrap gap-2">
            <Select
              value={draftTier}
              onValueChange={(v) =>
                setDraftTier(v as ReviewRuleResource["tier"])
              }
            >
              <SelectTrigger
                data-slot="review-rule-tier-select"
                className="h-8 w-[128px] text-[12px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIER_META) as ReviewRuleResource["tier"][]).map(
                  (tier) => (
                    <SelectItem key={tier} value={tier}>
                      {TIER_META[tier].label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Select
              value={draftMatchType}
              onValueChange={(v) =>
                setDraftMatchType(v as ReviewRuleResource["matchType"])
              }
            >
              <SelectTrigger
                data-slot="review-rule-match-select"
                className="h-8 w-[96px] text-[12px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="word">全文</SelectItem>
                <SelectItem value="regex">正则</SelectItem>
              </SelectContent>
            </Select>
            <Input
              data-slot="review-rule-category-input"
              className="h-8 w-[112px] text-[12px]"
              value={draftCategory}
              disabled={pending}
              placeholder="类目"
              onChange={(e) => setDraftCategory(e.target.value)}
              aria-label="规则类目"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              data-slot="review-rule-pattern-input"
              className="h-8 flex-1 text-[12px]"
              value={draftPattern}
              disabled={pending}
              placeholder="命中词/模式"
              onChange={(e) => setDraftPattern(e.target.value)}
              aria-label="命中词或模式"
            />
            <Input
              data-slot="review-rule-replacement-input"
              className="h-8 w-[140px] text-[12px]"
              value={draftReplacement}
              disabled={pending}
              placeholder="建议替代(可空)"
              onChange={(e) => setDraftReplacement(e.target.value)}
              aria-label="建议替代"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              data-slot="review-rule-note-input"
              className="h-8 flex-1 text-[12px]"
              value={draftNote}
              disabled={pending}
              placeholder="出处/原因(可空)"
              onChange={(e) => setDraftNote(e.target.value)}
              aria-label="出处或原因"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-slot="review-rule-create-submit"
              className="h-8 gap-1 px-2.5 text-[12px]"
              disabled={pending || !draftCategory.trim() || !draftPattern.trim()}
              onClick={createRule}
            >
              <Plus className="size-3.5" />
              新增
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// 单条规则的摘要展示(pattern + 徽章串)。
function RuleSummary({ rule }: { rule: ReviewRuleResource }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-[12px] font-medium text-foreground">
        {rule.pattern}
      </code>
      <Badge
        variant="outline"
        className="border-border bg-surface-subtle text-[10px] text-muted-foreground"
      >
        {rule.category}
      </Badge>
      <Badge
        variant="outline"
        className="border-border bg-surface-subtle text-[10px] text-muted-foreground"
      >
        {rule.matchType === "regex" ? "正则" : "全文"}
      </Badge>
      <Badge
        variant="outline"
        className={cn("text-[10px]", statusBadgeClass(rule.status))}
      >
        {rule.status === "active"
          ? "启用"
          : rule.status === "candidate"
            ? "待采纳"
            : "停用"}
      </Badge>
      {rule.replacement ? (
        <span className="text-[11px] text-muted-foreground">
          → {rule.replacement}
        </span>
      ) : null}
      {rule.note ? (
        <span className="truncate text-[11px] text-muted-foreground">
          · {rule.note}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SettingsFormRow
// ---------------------------------------------------------------------------

interface SettingsFormRowProps {
  readonly label: string;
  readonly controlId: string;
  readonly help?: string;
  readonly children: React.ReactNode;
}

function SettingsFormRow({
  label,
  controlId,
  help,
  children,
}: SettingsFormRowProps) {
  return (
    <div
      data-slot="settings-form-row"
      data-control-id={controlId}
      className="grid grid-cols-1 items-start gap-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[160px_minmax(0,1fr)]"
    >
      <div data-slot="form-row-label" className="flex flex-col gap-0.5">
        <label
          htmlFor={controlId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
        {help ? (
          <span className="text-xs text-muted-foreground">{help}</span>
        ) : null}
      </div>
      <div
        data-slot="form-row-control"
        className="flex min-w-0 items-center justify-start"
      >
        {children}
      </div>
    </div>
  );
}
