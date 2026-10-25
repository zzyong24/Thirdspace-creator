# T-1411 文本连接测试鉴权与结果说明一致性

用户已要求继续修复官方 Pi 与未通过的验收。T1408 的真实诊断发现文本 probe 丢失 `authStyle`，不能以与正式请求不同的鉴权结果证明连通；本项只修该已证实缺陷，不把它称为现场 402 的已证实根因。

## 行为与边界

- 文本 probe 的内部严格 IPC schema 增加可选 `authStyle: bearer | x-api-key`；backend 投影无损传递解析所得方式，worker 继续复用现有 modelFor/Pi，不改变 endpoint、模型、credential、128 输出上限或零重试。
- 老调用未提供 authStyle 时保留原 provider 默认；图片 probe 与公开 operation schema 不变。非法值被 schema 拒绝。
- 成功文案改为“已收到最小测试请求的流式回复，连通。”，明确它只证明最小请求。完整官方对话、记忆、工具与原任务恢复仍属 T1408，不因 probe 通过销账。
- 凭据仍只在内存/已有 IPC 内；错误回执不包含 token，不新增原始请求、headers 或上游正文日志。不得改用户模型配置、钱包、真实聊天预算或 fallback。

## 实施与验收

精确产品写集：`contract/src/internal/model-probe-io.ts`、`backend/src/modules/ai-runtime/model-probe-io.service.ts`、`frontend/src/server/settings-model-test-wrap.ts`。

测试写集：`backend/src/modules/ai-runtime/model-probe-io.service.test.ts`（新）、`frontend/src/server/settings-model-test-wrap.test.ts`（已有）。先在原生产代码执行真实 worker-entry 临时打包 + request IO/子进程 IPC + loopback HTTP 红测：自定义 Anthropic bearer 必须实际收到 Authorization Bearer 且不收到 x-api-key；显式 x-api-key 和缺省旧行为保持；断言一次请求与 128 上限；非法 authStyle 被拒；错误 token 不外泄。不得仅 mock 掉 IPC/modelFor 来声称鉴权通过。

修复后同组测试转绿，现有 frontend 测试保持真实 IPC 支付诊断覆盖；相关串行 6144MiB typecheck、timeout-policy、boundary 与 git diff --check 均真实运行。独立代码复核后提交，再按打包技能冻结安装；安装版最小探针与完整聊天分别记录，不替代全任务验收。此项不改变页面结构/交互，不新增 UI 旅程要求。
