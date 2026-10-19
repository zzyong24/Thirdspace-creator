# T1060 实现独立复核

## 本轮结论

本轮所审合同、后台聊天回合/图片端口、Worker ACP 宿主、复用客户端/适配器权限补丁，以及聊天图片展示链，在下列当前文件快照中未见尚未关闭的新增阻断项。`findings: []`。这仅是源码与隔离调用链复核，不能写成真实 Codex、WorkBuddy、界面或未来模型能力均已通过。

```mermaid
flowchart LR
  A[后台冻结任务与协议] --> B[Worker 建会话并核对权限]
  B --> C[后台持久入场]
  C --> D[复用客户端 prompt]
  D --> E[客户端通知排空]
  E --> F[宿主正文与图片队列排空]
  F --> G[后台验原图片收据并结算]
  G --> H[聊天原生素材卡]
  H --> I[用户确认后进入素材库]
```

## 实际核对

- 新 Codex binding 由后台生成并进入输入摘要；旧任务没有 binding 时走原 native Worker，服务端也拒绝转入 ACP；历史结算回执仍可读，started/unknown 不重新 prompt。
- 新会话在原生配置与实际 MCP 集合核对后，等待后台 `startExternalChatTurn`，才调用 prompt；`onRequestWritten` 不承担持久入场。可能已经发送的失败保留 unknown。
- 固定模式为只读、网络关闭、用户审核、明确取消权限请求；原全局 MCP 先禁用，本轮随机名称服务器单独加入，实际工具集合与冻结清单一致才入场。客户端 fs/terminal 为 false，子环境沿允许键，不复制历史登录文件。
- 内部 MCP 使用原 narrow task 服务，每次工具仍核对任务、lease、工具版本/效果和入场状态；未见新增任务权威或 Worker 直写库。
- 图片使用同一聊天原回合的窄端口，经原 pending 素材服务保存，操作键包括 call/tool/index；结算逐项读取原 checksum/file 收据。候选在后台 commit 后仍为 pending，用户沿原确认门采用。
- 路径图保留原始目标路径供 fs-safe 拒绝符号链接/硬链接，内联字节不受不安全 savedPath 牵连；最多保存 16 张，单图失败不抹除有效正文/其它图片。
- 聊天 `tool-native.image` 已有可达分支，复用 generated 素材卡、原签名预览和 pending 确认门；不是仅留工具 trace。

## 本轮发现和修复复核

| 问题 | 当前关闭证据 |
| --- | --- |
| 原生图片仅有 trace，用户没有预览/采用入口 | `ai-copilot-content.tsx:2672-2675` 显式 native.image 分支可达，generated 卡调用原预览/确认门 |
| 旧缺 binding 任务服务端仍可转 ACP | `external-chat-turn.service.ts:98` 反向拒绝非 native；当场服务测试覆盖旧/新两方向 |
| 保存回复丢失后重放恢复，仍遗留同键失败说明 | `external-chat-images.ts:45` recover committed 删除同键 failures；当场图片测试覆盖 |
| 客户端 close 抛异常会跳过桥清理并覆盖主结果 | `codex-acp-worker-run.ts:73-76` 全部资源 allSettled；当场 Worker 测试覆盖成功/unknown 两路径 |
| prompt 返回时客户端尾通知尚未执行，宿主 flush 会漏内容 | Worker `:54-56` 先用原公开通知排空，再宿主 queues；异常路径 `:68-69` 保留已收到回合事件。真实复用客户端 + 上游假 stdio 4 次自然传输实测漏 17/9/26/29 个块，排空都补到 4097；实际 Worker 修复后隔离测试完整交付全部块 |

## 独立当场检查

- 17:27:48，五个既有 Worker 隔离套件：`external-chat-images`、`codex-acp-policy`、`external-chat-binding`、`acpx-environment`、`codex-acp-worker-run`，5 文件、26 项，通过，retry=0，exit 0。
- 17:28:23，后台 `external-chat-turn.service.test.ts`，内存测试数据库与假对象存储，8 项，通过，retry=0，exit 0。包括新旧协议冻结、错会话/旧租约/伪造图片引用拒绝、纯图片 pending 与幂等。
- 17:24:16，仅 `/tmp` 的真实复用客户端/上游 stdio fixture/实际 Worker 隔离测试，1 项，通过，retry=0，exit 0；相关来源、原始观测、命令与前置测试工件失败全部在 `/tmp/t1060-acpx-notification-evidence.md`，补丁 `/tmp/t1060-acpx-notification-drain.patch` 尚由主会话决定整合。
- 未运行真实 Agent、读取凭据、浏览器、安装或产品真机验证。没有改共享仓库或控制面。

## 当前快照摘要

```text
b5993ee645ce70670e5fce2593196527612cd5f077ea991171ae5af348d9293b contract/src/internal/chat-worker.ts
32ed4556509221e373fc6248f986131015f6101a121ab09675ff458a441fff59 contract/src/internal/execution-worker.ts
16323fefe52b5d977a20f49fc22d552b5b7586ea5394653d94e936ade73c8f63 backend/src/modules/ai/external-chat-turn.service.ts
028b7399969e8a5092db635d359f0efe4fd0b5531e90574fec34b4f9ff9830ef backend/src/modules/execution/model-worker-dispatcher.ts
245dfa9f5d65572af5ba211e26c0125fdbaadb9a5a2202fe65dc2a634e70841c ai-worker/src/execution/codex-acp-host.ts
3ea26b7c6579c52be64a2649304c1fc6161da31b33dcb67aba05b7deec16fda5 ai-worker/src/execution/codex-acp-worker-run.ts
63c271ea0475056b86c016a263ffaeb0566c6a53857e0f508a8e2d6b5812a1e4 ai-worker/src/execution/external-chat-images.ts
1d30eb86829e77a1b775ce0a8744547814305746aa11f6ad52f7107962d0c64d ai-worker/vendor/codex-acp/src/CreatorOsPolicy.ts
d191bbe3f539eb5859ddea6eee0df22444305817c2899e931ba429a1d3a3becd frontend/src/features/copilot/ai-copilot-content.tsx
efc9502af7c23e85d825cfcefea5ebe7542059993a6a09b53bd851122c8e90db frontend/src/features/copilot/chat-screenshot-card.tsx
```
