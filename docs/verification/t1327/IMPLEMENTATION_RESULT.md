# T1327 实施进行中：准备门已恢复，完整公共链仍有独立读侧失败

当前不能签整任务或完整 GREEN。SPEC 最终 b73ebeb2b148f8ea656a60ddb547b9cce3a7ce720d6031f6c130736657290a11 已独审，产品唯一改动是 backend/src/modules/ai/script-draft-task-submission.ts 的局部 prepare 入口由 requireAccountId 改为既有 requireWorkspace + await assertWritableWorkspace；输入 clone 在异步前，后续事务、原父回执、目标、成员锁、冻结路由、候选和采纳不变。

| 本次真实记录 | 结果与限定 |
|---|---|
| runtime/run-red | exit1/23.209096917s；合成RPC子进程nonce未穿过生产env白名单，CODEX_PROCESS_EXITED、0turn，**夹具FAIL，不是产品RED**。旧字节/原件保留，未改生产env白名单或补原任务。 |
| runtime/run-red-v2 | exit1/23.658788666s；父成功，正式script.draft回执AccountRequiredError、taskId=null、sideEffect:none，公开children0，合法成功hard断言自然失败；这是当场目标公共RED。 |
| runtime/run-green | exit1/28.497628792s；prepare恢复，真实父/子事务→worker生成4段候选→用户确认→当前稿面和article/graphic来源新版本→重复确认幂等→刷新已闭合；两个采纳前服务端selector soft断言失败，因此最终0PASS/1FAIL。详见 runtime/SELECTOR_SCOPE_DELTA.md。 |

原真实7790 U10失败不变。上述均为新的隔离受控公共生产链，合成模型协议而非真实供应商；没有复用原任务、数据库或认证。原worker3851字节复制为本任务独占只读输出，未build共享dist；依赖仅链接到原包只读安装元数据。三次执行均未发实际模型，最后一轮合成原生3turn，不能冒0模型执行流程或供应商成功。

装配旧字节在 runtime/assembly-v1、assembly-v2-pre-nonce；各独立collection-only与锁、run内原始Vitest/命令/源snapshot/清理回执均保留，不覆盖旧FAIL。GREEN相对目标RED的2009项源锁唯一生产字节变化为prepare源485fe670…→451a9c8e…；并行T1329唯一agentic-worker-run源明确声明不消费并排除，不将其delta当本任务RED。

服务边界：runtime/run-service 首轮真实18PASS/1FAIL、exit1/17.571972833s；新增测试直接插入output时漏父groupId，真实归属门准确拒绝，作为夹具FAIL保留。改前test/runner/锁完整字节在runtime/service-assembly-v1；仅将四个owned output按真实父项目戳groupId，新runtime/run-service-v2真实19PASS0FAIL、exit0/16.243129584s。覆盖原legacy、纯组、真实成员账号、prepare零实体/父回执回滚、原Codex父绑定重放、不同call/inputDigest/execution拒绝、组间attempt隔离/同组并发、完整合法意图差异、归档/不存在/非本人/无工作区、准备后组或成员版本变化、跨组项目/output/非video拒绝、两个video及项目目标独立、旧master不写入、clone冻结、历史删除拒绝和坏保真原文。没有真实平台绑定或外部模型。

只读Gate实际原件在runtime/gates：boundary exit0/1.127116417s、orphan exit0/0.239031708s、semantic exit0/1.000211292s；五个相关contract文件实际Vitest exit0/2.892969333s（见contract-vitest.json）。diff --check实际0。无UI导航、轮询或布局改动，既有LED-047现场/源不变只能继承原限定，不冒本轮新增操作。统一timeout、pmem/reconcile由C独占收尾，不把此前旧Gate或T1292全局既有失败追签成fresh全绿。

Root已实际读目标RED、唯一prepare源diff、修后完整链两soft失败、service新增边界和service-v2原结果，认可局部门修复；明确不以局部认可覆盖公共最终FAIL。新读侧残余已单列T1331待审，当前未越出T1327产品范围。

新包实际供应商/页面验收、T1331依赖和统一收尾仍待做。C负责共享控制、最终统一包及pmem/reconcile/taskctl；本报告不代任务完成或父矩阵改写。T1327三个公共run及两个service run均真实退出，所有实际登记worker/RPC子进程已不存在，cleanup逐项完成而非恒写成功；未停止共享candidate、未重发旧未知任务。应用测试随机master key仅内存，未宣称诊断库可在丢key后恢复。
