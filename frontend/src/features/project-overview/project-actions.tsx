"use client";

/**
 * ProjectOverviewActions — the project header's mutating affordances (Task 8).
 *
 * A small Client island that turns the previously-static header controls into
 * real mutations against the mock backend. Mutations flow:
 *
 *   island -> client.* -> store mutation -> router.refresh()
 *
 * per the island-mode / URL-state-only architecture. The island owns no global
 * store: it reads its inputs from props (server-resolved) and, after a write,
 * asks the App Router to revalidate the server tree so the refreshed DTO flows
 * back through the page selectors.
 *
 *  - 进入下一步 advances `currentStage` by one adjacent step
 *    (`client.transitionProjectStage`); hidden at the terminal `review` stage.
 *  - 收藏 toggles the `starred` flag (`client.patchProject`).
 *  - 归档 archives the project (`client.archiveProject`).
 */

import * as React from "react";
import { Archive, Star, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import type { ProjectStageName, ProjectStatus } from "@/types/domain";

// The project pipeline order. The next stage is the adjacent forward step;
// `review` is terminal. Mirrors STAGE_ORDER in the transition handler.
const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "brief",
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

function nextStageOf(stage: ProjectStageName): ProjectStageName | null {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] ?? null;
}

export interface ProjectOverviewActionsProps {
  readonly projectId: string;
  readonly currentStage: ProjectStageName;
  readonly starred: boolean;
  // [T-085] 项目状态感知:已归档项目再点「归档」后端必 409(projects.service
  // archiveProject 的 already-archived 守卫)。传入 status,archived 时按钮换
  // 「已归档」禁用态(契约无 unarchive op,不新增)。缺省按 active 渲染(兼容旧挂载点)。
  readonly projectStatus?: ProjectStatus;
}

// 把 HttpTransport 抛出的错误转成一句中文。transport 现在把后端错误透传成
// `HttpTransport: 409 for projects.stage.transition: <后端 message>`(见 http-transport.ts)。
// 这里抽出冒号后的真实 message(交付物缺失原因);抽不到就按状态码给兜底。
function describeTransitionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // 形如 "HttpTransport: 409 for projects.stage.transition: 阶段「research」核心交付物缺失,…"
  const m = raw.match(/^HttpTransport: \d+ for [^:]+: ([\s\S]+)$/);
  if (m?.[1]?.trim()) return m[1].trim();
  if (raw.includes("409") || /Conflict/i.test(raw)) {
    return "当前阶段还有核心交付物未完成，无法进入下一步。";
  }
  return "进入下一步失败，请稍后重试。";
}

// [T-085] 归档 409 转人话:后端 already-archived 守卫抛 ProjectStateError(409),
// transport 透传成 "HttpTransport: 409 for projects.archive: …"。禁浏览器 alert,
// 内联错误条展示。
function describeArchiveError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("409") || /Conflict|archived/i.test(raw)) {
    return "该项目已归档，无需重复归档。";
  }
  return "归档失败，请稍后重试。";
}

export function ProjectOverviewActions({
  projectId,
  currentStage,
  starred,
  projectStatus = "active",
}: ProjectOverviewActionsProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  // [T-085] 双发防重:pending state 更新是异步的,同一 tick 内连点两次都读到
  // pending=false(React 批处理)→ 两个请求都发出。用 ref 做同步互斥,state 只管 UI 禁用态。
  const pendingRef = React.useRef(false);
  // bug #6 修复:进入下一步原来静默吞掉 transition 抛出的 409 gate 拒绝(交付物缺失),
  // 用户点了"没反应"。这里把拒绝原因捕获并就地展示;成功则清掉提示。
  const [transitionError, setTransitionError] = React.useState<string | null>(
    null,
  );
  const nextStage = nextStageOf(currentStage);
  const archived = projectStatus === "archived";

  const run = React.useCallback(
    async (mutate: () => Promise<unknown>, onError?: (e: unknown) => void) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      try {
        await mutate();
      } catch (e) {
        // 不再静默:把错误交给调用方(进入下一步会把 gate 原因显出来)。
        onError?.(e);
      } finally {
        // 总是 refresh:gate 不过时 service 已把当前阶段落 needs_review 再抛错,
        // 刷新才能让 stepper 看到"卡待补"(SKL-11)。
        pendingRef.current = false;
        setPending(false);
        router.refresh();
      }
    },
    [router],
  );

  const onFavorite = React.useCallback(() => {
    void run(() =>
      client.patchProject({
        params: { projectId },
        query: undefined,
        body: { starred: !starred },
      }),
    );
  }, [projectId, run, starred]);

  const onArchive = React.useCallback(() => {
    setTransitionError(null);
    // [T-085] 409(已归档)不再静默 —— 转人话内联展示,复用同一错误条槽位。
    void run(
      () =>
        client.archiveProject({
          params: { projectId },
          query: undefined,
          body: undefined,
        }),
      (e) => setTransitionError(describeArchiveError(e)),
    );
  }, [projectId, run]);

  const onNextStage = React.useCallback(() => {
    if (!nextStage) return; // 终态 review 不显示按钮
    setTransitionError(null);
    // SKL-11:推进**当前**阶段(in_progress→completed,触发交付物 gate),而非直接点亮下一阶段
    // 绕过 gate。完成后 current_stage 由 service 派生前移到下一未完成阶段。
    // bug #6:gate 拒绝(409)不再静默 —— 捕获并把"缺什么"显在按钮下方。
    void run(
      () =>
        client.transitionProjectStage({
          params: { projectId, stage: currentStage },
          query: undefined,
          body: {},
        }),
      (e) => setTransitionError(describeTransitionError(e)),
    );
  }, [nextStage, currentStage, projectId, run]);

  return (
    <div
      data-slot="project-overview-actions"
      className="flex flex-col items-end gap-1"
    >
      <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="收藏"
        aria-pressed={starred}
        disabled={pending}
        onClick={onFavorite}
      >
        <Star
          aria-hidden="true"
          className="size-4"
          fill={starred ? "currentColor" : "none"}
        />
      </Button>
      {archived ? (
        // [T-085] 已归档 → 禁用态「已归档」(契约无 unarchive op,只做状态感知禁用,
        // 不再放出必 409 的归档按钮)。
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="已归档"
          disabled
        >
          <Archive aria-hidden="true" className="size-4" />
          已归档
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="归档"
          disabled={pending}
          onClick={onArchive}
        >
          <Archive aria-hidden="true" className="size-4" />
        </Button>
      )}
      {nextStage && !archived ? (
        // L1 立项简化(SPEC §3.1 单一主行动):主按钮是「进入工作台」(page 的实心
        // Link)。「进入下一步」是次级 stage-transition 动作 → 降为 outline,不再与
        // 主按钮争抢两个实心按钮的歧义。终态 review(含 imported 已发布作品)nextStage
        // 为 null,本就不渲染。
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onNextStage}
        >
          <Wand2 aria-hidden="true" className="size-4" />
          进入下一步
        </Button>
      ) : null}
      </div>
      {/* bug #6:gate 拒绝原因就地展示(原来静默无反应)。 */}
      {transitionError ? (
        <p
          data-slot="transition-error"
          role="alert"
          className="max-w-xs text-right text-[11px] leading-snug text-destructive"
        >
          {transitionError}
        </p>
      ) : null}
    </div>
  );
}

export default ProjectOverviewActions;
