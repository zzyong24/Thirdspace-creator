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
 *
 * [T-332 S4·§6.3] 账号全域隔离:`scheduledJobs.list` 在 backend 已按 (user, 当前号)
 * strict 过滤(S2),本页把这一语义**明示**出来——解析当前号 handle 渲 badge,行上标
 * 归属号;未选号时 list 抛 AccountRequiredError → 捕获转空列表 + 引导(不裸 500)。
 */

import { client as defaultClient } from "@/lib/contract-client.server";
import type { FrozenWorkspaceScope } from "@/lib/http-transport";
import { isAccountRequiredError } from "@/lib/http-transport";
import type { ScheduledJobResource } from "@creatoros/backend/modules/scheduling";
import {
  AutomationsIsland,
  type CurrentAccountBadge,
  type AutomationAccount,
} from "@/features/automations/automations-island";

// 结构缝:server 读需 listScheduledJobs + listAccounts(解析当前号 handle);
// route 传 session-scoped client。
export type AutomationsReadClient = Pick<
  typeof defaultClient,
  "listScheduledJobs" | "listAccounts" | "getAccountGroup" | "getAccountCollectionPlanReadiness"
>;

export interface AutomationsPageProps {
  /** 测试覆盖:直接注入作业列表,跳过真读(fixture-driven,sync)。 */
  readonly jobs?: ReadonlyArray<ScheduledJobResource>;
  /** Session-scoped client;route 传 createServerClient(session.ctx),默认单例缝。 */
  readonly client?: AutomationsReadClient;
  /** [T-332 S4] 当前号 id(route 传 session.ctx.accountId;null = 未选号)。 */
  readonly currentAccountId?: string | null;
  readonly scope?: FrozenWorkspaceScope;
}

export async function AutomationsPage({
  jobs,
  client = defaultClient,
  currentAccountId = null,
  scope,
}: AutomationsPageProps = {}) {
  // 独立读并发启动；账号失败沿用原来的诚实降级，运行配置仍实时。
  const groupPromise = (scope?.groupId
    ? client.getAccountGroup({params:{groupId:scope.groupId},query:undefined,body:undefined})
    : Promise.resolve(null)).then(value=>({value,error:null}),error=>({value:null,error}));
  const accountsPromise = (!scope?.groupId && currentAccountId
    ? client.listAccounts({params:undefined,query:{page:1,pageSize:100},body:undefined})
    : Promise.resolve([])).then(value=>({value,error:null}),error=>({value:[],error}));
  // 读:page -> await client.listScheduledJobs -> composite transport -> pglite -> DTO。
  // `jobs?` 是测试覆盖缝(fixture,sync);生产读拉全部 enabled+disabled 作业(自动化
  // 两态都展示),按创建时刻的自然顺序(service 默认)。
  // [T-332 S4] 未选号 → backend 抛 AccountRequiredError(§4.2 引导态禁读):捕获转
  // 空列表,island 渲引导空态;其它错误照抛(不掩真故障)。
  let rows: ReadonlyArray<ScheduledJobResource>;
  if (jobs !== undefined) {
    rows = jobs;
  } else {
    try {
      const all: ScheduledJobResource[] = [];
      for (let page=1; ; page++) {
        const batch = await client.listScheduledJobs({params:undefined,query:{page,pageSize:100},body:undefined}) as unknown as ScheduledJobResource[];
        all.push(...batch);
        if (batch.length < 100) break;
      }
      rows = all;
    } catch (err) {
      if (!isAccountRequiredError(err)) throw err;
      rows = [];
    }
  }
  // 旧 detail/benchmark/favorites 保留历史；显式后台内容补全作业可独立管理。
  rows = rows.filter(
    (job) =>
      (job.sourceKind !== "self.detail" || (job.target as Record<string,unknown>)?.__backfillOnly===true) &&
      job.sourceKind !== "benchmark" &&
      job.sourceKind !== "favorites" &&
      !(job.target as Record<string, unknown>)?.mergedIntoSelfMetrics,
  );

  const groupResult = await groupPromise;
  if(groupResult.error)throw groupResult.error;
  const group=groupResult.value;
  const accounts: AutomationAccount[] = group ? await Promise.all(group.members.map(async member => {
    try {
      const readiness = await client.getAccountCollectionPlanReadiness({params:{accountId:member.accountId},query:undefined,body:undefined});
      return {id:member.accountId,handle:member.accountHandle,platform:member.platform,status:member.status,readiness};
    } catch {
      return {id:member.accountId,handle:member.accountHandle,platform:member.platform,status:member.status,readinessError:"采集计划资格读取失败，请刷新后重试"};
    }
  })) : [];
  let currentAccount: CurrentAccountBadge | null = null;
  const accountsResult=await accountsPromise;
  if(accountsResult.error)throw accountsResult.error;
  const legacyAccounts = accountsResult.value as unknown as {id:string;accountHandle:string}[];
  const selected = accounts.find(a=>a.id===currentAccountId) ?? legacyAccounts.find(a=>a.id===currentAccountId);
  if (selected) currentAccount = {id:selected.id,handle:'handle' in selected ? selected.handle : selected.accountHandle};

  return (
    <main
      data-app="creatoros"
      data-page="automations" data-studio-layout="operations"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-1">
        <h1
          data-slot="automations-page-heading"
          className="font-heading text-2xl font-semibold text-foreground"
        >
          自动化
        </h1>
        
      </header>

      <AutomationsIsland key={scope?.groupId ?? "legacy"} jobs={rows} currentAccount={currentAccount} accounts={accounts} groupName={group?.name} scope={scope} />
    </main>
  );
}
