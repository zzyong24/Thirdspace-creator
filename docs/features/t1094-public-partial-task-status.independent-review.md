# T1094 公共 partial 任务状态 SPEC 独立复评

- 评审类型：recheck
- 评审时间：2026-10-09T00:22:29Z
- SPEC SHA256：`de0680b5b89438ce332aebcce15560e14c22ff32b51de5825f0c6685d42fabf3`
- 产品宪法 SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- modules.config SHA256：`f46ef6445ee7a6b615d8211a60a48c10c5a5a7c3349a93e835a0f69d941a367d`

## 结论

原 `REV-001` 保持销账。当前新增的 `production-sources` 类型闭包补充合理，未引入新的 SPEC 阻断：它只让本地变量承认真实 `ExecutionTaskResource['status'] | 'reserved'`，没有增加 runtime 分支，也没有把 `partial` 冒充成功、失败、运行中或候选。

本结论允许 root 按正式流程 record 后实施这一精确路径；不代签尚未发生的类型检查、回归、浏览器、模型或安装结果。

## production source 类型闭包

公共 `ExecutionTaskResource.status` 由同一个 `aiTaskStatus` 派生。合同新增 `partial` 后，`production-sources.ts` 原本的本地六态变量无法接收真实 task status，因而出现确定性 TypeScript 失败。当前 SPEC 的最小方案具有以下边界：

- 只把本地变量类型改为 `ExecutionTaskResource['status'] | 'reserved'`；
- 保留 `awaiting_confirmation → succeeded` 的原 media-probe 完整回执映射；
- 保留最终 `productionSourceRequest.parse`，该领域合同没有 `partial` 时继续 fail closed；
- 不扩展 production source 公开状态，不增加候选、采纳或重试语义；
- 不把无完整 probe manifest 的 partial 当作已验证媒体；
- 将该唯一产品路径加入精确 read/write set，并绑定原 `production-asset-asr.integration.test.ts` 回归与 backend typecheck。

这是一处由公共 enum 扩展触发的真实类型闭包，并非新的媒体功能。严格 parse 的失败仍会暴露“不支持该终态”，不会静默伪造成功。若未来要求 media probe 支持 partial，必须另行定义领域合同；本任务没有预签。

## 其它已修正接线

- backend Article 状态从既有 `aiTaskStatus` 的 Zod 类型派生，没有新增 contract 根导出或手写另一套枚举。
- frontend Article 直接从现有 `client.getTask` 返回类型取得 `status/errorMessage`，没有宽类型旁路。
- public partial 集成测试把 get/list 分成各自 typed transport 请求，并继续用各自 endpoint response 严格 parse。

这些修正解决前次实施只读复核中发现的类型接线问题；由于新 Gate 尚未运行，本报告只确认设计和当前源码形状，不把它们写成实际 PASS。

## REV-001 与消费者补充

正式 Gate 继续覆盖 primitives、新 public-partial、原 completion/submission/authority、受影响卡片、Article/Knowledge/Daily/通知及 LED-047。`ExecutionTaskCard` 保持已纳入的消费者补充：`partial` 停止轮询、显示真实 manifest 摘要，不进入原确认门，也不显示采纳/重试/取消。

首轮 finding 的冻结 `evidence_ref` 保持原 SHA `f5900343…`；本轮只更新其 `status/resolution_evidence`。没有把实施中发现的补充伪造成新的 baseline finding。

## 未代签边界

- 未运行新的 typecheck 或 production ASR 回归。
- 未修改 production source、模型、数据库或用户资料。
- 未证明安装版原任务已恢复。
- 未关闭 Article 旧测试对照、原生 GUI 或全局 reconcile 欠债。
