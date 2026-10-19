# T-1189 原转写命令的版本明确恢复入口

Root/Growth T217与DEC206准确本地维修，既有Mother R01/R03/R05及FR-CR-020范围。本人创作者持原任务、操作和稳定key，响应丢失后点“核对原操作结果”，取回原任务当前事实与已存正文，交稿件编辑；失败保原记录/编号、恢复身份后同key核对，不再排队或收费。旧无版本unknown记录不可补造重放，版本不匹配明确提示保留并联系支持；正常已明确拒绝仍可按原门新操作。

```mermaid
flowchart LR
 A[本人原任务与操作] --> B[版本明确的入口受理]
 B --> C[连接丢响应]
 C --> D[原页面核对原操作结果]
 D --> E[同一原key返回当前任务]
 E --> F[查看步骤和已保存稿件]
```

兼容新增execution.tasks.transcribeCommand.v1/client commandTranscribeExecutionTaskV1，声明POST /execution/tasks/transcribe-commands/v1，实际原/api/v1/dispatch。public仅原三字段，strict在新handler真实消费；旧op原样，旧真实registry未知新ID先404，不fallback。内部literal只新handler设置；真实single direct transcribe双向绑定/当前权限先于私有回放，unsupported/mixed/delegated/otherkind拒；同key只回当前，原新key门/预算/期限/费用/unknown保。UI保存新协议唯一target，先重读原对象/作用域和完整record；晚200/4xx在当前turn且record不变才回写，旧unknown不伪填。

准确源码/测试13路径：
- `contract/src/operations/execution.ts`
- `backend/src/modules/execution/persistent-task.service.ts`
- `backend/src/modules/execution/execution.transport.ts`
- `contract/src/cli-policy.ts`
- `contract/src/workspace-operation-scope.ts`
- `contract/tests/registry.test.ts`
- `contract/tests/modules/execution.test.ts`
- `contract/tests/execution-command-receipt-protocol.test.ts`
- `backend/src/modules/execution/execution.transport.test.ts`
- `frontend/src/app/api/v1/dispatch/transcribe-command-legacy-dispatch.test.ts`
- `frontend/src/features/copilot/transcribe-task-progress.tsx`
- `frontend/src/features/copilot/transcribe-task-progress.test.tsx`
- `backend/src/modules/execution/transcribe-command-receipt.integration.test.ts`

Root冻结候选：backend/register 4a42bc1b6370，UI v2 fbe4ec6d88bd，service test v2 df9af1d1233c；完整SHA及三份交叉核见Root DEC206/T217合同。前置Creator T1188 191d0a71、T1093 d078e214已窄提交writer停止；不是将整体任务伪complete解除依赖。

按DEC206先test-only V03真实RED再prod；完整41与相关132、新contract/transport/冻结旧源码dispatch2、原UI五文件与新增42、types/build、LED047/timeout/边界实际运行。新fixture装配失败如实保留，只维修新增测试/后缀；原22字节前缀、旧所有业务asserts、超时和skip保持。冻结旧handler加实际已装锁定依赖只证明源码handler执行，不代安装旧binary、生产HTTP或真实会话。

Node25.9/pnpm10.32.1，仅本地自产PGlite和test tmp；Root串行治理/提交，三作者互斥文件写集与before-prod测试lane，等待明确handoff后才并行互不相交写入。原frontend20s/backendintegration180s不放宽。功能文字≥16px/触控≥44px；真实6视口、200%/键盘、意图→即时反馈→稳定结果→下一步→返回刷新/失败恢复另验，未有真人UAT不得complete。沿现oil-ui-pro方向局部深化，未取得视觉证据不宣称视觉通过。

不改Mother/方向/架构/数据归属/DTO/schema/table/迁移/权限/partial/通用dispatch/CLI缓存/Host即时wake；零provider/真实库/新PG/浏览器接管/安装/推送/部署/生产写入。原170四FAIL、Root2stage错误保；不升级旧引擎，不新增审核周期/风险接受/全局发布锁。
