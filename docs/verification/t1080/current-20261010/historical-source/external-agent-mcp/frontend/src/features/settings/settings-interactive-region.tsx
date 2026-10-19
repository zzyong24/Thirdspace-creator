"use client";

/** 设置入口负责页签与账号、外观、存储；模型配置由独立区域维护。 */

import { SettingsFormRow } from "./settings-form-row";
import { RedfoxConfiguration } from "./redfox-configuration";
import { SettingsModelRegion } from "./settings-model-region";
import { useSettingsMutation } from "./use-settings-mutation";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { ProgressBar } from "@/components/project/progress-bar";
import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { notifyAccountsChanged } from "@/lib/account-events";
import { client } from "@/lib/contract-client";
import { isAccountRequiredError } from "@/lib/http-transport";
import { WebSessionVaultCard } from "./web-session-vault-card";
// [T-332 S5] 重置工作区危险区卡(存储页签底部;桌面端专属)。
import { ResetWorkspaceCard } from "./reset-workspace-card";
// [T-363] 模型配置导出/导入兜底卡(模型页签底部;文件含密钥,卡内常驻警示)。
import { TagChip } from "@/components/content/tag-chip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  KeyRound,
  Loader2,
  Palette,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  type LucideIcon
} from "lucide-react";
// 桌面软件更新薄封装：只读当前包编译期入口，与激活态解耦且不跨渠道回退。
import {
  checkLatestVersion,
  getAppVersion,
  isDesktopRuntimeClient,
  PACKAGE_DOWNLOAD_URL,
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
  ModelAuthorityState,
  SettingsViewModel
} from "./settings-page";
// T-077a 技能页签:列表/详情组件 + 可序列化条目类型(route server 侧投影传入)。
import { requestOnboardingReopen } from "@/features/onboarding/onboarding-card";
import { ActivationResetControl } from "./activation-reset-control";
import { CliAccessCard } from "./cli-access-card";
import { ExternalAgentConnectionsCard } from "./external-agent-connections-card";
import type { SkillItem } from "./skills-data";
import { SkillsSection } from "./skills-section";

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
  if(typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if(raw && (allowed as ReadonlyArray<string>).includes(raw)) {
      return raw as T;
    }
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to default.
  }
  return fallback;
}

function writeStored(key: string, value: string): void {
  if(typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence; ignore quota / disabled-storage errors.
  }
}

/** Apply the resolved theme as a `.dark` / no-`.dark` class on <html>. */
function applyTheme(theme: Theme): void {
  if(typeof document === "undefined") return;
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
  if(typeof document === "undefined") return;
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
  { id: "data-services", label: "数据服务", icon: KeyRound },
  // T-077a:技能管理页签(SPEC 2026-07-03 §1.1)—— 列出 REGISTRY 全部 Skill,查看/定制
  // system/template(settings.prompts.put 热生效)。
  { id: "skills", label: "技能", icon: Sparkles },
  { id: "storage", label: "存储", icon: HardDrive },
];

// [T-132] onboarding 深链 stepKey → 该卡所在设置页签。settings 类步骤点「去配置」跳
// /settings?highlight=<stepKey>,弹窗据此先切到对应页签、再滚动+高亮那张卡。未列出的
// stepKey(或缺省 highlight)→ 无副作用(不切页签、不报错)。
const HIGHLIGHT_TAB: Record<string, string> = {
  "redfox": "data-services",
  "text-model": "models",
  "image-model": "models",
  "video-model": "models",
  "asr-model": "models",
  "review-rules": "models",
  "storage-root": "storage",
  "web-session-vault": "account",
};

