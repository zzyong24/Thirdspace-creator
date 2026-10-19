# T-1238 成片视觉审核迁移当场证据

本轮将原 `video.render` 抽帧审核从组合根直接调用 API 模型，迁入受控独立 Worker。原视频创建时选择 Codex，审核就使用 Codex，独立 API 模型配置不会被读取；原 Pi 任务仍使用 Pi。审核失效只记录原因，不阻断已生成的安全成片。

```mermaid
flowchart LR
  A[原视频 AI 任务\n冻结引擎与绝对期限] --> B[唯一审核子 execution\n原父 ID 和图片摘要]
  B --> C[受控审核 Worker]
  C --> D[Codex 原生图片输入]
  C --> E[原 Pi 视觉能力]
  D --> F[原调用账本与真实回执]
  E --> F
  F --> G[成片候选审核信息\n审核失败仍保成片]
```

## 实现范围

- `runExecutionTask` 在视频开始时调用 `freezeParentDeadline`，按原任务创建时间与合法总期限冻结；再次调用不会续期。已耗尽期限在进入 executor 前停止。executor 把真实沙箱任务 ID、同一取消 signal 与原绝对期限传给 `VideoVisualReviewer`。
- 新 `createExecutionVideoVisualReviewService` 查真实 scoped `exec.video.render` 父任务。子记录沿用 `execution_tasks`；ownerType/ownerId 与 payload.parentAiTaskId 明确指向原视频 AI task，parentInputDigest 绑定原 spec，requestDigest 绑定接触表与原 prompt。原 AI task.executionTaskId 不被审核子记录占用。
- 子 `stageKind=video.visual-review`，仅存专用 `reviewInput`，不存通用调度器读取的 `modelInput`。入队、期限绑定与 claim 在同一父行锁事务内，提交时已经 running，通用队列不能抢领。
- 子 deadline 不超过原视频 deadline，并给成片收割保留 5 秒。剩余不足完整两分钟审核预算时不启动模型，给可选审核留下诚实的 unavailable 原因。原视频明确无固定总期限时，单次审核仍限 180 秒。
- Codex 规格不含 API 凭据；Pi resolver 只获得可信原 aiTaskId。模型调用经过原 reserve/start/settle、checkpoint、租约、线程/回合绑定及进程监督。重复回读复用完整原回执；未知回执、取消或改变图片不会重发，也不会产生第二条审核任务。
- 新 Worker build 入口及桌面 runtime copy/完整性名单已补入 `video-visual-review-worker.cjs`。只验证代码与临时运行时资源，没有构建或发布正式安装包。

主线程组合根签名：

```ts
createExecutionVideoVisualReviewService(db, {
  entryPath: string | (() => string),
  resolvePiModelSpec(ctx, owner: {aiTaskId: string}): Promise<unknown | null>,
  now?: () => string,
});
// runExecutionTask deps:
bindModelExecutionScope: service.freezeParentDeadline;
// VideoVisualReviewer:
videoVisualReview: service.review;
// 共享停机清单:
service.stop();
```

## 实际测试，不重复相加

所有本轮独立测试命令使用 `--maxWorkers=1 --retry=0 --testTimeout=180000 --hookTimeout=180000`。被本轮触及的桌面启动测试实际 startup 为 120 秒、test 为 180 秒。

| 当场证据 | 结果 | 覆盖 |
|---|---:|---|
| `video-visual-scope-red.json` | 25 PASS / 1 FAIL | 原 executor 不传父 ID、期限与 signal，审核 callback 无法审查 |
| `video-visual-parent-expired-red.json` | 1 PASS / 1 FAIL / 8 selector SKIP | 公共 driver 在原期限已耗尽时仍进入 executor |
| `video-visual-runtime-red.json` | 5 PASS / 2 FAIL | 新 Worker 未复制、缺失资源未被完整性门拦截 |
| `video-visual-complete.json` | 42 PASS / 0 FAIL | service 6、video executor 26、公共执行 driver 10；互不重叠 |
| `video-visual-honest-skip.json` | 6 PASS / 0 FAIL | 最后预算不足原因修正后 service 6 全部重验，重叠于上行 |
| `video-visual-runtime-final.json` | 7 PASS / 0 FAIL | build/copy 字节相同、实际隔离启动与缺入口检查 |
| `video-visual-backend-typecheck-final.log` | exit 0 | backend 类型 |
| `video-visual-worker-typecheck-final.log` | exit 0 | ai-worker 类型 |

service 公共链测试使用真实独立子进程与 Pi 本地 HTTP 图片请求；校验零重发、真实图像内容、原父 ID/截止、原 Pi 路由在偏好改 Codex 后保持、缺配置可选审核、错误账号与伪造期限拒绝、在途取消保留 unknown 调用、不把视频父任务写成失败、通用 model claim 不抢领。

Codex case 只替换受控 app-server 会话为 native 协议 fixture，实际 Worker、provider、图像投影、真实 IPC、租约、Codex thread/turn 持久绑定和调用结算保持。fixture 要求原生 image 输入并返回完整终态与用量。它证明路由和协议执行链，不证明官方账户登录后的实际模型效果。

保留中间失败：`video-visual-worker-first.json` 是 fixture 模块路径错误、没有实际用例；`video-visual-worker-run.json` 的 3 PASS / 2 FAIL 是测试 settings deps 遗漏，不作为产品红测证据。`video-visual-runtime-green.json` 的 6 PASS / 1 FAIL 是旧启动测试硬编码 30 秒；修正实际预算后 final 7 PASS。`video-visual-scope-green.json` 实际为 34 PASS / 0 FAIL。前述中间报告都未删除或改写。

## 当场 Gate 与限制

- `video-visual-orphan.log`：orphan-scan exit 0，既有 PLANNED chain WARN 原样保留。
- `video-visual-semantic-boundary.log`：semantic-boundary-scan exit 0。
- `video-visual-boundary.log`：boundary-scan exit 1；唯一新增违规为主线程另写集的 `execution-codex-chat-tool.test.ts` 跨模块 import `../ai/ai.repository`，已通知主线程修复，未改 baseline。本视觉写集没有新增物理违规。
- `video-visual-timeout-policy.log`：完整 verify 当场 exit 1，首机械 check 报本轮主线程 Codex ACP/protocol 超时常量与既有 reference-editor vendor timer 等；后续真实测试组通过。主线程统一判定归属并修复/登记，本报告不声称全局 Gate 全绿。

未验证：真实官方 Codex 账户完成整条成片审核、真实视频渲染加该官方模型效果、正式桌面安装包真机验收。没有用户内容发布、没有提交、没有控制面状态签收。
