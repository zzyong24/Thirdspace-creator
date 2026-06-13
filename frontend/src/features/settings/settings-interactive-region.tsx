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
 *    StorageUsageCard → ModelConfigurationCard →
 *    OtherSettingsCard, with a destructive "delete account"
 *    affordance pinned in the OtherSettingsCard.
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
import { ProgressBar } from "@/components/project/progress-bar";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";

import type { SettingsViewModel } from "./settings-page";

// ---------------------------------------------------------------------------
// SettingsMainColumn
// ---------------------------------------------------------------------------

export function SettingsMainColumn({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  return (
    <div data-slot="main-settings" className="flex flex-col gap-(--card-gap)">
      <AccountInformationCard viewModel={viewModel} />
      <PreferenceSettingsCard viewModel={viewModel} />
      <SystemSettingsCard viewModel={viewModel} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsRailColumn
// ---------------------------------------------------------------------------

export function SettingsRailColumn({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  return (
    <div
      data-slot="settings-rail"
      className="flex flex-col gap-(--card-gap)"
    >
      <StorageUsageCard storage={viewModel.storage} />
      <ModelConfigurationCard model={viewModel.model} />
      <OtherSettingsCard />
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
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-md font-semibold text-brand"
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
              <TagChip
                label={`计划：${viewModel.account.planLabel}`}
                tone="brand"
                size="sm"
              />
              <TagChip
                label={`时区：${viewModel.account.timezone}`}
                tone="neutral"
                size="sm"
              />
            </div>
          </div>
        </div>
        <SettingsFormRow
          label="昵称"
          controlId="account-nickname"
          help="展示给协作者与内容合作方。"
        >
          <Input
            id="account-nickname"
            data-slot="account-nickname-input"
            defaultValue={viewModel.account.displayName}
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="邮箱"
          controlId="account-email"
          help="登录与重要通知会发送到此邮箱。"
        >
          <Input
            id="account-email"
            type="email"
            data-slot="account-email-input"
            defaultValue={viewModel.account.email}
          />
        </SettingsFormRow>
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
            onValueChange={(value) => setDefaultHome(String(value))}
          >
            <SelectTrigger
              id="pref-default-home"
              data-slot="pref-default-home-trigger"
              size="sm"
              className="w-44"
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
            onValueChange={(value) =>
              setDefaultCreationMode(value as CreationMode)
            }
          >
            <SelectTrigger
              id="pref-creation-mode"
              data-slot="pref-creation-mode-trigger"
              size="sm"
              className="w-44"
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
            onValueChange={(value) =>
              setDefaultVisibility(value as Visibility)
            }
          >
            <SelectTrigger
              id="pref-visibility"
              data-slot="pref-visibility-trigger"
              size="sm"
              className="w-44"
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
            onCheckedChange={(value) => setAutosaveEnabled(Boolean(value))}
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
            onCheckedChange={(value) => setAnalyticsEnabled(Boolean(value))}
            aria-label="启用使用情况分析"
          />
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

type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";

function SystemSettingsCard({ viewModel }: { viewModel: SettingsViewModel }) {
  const [theme, setTheme] = React.useState<Theme>(viewModel.system.theme);
  const [density, setDensity] = React.useState<Density>(
    viewModel.system.density,
  );
  const [notifications, setNotifications] = React.useState<boolean>(
    viewModel.system.notifications,
  );
  const [locale, setLocale] = React.useState<string>(viewModel.system.locale);
  return (
    <SectionCard
      title="系统设置"
      description="外观、语言与通知"
    >
      <div data-slot="system-settings-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="主题"
          controlId="sys-theme"
          help="跟随系统或手动切换浅色/深色。"
        >
          <Select
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            <SelectTrigger
              id="sys-theme"
              data-slot="sys-theme-trigger"
              size="sm"
              className="w-44"
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
          help="列表与卡片的间距。"
        >
          <Select
            value={density}
            onValueChange={(value) => setDensity(value as Density)}
          >
            <SelectTrigger
              id="sys-density"
              data-slot="sys-density-trigger"
              size="sm"
              className="w-44"
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
        <SettingsFormRow
          label="语言"
          controlId="sys-locale"
          help="界面与时区显示。"
        >
          <Select
            value={locale}
            onValueChange={(value) => setLocale(String(value))}
          >
            <SelectTrigger
              id="sys-locale"
              data-slot="sys-locale-trigger"
              size="sm"
              className="w-44"
            >
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent data-slot="sys-locale-content">
              {LOCALE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="桌面通知"
          controlId="sys-notifications"
          help="发布完成与系统消息提醒。"
        >
          <Switch
            id="sys-notifications"
            data-slot="sys-notifications-switch"
            size="sm"
            checked={notifications}
            onCheckedChange={(value) => setNotifications(Boolean(value))}
            aria-label="启用桌面通知"
          />
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

const LOCALE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English (US)" },
  { value: "ja-JP", label: "日本語" },
];

// ---------------------------------------------------------------------------
// StorageUsageCard
// ---------------------------------------------------------------------------

function StorageUsageCard({
  storage,
}: {
  storage: SettingsViewModel["storage"];
}) {
  return (
    <SectionCard
      title="存储空间"
      description="素材、知识库与导出文件"
    >
      <div data-slot="storage-usage-card" className="flex flex-col gap-3">
        <ProgressBar
          value={storage.usedGb}
          max={storage.totalGb}
          label={`已用 ${storage.usedGb} GB / ${storage.totalGb} GB`}
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
              key={row.id}
              data-slot="storage-breakdown-row"
              data-storage-id={row.id}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2 text-foreground">
                <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                {row.label}
              </span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {row.valueGb} GB
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

type ModelProvider = "anthropic" | "openai" | "google";
type ModelName = "claude-sonnet" | "gpt-4o" | "gemini-2";

function ModelConfigurationCard({
  model,
}: {
  model: SettingsViewModel["model"];
}) {
  const [provider, setProvider] = React.useState<ModelProvider>(
    model.provider,
  );
  const [modelName, setModelName] = React.useState<ModelName>(model.model);
  const [temperature, setTemperature] = React.useState<number>(
    model.temperature,
  );
  return (
    <SectionCard
      title="模型配置"
      description="AI Copilot 与脚本生成的默认模型"
    >
      <div data-slot="model-configuration-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="提供商"
          controlId="model-provider"
          help="选择默认调用的模型服务商。"
        >
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as ModelProvider)}
          >
            <SelectTrigger
              id="model-provider"
              data-slot="model-provider-trigger"
              size="sm"
              className="w-44"
            >
              <SelectValue placeholder="选择提供商" />
            </SelectTrigger>
            <SelectContent data-slot="model-provider-content">
              {PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="模型"
          controlId="model-name"
          help="模型配置位于本页（不跳转独立页面，page-specs §17）。"
        >
          <Select
            value={modelName}
            onValueChange={(value) => setModelName(value as ModelName)}
          >
            <SelectTrigger
              id="model-name"
              data-slot="model-name-trigger"
              size="sm"
              className="w-44"
            >
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent data-slot="model-name-content">
              {MODEL_OPTIONS_FOR[provider].map((option) => (
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
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isNaN(next)) {
                setTemperature(next);
              }
            }}
          />
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

const PROVIDER_OPTIONS: ReadonlyArray<{
  value: ModelProvider;
  label: string;
}> = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
];

const MODEL_OPTIONS_FOR: Record<
  ModelProvider,
  ReadonlyArray<{ value: ModelName; label: string }>
> = {
  anthropic: [{ value: "claude-sonnet", label: "Claude Sonnet" }],
  openai: [{ value: "gpt-4o", label: "GPT-4o" }],
  google: [{ value: "gemini-2", label: "Gemini 2" }],
};

// ---------------------------------------------------------------------------
// OtherSettingsCard
// ---------------------------------------------------------------------------

function OtherSettingsCard() {
  const [confirmDelete, setConfirmDelete] = React.useState<boolean>(false);
  return (
    <SectionCard
      title="其他"
      description="数据导入导出与账户操作"
    >
      <div data-slot="other-settings-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="导入数据"
          controlId="other-import"
          help="从旧版 CreatorOS 或外部工具导入。"
        >
          <Button
            id="other-import"
            data-slot="other-import-button"
            variant="outline"
            size="sm"
          >
            导入
          </Button>
        </SettingsFormRow>
        <SettingsFormRow
          label="导出全部数据"
          controlId="other-export"
          help="导出为 JSON + Markdown 包。"
        >
          <Button
            id="other-export"
            data-slot="other-export-button"
            variant="outline"
            size="sm"
          >
            导出
          </Button>
        </SettingsFormRow>
        <SettingsFormRow
          label="删除账户"
          controlId="other-delete"
          help="删除后 30 天内可恢复，届时将永久清除。"
        >
          <div className="flex items-center gap-2">
            <Switch
              id="other-delete"
              data-slot="other-delete-switch"
              size="sm"
              checked={confirmDelete}
              onCheckedChange={(value) => setConfirmDelete(Boolean(value))}
              aria-label="确认删除账户"
            />
            <Button
              data-slot="other-delete-button"
              variant="destructive"
              size="sm"
              disabled={!confirmDelete}
            >
              删除账户
            </Button>
          </div>
        </SettingsFormRow>
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
      className="grid grid-cols-1 items-start gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0 md:grid-cols-[180px_minmax(0,1fr)]"
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