export function SettingsDialog({
  viewModel,
  modelAuthority,
  skills = [],
  activation,
  channelLinks,
}: {
  viewModel: SettingsViewModel;
  modelAuthority?: ModelAuthorityState;
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
  const [tab, setTab] = React.useState<string>(
    () =>
      (highlight ? HIGHLIGHT_TAB[highlight] : undefined) ??
      SETTINGS_DIALOG_TABS[0]!.id,
  );

  // 关闭弹窗:回上一页(回到打开设置之前的位置),没有历史时兜底回首页。
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if(!next) {
        if(typeof window !== "undefined" && window.history.length > 1) {
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
    if(!highlight) return;
    const targetTab = HIGHLIGHT_TAB[highlight];
    if(!targetTab) return; // 未知 stepKey → 不切页签、不报错。
    // URL → React state 的同步延到浏览器帧，避免 effect 内同步 setState 触发级联渲染。
    const tabRaf = requestAnimationFrame(() => {
      setTab(targetTab);
      // 所有 panel 都 forceMount,同一帧即可定位;React 随后提交 tab 可见态。
      if(typeof document === "undefined") return;
      const el = document.querySelector(
        `[data-highlight="${CSS.escape(highlight)}"]`,
      );
      if(!(el instanceof HTMLElement)) return; // 找不到对应卡 → 无副作用。
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // 高亮 ring(2s 后移除)—— 用与卡片 focus 同调性的 brand ring。
      el.classList.add("ring-2", "ring-brand", "ring-offset-2", "rounded-card");
      const timer = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-brand", "ring-offset-2");
      }, 2000);
      // 保存 timer 到 dataset 以便卸载时清(避免组件卸载后 setTimeout 触发 DOM 访问)。
      el.dataset.highlightTimer = String(timer);
    });
    return () => cancelAnimationFrame(tabRaf);
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
                <AccountInformationCard
                  key={viewModel.account.displayName}
                  viewModel={viewModel}
                />
                <CliAccessCard />
                <ExternalAgentConnectionsCard />
                <AccountBindingCard
                  key={`${viewModel.douyinAccount.loggedIn}:${viewModel.douyinAccount.sourceReady ?? false}`}
                  douyinAccount={viewModel.douyinAccount}
                />
                {/* [T-217a] 网站登录保管库:登录一次网站 → 编导带登录态读正文(web.read)。 */}
                <div
                  data-slot="web-session-vault-highlight"
                  data-highlight="web-session-vault"
                >
                  <WebSessionVaultCard />
                </div>
                {/* [T-167] 激活状态卡:桌面端读真态四态诚实展示;web/未装配 → 桌面端专属空态。 */}
                <ActivationStatusCard
                  activation={activation}
                  purchaseUrl={channelLinks?.purchaseUrl ?? null}
                  renewalUrl={channelLinks?.renewalUrl ?? null}
                  channelSupportUrl={channelLinks?.channelSupportUrl ?? null}
                  downloadUrl={channelLinks?.downloadUrl ?? null}
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
              <SettingsModelRegion viewModel={viewModel} modelAuthority={modelAuthority} highlight={highlight} />
            </SettingsPanel>
            <SettingsPanel tabId="data-services" active={tab}>
              {tab === "data-services" && <div data-highlight="redfox"><RedfoxConfiguration /></div>}
            </SettingsPanel>
            <SettingsPanel tabId="skills" active={tab}>
              <SkillsSection
                // [T-513] 切号必须销毁展开行、草稿、pending/error 等本地状态；不能让旧账号
                // textarea 在新账号目录上复用。服务端读写仍以 RequestContext 做最终归属门。
                key={skills[0]?.accountId ?? "__no-account-skill-catalog__"}
                skills={skills}
              />
            </SettingsPanel>
            <SettingsPanel tabId="storage" active={tab}>
              <div className="flex flex-col gap-card-gap">
                <StorageUsageCard
                  key={viewModel.storage.rootPath}
                  storage={viewModel.storage}
                />
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

  const trimmed = draftName.trim();
  const dirty = trimmed.length > 0 && trimmed !== initialName;

  const saveName = React.useCallback(() => {
    if(!dirty) return;
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
          help="显示名称，保存后立即生效。"
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="account-nickname"
              data-slot="account-nickname-input"
              value={draftName}
              disabled={pending}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if(event.key === "Enter") {
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
        if(alive && typeof status.loggedIn === "boolean") {
          setLoggedIn(status.loggedIn);
        }
        // [T-144] 采集源就绪态(缺省 false):去「可采集」虚假承诺。
        if(alive && typeof status.sourceReady === "boolean") {
          setSourceReady(status.sourceReady);
        }
        if(alive) setAccountRequired(false);
      } catch(err) {
        // [T-332 S4] 未选号(428)→ 徽标转绑定引导;其它探针失败(无浏览器/transport
        // race)→ 保持 SSR 兜底(未连接),诚实不误报。
        if(alive && isAccountRequiredError(err)) setAccountRequired(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const busy = phase !== "idle";

  // 点击扫码:弹 headed Chromium 让用户扫码 → 成功后重拉 status 刷新徽标。
  const connect = React.useCallback(() => {
    if(busy) return;
    setPhase("scanning");
    setFeedback({ kind: "none" });
    void (async () => {
      try {
        const res = (await client.loginDouyin({
          params: undefined,
          query: undefined,
          body: {},
        })) as { loggedIn?: boolean };
        if(res.loggedIn) {
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
            if(typeof status.sourceReady === "boolean") {
              setSourceReady(status.sourceReady);
            }
          } catch {
            // status 探针失败(transport race)→ 信任 login 的成功返回。
            confirmed = true;
          }
          setLoggedIn(confirmed);
          // [T-332 S4] 扫码绑定成功 → 未选号引导态清除(切换器会收 accountsChanged 自动选号)。
          if(confirmed) setAccountRequired(false);
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
          <Image
            src="/douyin-icon.png"
            alt="抖音"
            aria-hidden="true"
            width={40}
            height={40}
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
  if(expiresAt === null && licenseMode !== null) return "永久激活";
  if(licenseMode === null) return "—";
  const upper = licenseMode.toUpperCase();
  if(upper === "TIME") return "时间型";
  if(upper === "PERMANENT") return "永久激活";
  return licenseMode; // 未知授权类型:透传原值,不臆造。
}

// ISO → 本地日期(YYYY-MM-DD)。SSR/CSR 一致:显式用 UTC 切片而非 toLocaleString
// (避免 hydration 时区漂移)。脏值 → 原样透传(诚实,不吞)。
function formatIsoDate(iso: string): string {
  const t = Date.parse(iso);
  if(Number.isNaN(t)) return iso;
  return new Date(t).toISOString().slice(0, 10);
}

// 到期展示:永久 → 「永久」;grace → 「离线宽限中」;否则显到期日期。
function expiryLabel(
  status: ActivationState["status"],
  expiresAt: string | null,
): string {
  if(expiresAt === null) return "永久";
  if(status === "grace") return "离线宽限中";
  return formatIsoDate(expiresAt);
}

// [T-372 L3] 「上次与授权服务器确认于 X 天前」(SPEC §8:买断离线时设置页至多显示这个)。
// 相对天数在客户端挂载后计算(nowMs=null 的 SSR 首帧只显绝对日期,避免水合漂移);
// 脏值透传原文(诚实,不吞)。
function lastConfirmedLabel(iso: string, nowMs: number | null): string {
  const t = Date.parse(iso);
  if(Number.isNaN(t)) return iso;
  const dateText = formatIsoDate(iso);
  if(nowMs === null) return dateText;
  const days = Math.floor((nowMs - t) / 86_400_000);
  if(days <= 0) return `今天(${dateText})`;
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
  if(machineId.length <= 18) return machineId;
  return `${machineId.slice(0, 8)}…${machineId.slice(-6)}`;
}

// [T-396b] 原 T-168 官网 PURCHASE_URL 硬编码已删:购买/续期入口按激活码所属渠道运行时
// 下发(channelLinks.purchaseUrl);null → 整个隐藏(SPEC §5/§7 红线:不回退官方链接)。

function ActivationStatusCard({
  activation,
  purchaseUrl = null,
  renewalUrl = null,
  channelSupportUrl = null,
  downloadUrl = null,
}: {
  activation?: ActivationState;
  /** T-534：四类商业/交付入口严格分工；null 只表示当前未提供。 */
  purchaseUrl?: string | null;
  renewalUrl?: string | null;
  channelSupportUrl?: string | null;
  downloadUrl?: string | null;
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
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后立刻取本机时钟,同帧渲出「X 天前」(T-167 契约;setTimeout 会让首屏只剩绝对日期)
    setNowMs(Date.now());
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const apply = (d: ShellGateDecision | null) => {
      if(disposed || !d) return;
      if(d.status === "grace" && d.mode === "trial" && d.offlineRemaining != null) {
        setGraceInfo({ remaining: d.offlineRemaining, anchoredAt: Date.now() });
      } else {
        setGraceInfo(null);
      }
    };
    void (async () => {
      apply(await fetchLastShellDecision());
      unlisten = await subscribeShellDecision(apply);
      if(disposed && unlisten) {
        unlisten();
        unlisten = null;
      }
    })();
    return () => {
      disposed = true;
      if(unlisten) unlisten();
    };
  }, []);

  // 倒计时每秒重渲(仅宽限态才起 interval;非宽限零开销)。
  React.useEffect(() => {
    if(!graceInfo) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [graceInfo]);

  // web / 未装配 / 读失败 → 诚实空态卡:激活是桌面端功能,web 端不显激活态(绝不假装)。
  if(!activation) {
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
                    ((nowMs ?? graceInfo.anchoredAt) - graceInfo.anchoredAt) /
                    1000;
                  return remaining > 0
                    ? formatCountdown(remaining)
                    : "已用尽,请联网重新校验授权";
                })()
                : "未知"}
            </span>
          </SettingsFormRow>
        ) : null}
        <div className="grid gap-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-foreground">渠道服务入口</p>
          <div className="flex flex-wrap gap-2">
            {purchaseUrl ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={purchaseUrl}
                  data-slot="activation-purchase-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <KeyRound aria-hidden="true" className="size-4 shrink-0" />
                  购买激活码
                </a>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                购买：当前未提供
              </span>
            )}
            {renewalUrl ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={renewalUrl}
                  data-slot="activation-renewal-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  续费
                </a>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                续费：当前未提供
              </span>
            )}
            {channelSupportUrl ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={channelSupportUrl}
                  data-slot="activation-channel-support-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  商业售后
                </a>
              </Button>
            ) : null}
            {downloadUrl ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={downloadUrl}
                  data-slot="activation-download-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  渠道下载
                </a>
              </Button>
            ) : null}
          </div>
        </div>
        <ActivationResetControl visible={activation.status !== "inactive"} />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// CheckUpdateCard — 软件更新 (T-180 → T-396c → T-459 官网公开源)
// ---------------------------------------------------------------------------
//
// [T-459/T-871] 更新流 = 「GET 包级 latest.json + 发现新版后提供包级下载入口」:
//   - 不调用授权域名,不发送激活码/机器/项目/nonce,不受授权状态影响;
//   - 有新版 → 显版本/说明 + 固定包级下载页「去下载」;远端 JSON 的 URL 一律不采纳;
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
    const timer = window.setTimeout(() => {
      const desktop = isDesktopRuntimeClient();
      setIsDesktop(desktop);
      if(desktop) {
        void getAppVersion().then((v) => setVersion(v));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const busy = phase === "checking";

  const check = React.useCallback(() => {
    if(busy) return;
    setPhase("checking");
    setMessage("");
    setAvailable(null);
    void (async () => {
      const res = await checkLatestVersion();
      switch(res.kind) {
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
  if(!isDesktop) {
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
      description="在应用内检查是否有新版"
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

        {/* [T-459/T-871] 有新版才显版本、说明与包级下载入口；不再常驻展示产品官网。 */}
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
            {PACKAGE_DOWNLOAD_URL ? (
              <div className="flex justify-end">
                <Button asChild size="sm">
                  <a
                    href={PACKAGE_DOWNLOAD_URL}
                    data-slot="check-update-download"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download aria-hidden="true" className="size-4 shrink-0" />
                    去官网下载
                  </a>
                </Button>
              </div>
            ) : null}
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
    const timer = window.setTimeout(
      () => setIsDesktop(isDesktopRuntimeClient()),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const reveal = React.useCallback(() => {
    if(state === "opening") return;
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
        if(res.ok && data.ok) {
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
  if(!isDesktop) {
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
  const router = useRouter();
  const initial = viewModel.preferences;
  const [reopenError, setReopenError] = React.useState<string | null>(null);
  const [reopening, setReopening] = React.useState(false);
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
            disabled={reopening}
            onClick={async () => {
              setReopening(true); setReopenError(null);
              try { await requestOnboardingReopen(); router.replace("/"); }
              catch { setReopenError("引导未能打开，请重试。"); }
              finally { setReopening(false); }
            }}
          >
            重新打开新手引导
          </Button>
          {reopenError ? <p role="status" className="text-xs text-destructive">{reopenError}</p> : null}
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
    const timer = window.setTimeout(() => {
      const storedTheme = readStored(THEME_STORAGE_KEY, THEME_VALUES, "system");
      const storedDensity = readStored(
        DENSITY_STORAGE_KEY,
        DENSITY_VALUES,
        viewModel.system.density,
      );
      setTheme(storedTheme);
      setDensity(storedDensity);
      // 根级 ThemeSync 统一维护主题；进入设置不重新解析系统外观。
      applyDensity(storedDensity);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [viewModel.system.density]);

  const onThemeChange = React.useCallback((next: Theme) => {
    setTheme(next);
    writeStored(THEME_STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event("creatoros:theme-change"));
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
  if(bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if(bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if(bytes > 0) return Math.max(1, Math.round(bytes / 1e3)) + " KB";
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

  const canSave = rootPath.trim().length > 0 && rootPath !== storage.rootPath && !pending;

  const save = React.useCallback(() => {
    if(!canSave) return;
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
              placeholder="~/media"
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
