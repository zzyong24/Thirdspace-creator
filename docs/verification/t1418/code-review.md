# T-1418 独立实现复核

结论：本轮源码与聚焦回归的独立复核通过，CR-001 已解决，无未闭合代码审核 finding。未发现新增的权限扩大、旧页面响应丢失或 dispatcher 漏注册；此结论不代表全 workspace 静态门或安装态性能已通过。本次仅只读源码、差异和已有日志，未运行测试、业务、浏览器、安装或网络操作；唯一写入为本报告。

## 本次窄范围复核

- **CR-001（原中等，测试充分性）已解决**：保留原发现——初版只证明无首页依赖及 mock 等价，缺少并发/单次调用/空发布回归。新增 `group-workspace.test.ts:22–39` 用四个受控 deferred promise 挂住真实应用层端口：发布与摘要均进入且各一次后才放行第一阶段，指标与输出引用均进入且各一次后才放行第二阶段；两阶段未放行时均断言请求未完成。这能识别退回串行等待的实现，`vi.waitFor` 只用于观察进入状态，没有以固定 sleep 推断并发或修改产品超时。空发布另断言发布列表只读一次、指标/输出引用/完播率/标题均不调用。`concurrency-green.log` 已有完整终态汇总：1 文件、8 PASS（15.69s），包含新增测试。这里只评价真实发生的 GREEN，不补造该新增用例的历史 RED。
- `backend-rerun.log` 现已有完整终态：2 文件、36 PASS（86.38s），对应新增双端点真实隔离 fixture 和摘要失败等价断言。它与上述8项是两次有重叠的运行，不相加宣称44个独立用例。
- 全 workspace typecheck 与安装态实测仍不在本次新增证据内，继续保持未由本报告验收。

## 已核实的实现与入口

`overview/page.tsx:12` 调用 `createServerClient(ctx).getGroupWorkspace`。`contract/src/client.ts` 从 ENDPOINTS 生成客户端方法，`contract-client.server.ts:38` 使用同一 compositeTransport；`persistence-client.ts:5686–5692` 装配真实 groupOverviewQuery，`:7692` 转到 `createApplicationTransport`。后者 `backend/src/application/transport.ts:78,91–102` 从 QUERY_SERVICES_OP_IDS 建 owners，新增 id 已在 query-services.transport 的数组与 case 中，case 调用真实 getWorkspace。HTTP `/api/v1/dispatch` 也从 ENDPOINTS 建 id 表并使用同一 compositeTransport。**源码层可达，无需另加前端 switch；本次未发送实际 HTTP 请求，不将静态链路核对冒充安装端点调用成功。**

新端点声明 GET、group scope、read/none，并同时进入两份观测登记；未加入助手的语义工具白名单。输入沿用 groupWorkspaceQuery，输出只解析 `{workspace: groupWorkspaceMeta}`。旧 get 继续解析完整 groupDashboardPage，首页和日报消费者没有迁移到新投影。

共享 read 先解析 query、调用真实 groups.get 并检查 ctx.groupId，再把 groupId 固定、accountId 清空后经原 service ports 读取。groups.get 的 root 使用 userId+groupId；publication 和 metrics 使用 userId+冻结组，output refs 通过 project workspaceFilter；账号与平台在本组当前成员、采集历史和 Publication 历史的并集上校验。没有把历史可读范围扩大为当前账号在其它组的数据，也没有改数据写入路径。未知/真实0、日期窗口、去重、followers 和 workspace 字段计算保持原逻辑。

空发布时最新快照、输出引用和标题返回空数组，保留平台采集数据；摘要异常继续返回 unavailable 和已知发布指标。历史账号仍从原安全事实源重建，未收窄为当前成员。摘要失败时只能依赖其余原事实源，不能据此声称所有仅有采集历史的账号在故障下都可重建；这也是旧路径的保守行为。

## 本轮反馈与证据

最初 `green-contract.log` 实际为 **3 FAIL / 18 PASS**：新增 workspace 路由漏在 registry 测试允许表，另两项为旧 scope 测试仍将已获准按组读取的 inspect/events 判为 platform-account。主线程已窄修 registry 一条路由、两处旧断言，并保留 artifacts/files 的 platform-account 限制；`contract-rerun.log` 现为 **4 文件、21 PASS**。原失败日志保留，不能因文件名为 green 就计作通过。

