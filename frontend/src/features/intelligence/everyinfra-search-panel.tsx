"use client";

import { useId, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { everyInfraQueryErrorCodeSchema, everyInfraQueryErrorMessages, type EveryInfraQuery } from "@creatoros/contract/internal/everyinfra";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { compactNumber, radarOriginalLink } from "./intelligence-display";
import { operationKey } from "./radar-operation-key";
import type { RadarApi } from "./intelligence-workbench-types";

type Platform = EveryInfraQuery["platform"];
type Action = "search" | "user_posts" | "video" | "trending";
type Query = NonNullable<RadarApi["queryEveryInfra"]>;
type Add = NonNullable<RadarApi["addEveryInfraItem"]>;
type Result = Awaited<ReturnType<Query>>["hits"][number];

const actionNames = { search: "关键词搜索", user_posts: "账号作品", video: "单条视频", trending: "热榜" };
const selectClassName = "h-9 w-full rounded-md border border-input bg-surface px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function message(error: unknown, fallback: string) {
  const transportError = error as { code?: string; details?: { domainCode?: string } } | null;
  const code = transportError?.details?.domainCode ?? transportError?.code;
  if (code === "EVERYINFRA_HIT_NOT_ADDABLE") return "该结果无法加入，请重新查询或选择其他作品。";
  const parsed = everyInfraQueryErrorCodeSchema.safeParse(code);
  return parsed.success ? everyInfraQueryErrorMessages[parsed.data] : fallback;
}

function buildQuery(platform: Platform, action: Action, value: string): EveryInfraQuery {
  if (platform === "wechatVideo") {
    if (action === "video") return { platform, action, params: { object_id: value } };
    if (action === "user_posts") return { platform, action, params: { username: value } };
    return { platform, action: "search", params: { keyword: value } };
  }
  if (platform === "xiaohongshu") {
    if (action === "user_posts") return { platform, action, params: { user_id: value } };
    if (action === "trending") return { platform, action, params: {} };
    return { platform, action: "search", params: { keyword: value } };
  }
  if (action === "user_posts") return { platform, action, params: { user_id: value } };
  if (action === "trending") return { platform, action, params: {} };
  return { platform, action: "search", params: { keyword: value } };
}

function fieldFor(platform: Platform, action: Action) {
  if (action === "video") return { label: "视频号分享链接或作品 ID", placeholder: "https://weixin.qq.com/sph/…" };
  if (action !== "user_posts") return { label: "关键词", placeholder: "输入要搜索的内容" };
  if (platform === "wechatVideo") return { label: "视频号账号 ID", placeholder: "sph… 或 v2_…@finder" };
  if (platform === "douyin") return { label: "抖音账号 secUid", placeholder: "MS4w…" };
  return { label: "小红书账号 ID", placeholder: "主页链接 /user/profile/ 后的 ID" };
}

export function EveryInfraSearchPanel({ query, add, onAdded }: {
  query: Query;
  add: Add;
  onAdded: (itemId: string) => void;
}) {
  const id = useId();
  const [platform, setPlatform] = useState<Platform>("douyin");
  const [action, setAction] = useState<Action>("search");
  const [value, setValue] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const actions: Action[] = platform === "wechatVideo"
    ? ["search", "user_posts", "video"] : ["search", "user_posts", "trending"];
  const field = fieldFor(platform, action);
  const busy = searching || adding !== null;

  function clearInputs() {
    setValue("");
    setResults(null);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (action !== "trending" && !value.trim())) return;
    setSearching(true);
    setResults(null);
    setError("");
    try {
      const input = buildQuery(platform, action, value.trim());
      setResults((await query(input, operationKey("everyinfra-query"))).hits);
      setAdded(new Set());
    } catch (error) {
      setError(message(error, "万有引擎查询失败，请核对输入后重试。"));
    } finally {
      setSearching(false);
    }
  }

  async function addHit(importId: string) {
    if (busy) return;
    setAdding(importId);
    setError("");
    try {
      const { itemId } = await add(importId);
      setAdded((previous) => new Set(previous).add(importId));
      onAdded(itemId);
    } catch (error) {
      setError(message(error, "暂时无法加入内容雷达，请重试。"));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline"><Search className="size-3.5" aria-hidden="true" />搜索平台内容</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)] gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>搜索平台内容</DialogTitle>
          <DialogDescription>查询和取视频会计入你的万有引擎余额。</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-3" aria-busy={searching}>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>平台</span>
              <select value={platform} disabled={busy} className={selectClassName}
                onChange={(event) => { setPlatform(event.target.value as Platform); setAction("search"); clearInputs(); }}>
                <option value="douyin">抖音</option>
                <option value="xiaohongshu">小红书</option>
                <option value="wechatVideo">视频号</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>查询方式</span>
              <select value={action} disabled={busy} className={selectClassName}
                onChange={(event) => { setAction(event.target.value as Action); clearInputs(); }}>
                {actions.map((mode) => <option key={mode} value={mode}>{actionNames[mode]}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-end gap-2">
            {action !== "trending" ? (
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor={id} className="text-xs text-muted-foreground">{field.label}</label>
                <Input id={id} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} placeholder={field.placeholder} maxLength={2048} required />
              </div>
            ) : null}
            <Button type="submit" disabled={busy || (action !== "trending" && !value.trim())}>{searching ? "查询中…" : "查询"}</Button>
          </div>
        </form>
        <div className="min-h-0 space-y-2 overflow-auto">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {results?.length === 0 ? <p role="status" className="text-sm text-muted-foreground">没有找到匹配的内容。</p> : null}
          {results?.map((hit, index) => {
            const imported = hit.importId && added.has(hit.importId);
            const coverLink = hit.coverUrl ? radarOriginalLink(hit.coverUrl) : null;
            const reason = hit.platform === "wechatVideo" && hit.action === "search"
              ? "搜索结果没有作品 ID，不能加入" : "该结果缺少作品信息，不能加入";
            return (
              <article key={hit.importId ?? index} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-2">
                {coverLink
                  ? <img src={coverLink} width={56} height={56} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-14 rounded-md object-cover" /> : null}
                <div className="min-w-28 flex-1">
                  <h3 className="break-words text-sm font-medium">{hit.title || hit.summary || "未命名内容"}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[hit.authorName, hit.durationMs === undefined ? null : `${Math.round(hit.durationMs / 1000)} 秒`,
                      hit.metrics.likes === undefined ? null : `${compactNumber(hit.metrics.likes)} 赞`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={!hit.importId || busy || Boolean(imported)}
                  onClick={() => hit.importId && void addHit(hit.importId)}>
                  {imported ? "已加入" : !hit.importId ? reason : adding === hit.importId ? "加入中…" : "加入内容雷达"}
                </Button>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
