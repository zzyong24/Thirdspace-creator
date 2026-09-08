"use client";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import * as React from "react";
import { sourceVerificationErrorMessage,structuredErrorSignal } from "./intelligence-errors";
import type { CreateSourceResult,RadarApi,RadarCollection,RadarSource } from "./intelligence-workbench-types";
import { operationKey } from "./radar-operation-key";
export function AddSourceDialog({
  accountId,
  collections,
  api,
  onDone,
}: {
  accountId: string;
  collections: RadarCollection[];
  api: RadarApi;
  onDone: (result: CreateSourceResult) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<RadarSource["type"]>(
    "creator_profile",
  );
  const [value, setValue] = React.useState("");
  const [name, setName] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [collectionId, setCollectionId] = React.useState("");
  const [monitor, setMonitor] = React.useState(true);
  const [collectors, setCollectors] = React.useState<
    Awaited<ReturnType<RadarApi["listCollectors"]>>
  >([]);
  const [collectorAccountId, setCollectorAccountId] =
    React.useState("");
  const [profilePreview, setProfilePreview] = React.useState<Awaited<
    ReturnType<RadarApi["previewProfile"]>
  > | null>(null);
  const [webPreview, setWebPreview] = React.useState<Awaited<
    ReturnType<RadarApi["previewWeb"]>
  > | null>(null);
  const [favoriteFolderName, setFavoriteFolderName] = React.useState("");
  const [folders, setFolders] = React.useState<
    Awaited<ReturnType<RadarApi["listFavoriteFolders"]>>
  >([]);
  const [verifiedMessage, setVerifiedMessage] = React.useState<string | null>(
    null,
  );
  const [darkhorseAuthorized, setDarkhorseAuthorized] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reconnectNeeded, setReconnectNeeded] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const loginSource =
    type === "creator_profile" ||
    type === "favorites_folder" ||
    type === "darkhorse_query";

  const resetVerification = React.useCallback(() => {
    setProfilePreview(null);
    setWebPreview(null);
    setVerifiedMessage(null);
    setDarkhorseAuthorized(false);
    setReconnectNeeded(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .listCollectors({ accountId })
      .then((rows) => {
        if (cancelled) return;
        setCollectors(rows);
        setCollectorAccountId(
          rows.find((row) => row.accountId === accountId)?.accountId ??
            rows[0]?.accountId ??
            "",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCollectors([]);
        setCollectorAccountId("");
        setError("暂时无法读取可用的抖音采集账号。");
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, api, open]);

  const verify = React.useCallback(() => {
    startTransition(async () => {
      setError(null);
      resetVerification();
      try {
        if (type === "creator_profile") {
          if (!collectorAccountId) throw new Error("collector required");
          const preview = await api.previewProfile({
            accountId,
            collectorAccountId,
            url: new URL(value).toString(),
          });
          setProfilePreview(preview);
          setName((current) => current || preview.nickname);
          setVerifiedMessage(
            `已识别「${preview.nickname}」· 当前可见 ${preview.visibleWorkCount ?? "未知"} 条作品`,
          );
          return;
        }
        if (type === "favorites_folder") {
          if (!collectorAccountId) throw new Error("collector required");
          setFolders([]);
          setValue("");
          const rows = await api.listFavoriteFolders({
            accountId,
            collectorAccountId,
          });
          setFolders(rows);
          if (rows.length === 0) {
            setVerifiedMessage("已确认当前账号目前有 0 个收藏夹。");
            return;
          }
          const requestedName = favoriteFolderName.trim();
          const matched = requestedName
            ? rows.find((folder) => folder.name.trim() === requestedName)
            : rows[0];
          if (matched) {
            setValue(matched.id);
            setFavoriteFolderName(matched.name);
          }
          setVerifiedMessage(
            requestedName && !matched
              ? `已读取 ${rows.length} 个收藏夹，但未找到「${requestedName}」。可检查名称或从列表选择。`
              : `已读取 ${rows.length} 个收藏夹，请选择要监控的一个。`,
          );
          return;
        }
        if (type === "darkhorse_query") {
          if (!collectorAccountId || !value.trim()) {
            throw new Error("collector and keyword required");
          }
          const result = await api.reconnectCollector({
            collectorAccountId,
            sourceType: "darkhorse_query",
          });
          if (!result.loggedIn) {
            setReconnectNeeded(true);
            setError(
              "没有检测到热点宝授权成功。请在弹出的 Chrome 窗口完成授权后再试。",
            );
            return;
          }
          setDarkhorseAuthorized(true);
          setVerifiedMessage("热点宝授权已确认，可以保存并开始同步。");
          return;
        }
        if (type === "web" || type === "rss") {
          const preview = await api.previewWeb({
            accountId,
            url: new URL(value).toString(),
            instruction,
          });
          if (preview.loginRequired) {
            setError("该网页需要先登录。请到“设置 → 网站登录保管库”登录后再测试。");
            return;
          }
          setWebPreview(preview);
          setType(preview.type);
          setName((current) => current || preview.title || "");
          setVerifiedMessage(
            `验证成功：识别为 ${preview.type === "rss" ? "RSS/Atom" : "网页正文"}，取得 ${preview.samples.length} 条样例`,
          );
        }
      } catch (caught) {
        const signal = structuredErrorSignal(caught);
        setReconnectNeeded(
          type === "darkhorse_query" ||
            (loginSource &&
              /DOUYIN_FAVORITES_SESSION_EXPIRED|DouyinNotLoggedIn|LOGIN_REQUIRED|LoginRequired/i.test(
                signal,
              )),
        );
        setError(sourceVerificationErrorMessage(type, caught));
      }
    });
  }, [
    accountId,
    api,
    collectorAccountId,
    favoriteFolderName,
    instruction,
    loginSource,
    resetVerification,
    type,
    value,
  ]);

  const reconnectCollectorForVerification = React.useCallback(() => {
    if (!collectorAccountId || pending) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await api.reconnectCollector({
          collectorAccountId,
          sourceType: type,
        });
        if (!result.loggedIn) {
          setReconnectNeeded(true);
          setError(
            type === "darkhorse_query"
              ? "热点宝授权尚未完成，请在打开的窗口中确认授权。"
              : "重新登录尚未完成，请在打开的窗口中扫码并确认登录。",
          );
          return;
        }
        setReconnectNeeded(false);
        if (type === "darkhorse_query") {
          setDarkhorseAuthorized(true);
          setVerifiedMessage("热点宝授权已确认，可以保存并开始同步。");
        } else {
          setVerifiedMessage("登录已恢复，请重新测试来源。");
        }
      } catch {
        setReconnectNeeded(true);
        setError(
          type === "darkhorse_query"
            ? "未能完成热点宝授权，请确认授权窗口可用后重试。"
            : "未能完成重新登录，请确认扫码窗口可用后重试。",
        );
      }
    });
  }, [api, collectorAccountId, pending, type]);

  const create = React.useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        let config: Record<string, unknown>;
        let inferredDisplayName = "";
        if (type === "creator_profile") {
          if (!profilePreview) throw new Error("preview required");
          config = {
            type,
            collectorAccountId,
            canonicalUrl: profilePreview.canonicalUrl,
            externalAccountId: profilePreview.externalAccountId,
          };
        } else if (type === "favorites_folder") {
          const selectedFolder = folders.find((folder) => folder.id === value);
          const folderKey = selectedFolder?.id ?? favoriteFolderName.trim();
          if (!folderKey) throw new Error("folder required");
          inferredDisplayName =
            selectedFolder?.name ?? favoriteFolderName.trim();
          config = {
            type,
            collectorAccountId,
            folderId: folderKey,
          };
        } else if (type === "darkhorse_query") {
          if (!value.trim() || !darkhorseAuthorized) {
            throw new Error("keyword and douhot authorization required");
          }
          config = {
            type,
            collectorAccountId,
            keyword: value.trim(),
            board: "low_follower_breakout",
          };
        } else {
          if (!webPreview || webPreview.type !== type) {
            throw new Error("preview required");
          }
          config = {
            type,
            url: webPreview.finalUrl,
            ...(webPreview.browserSessionRef
              ? { browserSessionRef: webPreview.browserSessionRef }
              : {}),
          };
        }
        const result = await api.createSource({
          accountId,
          collectionId: collectionId || null,
          type,
          config,
          ...(name.trim() || inferredDisplayName
            ? { displayName: name.trim() || inferredDisplayName }
            : {}),
          ...(instruction.trim()
            ? { extractionInstruction: instruction.trim() }
            : {}),
          monitorEnabled: monitor,
          runInitial: true,
          idempotencyKey: operationKey("source"),
        });
        setValue("");
        setName("");
        setInstruction("");
        setFavoriteFolderName("");
        setFolders([]);
        resetVerification();
        setOpen(false);
        onDone(result);
      } catch {
        setError(
          type === "darkhorse_query"
            ? "请填写低粉爆款关键词，并先验证热点宝授权。"
            : "请先完成来源验证，再保存并首次同步。",
        );
      }
    });
  }, [
    accountId,
    api,
    collectionId,
    collectorAccountId,
    darkhorseAuthorized,
    favoriteFolderName,
    monitor,
    name,
    onDone,
    profilePreview,
    folders,
    instruction,
    resetVerification,
    type,
    value,
    webPreview,
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5">
          <Plus className="size-3.5" />
          添加来源
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加真实来源</DialogTitle>
          <DialogDescription>
            主页、网页和收藏夹先真实验证再保存。逐字稿不会自动生成。
          </DialogDescription>
        </DialogHeader>
        <div
          data-testid="source-type-choices"
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {(
            [
              ["creator_profile", "博主主页"],
              ["favorites_folder", "我的收藏"],
              ["web", "网页"],
              ["rss", "RSS"],
              ["darkhorse_query", "黑马关键词"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setType(id);
                setValue("");
                setFavoriteFolderName("");
                setError(null);
                setReconnectNeeded(false);
                setFolders([]);
                resetVerification();
              }}
              className={cn(
                "min-w-0 whitespace-normal break-words rounded-xl border px-2 py-2 text-xs transition",
                type === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {loginSource ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            采集账号
            <select
              aria-label="采集账号"
              value={collectorAccountId}
              onChange={(event) => {
                setCollectorAccountId(event.target.value);
                setValue("");
                setFavoriteFolderName("");
                setFolders([]);
                setError(null);
                setReconnectNeeded(false);
                resetVerification();
              }}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
            >
              {collectors.length === 0 ? (
                <option value="">暂无可用抖音账号</option>
              ) : null}
              {collectors.map((collector) => (
                <option
                  key={collector.accountId}
                  value={collector.accountId}
                >
                  {collector.accountHandle}
                  {collector.accountId === accountId ? "（当前工作区）" : ""}
                </option>
              ))}
            </select>
            <span>
              用所选账号的登录态采集，内容仍归当前工作区。
            </span>
          </label>
        ) : null}
        {type === "favorites_folder" ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            收藏夹名称
            <Input
              aria-label="收藏夹名称"
              value={favoriteFolderName}
              onChange={(event) => {
                const nextName = event.target.value;
                const selectedFolder = folders.find(
                  (folder) => folder.id === value,
                );
                setFavoriteFolderName(nextName);
                if (
                  !selectedFolder ||
                  selectedFolder.name.trim() !== nextName.trim()
                ) {
                  setValue("");
                }
                setError(null);
                setVerifiedMessage(null);
              }}
              placeholder="与抖音收藏夹同名，例如：选题库"
            />
            <span>
              可直接输入准确名称；也可以读取所选账号后，从下方列表选择。
            </span>
          </label>
        ) : null}
        {type === "favorites_folder" && folders.length > 0 ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            选择收藏夹
            <select
              aria-label="选择收藏夹"
              value={value}
              onChange={(event) => {
                const nextId = event.target.value;
                const selectedFolder = folders.find(
                  (folder) => folder.id === nextId,
                );
                setValue(nextId);
                if (selectedFolder) {
                  setFavoriteFolderName(selectedFolder.name);
                }
                setError(null);
              }}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">按上方名称精确匹配</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                  {folder.itemCount === null ? "" : `（${folder.itemCount}）`}
                </option>
              ))}
            </select>
          </label>
        ) : type !== "favorites_folder" ? (
          <Input
            aria-label="来源地址或关键词"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              resetVerification();
            }}
            placeholder={
              type === "creator_profile"
                ? "https://www.douyin.com/user/..."
                : type === "darkhorse_query"
                  ? "输入要监控的低粉爆款关键词"
                  : "https://..."
            }
          />
        ) : null}
        {type === "web" || type === "rss" ? (
          <Input
            aria-label="监控说明"
            value={instruction}
            onChange={(event) => {
              setInstruction(event.target.value);
              resetVerification();
            }}
            placeholder="例如：只关注 AI 产品更新（会进入真实抽取规则）"
          />
        ) : null}
        <Input
          aria-label="来源显示名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            type === "favorites_folder"
              ? "来源显示名称（可选，默认使用收藏夹名称）"
              : "显示名称（可选）"
          }
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          放入分类
          <select
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">未分类</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={monitor}
            onChange={(event) => setMonitor(event.target.checked)}
          />
          每日自动同步
        </label>
        <p className="-mt-2 text-xs leading-5 text-muted-foreground">
          {monitor
            ? "保存后立即同步一次；此后 APP 运行时每天同步，错过会在下次打开后补跑。"
            : "保存后仍会立即同步一次；此后只在你点击“同步”时更新。"}
        </p>
        {type === "darkhorse_query" ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
            黑马采集使用热点宝的独立授权，不等同于普通抖音登录。请先验证热点宝授权；不会回退到旧抖音搜索。
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={
            pending ||
            (loginSource && !collectorAccountId) ||
            (type !== "favorites_folder" && !value.trim())
          }
          onClick={verify}
        >
          {pending
            ? type === "darkhorse_query"
              ? "等待热点宝授权…"
              : "正在验证…"
            : type === "favorites_folder"
              ? "读取并选择收藏夹"
              : type === "darkhorse_query"
                ? "验证热点宝授权"
                : "测试来源"}
        </Button>
        {verifiedMessage ? (
          <p className="text-xs leading-5 text-success">
            {verifiedMessage}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {reconnectNeeded ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending || !collectorAccountId}
            onClick={reconnectCollectorForVerification}
          >
            {pending
              ? type === "darkhorse_query"
                ? "等待热点宝授权…"
                : "等待扫码登录…"
              : type === "darkhorse_query"
                ? "重新打开热点宝授权"
                : "重新登录所选采集账号"}
          </Button>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={
              pending ||
              (loginSource && !collectorAccountId) ||
              (type === "favorites_folder"
                ? !value.trim() && !favoriteFolderName.trim()
                : !value.trim()) ||
              (type === "creator_profile" && !profilePreview) ||
              (type === "darkhorse_query" && !darkhorseAuthorized) ||
              ((type === "web" || type === "rss") && !webPreview)
            }
            onClick={create}
          >
            {pending ? "保存中…" : "保存并开始首次同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

