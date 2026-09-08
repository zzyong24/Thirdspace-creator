"use client";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus,Link2 } from "lucide-react";
import * as React from "react";
import type { RadarApi,RadarCollection } from "./intelligence-workbench-types";
import { useShareImportTasks } from "./use-share-import-tasks";
import { ShareImportTaskStatus } from "./share-import-task-status";
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

type ShareDialogProps = {
  accountId: string; collections: RadarCollection[]; api: RadarApi; onDone: () => void;
};

export function ImportDouyinShareDialog(props: ShareDialogProps) {
  return <ShareImportDialogSession key={props.accountId} {...props} />;
}

function ShareImportDialogSession({
  accountId,
  collections,
  api,
  onDone,
}: ShareDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [shareText, setShareText] = React.useState("");
  const [collectionId, setCollectionId] = React.useState("");
  const {tasks, hasMore, error, pending, unconfirmed, commandBusy, submit, command, refresh} = useShareImportTasks(accountId, api, open, onDone);

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
          disabled={pending || unconfirmed}
          value={shareText}
          onChange={(event) => setShareText(event.target.value)}
          placeholder="例如：复制打开抖音，看看这个视频 https://v.douyin.com/..."
          className="resize-none"
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          导入到分类
          <select
            aria-label="导入到分类"
            disabled={pending || unconfirmed}
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
          验证码受阻时会等待处理。关闭弹窗只离开查看，任务继续保留，可再次打开查看。
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {unconfirmed ? <p className="text-xs text-muted-foreground">原提交回执待核对，输入已保留。再次核对会复用同一个幂等标识。</p> : null}
        <div className="grid max-h-64 gap-2 overflow-y-auto" aria-live="polite">
          {tasks.map(task => <ShareImportTaskStatus key={task.id} task={task} busy={commandBusy !== null}
            canCommand={!!api.commandTask} onCommand={action => void command(task, action)} onRefresh={() => void refresh(task)} />)}
        </div>
        {hasMore ? <Button type="button" variant="ghost" size="sm" onClick={() => void refresh(undefined, true)}>读取更早的导入任务</Button> : null}
        <DialogFooter>
          <Button type="button" disabled={pending || !shareText.trim()}
            onClick={async () => {
              if (await submit(shareText, collectionId || null)) { setShareText(""); setCollectionId(""); }
            }}>
            {pending ? "正在核对提交…" : unconfirmed ? "核对原提交" : "识别并建档"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

