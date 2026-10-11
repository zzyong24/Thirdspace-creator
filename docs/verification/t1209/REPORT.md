# 自动化409修复与真实证据

原因：0128升级只填旧作业的groupId，漏填groupVersion/membershipVersion；私有采集准入严格核空值与当前成员v1，拒绝合法作业。公开CLI req-f394bff8-1525/1527确认两个真实抖音组12条旧作业均如此，没有修改或手动触发真实平台采集。

修复：追加0132，仅给同user真实账号、已归初始legacy组、当前唯一成员v1且无任何其它历史的旧作业补版本。原任务身份、归属、排期、开关、更新时间及旧运行/AI/execution冻结数据不变。错误版本、转组又返回、跨用户/组或缺证明不补；原执行权限校验保留。

|验证|当场结果|
|---|---|
|隔离旧库RED|2失败8通过；真实runNow先重现同409，缺版本修复与定时链预期失败|
|专项最终矩阵|17/17通过，含真实public typed client→controls→AI→job run→execution、重复防重、105/106历史升级/重开、归档、错误证明及两个真实PG转组并发顺序|
|调度相关原回归|3文件110/110通过，含startup-group-collectors真实PG，无条件跳过|
|原多来源迁移双启动|4通过；用名称过滤其余18未执行，不冒称全迁移通过|
|后端typecheck|exit0|
|物理边界|无新增违规，原5条基线保留|

原RED、两次后续失败、最终GREEN和原回归分别保留日志；没有删测、缩预算、禁用归属门或重建真实任务。

原历史来源迁移测试31/31通过，包括真实PG；打包四项基本测试45/45通过。超时规范入口实际exit1：27条既有静态项，当前修复文件不在失败项内，原T-1081继续保留。完整全局reconcile仍以其当场退出结果为准，不以局部通过代签。

完整reconcile当场exit1，27ERROR/0WARN：打印前5为看板RUNAWAY及T1072/T1021/T915/T859旧审核收据，另22未打印，不能推断全部为旧债。当前统计触发LED018/042/052/058/054/057/053，只标触发项，不足以代替底层日志；继续关联T-1204，当前任务不签全局通过。

LED052原总入口遗漏CREATOROS_ISOLATED_PG_URL；补齐两个隔离变量后按原入口实际58通过1失败，失败在测试afterEach的DROP DATABASE WITH FORCE（permission denied to terminate process），并非业务断言。隔离服务器实读证明zyongzhu非superuser、既有creatoros_test为测试管理角色；后续使用该既有角色按原入口复跑，不改角色权限、产品门卫或断言。前两次失败均保留。

使用既有creatoros_test测试管理角色、同时设置两个隔离URL，原归档入口实际59/59通过，exit0；不改变上次全局27项失败的结果。

## 本轮构建和安装

冻结源6730a15eab7749edf999dc5399c8497c6fa3eaa5，复用干净构建worktree，四版本均1.2.0。提交对象预检13054个blob，无新secret形状；3个已知fixture精确哈希已列入source-freeze.json。构建后所有跟踪文件哈希不变、Git状态干净。

固定入口 `CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local` 实际exit0；新包 `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，SHA-256 `4e82ba9690a85de58a86b3965ffdaf241df526beb00f3bddd1e4fd9155f04e0e`。hdiutil verify、构建App与DMG内App深层签名校验通过；两者shell和runtime相同，包内0132 SQL精确哈希与源码一致，journal实际107条。此包本地ad-hoc签名，未Apple公证，没有正式发布。

使用原固定入口导出的安装函数替换 `/Applications/CreatorOS.app` 并启动，不制作备份。新原生PID58836；公开status确认installed/connected/full，直属服务PID59280监听62247，实际HTTP首页加载完成，runtime stamp与本轮包一致。首次资源展开期间连接未就绪的失败原文保留为installed-status-initial.json，没有删去失败探针。

真实账号只读前后对照：两个账号组12条旧作业全部从null/null补为1/1，只有两个版本字段变化。原ID/user/group/account/名称/提示词/类型/目标/cron/grants/recipe/启用/创建与更新时间全部不变。详见installed-job-comparison.json（公开请求req-f394bff8-1529/1531 → req-0f0dcc73-137/136）。

安装后原调度器自动补跑2026-10-11的作品同步，未显式重发或批量触发外部采集。第三空间原job-b944fd09-474实际产生run-5efd8bb4-530f-42d1-8830-6f3bb379f195、ai-task-0f0dcc73-152和exec_90e4dc58-d3ee-4b9f-8a8d-5a91afdaf729，均当前版本1；公开读状态running、error=null，已经通过原准入。另一组首次公开run列表为空，后续原job-ae1a8346-11实际产生run-4f1bbadf-5506-4090-ae34-12a727fb60ac、ai-task-0f0dcc73-304，当前版本1，running且error=null。两组均已经原定时链进入真实执行，尚不代表外部平台采集已完成。

本轮对标页第1次导航超时，第2次实际恢复，读取33条公开作品；没有手动重发。原失败和自愈日志均保留。

启动同时保留既有CHANNEL_RUNTIME_DIGEST_MISMATCH/展示副本与config_sync 502，以及后续CLIENT_CONFIG_ACCESS_CHANGED；关联T-1196。旧intelligence同步ai-task-f394bff8-1465失败、本轮ai-task-0f0dcc73-148成功，关联T-1098；没有把原失败抹掉或声称全部自动化完成。

进一步公共只读观察：上述采集execution仍running，attempt已由2变3，checkpoint为空、心跳仅在领取时推进，外部执行未验收成功。T1209的旧job元数据409范围已修复；原执行消费/租约与缺少失败结果收口另建精确诊断任务，继续修复，不让入队PASS替代完成。

```mermaid
flowchart LR
 A[旧任务归组但版本空缺] --> B[升级补齐可证明的初始版本]
 B --> C[原校验与防重通过]
 C --> D[原作业产生真实运行记录]
```
