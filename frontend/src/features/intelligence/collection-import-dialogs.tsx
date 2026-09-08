"use client";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus,Link2 } from "lucide-react";
import * as React from "react";
import type { RadarApi,RadarCollection } from "./intelligence-workbench-types";
import { operationKey } from "./radar-operation-key";
export function AddCollectionDialog({
  accountId,
  api,
  onDone,
}: {
  accountId: string;
  api: RadarApi;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <FolderPlus className="size-3.5" />
          新建分类
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建监控分类</DialogTitle>
          <DialogDescription>
            分类只负责整理来源，不复制作品，也不会自动创建选题。
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="分类名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：AI 工具博主"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await api.createCollection({
                    accountId,
                    name: name.trim(),
                    parentId: null,
                    idempotencyKey: operationKey("collection"),
                  });
                  setName("");
                  setOpen(false);
                  onDone();
                } catch {
                  setError("创建失败：同级可能已有同名分类。");
                }
              })
            }
          >
            {pending ? "创建中…" : "创建分类"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImportDouyinShareDialog({
  accountId,
  collections,
  api,
  onDone,
}: {
  accountId: string;
  collections: RadarCollection[];
  api: RadarApi;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [shareText, setShareText] = React.useState("");
  const [collectionId, setCollectionId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <Link2 className="size-3.5" />
          粘贴分享链接
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从抖音分享链接建档</DialogTitle>
          <DialogDescription>
            可直接粘贴整段分享话术。系统会识别真实作品和作者：已有博主就把视频归入其作品，
            没有则自动创建博主档案。只建档公开数据，不会自动转写。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          aria-label="抖音分享文本"
          rows={5}
          value={shareText}
          onChange={(event) => setShareText(event.target.value)}
          placeholder="例如：复制打开抖音，看看这个视频 https://v.douyin.com/..."
          className="resize-none"
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          导入到分类
          <select
            aria-label="导入到分类"
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
        <div className="rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          建档层级为“分类 → 博主 → 视频”。导入会排进持久任务队列；短链解析、登录校验或
          验证码受阻时会诚实显示失败，不会建立只有标题的空记录。
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !shareText.trim()}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await api.importDouyinShare({
                    accountId,
                    collectionId: collectionId || null,
                    shareInput: shareText.trim(),
                    idempotencyKey: operationKey("douyin-share-import"),
                  });
                  setShareText("");
                  setCollectionId("");
                  setOpen(false);
                  onDone();
                } catch {
                  setError(
                    "暂时无法进入导入队列。请确认分享文本含抖音链接，并检查当前账号登录状态。",
                  );
                }
              })
            }
          >
            {pending ? "正在排队…" : "识别并建档"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

