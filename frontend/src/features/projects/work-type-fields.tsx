"use client";

import * as React from "react";

export type WorkType = "article" | "image" | "video";
export type WorkPlatform = "xiaohongshu" | "douyin" | "kuaishou" | "wechatOfficialAccount";
export const WORK_CHOICES = [
  {id: "article", contentType: "article", label: "文章", description: "分段正文、摘要、配图与公众号排版"},
  {id: "image", contentType: "image", label: "图文", description: "正文、多张图卡与封面"},
  {id: "video", contentType: "video", label: "视频", description: "脚本、录制素材与可视剪辑"},
] as const;

export const WORK_PLATFORMS = [
  {id: "xiaohongshu", label: "小红书", types: ["image", "video"]},
  {id: "douyin", label: "抖音", types: ["video"]},
  {id: "kuaishou", label: "快手", types: ["video"]},
  {id: "wechatOfficialAccount", label: "公众号", types: ["article"]},
] as const;

export function WorkTypeFields({value, onChange, platform, onPlatformChange, disabled = false}: {
  value: WorkType;
  onChange: (value: WorkType) => void;
  platform: WorkPlatform | "";
  onPlatformChange: (value: WorkPlatform | "") => void;
  disabled?: boolean;
}) {
  const group = React.useId();
  const platforms = WORK_PLATFORMS.filter(item => (item.types as readonly string[]).includes(value));
  return <>
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">作品形式</legend>
      <div className="grid grid-cols-3 gap-2">
        {WORK_CHOICES.map(choice => <label key={choice.id} className={`cursor-pointer rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring ${value === choice.id ? "border-primary bg-primary/5" : "border-border"}`}>
          <input type="radio" name={group} checked={value === choice.id} onChange={() => {
            onChange(choice.id);
            if (!WORK_PLATFORMS.some(item => item.id === platform && (item.types as readonly string[]).includes(choice.id))) onPlatformChange("");
          }} className="sr-only" />
          <span className="block text-sm font-medium">{choice.label}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{choice.description}</span>
        </label>)}
      </div>
    </fieldset>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">平台设置{platform ? ` · ${WORK_PLATFORMS.find(item => item.id === platform)?.label}` : "（可选）"}</summary>
      <label className="mt-3 block">发布目标
        <select aria-label="发布目标" value={platform} disabled={disabled} onChange={event => onPlatformChange(event.target.value as WorkPlatform | "")} className="ml-3 rounded-md border border-border bg-background p-2">
          <option value="">暂不指定，先创作</option>
          {platforms.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </details>
  </>;
}

/** 只落实用户选择与平台合同的类型兼容，不推断创作意图。 */
export function supportsWorkPlatform(type: WorkType, platform: WorkPlatform): boolean {
  return WORK_PLATFORMS.some(item => item.id === platform && (item.types as readonly string[]).includes(type));
}

export function WorkTypesFields({values, onChange, platform, onPlatformChange, disabled = false}: {
  values: readonly WorkType[];
  onChange: (values: readonly WorkType[]) => void;
  platform: WorkPlatform | "";
  onPlatformChange: (value: WorkPlatform | "") => void;
  disabled?: boolean;
}) {
  const platforms = WORK_PLATFORMS.filter(item => values.some(type => supportsWorkPlatform(type, item.id)));
  function toggle(type: WorkType) {
    const next = WORK_CHOICES.filter(choice => choice.id === type ? !values.includes(type) : values.includes(choice.id)).map(choice => choice.id);
    onChange(next);
    if (platform && !next.some(value => supportsWorkPlatform(value, platform))) onPlatformChange("");
  }
  return <>
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">作品形式 <span className="font-normal text-muted-foreground">（可多选）</span></legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {WORK_CHOICES.map(choice => <label key={choice.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring ${values.includes(choice.id) ? "border-primary bg-primary/5" : "border-border"}`}>
          <input type="checkbox" checked={values.includes(choice.id)} onChange={() => toggle(choice.id)}
            onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); if (!disabled) toggle(choice.id);}}}
            className="mt-0.5 size-4 shrink-0 accent-primary" />
          <span><span className="block text-sm font-medium">{choice.label}</span><span className="mt-1 block text-xs text-muted-foreground">{choice.description}</span></span>
        </label>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">每种形式都有独立稿件，创建后可在顶部切换工作台。</p>
    </fieldset>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">平台设置{platform ? ` · ${WORK_PLATFORMS.find(item => item.id === platform)?.label}` : "（可选）"}</summary>
      <label className="mt-3 block">发布目标
        <select aria-label="发布目标" value={platform} disabled={disabled} onChange={event => onPlatformChange(event.target.value as WorkPlatform | "")} className="ml-3 rounded-md border border-border bg-background p-2">
          <option value="">暂不指定，先创作</option>
          {platforms.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted-foreground">只应用到支持此平台的已选作品，其余作品可在工作台另行设置。</p>
    </details>
  </>;
}
