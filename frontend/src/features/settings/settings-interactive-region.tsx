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
import { isAccountRequiredError } from "@/lib/http-transport";
import { Badge } from "@/components/ui/badge";
import { notifyAccountsChanged } from "@/lib/account-events";
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
import { WebSessionVaultCard } from "./web-session-vault-card";
// [T-332 S5] 重置工作区危险区卡(存储页签底部;桌面端专属)。
import { ResetWorkspaceCard } from "./reset-workspace-card";
// [T-363] 模型配置导出/导入兜底卡(模型页签底部;文件含密钥,卡内常驻警示)。
import { ModelConfigTransferCard } from "./model-config-transfer-card";
import { ModelConfigurationManual } from "./model-configuration-manual";
import { TagChip } from "@/components/content/tag-chip";
import {
  MODEL_PROVIDER_PRESETS,
  CUSTOM_PRESET_ID,
  matchPresetByConfig,
  presetModels,
  type ModelProviderPreset,
} from "./model-provider-presets";
import { cn } from "@/lib/utils";
import {
  UserRound,
  SlidersHorizontal,
  Palette,
  Cpu,
  HardDrive,
  QrCode,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  KeyRound,
  Trash2,
  Plus,
  ChevronDownIcon,
  ChevronRightIcon,
  Download,
  RefreshCw,
  ExternalLink,
  FileText,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
// [T-180 → T-396c → T-459] 桌面软件更新薄封装(client-only,web/SSR 安全降级)。
// T-459 后只读官网公开 manifest,与激活/白标渠道完全解耦。
import {
  checkLatestVersion,
  getAppVersion,
  isDesktopRuntimeClient,
  OFFICIAL_DOWNLOAD_URL,
  type LatestVersionInfo,
} from "@/lib/desktop-updater";
// [T-372 L3] Rust 壳授权判定薄封装:内测离线宽限倒计时的实时数据源(零网络,读缓存+订阅事件)。
import {
  fetchLastShellDecision,
  subscribeShellDecision,
  type ShellGateDecision,
} from "@/lib/shell-license";

import type {
  ActivationState,
  ChannelLinksState,
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
// repo (island → client.* → router.refresh seam). A `pending` guard blocks
// concurrent writes. The optimistic value is the source of truth in the control
// while the refresh round-trips; the server read confirms it on the next render.
function useSettingsMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (mutate: () => Promise<unknown>): Promise<boolean> => {
      if (pending) return false;
      setPending(true);
      try {
        await mutate();
        router.refresh();
        return true;
      } finally {
        setPending(false);
      }
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
  activation,
  channelLinks,
}: {
  viewModel: SettingsViewModel;
  /**
   * T-077a:技能清单(route server 侧经 ai-worker listTemplates + settings.prompts.list
   * 投影)。单测/无 server 数据时缺省空数组 → SkillsSection 渲诚实空态。
   */
  skills?: readonly SkillItem[];
  /**
   * [T-167] 桌面激活状态(route server 侧经 getActivationService().getStatus() 本地读)。
   * web / 未装配 / 单测缺省 → undefined:激活卡显「激活为桌面端功能」诚实空态。
   */
  activation?: ActivationState;
  /**
   * [T-396b] 渠道链接(route server 侧读 `.channel-links` 缓存)。null/缺省 →
   * 购买入口隐藏、更新卡「联系授权方」纯文案 —— 中性降级,不回退官方链接(红线)。
   */
  channelLinks?: ChannelLinksState;
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
                {/* [T-217a] 网站登录保管库:登录一次网站 → 编导带登录态读正文(web.read)。 */}
                <WebSessionVaultCard />
                {/* [T-167] 激活状态卡:桌面端读真态四态诚实展示;web/未装配 → 桌面端专属空态。 */}
                <ActivationStatusCard
                  activation={activation}
                  purchaseUrl={channelLinks?.purchaseUrl ?? null}
                />
                {/* [T-459] 软件更新只读官网公开版本源,不再绑定授权状态/白标渠道。 */}
                <CheckUpdateCard />
                {/* [T-259] 诊断日志卡:桌面端一键在 Finder 打开日志目录发给开发者;web → 桌面端专属空态。 */}
                <DiagnosticLogsCard />
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">必配</span>
                      <span className="text-xs text-muted-foreground">
                        AI 写字 / 对话的地基,配这一个就能用;不配时有官方兜底。
                      </span>
                    </div>
                    <ModelConfigurationManual />
                  </div>
                  <ModelConfigurationCard
                    key={[
                      viewModel.model.provider,
                      viewModel.model.modelName,
                      viewModel.model.baseUrl,
                      viewModel.model.apiFormat,
                      viewModel.model.hasSecret,
                      viewModel.model.temperature,
                    ].join(":")}
                    model={viewModel.model}
                  />
                </div>

                {/* ② 折叠块「更多能力」:7 张按需卡,默认收起(不配也能用,各自诚实降级)。
                    highlight 命中组内某张卡时初始展开,保证 ?highlight 深链能滚到它。 */}
                <CollapsibleModelGroup
                  title="更多能力(按需,不配也能用)"
                  highlight={highlight}
                  highlightKeys={[
                    "review-model",
                    "image-model",
                    "video-model",
                    "asr-model",
                    // [T-231⑪] 联网搜索深链(?highlight=web-search)也要能展开组并滚到卡。
                    "web-search",
                  ]}
                >
                  <MultimodalModelCard
                    kind="audio"
                    state={viewModel.multimodalModels.audio}
                  />
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
                  {/* [T-093] 知识库语义搜索 embedding(未配 → AI 搜索诚实降级关键词)。 */}
                  <MultimodalModelCard
                    kind="embed"
                    state={viewModel.multimodalModels.embed}
                  />
                  {/* [T-231⑪] 视觉理解(asset.classify)与联网搜索(web.search):组件与
                      state 早已备好(MULTIMODAL_META.vision/search + viewModel 两档),
                      此前一直没挂进面板 → 用户想配联网搜索(T-228)/视觉理解无入口。 */}
                  <MultimodalModelCard
                    kind="vision"
                    state={viewModel.multimodalModels.vision}
                  />
                  <MultimodalModelCard
                    kind="search"
                    state={viewModel.multimodalModels.search}
                  />
                  {/* [T-239b] 备用对话模型(chat.fallback):主模型可重试错误耗尽时接管一次;
                      未配 → 现状报错(诚实降级,不静默换模型)。 */}
                  <MultimodalModelCard
                    kind="fallback"
                    state={viewModel.multimodalModels.fallback}
                  />
                </CollapsibleModelGroup>

                {/* [T-363] 配置备份:导出/导入全部模型配置(重置/换机兜底;文件含密钥,卡内警示)。 */}
                <ModelConfigTransferCard />
              </div>
            </SettingsPanel>
            <SettingsPanel tabId="skills" active={tab}>
              <SkillsSection skills={skills} />
            </SettingsPanel>
            <SettingsPanel tabId="storage" active={tab}>
              <div className="flex flex-col gap-card-gap">
                <StorageUsageCard storage={viewModel.storage} />
                {/* [T-332 S5] 危险区:重置工作区(二次确认 + 落 reset-pending 标记,重启归档生效)。 */}
                <ResetWorkspaceCard />
              </div>
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
  // [T-144] 采集源是否就绪(有 external_source)。登录态 ≠ 能采集 —— 据此把「可采集」承诺
  // 收敛到真实能力。SSR 兜底缺省 false(诚实,同 loggedIn)。
  const [sourceReady, setSourceReady] = React.useState<boolean>(
    douyinAccount.sourceReady ?? false,
  );
  const [phase, setPhase] = React.useState<BindingPhase>("idle");
  const [feedback, setFeedback] = React.useState<BindingFeedback>({
    kind: "none",
  });
  // [T-332 S4] 未选号态:statusDouyin 抛 AccountRequiredError(428)时置真 —— 徽标从
  // 灰「未连接」翻译成「未绑定账号」绑定引导(SPEC §4.2:引导,不是报错/不是误导的连接态)。
  const [accountRequired, setAccountRequired] = React.useState(false);

  // SSR 值变化(切账号 / 首次水合)时同步徽标。
  React.useEffect(() => {
    setLoggedIn(douyinAccount.loggedIn);
    setSourceReady(douyinAccount.sourceReady ?? false);
  }, [douyinAccount.loggedIn, douyinAccount.sourceReady]);

  // 挂载后拉一次真 status(不弹窗,headless 探针),把 SSR 兜底徽标翻真。探针失败(无
  // 浏览器 / transport race)静默保持 SSR 值(未连接),不误显已连接。
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const status = (await client.statusDouyin({
          params: undefined,
          query: {}, // [T-136] 被动探针走 header 注入的当前号;query 带号位 additive
          body: undefined,
        })) as { loggedIn?: boolean; sourceReady?: boolean };
        if (alive && typeof status.loggedIn === "boolean") {
          setLoggedIn(status.loggedIn);
        }
        // [T-144] 采集源就绪态(缺省 false):去「可采集」虚假承诺。
        if (alive && typeof status.sourceReady === "boolean") {
          setSourceReady(status.sourceReady);
        }
        if (alive) setAccountRequired(false);
      } catch (err) {
        // [T-332 S4] 未选号(428)→ 徽标转绑定引导;其它探针失败(无浏览器/transport
        // race)→ 保持 SSR 兜底(未连接),诚实不误报。
        if (alive && isAccountRequiredError(err)) setAccountRequired(true);
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
              query: {}, // [T-136] 被动探针走 header 注入的当前号;query 带号位 additive
              body: undefined,
            })) as { loggedIn?: boolean; sourceReady?: boolean };
            confirmed = status.loggedIn ?? true;
            // [T-144] 扫码成功后 loginDouyin 已 ensure external_source → 重拉的 status
            // sourceReady 应转真;据此翻「可采集」态(诚实,以探针为准)。
            if (typeof status.sourceReady === "boolean") {
              setSourceReady(status.sourceReady);
            }
          } catch {
            // status 探针失败(transport race)→ 信任 login 的成功返回。
            confirmed = true;
          }
          setLoggedIn(confirmed);
          // [T-332 S4] 扫码绑定成功 → 未选号引导态清除(切换器会收 accountsChanged 自动选号)。
          if (confirmed) setAccountRequired(false);
          setFeedback({
            kind: "success",
            text: confirmed
              ? "抖音已连接。"
              : "已扫码,但未检测到有效登录态,请重试。",
          });
          // [Bug-7 T-020] 跨页失效广播:settings 路由的 router.refresh() 刷不到 layout 里的
          // AccountSwitcher 和其他打开页面的陈旧 state(loginDouyin 不重 mount 它们)。
          notifyAccountsChanged();
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
        accountRequired ? (
          // [T-332 S4] 未选号 ≠ 连接故障:徽标给绑定引导语义(点下方扫码按钮即绑定)。
          <Badge
            data-slot="douyin-binding-status"
            data-connected="false"
            data-account-required="true"
            variant="outline"
            className="border-brand/40 bg-brand-soft text-brand"
          >
            未绑定账号 —— 扫码即可绑定
          </Badge>
        ) : loggedIn ? (
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
          {/* T-174:抖音官方 logo(替原 Link2 通用链接图标),圆角方形贴合抖音 app 图标观感。 */}
          <img
            src="/douyin-icon.png"
            alt="抖音"
            aria-hidden="true"
            className="size-10 shrink-0 rounded-[9px]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">抖音</span>
            <span
              data-slot="douyin-binding-hint"
              className={cn(
                "text-xs",
                loggedIn && sourceReady
                  ? "text-success"
                  : "text-muted-foreground",
              )}
            >
              {!loggedIn
                ? "登录态已过期或未连接,请扫码登录以采集数据。"
                : sourceReady
                  ? "登录态有效,可采集你的作品数据与评论。"
                  : // [T-144] 去虚假承诺:登录态有效但采集源未建时,别说「可采集」。
                    "已扫码,但还没开始同步。重新扫码,或手动同步一次即可。"}
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
// ActivationStatusCard — 激活状态面板 (T-167)
// ---------------------------------------------------------------------------
//
// P5 已落地一机一码激活授权(activation-service 状态机)。本卡在「账户」页签展示激活态,
// 让用户看到:激活状态(四态徽章)/ 授权类型 / 到期 / 机器码 / 最后在线校验 / 购买续期入口。
//
// 数据源:route server 侧 `getActivationService().getStatus()` 本地读(**不打网络**,纯展示),
// 结果作为 `activation` prop 传入。四态诚实映射(铁律:未激活/web 态如实展示,不假装已激活):
//   active  → 已激活(绿)   grace → 离线宽限(黄)
//   expired → 已过期(红)   inactive → 未激活(灰)
// web / 未装配 / 读失败 → activation undefined:显「激活为桌面端功能」诚实空态。
//
// **纯展示卡,无 client 交互 / 无网络**:激活/续期动作走 /activate 页(P5),此处只给购买入口链接。

// 四态 → 徽章文案 + 色调(brand token,与设置页其它徽章同款视觉)。
const ACTIVATION_BADGE: Record<
  ActivationState["status"],
  { label: string; className: string }
> = {
  active: {
    label: "已激活",
    className: "border-success/40 bg-success-soft text-success",
  },
  grace: {
    label: "离线宽限",
    className: "border-warning/40 bg-warning-soft text-warning",
  },
  expired: {
    label: "已过期",
    className: "border-danger/40 bg-danger-soft text-danger",
  },
  inactive: {
    label: "未激活",
    className: "border-border bg-surface-subtle text-muted-foreground",
  },
};

// licenseMode + expiresAt → 授权类型中文。永久(expiresAt=null)优先显「永久激活」;
// 否则据 licenseMode 映射(TIME→时间型),未知 mode 回退原值(诚实,不臆造)。
function licenseModeLabel(
  licenseMode: string | null,
  expiresAt: string | null,
): string {
  if (expiresAt === null && licenseMode !== null) return "永久激活";
  if (licenseMode === null) return "—";
  const upper = licenseMode.toUpperCase();
  if (upper === "TIME") return "时间型";
  if (upper === "PERMANENT") return "永久激活";
  return licenseMode; // 未知授权类型:透传原值,不臆造。
}

// ISO → 本地日期(YYYY-MM-DD)。SSR/CSR 一致:显式用 UTC 切片而非 toLocaleString
// (避免 hydration 时区漂移)。脏值 → 原样透传(诚实,不吞)。
function formatIsoDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toISOString().slice(0, 10);
}

