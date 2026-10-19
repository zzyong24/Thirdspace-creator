# T-1022 启动、后台采集与绑定回调冻结交付

候选 tree：`/Users/zyongzhu/.codex/worktrees/t1022-task-scope/Thirdspace-creator`。仅由 ROOT 集成；本子任务未修改 ROOT、未启动浏览器/外网采集、未读取真实数据库或真实媒体。

21 个冻结文件和 SHA：`/tmp/t1022-startup-owned-files.sha256`。JSON（含每个 ROOT 集成前 SHA）为 `/tmp/t1022-startup-freeze.json`。含新服务 barrel export、新测试与原 59 条调度测试 fixture；不含未修改的 scheduled-collection-scheduler.ts。

## 结果与权限边界

- 启动真实 accountGroupService.forAccount/get 派生当前 group/version/member；知识 seed 和共享 topic.daily / intelligence.sync 按组幂等，私有 self.metrics / self.traffic / comments / self.detail 精确按真实账号查找。旧默认模板仍明确只属于 Douyin；其它平台没有套用该采集能力。
- 默认私有作业只为 active Douyin 且 collect.available 的实际账号补齐，证据取自成功 account_binding 的持久化回执或旧 profile 非空真实 cookie 文件。manual externalID 与昵称不算成功绑定。旧 cookie 文件仅是旧登录环境存在的证据，不等于实时登录成功；运行采集仍需实际身份/session 校验。本次没有读取 cookie 内容或真实外部平台。
- accountBindingService 成功事务提交、任务 succeeded 后调用内部 onBound。生产 composition 再读成功回执和当前成员后，复用 bootstrapDouyinOnBind。回调及诊断失败均 best-effort，不回滚绑定/profile、不改成失败；下一次启动可补齐。失败绑定不调用回调。
- 归档组仅放行 source ingestion 的真实 active Douyin 私有 scheduled collector。后台 job、AI 创建、persistent automation、AI→execution admission 各自重验实际 job/account/member；锁中验 owner/group/member version。不新增外部 allowArchived wire flag。普通用户组写、普通 AI、shared topic/intelligence 在归档组仍拒绝。
- 转组持同一实际账号/成员锁，未来私有 job 在同 TX 重绑新组/版本，shared topic/intelligence 不跟随移动，历史 run/task 不改写。历史 run 查询按 run 原始 frozen group 判断，避免 future job 转组隐藏原组历史。
- automation/persistent 透传冻结组域；group-only shared job accountId=null 可排队和执行，不借当前页面账号。payload 中 job 用实际持久化 job 重新规范化。

## 真实验证记录

所有 PG 测试均用 `postgresql://zyongzhu@127.0.0.1:55422/postgres`，同时设置 CREATOROS_TEST_POSTGRES_URL 与 CREATOROS_ISOLATED_PG_URL；每 suite 随机 isolated DB 并清理。

1. 初始 RED `/tmp/t1022-startup-red.log`：6 FAIL，其中 5 是实际缺口；第 6 个是 transfer fixture SQL 表名 job_runs 写错（真实表为 job_run），已修正，不能充当 meaningful RED。
2. 初始 GREEN `/tmp/t1022-startup-green-second.log`：6/6 PASS；扩展 `/tmp/t1022-startup-broad-green-2.log`：6 文件 51/51 PASS；完整原服务回归 `/tmp/t1022-startup-full-green.log`：9 文件 124/124 PASS。
3. `/tmp/t1022-startup-existing-public-regression.log`：7 文件 134 PASS / 9 FAIL。9 条均为旧 scheduler ctx 精确断言缺 groupId:null、groupVersion:undefined、membershipVersion:undefined。没有改变旧任务合并/拆分/计数业务；runtime scheduled-collection-scheduler.ts 未编辑，只更新 common fixture 真实预期。该历史失败保留。
4. callback 实际 RED `/tmp/t1022-binding-default-callback-red.log`：2 FAIL / 1 PASS（17 filtered），原因是成功后的 callback 从未执行。
5. `/tmp/t1022-startup-binding-scheduler-completed.log`：旧源码模块在补丁写入前被进程加载，留下 11 FAIL / 104 PASS（9 个 ctx + 2 个 callback）；诚实保留，不当作完成证明。
6. 最终源码完整重跑 `/tmp/t1022-startup-binding-scheduler-final.log`：7 文件 115/115 PASS，进程 exit 0，02:26:00 开始。文件为 account-binding.integration（20）、account-binding-commit.integration、startup-group-collectors PG（16）、scheduled-collection-scheduler（59）、controls、automation-driver、workspace startup（6）。
7. 最后 production types：`/tmp/t1022-startup-production-types-final-callback.log`，`pnpm exec tsc --noEmit -p /tmp/t1022-startup-backend-tsconfig.json` exit 0 / 0 diagnostics。该配置 excludes tests，extends 此 tree backend/tsconfig。
8. owned `git diff --check` exit 0：`/tmp/t1022-startup-diff-check.log`。

## PG 重要行为覆盖

两种顺序均通过真实 pg_stat_activity Lock 等待验证：private AI 写先持锁 → transfer 阻塞后看到新增 active task 并拒绝转组；transfer 先持锁 → 旧成员 AI 写阻塞后因 stale membership 拒绝、新组当前版本写成功。另有 SQL trigger 故障验证 transfer 的成员/job 回绑原子回滚。

覆盖跨 owner/group、manual/unverified、其它平台、归档普通 AI/job 拒绝且无残留；旧合法 Douyin collector；group-only topic/intelligence driver frozen scope；archive private driver 正规化 payload；public trigger→AI task→真实 run intent→execution-authority 的窄权限链路；旧 run 历史不移动；绑定成功/失败/callback 和诊断异常。

## 还需 ROOT 验证

ROOT freshly review 权限窄口与锁；按冻结 SHA 集成后跑现有完整生产前端类型/合并 PG gates、重启 Next 并实际页面旅程。隔离 tree 前端旧类型债不在此子任务扩大修复；没有宣称 ROOT 运行态已完成。最终 115 测试出现 pg client.query 并发 deprecation warning，但进程 exit 0，测试全部通过。
