"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Folder,
  FolderPlus,
  Plus,
  Search,
  ArrowUpRight,
  Sparkles,
  Archive,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ENDPOINTS, createClient } from "@creatoros/contract";
import {
  createHttpTransport,
  readCurrentGroupId,
  readCurrentAccountId,
  type FrozenWorkspaceScope,
} from "@/lib/http-transport";
import { describeUserError } from "@/lib/ai-error-humanize";
import { openCopilotLocally } from "@/lib/copilot-navigation";
import { KnowledgeDetailPreview } from "./knowledge-detail-preview";
import { KnowledgeDumpZone, distillCopilotHref } from "./knowledge-dump-zone";
import {
  readLibrary,
  readPagedRows,
  filterLibrary,
  LIBRARY_TYPES,
  libraryTypeLabel,
  type LibraryReader,
  type LibraryVm,
  type LibraryItem,
} from "./knowledge-library-data";

const selectClass =
  "h-9 min-w-0 rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textAreaClass =
  "w-full rounded-md border border-border bg-surface p-3 text-sm leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
type ProjectChoice = { id: string; title: string; status: string };
type Modal = "add" | "folder" | "edit" | "reference" | "archive" | null;

/** 所有写操作经契约客户端；scope换页以key卸载，异步不回写已卸载的书架。 */
export function KnowledgeLibrary({
  initial,
  scope,
}: {
  initial: LibraryVm;
  scope: FrozenWorkspaceScope;
}) {
  const [invalid, setInvalid] = React.useState(false);
  const scopedClient = React.useMemo(
    () =>
      createClient(
        ENDPOINTS,
        createHttpTransport("/api/v1", {
          groupId: scope.groupId,
          accountId: scope.accountId,
        }),
      ),
    [scope.groupId, scope.accountId],
  );
  React.useEffect(() => {
    const check = () => {
      if (
        scope.groupId
          ? readCurrentGroupId() !== scope.groupId
          : readCurrentAccountId() !== scope.accountId
      )
        setInvalid(true);
    };
    window.addEventListener("creatoros:accounts-changed", check);
    return () =>
      window.removeEventListener("creatoros:accounts-changed", check);
  }, [scope.groupId, scope.accountId]);
  return invalid ? (
    <main role="status" className="p-6">
      正在切换资料书架…
    </main>
  ) : (
    <KnowledgeLibraryWorkspace initial={initial} client={scopedClient} />
  );
}
function KnowledgeLibraryWorkspace({
  initial,
  client,
}: {
  initial: LibraryVm;
  client: ReturnType<typeof createClient<typeof ENDPOINTS>>;
}) {
  const search = useSearchParams();
  const [vm, setVm] = React.useState(initial);
  const [previousInitial, setPreviousInitial] = React.useState(initial);
  if (previousInitial !== initial) {
    setPreviousInitial(initial);
    setVm(initial);
  }
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [directoryOpen, setDirectoryOpen] = React.useState(false);
  const [modal, setModal] = React.useState<Modal>(null);
  const [modalTarget, setModalTarget] = React.useState<LibraryItem | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false),
    alive = React.useRef(true),
    readEpoch = React.useRef(0);
  const [error, setError] = React.useState<string | null>(null),
    [notice, setNotice] = React.useState("");
  const [title, setTitle] = React.useState(""),
    [content, setContent] = React.useState(""),
    [type, setType] = React.useState("reference"),
    [source, setSource] = React.useState("");
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [savedFolderId, setSavedFolderId] = React.useState<string | null>(null);
  const [savedRevisionId, setSavedRevisionId] = React.useState<string | null>(
    null,
  );
  const modalReturnFocus = React.useRef<HTMLElement | null>(null);
  const addButton = React.useRef<HTMLButtonElement | null>(null);
  const importing = React.useRef(false);
  const onImportBusy = React.useCallback((value: boolean) => {
    if (value && (lock.current || importing.current)) return false;
    importing.current = value;
    setBusy(value || lock.current);
    return true;
  }, []);
  const [newFolder, setNewFolder] = React.useState(""),
    [targetFolder, setTargetFolder] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<{
      id: string;
      revisionId?: string;
      content: string;
    } | null>(null),
    [revision, setRevision] = React.useState(0);
  const [projects, setProjects] = React.useState<ProjectChoice[]>([]),
    [projectId, setProjectId] = React.useState(""),
    [projectPhase, setProjectPhase] = React.useState<
      "loading" | "ready" | "error"
    >("loading");
  const [linkedProject, setLinkedProject] = React.useState<{
    knowledgeId: string;
    id: string;
    title: string;
  } | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求世代计数器，卸载时主动使晚到响应失效。
      readEpoch.current++;
    };
  }, []);
  const filter = {
    type: search.get("type") ?? "all",
    folder: search.get("folder") ?? "all",
    q: search.get("q") ?? "",
  };
  const rows = filterLibrary(vm.items, filter);
  const requested = search.get("item");
  const selected = rows.find((x) => x.id === requested) ?? null;
  React.useEffect(() => {
    if (modalTarget && modalTarget.id !== requested && !lock.current) {
      setModal(null);
      setModalTarget(null);
    }
  }, [requested, modalTarget]);
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const selectedIndex = rows.findIndex((x) => x.id === requested);
  const page =
    selectedIndex >= 0
      ? Math.floor(selectedIndex / 20) + 1
      : Math.min(pageCount, Math.max(1, Number(search.get("page")) || 1));
  const visible = rows.slice((page - 1) * 20, page * 20);
  const filterLabel =
    filter.folder === "unfiled"
      ? "未放入文件夹"
      : (vm.folders.find((x) => x.id === filter.folder)?.name ??
        (filter.type === "all" ? "全部资料" : libraryTypeLabel(filter.type)));
  function navigate(patch: Record<string, string | null>, replace = false) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    const href = "/knowledge" + (params.size ? "?" + params.toString() : "");
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }
  function changeFilter(patch: Record<string, string | null>, replace = false) {
    setLoaded(null);
    setLinkedProject(null);
    navigate({ ...patch, item: null, page: null }, replace);
  }
  async function refresh(): Promise<LibraryVm> {
    const epoch = ++readEpoch.current;
    const next = await readLibrary(client as unknown as LibraryReader);
    if (alive.current && epoch === readEpoch.current) setVm(next);
    return next;
  }
  async function run(action: () => Promise<void>) {
    if (lock.current || importing.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action();
    } catch (reason) {
      if (alive.current)
        setError(
          describeUserError(reason, "操作未完成，请重试；原资料和输入已保留。"),
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function open(next: Modal) {
    modalReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError(null);
    setNotice("");
    if (next === "add") {
      setSavedId(null);
      setTitle("");
      setContent("");
      setType("reference");
      setSource("");
      setTargetFolder(
        vm.folders.some((x) => x.id === filter.folder) ? filter.folder : null,
      );
    }
    if (next === "edit") {
      if (
        !selected ||
        loaded?.id !== selected.id ||
        loaded.revisionId !== selected.currentRevisionId
      )
        return;
      setSavedRevisionId(null);
      setContent(loaded.content);
    }
    if (next === "folder") {
      setNewFolder("");
      setSavedFolderId(null);
    }
    setModalTarget(
      next === "edit" || next === "reference" || next === "archive"
        ? selected
        : null,
    );
    setModal(next);
  }
  async function saveNew() {
    await run(async () => {
      const item = savedId
        ? { id: savedId }
        : await client.createKnowledge({
            params: undefined,
            query: undefined,
            body: {
              title: title.trim(),
              knowledgeType: type as "reference",
              content,
              sourceNote: source.trim() || undefined,
              folderId: targetFolder,
              sourceType: "manual",
            },
          });
      if (!alive.current) return;
      setSavedId(item.id);
      const next = await refresh();
      if (!alive.current) return;
      if (next.error || !next.items.some((x) => x.id === item.id))
        throw Error("资料已保存，列表暂未读回。请点击“重新读取已保存资料”。");
      navigate({
        type: null,
        folder: targetFolder,
        q: null,
        page: null,
        item: item.id,
      });
      setModal(null);
      setNotice("已保存完整资料");
    });
  }
  async function saveEdit() {
    const id = modalTarget?.id;
    if (!id) return;
    await run(async () => {
      const submitted = savedRevisionId
        ? { id: savedRevisionId }
        : await client.createKnowledgeRevision({
            params: { knowledgeId: id },
            query: undefined,
            body: { content },
          });
      if (!alive.current) return;
      setSavedRevisionId(submitted.id);
      const revisions = (await client.listKnowledgeRevisions({
        params: { knowledgeId: id },
        query: undefined,
        body: undefined,
      })) as unknown as { id: string; content: string }[];
      const item = await client.getKnowledge({
        params: { knowledgeId: id },
        query: undefined,
        body: undefined,
      });
      if (!alive.current) return;
      if (
        !revisions.some(
          (x) =>
            x.id === submitted.id &&
            x.id === item.currentRevisionId &&
            x.content === content,
        )
      )
        throw Error("已提交保存，但未读回新正文。请重试读取。");
      await refresh();
      if (!alive.current) return;
      setLoaded(null);
      setRevision((x) => x + 1);
      setModal(null);
      setNotice("已保存新版本，旧版本保留");
    });
  }
  async function move(id: string, folderId: string | null) {
    await run(async () => {
      await client.moveKnowledge({
        params: { knowledgeId: id },
        query: undefined,
        body: { folderId },
      });
      const actual = await client.getKnowledge({
        params: { knowledgeId: id },
        query: undefined,
        body: undefined,
      });
      if (actual.folderId !== folderId)
        throw Error("未读回移动结果，请重试读取");
      await refresh();
      if (!alive.current) return;
      setNotice("已更新文件夹");
      if (filter.folder !== "all" && filter.folder !== folderId)
        navigate({ item: null }, true);
    });
  }
  async function loadProjects() {
    setProjectPhase("loading");
    try {
      const choices = await readPagedRows<ProjectChoice>((p) =>
        client.listProjects({
          params: undefined,
          query: { page: p, pageSize: 100 },
          body: undefined,
        }),
      );
      if (!alive.current) return;
      setProjects(choices.filter((x) => x.status !== "archived"));
      setProjectPhase("ready");
    } catch {
      if (alive.current) setProjectPhase("error");
    }
  }
  function reference() {
    setProjectId("");
    open("reference");
    void loadProjects();
  }
  async function attachToProject() {
    const id = modalTarget?.id,
      chosen = projects.find((x) => x.id === projectId);
    if (!id || !chosen) return;
    await run(async () => {
      await client.createMaterialLink({
        params: undefined,
        query: undefined,
        body: {
          projectId: chosen.id,
          entityType: "knowledge",
          entityId: id,
          role: "reference",
          stage: "research",
          addedByType: "user",
        },
      });
      const links = await readPagedRows<{
        id: string;
        entityType: string;
        entityId: string;
      }>((p) =>
        client.listMaterialLinks({
          params: undefined,
          query: { projectId: chosen.id, page: p, pageSize: 100 },
          body: undefined,
        }),
      );
      if (!links.some((x) => x.entityType === "knowledge" && x.entityId === id))
        throw Error("引用已提交，尚未读回，请重试查看");
      if (!alive.current) return;
      setLinkedProject({ knowledgeId: id, id: chosen.id, title: chosen.title });
      setModal(null);
      setNotice("资料已引用到项目");
    });
  }
  const detailsLink =
    linkedProject?.knowledgeId === selected?.id ? linkedProject : null;
  return (
    <main
      data-page="knowledge-library"
      className="flex min-w-0 flex-col gap-5 text-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <BookOpen className="size-4" />
            知识库
          </div>
          <h1 className="text-xl font-semibold tracking-tight">资料书架</h1>
          <p className="mt-1 text-muted-foreground">
            保存完整资料，找到原文，带到创作里。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-border bg-surface px-3 py-2">
              更多知识视图
            </summary>
            <nav className="absolute right-0 z-20 mt-2 flex w-52 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg">
              <Link
                className="rounded-md p-2 hover:bg-muted"
                href="/knowledge?view=course"
              >
                IP 实战课
              </Link>
              <Link
                className="rounded-md p-2 hover:bg-muted"
                href="/knowledge?view=advanced"
              >
                经验、关系图与标签
              </Link>
            </nav>
          </details>
          <Button
            ref={addButton}
            size="lg"
            disabled={busy}
            onClick={() => open("add")}
          >
            <Plus />
            添加资料
          </Button>
        </div>
      </header>
      <div className="grid min-h-[580px] min-w-0 overflow-hidden rounded-2xl border border-border bg-surface md:h-[calc(100dvh-230px)] md:min-h-[460px] md:grid-cols-[150px_240px_minmax(0,1fr)] xl:grid-cols-[180px_300px_minmax(0,1fr)]">
        <aside
          aria-label="资料目录"
          className="flex flex-col gap-5 overflow-y-auto border-b border-border bg-surface-subtle/40 p-4 md:border-r md:border-b-0"
        >
          <Button
            variant="ghost"
            className="justify-between md:hidden"
            aria-expanded={directoryOpen}
            aria-controls="library-directories"
            onClick={() => setDirectoryOpen((value) => !value)}
          >
            <span>资料目录 · {filterLabel}</span>
            <ChevronRight className={directoryOpen ? "rotate-90" : ""} />
          </Button>
          <div
            id="library-directories"
            className={
              (directoryOpen ? "flex" : "hidden") + " flex-col gap-5 md:flex"
            }
          >
            <nav className="flex flex-col gap-1" aria-label="资料分类">
              <DirectoryButton
                label="全部资料"
                count={vm.items.length}
                active={filter.folder === "all" && filter.type === "all"}
                disabled={busy}
                onClick={() =>
                  changeFilter({ folder: null, type: null, q: null })
                }
              />
              <DirectoryButton
                label="未放入文件夹"
                count={vm.items.filter((x) => !x.folderId).length}
                active={filter.folder === "unfiled"}
                disabled={busy}
                onClick={() => changeFilter({ folder: "unfiled", type: null })}
              />
              <p className="mt-4 mb-1 font-medium text-muted-foreground">
                资料类别
              </p>
              {LIBRARY_TYPES.filter((t) =>
                vm.items.some((x) => x.knowledgeType === t.value),
              ).map((t) => (
                <DirectoryButton
                  key={t.value}
                  label={t.label}
                  count={
                    vm.items.filter((x) => x.knowledgeType === t.value).length
                  }
                  active={filter.type === t.value && filter.folder === "all"}
                  disabled={busy}
                  onClick={() => changeFilter({ type: t.value, folder: null })}
                />
              ))}
            </nav>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-medium text-muted-foreground">文件夹</h2>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="新建文件夹"
                  disabled={busy || !!vm.folderError}
                  onClick={() => open("folder")}
                >
                  <FolderPlus />
                </Button>
              </div>
              {vm.folderError ? (
                <div role="alert">
                  <p className="text-destructive">{vm.folderError}</p>
                  <Button variant="link" onClick={() => void refresh()}>
                    重读文件夹
                  </Button>
                </div>
              ) : (
                <nav aria-label="文件夹列表" className="flex flex-col gap-1">
                  {vm.folders.length === 0 ? (
                    <p className="text-muted-foreground">还没有文件夹</p>
                  ) : (
                    vm.folders.map((f) => (
                      <DirectoryButton
                        key={f.id}
                        label={f.name}
                        icon="folder"
                        count={
                          vm.items.filter((x) => x.folderId === f.id).length
                        }
                        active={filter.folder === f.id}
                        disabled={busy}
                        onClick={() =>
                          changeFilter({ folder: f.id, type: null })
                        }
                      />
                    ))
                  )}
                </nav>
              )}
            </section>
          </div>
        </aside>
        <section
          aria-label="资料列表"
          className="flex min-h-0 min-w-0 flex-col border-b border-border md:border-r md:border-b-0"
        >
          <div className="border-b border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="min-w-0 break-words font-semibold">
                {filterLabel}
              </h2>
              <span className="shrink-0 text-muted-foreground">
                {rows.length} 份
              </span>
            </div>
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="搜索资料标题"
                placeholder="搜索资料标题"
                value={filter.q}
                disabled={busy}
                onChange={(e) => changeFilter({ q: e.target.value }, true)}
                className="h-9 pl-9"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {vm.error ? (
              <div role="alert" className="p-5">
                <p className="text-destructive">{vm.error}</p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => void refresh()}
                >
                  重新读取资料
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-5 text-muted-foreground">
                <FileText className="mb-4 size-7 text-text-subtle" />
                <p className="font-medium text-foreground">
                  {vm.items.length ? "没有匹配的资料" : "书架还是空的"}
                </p>
                <p className="mt-2 leading-6">
                  {vm.items.length
                    ? "试试其他类别或清除搜索。"
                    : "从一段笔记或一份文件开始。"}
                </p>
                {vm.items.length > 0 ? (
                  <Button
                    variant="link"
                    className="mt-3"
                    onClick={() =>
                      changeFilter({ folder: null, type: null, q: null })
                    }
                  >
                    清除筛选
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => open("add")}
                  >
                    添加第一份资料
                  </Button>
                )}
              </div>
            ) : (
              visible.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={busy}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => {
                    setLoaded(null);
                    setLinkedProject(null);
                    navigate({ item: item.id });
                  }}
                  className={
                    "flex w-full flex-col gap-2 border-b border-border/60 px-4 py-4 text-left transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring " +
                    (selected?.id === item.id
                      ? "border-l-2 border-l-brand bg-brand-soft/45"
                      : "border-l-2 border-l-transparent")
                  }
                >
                  <span className="flex items-start gap-2">
                    <FileText
                      className={
                        "mt-0.5 size-4 shrink-0 " +
                        (selected?.id === item.id
                          ? "text-brand"
                          : "text-text-subtle")
                      }
                    />
                    <span className="break-words text-pretty font-medium leading-6">
                      {item.title}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2 pl-6 text-muted-foreground">
                    <span>{libraryTypeLabel(item.knowledgeType)}</span>
                    <time>{item.updatedAt.slice(0, 10)}</time>
                  </span>
                </button>
              ))
            )}
          </div>
          {pageCount > 1 && (
            <nav
              aria-label="资料分页"
              className="flex items-center justify-between border-t border-border p-3"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="上一页资料"
                disabled={page === 1 || busy}
                onClick={() => navigate({ page: String(page - 1), item: null })}
              >
                <ChevronLeft />
              </Button>
              <span>
                {page} / {pageCount}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="下一页资料"
                disabled={page === pageCount || busy}
                onClick={() => navigate({ page: String(page + 1), item: null })}
              >
                <ChevronRight />
              </Button>
            </nav>
          )}
        </section>
        <section
          aria-label="资料原文"
          className="min-h-0 min-w-0 overflow-y-auto"
        >
          {selected ? (
            <>
              <header className="border-b border-border p-5 lg:p-6">
                <p className="mb-2 text-muted-foreground">
                  {libraryTypeLabel(selected.knowledgeType)} ·{" "}
                  {selected.sourceMetadata?.fileName
                    ? "文件导入"
                    : selected.updatedAt.slice(0, 10)}
                </p>
                <h2 className="break-words text-balance text-xl font-semibold leading-8">
                  {selected.title}
                </h2>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={
                      busy ||
                      loaded?.id !== selected.id ||
                      loaded.revisionId !== selected.currentRevisionId
                    }
                    onClick={() => open("edit")}
                  >
                    编辑原文
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={reference}>
                    <ArrowUpRight />
                    用到项目
                  </Button>
                  <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label="更多资料操作"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64" align="start">
                      <label className="flex flex-col gap-2 p-3">
                        放入文件夹
                        <select
                          aria-label="移动到文件夹"
                          className={selectClass}
                          value={selected.folderId ?? ""}
                          disabled={busy || !!vm.folderError}
                          onChange={(e) => {
                            setMoreOpen(false);
                            void move(selected.id, e.target.value || null);
                          }}
                        >
                          <option value="">未放入文件夹</option>
                          {vm.folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() => {
                          const href = distillCopilotHref(
                            loaded?.id === selected.id ? loaded.content : "",
                          );
                          if (!openCopilotLocally(href))
                            window.location.assign(href);
                        }}
                      >
                        <Sparkles />
                        AI 提炼
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={busy}
                        onSelect={() => open("archive")}
                      >
                        <Archive />
                        归档资料
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {selected.sourceNote && (
                  <p className="mt-4 break-words text-muted-foreground">
                    出处：{selected.sourceNote}
                  </p>
                )}
                {selected.assetId && (
                  <OriginalFile
                    key={selected.assetId}
                    assetId={selected.assetId}
                    client={client}
                  />
                )}
                {detailsLink && (
                  <Link
                    className="mt-4 block text-brand underline underline-offset-4"
                    href={`/projects/${detailsLink.id}`}
                  >
                    进入「{detailsLink.title}」写稿 →
                  </Link>
                )}
              </header>
              <div className="p-5 lg:p-6">
                <KnowledgeDetailPreview
                  key={`${selected.id}:${selected.currentRevisionId}:${revision}`}
                  knowledgeId={selected.id}
                  contractClient={client}
                  reader
                  onContentLoaded={(text) =>
                    setLoaded({
                      id: selected.id,
                      revisionId: selected.currentRevisionId,
                      content: text,
                    })
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-72 flex-col items-center justify-center px-8 py-12 text-center">
              <BookOpen className="mb-5 size-9 text-text-subtle" />
              <h2 className="text-lg font-medium">
                {rows.length
                  ? "选择一份资料，阅读完整原文"
                  : "添加资料后，在这里阅读原文"}
              </h2>
            </div>
          )}
        </section>
      </div>
      <div className="min-h-6" aria-live="polite">
        {" "}
        {notice && (
          <p role="status" className="text-success">
            {notice}
          </p>
        )}
        {error && !modal && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 p-3 text-destructive"
          >
            {error}
          </p>
        )}
      </div>
      <Dialog
        open={modal !== null}
        onOpenChange={(value) => {
          if (!value && !busy) setModal(null);
        }}
      >
        <DialogContent
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              if (!alive.current) return;
              const previous = modalReturnFocus.current;
              (previous?.isConnected ? previous : addButton.current)?.focus();
            });
          }}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
        >
          <DialogTitle>
            {modal === "add"
              ? "添加资料"
              : modal === "folder"
                ? "新建文件夹"
                : modal === "edit"
                  ? "编辑原文"
                  : modal === "reference"
                    ? "用到项目"
                    : "归档资料"}
          </DialogTitle>
          <DialogDescription>
            {modal === "add"
              ? "完整原文直接保存，也可以导入文件。"
              : modal === "edit"
                ? "保存为新版本，保留之前的正文。"
                : modal === "reference"
                  ? "选择已有项目，创作时可直接查看这份资料。"
                  : modal === "archive"
                    ? "归档后从书架隐藏，原文、版本和项目引用仍保留。"
                    : "把相关资料放在一起，方便下次找到。"}
          </DialogDescription>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {modal === "add" && (
            <>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveNew();
                }}
              >
                <Field label="资料标题">
                  <Input
                    aria-label="资料标题"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={busy || !!savedId}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="资料类型">
                    <select
                      aria-label="资料类型"
                      className={selectClass}
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      disabled={busy || !!savedId}
                    >
                      {LIBRARY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="保存到文件夹">
                    <select
                      aria-label="保存到文件夹"
                      className={selectClass}
                      value={targetFolder ?? ""}
                      disabled={busy || !!savedId || !!vm.folderError}
                      onChange={(e) => setTargetFolder(e.target.value || null)}
                    >
                      <option value="">未放入文件夹</option>
                      {vm.folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="完整原文">
                  <textarea
                    aria-label="完整原文"
                    className={textAreaClass}
                    rows={8}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={busy || !!savedId}
                  />
                </Field>
                <Field label="出处（可选）">
                  <Input
                    aria-label="出处（可选）"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    disabled={busy || !!savedId}
                    placeholder="链接、书名或资料来源"
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={busy || !title.trim()}>
                    {busy
                      ? "正在保存…"
                      : savedId
                        ? "重新读取已保存资料"
                        : "保存资料"}
                  </Button>
                </div>
              </form>
              <div className="border-t border-border pt-4">
                <KnowledgeDumpZone
                  importOnly
                  contractClient={client}
                  disabled={busy || !!savedId}
                  folderId={targetFolder}
                  onSaved={() => {
                    void refresh();
                  }}
                  onBusyChange={onImportBusy}
                />
              </div>
            </>
          )}
          {modal === "edit" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              <textarea
                aria-label="编辑完整原文"
                className={textAreaClass}
                rows={14}
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={busy || !!savedRevisionId}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  取消编辑
                </Button>
                <Button type="submit" disabled={busy || !content.trim()}>
                  {busy
                    ? "正在保存…"
                    : savedRevisionId
                      ? "重新读取已保存版本"
                      : "保存新版本"}
                </Button>
              </div>
            </form>
          )}
          {modal === "folder" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const folder = savedFolderId
                    ? { id: savedFolderId }
                    : await client.createKnowledgeFolder({
                        params: undefined,
                        query: undefined,
                        body: { name: newFolder.trim() },
                      });
                  if (!alive.current) return;
                  setSavedFolderId(folder.id);
                  const next = await refresh();
                  if (!alive.current) return;
                  if (!next.folders.some((x) => x.id === folder.id))
                    throw Error("未读回新文件夹，请重试读取");
                  setModal(null);
                  setNotice("文件夹已创建");
                });
              }}
            >
              <Input
                aria-label="文件夹名称"
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                maxLength={120}
                required
                disabled={busy || !!savedFolderId}
              />
              <Button type="submit" disabled={busy || !newFolder.trim()}>
                {busy
                  ? "正在创建…"
                  : savedFolderId
                    ? "重新读取已建文件夹"
                    : "创建文件夹"}
              </Button>
            </form>
          )}
          {modal === "reference" && (
            <div className="flex flex-col gap-4">
              {projectPhase === "loading" ? (
                <p role="status">正在读取项目…</p>
              ) : projectPhase === "error" ? (
                <div role="alert">
                  <p>项目读取失败，请重试。</p>
                  <Button variant="outline" onClick={() => void loadProjects()}>
                    重读项目
                  </Button>
                </div>
              ) : projects.length === 0 ? (
                <p>
                  当前工作区还没有项目。
                  <Link className="text-brand underline" href="/projects">
                    前往创建项目
                  </Link>
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-2">
                    选择项目
                    <select
                      aria-label="选择项目"
                      className={selectClass}
                      value={projectId}
                      disabled={busy}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      <option value="">请选择已有项目</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={busy || !projectId}
                    onClick={() => void attachToProject()}
                  >
                    {busy ? "正在引用…" : "确认引用"}
                  </Button>
                </>
              )}
            </div>
          )}
          {modal === "archive" && (
            <>
              <p className="break-words font-medium">{modalTarget?.title}</p>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  const id = modalTarget?.id;
                  if (!id) return;
                  void run(async () => {
                    await client.archiveKnowledge({
                      params: { knowledgeId: id },
                      query: undefined,
                      body: undefined,
                    });
                    const item = await client.getKnowledge({
                      params: { knowledgeId: id },
                      query: undefined,
                      body: undefined,
                    });
                    if (item.status !== "archived")
                      throw Error("未读回归档结果");
                    await refresh();
                    if (!alive.current) return;
                    navigate({ item: null }, true);
                    setModal(null);
                    setNotice("已归档，原资料保留");
                  });
                }}
              >
                {busy ? "正在归档…" : "确认归档"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 font-medium">
      {label}
      {children}
    </label>
  );
}
function DirectoryButton({
  label,
  count,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon?: "folder";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted " +
        (active
          ? "bg-brand-soft text-brand font-medium"
          : "text-muted-foreground")
      }
    >
      {icon === "folder" ? <Folder className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1 break-words">{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function OriginalFile({
  assetId,
  client,
}: {
  assetId: string;
  client: ReturnType<typeof createClient<typeof ENDPOINTS>>;
}) {
  const [url, setUrl] = React.useState<string | null>(null),
    [failed, setFailed] = React.useState(false),
    [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    void client
      .getDownloadUrl({
        params: { assetId },
        query: undefined,
        body: undefined,
      })
      .then((result) => {
        if (active) setUrl(result.url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [assetId, retry, client]);
  return url ? (
    <a
      className="mt-3 inline-flex items-center gap-1 text-brand underline underline-offset-4"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      查看原文件
      <ArrowUpRight className="size-4" />
    </a>
  ) : failed ? (
    <div role="alert" className="mt-3 text-destructive">
      原文件链接读取失败。
      <Button
        variant="link"
        onClick={() => {
          setFailed(false);
          setRetry((n) => n + 1);
        }}
      >
        重读原文件链接
      </Button>
    </div>
  ) : (
    <p role="status" className="mt-3 text-muted-foreground">
      正在读取原文件链接…
    </p>
  );
}