// 到期展示:永久 → 「永久」;grace → 「离线宽限中」;否则显到期日期。
function expiryLabel(
  status: ActivationState["status"],
  expiresAt: string | null,
): string {
  if (expiresAt === null) return "永久";
  if (status === "grace") return "离线宽限中";
  return formatIsoDate(expiresAt);
}

// [T-372 L3] 「上次与授权服务器确认于 X 天前」(SPEC §8:买断离线时设置页至多显示这个)。
// 相对天数在客户端挂载后计算(nowMs=null 的 SSR 首帧只显绝对日期,避免水合漂移);
// 脏值透传原文(诚实,不吞)。
function lastConfirmedLabel(iso: string, nowMs: number | null): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const dateText = formatIsoDate(iso);
  if (nowMs === null) return dateText;
  const days = Math.floor((nowMs - t) / 86_400_000);
  if (days <= 0) return `今天(${dateText})`;
  return `${days} 天前(${dateText})`;
}

// [T-372 L3] 离线宽限倒计时格式:HH:MM:SS(≤0 归零,由调用方给「已用尽」文案)。
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// 机器码截断显示:一机一码,完整码较长,前 8 + 后 6 中间省略(hover title 显全码)。
function truncateMachineId(machineId: string): string {
  if (machineId.length <= 18) return machineId;
  return `${machineId.slice(0, 8)}…${machineId.slice(-6)}`;
}

