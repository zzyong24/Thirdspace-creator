/**
 * 自动化 `/automations` 页面(T-007 切片 D6,data-source-pipeline-design §9)。
 *
 * 调度 Agent 作业的读/管 UI —— 数据链路可视化。Server Component:读
 * `scheduledJobs.list`(真 SQL via composite transport,pglite 迁移 0009 的
 * scheduled_job 表),把 wire DTO 直传给 client island `AutomationsIsland`。
 * 交互(启用开关 / 新建作业 / 运行详情抽屉 / 「立即运行」)全在 island 里,因为
 * 需要 client-side 状态 + client.* mutation + router.refresh。
 *
 * 空态诚实:D3 采集器尚未落地前,新账号 list 可能为空 —— island 渲染引导空态,
 * 不假装有作业。运行详情里的 job_run / ai_task_steps 也要 D3 真跑过才有数据。
 *
 * Session-scoped read(lane center-pages):route 传 `createServerClient(session.ctx)`,
 * 作业列表按登录用户收窄;无 session 走 canonical 单例兜底(SSR/测试不崩)。
 */

import { client as defaultClient } from "@/lib/contract-client.server";
import type { ScheduledJobResource } from "@creatoros/backend/modules/scheduling";
import { AutomationsIsland } from "@/features/automations/automations-island";

// 结构缝:server 读只需 listScheduledJobs;route 传 session-scoped client。
export type AutomationsReadClient = Pick<typeof defaultClient, "listScheduledJobs">;

export interface AutomationsPageProps {
  /** 测试覆盖:直接注入作业列表,跳过真读(fixture-driven,sync)。 */
  readonly jobs?: ReadonlyArray<ScheduledJobResource>;
  /** Session-scoped client;route 传 createServerClient(session.ctx),默认单例缝。 */
  readonly client?: AutomationsReadClient;
}

export async function AutomationsPage({
  jobs,
  client = defaultClient,
}: AutomationsPageProps = {}) {
  // 读:page -> await client.listScheduledJobs -> composite transport -> pglite -> DTO。
  // `jobs?` 是测试覆盖缝(fixture,sync);生产读拉全部 enabled+disabled 作业(自动化
  // 两态都展示),按创建时刻的自然顺序(service 默认)。
  const rows =
    jobs === undefined
      ? ((await client.listScheduledJobs({
          params: undefined,
          query: { page: 1, pageSize: 200 },
          body: undefined,
        })) as unknown as ReadonlyArray<ScheduledJobResource>)
      : jobs;

  return (
    <main
      data-app="creatoros"
      data-page="automations"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-1">
        <h1
          data-slot="automations-page-heading"
          className="font-heading text-2xl font-semibold text-foreground"
        >
          自动化
        </h1>
        <p
          data-slot="automations-subtitle"
          className="text-sm text-muted-foreground"
        >
          周期性抓取「自己作品指标 / 评论」的调度作业 —— 到点自动跑,数据落库供 Dashboard 与选题消费。
        </p>
      </header>

      <AutomationsIsland jobs={rows} />
    </main>
  );
}