最初新入口红测 `red.log` 为 1 FAIL / 6 PASS，错误为 UnsupportedOperationError。旧 `green-backend.log` 为 2 文件、36 PASS，其当时真实 DB fixture 只走旧 endpoint。反馈后，`dashboard-collected-metrics.test.ts:56–64` 已让同一 fixture 通过两个真实 transport 端点，并比较完整 workspace 或拒绝 code；旧页面全部字段断言保留；摘要失败分支另加新端点等价断言。这使历史转组、异用户/账号平台不符、采集指标等既有场景真实覆盖新路径；本次已核 `backend-rerun.log` 的36项通过终态。

`led047.log` 显示前端 8 文件、190 PASS；`timeout-policy.log` 所读末组为 5 PASS / 0 FAIL；`boundary.log` 报告原基线5条、无新增。日志未附逐条实际进程退出收据，本报告按所见汇总记录，不代替执行者的终态记录或全 workspace typecheck。

## 性能与真实性限制

专用路径已取消 dashboard、全项目列表、首页标题与完播率读取。剩余可测成本包括：本组最多100000条 Publication 的读取及内存筛选；摘要内部成员证据复核及3条串行 SQL；`read(false)` 仍计算随后丢弃的首页 metrics 和 recentPublications 排序。前两项承担历史选项和统计语义；未实测前不能删减或断言它们就是瓶颈。无跨请求缓存，无新增短超时；旧路由竞态实现未改。

`installed-cli-before.json` 只有3个含启动开销的单次样本。`installed-ui-before.json` 实际 WebArea 在项目页 `/projects/...`，是单份 AX 快照且没有 duration，并非总览筛选切换计时。两者都不能证明修复后组合页 P95≤1s 或页面提交达标。仍须按 SPEC 在同一安装候选、相同组/日期、正常及最小视口逐平台至少5次，分别记录 CLI、服务端操作与点击到匹配 scope 提交，并保留冷次和慢次；不继续暂停的推送。

## 复核绑定

以下为本报告生成时的文件 SHA256；后续变化必须重新核对。

|文件|SHA256|
|---|---|
|`docs/features/t1418-creator-overview-read-performance.md`|`82fcdae0348667f13fb360f38e8ef1a7ed750e7037133d1e99022dfbdf1769de`|
|`backend/src/application/queries/group-workspace.ts`|`bbc534af0e50477b104214cddc4c6e0716f9aae685678c1d4d431c362e14f45b`|
|`backend/src/modules/query-services/query-services.transport.ts`|`ebcb8bb79ab43792cac4efc54f48e2ada432605343019dcf12f3f4fdcf2e8c4e`|
|`contract/src/operations/pages.ts`|`cfd2314840772a901894fd9f8a38da157aab6245dfe476f748e9a53e97e7fb63`|
|`frontend/src/app/(creator)/overview/page.tsx`|`b2f25ddbe706bc77b6895d88b03b4f642f99616a776b7d3ee69665f719188448`|
|`backend/src/application/queries/group-workspace.test.ts`|`1cffe568f930bc1ac008475c82825453c0de1a98fede20eaa9e8ea5077e60295`|
|`backend/src/application/queries/dashboard-collected-metrics.test.ts`|`cd58e4bb67003ada235ccbd94ef14492be0ea8b3794215145fcab3414a9cb7d7`|
|`contract/tests/group-workspace-read.test.ts`|`1ab3a2387a605f649d1e2fdba3063fe7df947ff8ce2869b0896b09f6b55a99a4`|
|`contract/tests/registry.test.ts`|`7f1f0417e2a6ecfda43e33d3f7e07aace4418ca334ca109e38c33c808ef3664d`|
|`contract/tests/workspace-operation-scope.test.ts`|`ac9ae1ee6f76652f4a0b4d59083450ddf2caf7974911833a0e60c3d43a016e8c`|
|`frontend/src/features/group-workspace/group-page-routing.test.tsx`|`34943e6fb39b27b6c5a5ab68c0882a7124de340f6434f543acd25178f9fb2bc6`|
|`docs/verification/t1418/backend-rerun.log`|`bb4c8f255de35344c3e9b2e2232d1d51fc9e98d785bd5ec15f71bc5857326510`|
|`docs/verification/t1418/concurrency-green.log`|`da8252733551ef47ca681c57c29b4a13e373f40193462f3287d3faeef6dd09e0`|
|`docs/verification/t1418/contract-rerun.log`|`dc6e2679890643b77276ef3b6d95065340af04d2009085df4291b6a37951f358`|