// [T-396b] 原 T-168 官网 PURCHASE_URL 硬编码已删:购买/续期入口按激活码所属渠道运行时
// 下发(channelLinks.purchaseUrl);null → 整个隐藏(SPEC §5/§7 红线:不回退官方链接)。

function ActivationStatusCard({
  activation,
  purchaseUrl = null,
}: {
  activation?: ActivationState;
  /** [T-396b] 渠道购买/续期链接;null = 未激活/渠道未配 → 购买入口整个隐藏(非 disabled)。 */
  purchaseUrl?: string | null;
}) {
  // [T-372 L3] 相对时间基准:挂载后取本机时钟(SSR 首帧 null → 只显绝对日期,无水合漂移)。
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  // [T-372 L3] 内测离线宽限实时态:来自 Rust 决策链(license_last_decision + 事件订阅,
  // 零网络)。仅 trial + status=grace 时有值;anchoredAt 锚定收到判定的本机时刻,倒计时
  // 在客户端本地递减(不轮询 Rust)。web 下封装短路 → 恒 null。
  const [graceInfo, setGraceInfo] = React.useState<{
    remaining: number;
    anchoredAt: number;
  } | null>(null);
  const [, setCountdownTick] = React.useState(0);

  React.useEffect(() => {
    setNowMs(Date.now());
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const apply = (d: ShellGateDecision | null) => {
      if (disposed || !d) return;
      if (d.status === "grace" && d.mode === "trial" && d.offlineRemaining != null) {
        setGraceInfo({ remaining: d.offlineRemaining, anchoredAt: Date.now() });
      } else {
        setGraceInfo(null);
      }
    };
    void (async () => {
      apply(await fetchLastShellDecision());
      unlisten = await subscribeShellDecision(apply);
      if (disposed && unlisten) {
        unlisten();
        unlisten = null;
      }
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // 倒计时每秒重渲(仅宽限态才起 interval;非宽限零开销)。
  React.useEffect(() => {
    if (!graceInfo) return;
    const timer = window.setInterval(() => setCountdownTick((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [graceInfo]);

  // web / 未装配 / 读失败 → 诚实空态卡:激活是桌面端功能,web 端不显激活态(绝不假装)。
  if (!activation) {
    return (
      <SectionCard
        title="激活"
        description="桌面端一机一码激活授权"
        action={
          <Badge
            data-slot="activation-status-badge"
            data-status="unavailable"
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            桌面端专属
          </Badge>
        }
      >
        <div
          data-slot="activation-status-card"
          data-activation-available="false"
          className="flex items-start gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              激活为桌面端功能
            </span>
            <span className="text-xs text-muted-foreground">
              一机一码激活授权仅在桌面客户端生效。Web 端无需激活,可直接使用。
            </span>
          </div>
        </div>
      </SectionCard>
    );
  }

  const badge = ACTIVATION_BADGE[activation.status];

  return (
    <SectionCard
      title="激活"
      description="桌面端一机一码激活授权"
      action={
        <Badge
          data-slot="activation-status-badge"
          data-status={activation.status}
          variant="outline"
          className={badge.className}
        >
          {badge.label}
        </Badge>
      }
    >
      <div
        data-slot="activation-status-card"
        data-activation-available="true"
        className="flex flex-col gap-3"
      >
        <SettingsFormRow
          label="授权类型"
          controlId="activation-license-mode"
          help="时间型有到期日;永久激活不过期。"
        >
          <span
            id="activation-license-mode"
            data-slot="activation-license-mode"
            className="text-sm text-foreground"
          >
            {licenseModeLabel(activation.licenseMode, activation.expiresAt)}
          </span>
        </SettingsFormRow>
        <SettingsFormRow
          label="到期"
          controlId="activation-expires-at"
          help="离线宽限期内仍可使用,请尽快联网复校授权。"
        >
          <span
            id="activation-expires-at"
            data-slot="activation-expires-at"
            className="text-sm text-foreground"
          >
            {expiryLabel(activation.status, activation.expiresAt)}
          </span>
        </SettingsFormRow>
        {activation.machineId ? (
          <SettingsFormRow
            label="机器码"
            controlId="activation-machine-id"
            help="一机一码,绑定当前设备。换机请联系作者迁移授权。"
          >
            <span
              id="activation-machine-id"
              data-slot="activation-machine-id"
              title={activation.machineId}
              className="font-mono text-xs text-muted-foreground"
            >
              {truncateMachineId(activation.machineId)}
            </span>
          </SettingsFormRow>
        ) : null}
        {/* [T-372 L3] 上次与授权服务器确认于 X 天前(SPEC §8:买断离线时至多显示这个)。
            行恒渲染:缺数据(老库/尚未在线校过)→ 诚实「未知」,不藏行、不臆造时间。 */}
        <SettingsFormRow
          label="上次在线确认"
          controlId="activation-last-check"
          help="上次成功与授权服务器确认的时间。买断授权离线不影响使用。"
        >
          <span
            id="activation-last-check"
            data-slot="activation-last-check"
            className="text-sm text-muted-foreground"
          >
            {activation.lastOnlineCheckAt
              ? lastConfirmedLabel(activation.lastOnlineCheckAt, nowMs)
              : "未知(尚无在线校验记录)"}
          </span>
        </SettingsFormRow>
        {/* [T-372 L3] 内测离线宽限倒计时(SPEC §7:宽限窗内显示离线剩余)。数据来自 Rust
            决策链实时判定(仅 trial+grace 有值);无实时判定但镜像态已是 grace → 诚实「未知」。 */}
        {graceInfo || activation.status === "grace" ? (
          <SettingsFormRow
            label="离线宽限剩余"
            controlId="activation-grace-countdown"
            help="内测版离线可用 24 小时,之后需联网确认一次;买断版无此限制。"
          >
            <span
              id="activation-grace-countdown"
              data-slot="activation-grace-countdown"
              className="font-mono text-sm text-warning"
            >
              {graceInfo
                ? (() => {
                    const remaining =
                      graceInfo.remaining -
                      (Date.now() - graceInfo.anchoredAt) / 1000;
                    return remaining > 0
                      ? formatCountdown(remaining)
                      : "已用尽,请联网重新校验授权";
                  })()
                : "未知"}
            </span>
          </SettingsFormRow>
        ) : null}
        {/* [T-396b] 购买 / 续期激活码 → 渠道 purchaseUrl(跟激活码走,Rust 验签落缓存)。
            null → 整个隐藏(SPEC §7 中性降级操作定义;绝不回退官方链接防泄定价)。
            用 <a> 而非 client 动作:纯外链跳转,无需 router;激活/续期真流程走 /activate 页(P5)。 */}
        {purchaseUrl ? (
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <a
                href={purchaseUrl}
                data-slot="activation-purchase-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <KeyRound aria-hidden="true" className="size-4 shrink-0" />
                购买 / 续期激活码
              </a>
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// CheckUpdateCard — 软件更新 (T-180 → T-396c → T-459 官网公开源)
// ---------------------------------------------------------------------------
//
// [T-459] 更新流 = 「GET 官网静态 latest.json + 跳产品官网」:
//   - 不调用授权域名,不发送激活码/机器/项目/nonce,不受授权状态影响;
//   - 有新版 → 显版本/说明 + 固定官网「去下载」;远端 JSON 的 URL 一律不采纳;
//   - 无新版 → 「已是最新版」;失败 → 人话文案(技术报错不出 UI)。
//
// **只桌面态有意义**:挂载后经 `isDesktopRuntimeClient()` 探测;web/SSR → 显「桌面端专属」诚实
// 空态(无检查入口),绝不假装能更新。SSR 首帧走空态(desktop=false),挂载后翻真(避免水合漂移)。

type UpdatePhase = "idle" | "checking" | "available" | "uptodate" | "error";

function CheckUpdateCard() {
  // SSR 首帧 desktop=false → 渲空态;挂载后 isDesktopRuntimeClient() 翻真(无水合漂移)。
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [version, setVersion] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<UpdatePhase>("idle");
  const [available, setAvailable] = React.useState<LatestVersionInfo | null>(null);
  const [message, setMessage] = React.useState<string>("");

  React.useEffect(() => {
    const desktop = isDesktopRuntimeClient();
    setIsDesktop(desktop);
    if (desktop) {
      void getAppVersion().then((v) => setVersion(v));
    }
  }, []);

  const busy = phase === "checking";

  const check = React.useCallback(() => {
    if (busy) return;
    setPhase("checking");
    setMessage("");
    setAvailable(null);
    void (async () => {
      const res = await checkLatestVersion();
      switch (res.kind) {
        case "available":
          setAvailable(res.info);
          setPhase("available");
          break;
        case "uptodate":
          setPhase("uptodate");
          setMessage("已是最新版。");
          break;
        case "unavailable":
          // 理论上桌面态不会走到(按钮只在 desktop 显);兜底诚实提示。
          setPhase("error");
          setMessage("当前环境不支持检查更新。");
          break;
        case "error":
          setPhase("error");
          setMessage(res.message);
          break;
      }
    })();
  }, [busy]);

  // web / SSR → 诚实空态:软件更新是桌面端功能,web 端随浏览器自动更新,无检查入口。
  if (!isDesktop) {
    return (
      <SectionCard
        title="软件更新"
        description="桌面端自动更新"
        action={
          <Badge
            data-slot="check-update-badge"
            data-status="unavailable"
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            桌面端专属
          </Badge>
        }
      >
        <div
          data-slot="check-update-card"
          data-desktop="false"
          className="flex items-start gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <Download className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              软件更新为桌面端功能
            </span>
            <span className="text-xs text-muted-foreground">
              桌面客户端支持一键检查并安装新版。Web 端随浏览器加载最新版,无需手动更新。
            </span>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="软件更新"
      description="检查新版,前往 CreatorOS 官网获取"
      action={
        <Badge
          data-slot="check-update-badge"
          data-status="desktop"
          variant="outline"
          className="border-border bg-surface-subtle text-muted-foreground"
        >
          {version ? `v${version}` : "桌面端"}
        </Badge>
      }
    >
      <div
        data-slot="check-update-card"
        data-desktop="true"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle p-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <Download className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              当前版本
            </span>
            <span
              data-slot="app-version"
              className="font-mono text-xs text-muted-foreground"
            >
              {version ? `v${version}` : "读取中…"}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="check-update-action"
            disabled={busy}
            onClick={check}
          >
            {phase === "checking" ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
            )}
            检查更新
          </Button>
        </div>

        {/* [T-465] 永久展示"访问官网"入口 —— 无论有没有新版,用户点击可跳产品官网看最新说明/
              下载最新版。**永远指向 OFFICIAL_DOWNLOAD_URL 常量**(与 check-update-download
              同源;后续官网维护更新链接,常量改一处即可)。 */}
        <a
          href={OFFICIAL_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-slot="check-update-official-link"
          className="inline-flex items-center gap-1.5 self-start text-xs text-brand underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
          访问 CreatorOS 官网(查看最新版本与更新说明)
        </a>

        {/* [T-459] 有新版:显版本号 + releaseNotes；下载入口永远固定产品官网。 */}
        {phase === "available" && available ? (
          <div
            data-slot="check-update-available"
            className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand-soft/40 p-3"
          >
            <span className="text-sm font-medium text-foreground">
              发现新版本 v{available.latestVersion}
              <span className="ml-1.5 font-normal text-muted-foreground">
                (当前 v{available.currentVersion})
              </span>
            </span>
            {available.releaseNotes ? (
              <p className="whitespace-pre-line text-xs text-muted-foreground">
                {available.releaseNotes}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button asChild size="sm">
                <a
                  href={OFFICIAL_DOWNLOAD_URL}
                  data-slot="check-update-download"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download aria-hidden="true" className="size-4 shrink-0" />
                  去官网下载
                </a>
              </Button>
            </div>
          </div>
        ) : null}

        {/* 已是最新版。 */}
        {phase === "uptodate" ? (
          <p
            data-slot="check-update-feedback"
            data-tone="uptodate"
            className="flex items-center gap-1.5 text-xs text-success"
          >
            <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
            {message}
          </p>
        ) : null}

        {/* 失败(可读文案)。 */}
        {phase === "error" ? (
          <p
            data-slot="check-update-feedback"
            data-tone="error"
            className="flex items-center gap-1.5 text-xs text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            {message}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// DiagnosticLogsCard — 诊断日志 (T-259)
// ---------------------------------------------------------------------------
//
// Rust 壳把 sidecar 的 stdout/stderr 每行 tee 到 <appDataDir>/logs/sidecar.log.enc(加密、脱敏 + 轮转,
// 见 src-tauri/src/logging.rs)。本卡是**前端入口**:桌面端点「在 Finder 打开日志文件夹」→
// fetch /api/v1/local/reveal-logs → sidecar 跑平台 `open` 命令在文件管理器打开 logs 目录,
// 用户把 sidecar.log.enc / sidecar.prev.log.enc 发给开发者即可排障(真实用户撞 bug 的头号打磨)。
//
// **只桌面态有意义**:挂载后经 isDesktopRuntimeClient() 探测;web/SSR → 显「桌面端专属」诚实
// 空态(无入口),绝不假装能打开本机目录。SSR 首帧走空态(desktop=false),挂载后翻真(免水合漂移)。

function DiagnosticLogsCard() {
  // SSR 首帧 desktop=false → 渲空态;挂载后 isDesktopRuntimeClient() 翻真(无水合漂移)。
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "opening" | "error">("idle");
  const [fallbackDir, setFallbackDir] = React.useState("");

  React.useEffect(() => {
    setIsDesktop(isDesktopRuntimeClient());
  }, []);

  const reveal = React.useCallback(() => {
    if (state === "opening") return;
    setState("opening");
    setFallbackDir("");
    void (async () => {
      try {
        const res = await fetch("/api/v1/local/reveal-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          dir?: string;
        };
        if (res.ok && data.ok) {
          setState("idle");
        } else {
          setFallbackDir(data.dir?.trim() ?? "");
          setState("error");
        }
      } catch {
        setState("error");
      }
    })();
  }, [state]);

  // web / SSR → 诚实空态:诊断日志是桌面端功能(sidecar 落盘),web 端无本地日志文件。
  if (!isDesktop) {
    return (
      <SectionCard
        title="诊断日志"
        description="桌面端排障日志"
        action={
          <Badge
            data-slot="diagnostic-logs-badge"
            data-status="unavailable"
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            桌面端专属
          </Badge>
        }
      >
        <div
          data-slot="diagnostic-logs-card"
          data-desktop="false"
          className="flex items-start gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <FileText className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              诊断日志为桌面端功能
            </span>
            <span className="text-xs text-muted-foreground">
              桌面客户端把运行日志落盘到本地,撞 bug 时可一键导出发给开发者。Web 端无本地日志文件。
            </span>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="诊断日志" description="打开运行日志目录用于排障">
      <div
        data-slot="diagnostic-logs-card"
        data-desktop="true"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle p-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <FileText className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              运行日志
            </span>
            <span className="text-xs text-muted-foreground">
              撞到问题时点此打开日志文件夹,把 sidecar.log.enc 发给开发者即可定位。日志已加密并自动脱敏。
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="diagnostic-logs-action"
            disabled={state === "opening"}
            onClick={reveal}
            title="打开诊断日志文件夹(sidecar.log.enc / sidecar.prev.log.enc)"
          >
            {state === "opening" ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
            ) : (
              <FolderOpen aria-hidden="true" className="size-4 shrink-0" />
            )}
            {state === "error" ? "打开失败,重试" : "打开日志目录"}
          </Button>
        </div>
        {state === "error" && fallbackDir ? (
          <div
            data-slot="diagnostic-logs-fallback"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground"
          >
            文件管理器未能自动打开。请手动前往：
            <code className="ml-1 select-all break-all text-foreground">
              {fallbackDir}
            </code>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// PreferenceSettingsCard
// ---------------------------------------------------------------------------

type CreationMode = "guided" | "flexible" | "freeform";

// [T-247 假设置清算] 偏好卡只保留**有真实消费方**的两项:
//   - defaultCreationMode → 新建项目弹窗预选创作模式(new-project-dialog 读它);
//   - autosaveEnabled     → 脚本编辑器失焦自动保存开关(script-rich-editor 读它)。
// 撤掉的控件(契约字段保留兼容,UI 不再渲染):
//   - defaultHome:导航「首页」href="/" 即 Dashboard,按偏好重定向会让首页不可达,
//     且产品无独立「启动页」概念 → 无处消费,撤;
//   - defaultVisibility:项目创建/契约都没有 visibility 字段(宪法 §8 个人产品无分享
//     范围)→ 无处消费,撤;
//   - analyticsEnabled:产品无埋点(PROTECTION.md §4 遥测零收集)→ 开关无意义,撤;
//   - fileNamingRule:从未渲染过控件,命名也不走它 → 维持不渲染。
function PreferenceSettingsCard({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  const initial = viewModel.preferences;
  const [defaultCreationMode, setDefaultCreationMode] =
    React.useState<CreationMode>(initial.defaultCreationMode);
  const [autosaveEnabled, setAutosaveEnabled] = React.useState<boolean>(
    initial.autosaveEnabled,
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
          label="默认创作模式"
          controlId="pref-creation-mode"
          help="新建项目弹窗会按此预选创作模式。"
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
          label="自动保存"
          controlId="pref-autosave"
          help="开启后，脚本编辑器失焦即自动保存未保存的修改。"
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

const CREATION_MODE_OPTIONS: ReadonlyArray<{
  value: CreationMode;
  label: string;
}> = [
  { value: "guided", label: "向导模式" },
  { value: "flexible", label: "灵活模式" },
  { value: "freeform", label: "自由模式" },
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
  // [T-305] 主题默认 'system' —— 必须与 layout.tsx 防闪脚本(默认 'system')一致。
  //   原来初始态/兜底用 viewModel.system.theme(fixture 死值,非 'system')→ localStorage 未
  //   存过主题时,进设置页挂载会把「系统暗」刷成 viewModel 值(亮)→ 主题翻转。主题偏好只存
  //   localStorage(无服务端字段),故 viewModel.system.theme 不该参与默认判定。density 同理。
  const [theme, setTheme] = React.useState<Theme>("system");
  const [density, setDensity] = React.useState<Density>(
    viewModel.system.density,
  );

  React.useEffect(() => {
    const storedTheme = readStored(THEME_STORAGE_KEY, THEME_VALUES, "system");
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

// [T-360①] 自适应单位(带后缀):此前死绑 GB,几 MB 用量显示 0.0 被判统计 bug。
function gb(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes > 0) return Math.max(1, Math.round(bytes / 1e3)) + " KB";
  return "0 MB";
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
              ? `已用 ${usedGb} / ${totalGb}`
              : `已用 ${usedGb}`
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
                {gb(row.bytes)}
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

type ApiFormat = "anthropic" | "openai_chat" | "openai_responses";

const API_FORMAT_OPTIONS: ReadonlyArray<{ value: ApiFormat; label: string }> = [
  { value: "anthropic", label: "Anthropic 兼容" },
  { value: "openai_chat", label: "OpenAI Chat 兼容" },
  { value: "openai_responses", label: "OpenAI Responses" },
];

// Free-form provider suggestions — the input is NOT restricted to these (bind any
// vendor: an Anthropic relay, MiniMax, an OpenAI-compatible gateway, etc.).
const PROVIDER_SUGGESTIONS: ReadonlyArray<string> = [
  "anthropic",
  "minimax",
  "openai",
  "new-api",
  "google",
  "deepseek",
];

// [T-325] 供应商预设行 —— cc-switch 风格「选一家 → 一次性填 baseUrl/接口格式/模型候选」。
// 复用于文本模型卡(ModelConfigurationCard)与备用对话卡(MultimodalModelCard/fallback):
// 两者都是「apiFormat 分派的文本 LLM」,预设目录(MODEL_PROVIDER_PRESETS)对它们同义。
// presetId 由宿主卡按当前 (baseUrl, apiFormat) 反推(matchPresetByConfig)得出并高亮;
// 选中回调把整条预设交给宿主卡填充(custom → 宿主不填,回全自由填)。用现有 shadcn
// Select,与「接口格式」下拉同款。
function ProviderPresetRow({
  idPrefix,
  presetId,
  disabled,
  onSelectPreset,
}: {
  /** data-slot / controlId 前缀,如 "model" | "multimodal-fallback"。 */
  idPrefix: string;
  /** 当前高亮的预设 id(宿主卡按 baseUrl/apiFormat 反推;匹配不到 = custom)。 */
  presetId: string;
  disabled: boolean;
  /** 选中某预设 → 交回宿主卡决定如何填充字段。 */
  onSelectPreset: (preset: ModelProviderPreset) => void;
}) {
  return (
    <SettingsFormRow
      label="供应商预设"
      controlId={`${idPrefix}-preset`}
      help="选一个供应商快速填入接口地址 / 格式;所有字段仍可自由改(参考起始值,可能随供应商变动)。模型名一律自由填(不预置候选,以服务商最新为准)。选「自定义」不填充。"
    >
      <Select
        value={presetId}
        onValueChange={(id) => {
          const preset = MODEL_PROVIDER_PRESETS.find((p) => p.id === id);
          if (preset) onSelectPreset(preset);
        }}
      >
        <SelectTrigger
          id={`${idPrefix}-preset`}
          data-slot={`${idPrefix}-preset-trigger`}
          size="sm"
          className="w-full md:w-72"
          disabled={disabled}
        >
          <SelectValue placeholder="选择供应商" />
        </SelectTrigger>
        <SelectContent data-slot={`${idPrefix}-preset-content`}>
          {MODEL_PROVIDER_PRESETS.map((preset) => (
            <SelectItem
              key={preset.id}
              value={preset.id}
              data-slot={`${idPrefix}-preset-item-${preset.id}`}
            >
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsFormRow>
  );
}

// ---------------------------------------------------------------------------
// TestConnectionButton — [T-377] 每个 capability 配置卡的「测试连接」
// ---------------------------------------------------------------------------
//
// 点击 → settings.models.test(composition-only op,host 侧按该 capability **现有解析链**
// 解析「已保存」的配置 → 发一次最小真实调用 / 最便宜鉴权探测,策略见
// server/settings-model-test-wrap.ts 头注)→ 诚实渲三态「✓ 连通」/「⚠ 无法探测(非失败,
// T-384)」/「✗ 失败:<真实原因>」。
// 注意:测的是**已保存**的配置 —— 表单里没保存的草稿不参与(hint 里明示)。
function TestConnectionButton({
  capability,
  slotPrefix,
  quotaHint,
  beforeTest,
  label = "测试连接",
  disabled = false,
}: {
  capability: string;
  /** data-slot 前缀,如 "model" | "multimodal-image"。 */
  slotPrefix: string;
  /** 额度提示(如生图/付费搜索会真实调用消耗少量额度);null = 不提示。 */
  quotaHint?: string | null;
  /** 主模型可先保存当前草稿，再测试刚保存的同一份配置。 */
  beforeTest?: () => Promise<boolean | void>;
  label?: string;
  disabled?: boolean;
}) {
  const [testing, setTesting] = React.useState(false);
  // [T-384] 三态:"warn" = 无法探测但也无法证伪配置(如 ASR 厂商无 /v1/models 端点)——
  // 诚实中间态,不当失败渲。旧二态响应无 status 字段 → 按 ok 推导,向后兼容。
  const [result, setResult] = React.useState<{
    status: "ok" | "warn" | "fail";
    detail: string;
  } | null>(null);

  const runTest = React.useCallback(async () => {
    setTesting(true);
    setResult(null);
    try {
      if (beforeTest) {
        const ready = await beforeTest();
        if (ready === false) {
          setResult({ status: "fail", detail: "当前配置未保存，请检查必填项。" });
          return;
        }
      }
      const res = (await client.testModelConnection({
        params: { capability },
        query: undefined,
        body: undefined,
      })) as unknown as { ok: boolean; detail: string; status?: "ok" | "warn" | "fail" };
      setResult({ status: res.status ?? (res.ok ? "ok" : "fail"), detail: res.detail });
    } catch (err) {
      setResult({
        status: "fail",
        detail: err instanceof Error ? err.message : "测试请求失败,请重试",
      });
    } finally {
      setTesting(false);
    }
  }, [beforeTest, capability]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {beforeTest
            ? "会先保存当前填写，再按正式调用方式测试"
            : "测试的是已保存的配置(改动请先保存)"}
          {quotaHint ? `;${quotaHint}` : ""}
        </span>
        <Button
          type="button"
          data-slot={`${slotPrefix}-test-connection`}
          variant="outline"
          size="sm"
          disabled={testing || disabled}
          onClick={() => void runTest()}
        >
          {testing ? "测试中…" : label}
        </Button>
      </div>
      {result ? (
        <p
          data-slot={`${slotPrefix}-test-result`}
          data-ok={result.status === "fail" ? "false" : "true"}
          data-status={result.status}
          className={
            result.status === "ok"
              ? "text-xs text-success"
              : result.status === "warn"
                ? "text-xs text-warning"
                : "text-xs text-destructive"
          }
        >
          {result.status === "ok"
            ? `✓ 连通:${result.detail}`
            : result.status === "warn"
              ? `⚠ ${result.detail}`
              : `✗ 失败:${result.detail}`}
        </p>
      ) : null}
    </div>
  );
}

// cc-switch-style configurable provider binding. provider / model / baseUrl /
// apiFormat are free-form; the API key is stored in the LOCAL db (masked to
// `hasSecret` on read — the raw key is never echoed back). A single 保存 upserts
// the "default" capability via `settings.models.put`; resolve.ts then reads it
// (stored key preferred over env-ref) with a global-default fallback.
// [T-325] 顶部加「供应商预设」下拉:选一家 → 填 baseUrl/接口格式 + 切模型候选 datalist。
function ModelConfigurationCard({
  model,
}: {
  model: SettingsViewModel["model"];
}) {
  const [provider, setProvider] = React.useState<string>(model.provider);
  const [modelName, setModelName] = React.useState<string>(model.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(model.baseUrl);
  const [apiFormat, setApiFormat] = React.useState<ApiFormat>(model.apiFormat);
  // [T-325] 当前高亮的供应商预设 id:按 (baseUrl, apiFormat) 反推(回显匹配);匹配
  // 不到 = custom。手改字段时重算,选预设时直接置位。仅驱动下拉高亮 + 模型候选,
  // 不进 PUT(后端不认 presetId)。
  const [presetId, setPresetId] = React.useState<string>(
    () => matchPresetByConfig(model.baseUrl, model.apiFormat)?.id ?? CUSTOM_PRESET_ID,
  );
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  // 常用主路径只留「预设 / 模型 / 密钥」。只有自定义中转或排错时才展开协议等字段。
  const [showAdvanced, setShowAdvanced] = React.useState(
    () => matchPresetByConfig(model.baseUrl, model.apiFormat) === undefined,
  );
  const [temperature, setTemperature] = React.useState<number>(
    model.temperature,
  );
  const { pending, run } = useSettingsMutation();

  // [T-325] 选中预设:一次性填 provider/baseUrl/接口格式(custom 不填,回全自由填)。
  // 模型不强制覆盖(预设是起点不锁死),只把候选切成该家 —— 见下方 datalist。
  const handleSelectPreset = React.useCallback((preset: ModelProviderPreset) => {
    setPresetId(preset.id);
    if (preset.id === CUSTOM_PRESET_ID) {
      setShowAdvanced(true);
      return;
    }
    setProvider(preset.id);
    setBaseUrl(preset.baseUrl);
    setApiFormat(preset.apiFormat);
  }, []);

  const canSave =
    provider.trim().length > 0 && modelName.trim().length > 0 && !pending;

  // One PUT upserts the whole "default" config; an empty secret is omitted so a
  // re-save without re-typing the key preserves the stored one.
  const persistDraft = React.useCallback(
    () =>
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
    [provider, modelName, baseUrl, apiFormat, secret, temperature],
  );

  const save = React.useCallback(() => {
    if (!canSave) return;
    void run(persistDraft);
  }, [canSave, persistDraft, run]);

  const saveBeforeTest = React.useCallback(
    () => (canSave ? run(persistDraft) : Promise.resolve(false)),
    [canSave, persistDraft, run],
  );

  return (
    <SectionCard
      title="模型配置"
      description="选供应商、填模型和密钥即可；中转站与特殊协议放在高级设置"
    >
      <div
        data-slot="model-configuration-card"
        data-highlight="text-model"
        className="flex flex-col gap-3"
      >
        <ProviderPresetRow
          idPrefix="model"
          presetId={presetId}
          disabled={pending}
          onSelectPreset={handleSelectPreset}
        />
        <SettingsFormRow
          label="模型"
          controlId="model-name"
          help="模型 id 自由填(示例:claude-opus-4-8;仅示例,以你的服务商最新型号为准)。"
        >
          <Input
            id="model-name"
            data-slot="model-name-input"
            list="model-name-suggestions"
            value={modelName}
            disabled={pending}
            onChange={(event) => setModelName(event.target.value)}
            aria-label="模型名称"
          />
          {/* [T-325] 候选随选中预设切换;custom / 无候选时为空(纯自由输入)。 */}
          <datalist id="model-name-suggestions">
            {presetModels(presetId).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
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
        <div className="flex justify-end">
          <Button
            type="button"
            data-slot="model-advanced-toggle"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? "收起高级设置" : "高级设置（中转站 / 协议）"}
          </Button>
        </div>
        <div
          data-slot="model-advanced-settings"
          hidden={!showAdvanced}
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-subtle p-3"
        >
          <SettingsFormRow
            label="提供商标识"
            controlId="model-provider"
            help="仅用于识别配置；选择预设时已自动填写。"
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
            label="接口地址"
            controlId="model-base-url"
            help="中转站填写其 Base URL；通常应包含 /v1，具体以服务商文档为准。"
          >
            <Input
              id="model-base-url"
              data-slot="model-base-url-input"
              value={baseUrl}
              disabled={pending}
              placeholder="https://example.com/v1"
              onChange={(event) => {
                const next = event.target.value;
                setBaseUrl(next);
                setPresetId(
                  matchPresetByConfig(next, apiFormat)?.id ?? CUSTOM_PRESET_ID,
                );
              }}
              aria-label="接口地址"
            />
          </SettingsFormRow>
          <SettingsFormRow
            label="接口格式"
            controlId="model-api-format"
            help="必须与服务商实际支持的协议一致；New API 可按渠道选择 Chat 或 Responses。"
          >
            <Select
              value={apiFormat}
              onValueChange={(value) => {
                const next = value as ApiFormat;
                setApiFormat(next);
                setPresetId(
                  matchPresetByConfig(baseUrl, next)?.id ?? CUSTOM_PRESET_ID,
                );
              }}
            >
              <SelectTrigger
                id="model-api-format"
                data-slot="model-api-format-trigger"
                size="sm"
                className="w-52"
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
            label="温度"
            controlId="model-temperature"
            help="一般保持默认即可；较高会让回答更发散。"
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
        </div>
        <div className="flex items-start justify-between gap-3">
          <Button
            type="button"
            data-slot="model-save"
            variant="outline"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            仅保存
          </Button>
          <TestConnectionButton
            capability={MODEL_CAPABILITY}
            slotPrefix="model"
            beforeTest={saveBeforeTest}
            label="保存并测试"
            disabled={!canSave}
          />
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
    // [T-379] openai = OpenAI 兼容 images API(gpt-image 系及 one-api/new-api 中转站通用)。
    providerSuggestions: ["openai", "minimax"] as ReadonlyArray<string>,
    providerPlaceholder: "openai",
    providerHelp:
      "内置适配:minimax / openai 兼容(中转站通用)。openai = OpenAI 兼容 images API —— gpt-image 系及各中转站(one-api/new-api)通用,配中转就选它;其他厂商需接入适配器。",
    // [T-377] 模型 id 自由填,不预置候选 —— 供应商上新频繁,示例仅供参考。
    modelHelp:
      "文生图模型 id 自由填(示例:gpt-image-2 / image-01;仅示例,以你的服务商最新型号为准)。",
    modelPlaceholder: "示例:gpt-image-2(以服务商最新为准)",
    baseUrlPlaceholder:
      "示例:https://你的中转站域名 或 https://api.minimaxi.com/v1(留空=provider 默认)",
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
    // [T-379] 生视频各家 API 形态不统一(异步任务/专有协议),本期只内置 minimax;
    // 裁决与后续适配建议见 docs/research/2026-07-17-image-video-gen-provider-landscape-research.md。
    providerHelp:
      "内置适配:minimax;Sora / Veo / Kling 等需后续适配(各家视频 API 形态不统一,见调研)。",
    // [T-377] 模型 id 自由填,不预置候选 —— 供应商上新频繁,示例仅供参考。
    modelHelp: "文生视频模型 id 自由填(示例:video-01;仅示例,以你的服务商最新型号为准)。",
    modelPlaceholder: "示例:video-01(以服务商最新为准)",
    baseUrlPlaceholder: "示例:https://api.minimaxi.com/v1(留空=provider 默认)",
    disabledHint: "未配 → 录制页 AI 生成禁用。",
  },
  // 逐字稿 ASR(T-030-D1 / **T-160 改选配**)—— 与图/视频同款 cc-switch 表单,provider 走 OpenAI
  // 兼容 ASR(SiliconFlow/OpenAI/Groq);建议值给 SiliconFlow(skill 已验)但不锁死。
  // [T-160] ASR 变**选配**:不配 API 也能转写——回退本地 Whisper(免 key,首次自动下模型,默认
  // small 级)。文案改「选配」+ 说明未配走本地。TODO:级别选择器(tiny/base/small/medium)——
  // 现按 env CREATOROS_WHISPER_LEVEL 或默认 small;做进 UI 需新 model_config 字段/迁移,暂缓。
  audio: {
    capability: "transcribe.audio" as const,
    title: "语音转文字(选配)",
    icon: Cpu,
    description:
      "把视频里的话转成文字稿(复盘 / 二创的底稿)。选配:不配则用本地 Whisper(免 key,首次自动下模型,默认 small 级);配了云端 ASR 则更快更准。",
    providerSuggestions: ["siliconflow", "openai", "groq"] as ReadonlyArray<string>,
    providerPlaceholder: "示例:siliconflow",
    providerHelp:
      "OpenAI 兼容 ASR 厂商,可自定义(SiliconFlow / OpenAI / Groq 同形状)。留空则用本地 Whisper。",
    modelHelp: "ASR 模型 id,如 FunAudioLLM/SenseVoiceSmall(SiliconFlow)。",
    modelPlaceholder: "示例:FunAudioLLM/SenseVoiceSmall",
    baseUrlPlaceholder:
      "示例:https://api.siliconflow.cn/v1(留空=provider 默认)",
    disabledHint: "未配 → 用本地 Whisper 转写(免 key,首次下载模型)。",
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
  // [T-239b S1] 备用对话模型 —— 主对话模型「流开始前」可重试错误(限流/5xx/网络断/过载)
  // 自动重试耗尽后由它接管一次(错误恢复层)。只认本专配行(不回退默认模型 —— 那会「备用」
  // 成主模型自己);未配 → 现状报错(诚实降级)。文本 LLM 走 apiFormat 分派,故此卡多一个
  // 「接口格式」选择(与文本模型卡同款,是唯一带 apiFormat 的多模态卡)。
  fallback: {
    capability: "chat.fallback" as const,
    title: "备用对话模型",
    icon: Cpu,
    description:
      "主对话模型故障(限流/服务端错误/网络断)自动重试仍失败时,由它接管本轮;建议配与主模型不同厂商的模型(故障不同时发生)。不配则重试耗尽后直接报错。",
    providerSuggestions: ["anthropic", "minimax", "deepseek", "openai"] as ReadonlyArray<string>,
    providerPlaceholder: "anthropic",
    providerHelp: "任意厂商名,可自定义(建议与主模型不同厂商,故障不同时发生)。",
    modelHelp: "模型 id 自由填(示例:claude-opus-4-8 / deepseek-chat;仅示例,以你的服务商最新型号为准)。",
    modelPlaceholder: "",
    baseUrlPlaceholder: "https://api.anthropic.com(留空=provider 默认)",
    disabledHint: "未配 → 主模型重试耗尽后直接报错。",
  },
} as const;

// [T-132] 多模态卡 kind → onboarding stepKey(?highlight=<stepKey> 深链落地定位)。
// 只映射 onboarding 清单里有对应步的 kind;embed/vision 无 onboarding 步 → undefined
// (不加 data-highlight,不影响定位)。
const MULTIMODAL_HIGHLIGHT_KEY: Record<
  | "image"
  | "video"
  | "audio"
  | "embed"
  | "vision"
  | "review"
  | "search"
  | "fallback",
  string | undefined
> = {
  image: "image-model",
  video: "video-model",
  audio: "asr-model",
  review: "review-model",
  search: "web-search",
  embed: undefined,
  vision: undefined,
  // [T-239b] 备用对话模型无 onboarding 步 → 无深链锚点。
  fallback: undefined,
};

function MultimodalModelCard({
  kind,
  state,
}: {
  kind:
    | "image"
    | "video"
    | "audio"
    | "embed"
    | "vision"
    | "review"
    | "search"
    | "fallback";
  state: MultimodalModelState;
}) {
  const meta = MULTIMODAL_META[kind];
  const [provider, setProvider] = React.useState<string>(state.provider);
  const [modelName, setModelName] = React.useState<string>(state.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(state.baseUrl);
  // [T-239b] 仅备用对话模型卡消费:文本 LLM 走 apiFormat 分派(anthropic / OpenAI 兼容),
  // 与文本模型卡同款下拉;其它多模态卡按 provider 分派,不渲此控件。
  const [apiFormat, setApiFormat] = React.useState<ApiFormat>(
    state.apiFormat ?? "anthropic",
  );
  // [T-325] 仅备用对话卡(fallback,apiFormat 分派的文本 LLM)复用供应商预设 —— 与文本
  // 模型卡同款目录。其它多模态卡按 provider 分派、字段语义不同,不挂预设(state 恒存
  // 但仅 fallback 渲染,遵守 Hooks 规则)。
  const isFallback = kind === "fallback";
  const [presetId, setPresetId] = React.useState<string>(() =>
    isFallback
      ? matchPresetByConfig(state.baseUrl, state.apiFormat ?? "anthropic")?.id ??
        CUSTOM_PRESET_ID
      : CUSTOM_PRESET_ID,
  );
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  const { pending, run } = useSettingsMutation();

  // Re-sync drafts when a server refresh changes the stored config.
  React.useEffect(() => {
    setProvider(state.provider);
    setModelName(state.modelName);
    setBaseUrl(state.baseUrl);
    setApiFormat(state.apiFormat ?? "anthropic");
    if (isFallback) {
      setPresetId(
        matchPresetByConfig(state.baseUrl, state.apiFormat ?? "anthropic")?.id ??
          CUSTOM_PRESET_ID,
      );
    }
    setSecret("");
  }, [state, isFallback]);

  // [T-325] 备用对话卡选中预设:填 provider/baseUrl/接口格式(custom 不填)。
  const handleSelectPreset = React.useCallback((preset: ModelProviderPreset) => {
    setPresetId(preset.id);
    if (preset.id === CUSTOM_PRESET_ID) return;
    setProvider(preset.id);
    setBaseUrl(preset.baseUrl);
    setApiFormat(preset.apiFormat);
  }, []);

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
            // [T-239b] 备用对话模型卡存用户选的接口格式(resolveModelSpec 按它分派适配器)。
            // 其余多模态卡不带 apiFormat 不变。
            ...(kind === "embed" || kind === "review"
              ? { apiFormat: "openai_chat" as const }
              : kind === "fallback"
                ? { apiFormat }
                : {}),
          },
        })
        .then(() => setSecret("")),
    );
  }, [
    canSave,
    run,
    kind,
    meta.capability,
    provider,
    modelName,
    baseUrl,
    apiFormat,
    secret,
  ]);

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
        {isFallback ? (
          // [T-325] 备用对话卡复用供应商预设(与文本模型卡同款)。
          <ProviderPresetRow
            idPrefix={`multimodal-${kind}`}
            presetId={presetId}
            disabled={pending}
            onSelectPreset={handleSelectPreset}
          />
        ) : null}
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
            list={isFallback ? `multimodal-${kind}-model-suggestions` : undefined}
            value={modelName}
            disabled={pending}
            placeholder={meta.modelPlaceholder}
            onChange={(event) => setModelName(event.target.value)}
            aria-label={`${meta.title}名称`}
          />
          {/* [T-325] 备用对话卡:候选随选中预设切换;custom / 无候选时为空。 */}
          {isFallback ? (
            <datalist id={`multimodal-${kind}-model-suggestions`}>
              {presetModels(presetId).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          ) : null}
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
            onChange={(event) => {
              const next = event.target.value;
              setBaseUrl(next);
              // [T-325] 备用对话卡:手改地址 → 重算预设高亮(其它卡无预设,不需重算)。
              if (isFallback) {
                setPresetId(
                  matchPresetByConfig(next, apiFormat)?.id ?? CUSTOM_PRESET_ID,
                );
              }
            }}
            aria-label={`${meta.title}接口地址`}
          />
        </SettingsFormRow>
        {kind === "fallback" ? (
          // [T-239b] 备用对话模型走文本 LLM 解析链 → 需要接口格式(与文本模型卡同款下拉)。
          <SettingsFormRow
            label="接口格式"
            controlId={`multimodal-${kind}-api-format`}
            help="鉴权与请求体格式(与主模型卡同义)。"
          >
            <Select
              value={apiFormat}
              onValueChange={(value) => {
                const next = value as ApiFormat;
                setApiFormat(next);
                // [T-325] 改格式 → 重算预设高亮(匹配不到 = 自定义)。
                setPresetId(
                  matchPresetByConfig(baseUrl, next)?.id ?? CUSTOM_PRESET_ID,
                );
              }}
            >
              <SelectTrigger
                id={`multimodal-${kind}-api-format`}
                data-slot={`multimodal-${kind}-api-format-trigger`}
                size="sm"
                className="w-44"
                disabled={pending}
              >
                <SelectValue placeholder="选择格式" />
              </SelectTrigger>
              <SelectContent data-slot={`multimodal-${kind}-api-format-content`}>
                {API_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
        ) : null}
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
        <div className="flex items-start justify-between gap-3">
          {/* [T-377] 测试连接:按能力走最小真实调用/最便宜鉴权探测(生图/付费搜索会真实
              调用 → 额度提示;生视频只验鉴权不真生成)。 */}
          <TestConnectionButton
            capability={meta.capability}
            slotPrefix={`multimodal-${kind}`}
            quotaHint={
              kind === "image"
                ? "生图无免费探测端点,测试会真实生成一张最小图,消耗少量额度"
                : kind === "search"
                  ? "付费搜索(bocha/tavily/serpapi)会发一次最小真实检索,消耗少量额度"
                  : null
            }
          />
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
