# T-1319：恢复公开agentic采集任务执行器准入

## 当前真实失败
group18公开创建BBC Technology RSS source intelligence-source-e80980cf-349，runInitial=false/monitorEnabled=false。execution.tasks.create agentic.collect实际400 ValidationError“未注册的 executor: agentic.collect”，无task ID/模型，不绕ai.tasks.create或manual runs.start。

新不可变包source 0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a，owned-root qyb5ZR/50727；原失败、任务与响应保留，证据见docs/verification/t1319/OBSERVATION_INDEX.json。不用后续task succeeded覆盖单操作拒绝。

## 待审最小方向
Root/R只读线索是hasExecutor/registry与已有worker wiring错位；正式修法需追完整公共create→admission→dispatcher/worker/ledger→collect.run稳定key，未证范围不得扩大其它agentic能力或放宽executor白名单。

## 授权与阶段
用户原全功能修复授权与Root本轮明确裁决覆盖本问题登记；当前仅现象/源码线索/必要最小范围草案，不start、不产品/测试修改、不重包、不改变当前T1314–1316 packet/共享配置或T1300已锁矩阵/原审核轮次。先精确正式SPEC/输入锁与独立评审，再真实完整公共消费者前RED→最小实现→安全回归及新包必要复验。原既成失败不能补拍成前RED；不重发旧UNKNOWN或重复付费请求。

后续验收必须以原受权入口/实际owner/原scope/真实task/call/结果读回为据，跨user/group/account拒绝、旧合法账号兼容、归档/取消/回放/rollback按实际受影响族核；新机制或写集扩大须先明定。此时没有实施PASS或新模型结果。
