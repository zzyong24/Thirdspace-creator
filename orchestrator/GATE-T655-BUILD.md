# T-655 Seedance 文生视频适配器 BUILD Gate

日期：2026-08-02  
结论：未知 provider 阻断已修复，保持进行中；等待统一安装包后的真实计费任务验收。

## 真实故障

- 用户任务 `ai-task-2684c3e2-322` 在 8ms 内失败，尚未发出任何模型请求；日志原因为
  `未知多模态 provider: "seeddance"`。
- 本机实际配置为 provider=`seeddance`、model=`seedance/seedance-2.0-fast`、
  base URL=`https://api.omnihi.ai/media/v1`，API Key 已存在。
- 对服务做无 Key、零计费探测：`POST /videos/generations` 与 `GET /jobs/{jobId}` 均返回
  401 而非 404，确认渠道模板中的 submit/poll 路径真实存在；没有提交付费生成任务。

## 修复

- 新增 OmniHi 异步视频 adapter：提交 generation → 轮询 job → 下载成品字节。
- registry 同时注册 `omnihi`、`seedance`、`seeddance`，兼容已保存的历史拼写；渠道
  authority 将两种历史拼写归一为 `omnihi`。
- 请求参数与渠道当前档位对齐：4 秒、480p、9:16、关闭原生音频；2 秒意图先生成服务商
  最短 4 秒素材，进入项目后再裁切。
- 兼容 `jobId` / `job_id` / `id`、顶层或 `data` 包裹，以及 `output(s)` / `results` /
  `video_url` 等常见中转响应；失败、无成品地址、下载空文件和轮询超时均给出可行动错误。
- 设置页连接测试、provider 候选与帮助文案同步支持 OmniHi / Seedance。

## 验证

- AI worker：2 files / 14 tests PASS。
- backend 渠道配置 + projects 契约：2 files / 14 tests PASS。
- frontend 设置/项目/拖拽聚焦集：5 files / 94 tests PASS。
- Node `v25.9.0` 下 ai-worker/backend/frontend typecheck PASS；boundary 无新增违规，
  orphan-scan 0 error。

## 待真实验收

- 2026-08-02 已进入统一 `release-fast` 本地测试包；12 个打包阶段、真实 sidecar smoke、
  App TLS 自包含与 DMG 完整性校验均通过。
- 仍需用现有 Key 发起一次真实 4 秒视频任务，确认服务商返回的最终 payload 与
  成品下载；这是付费外部 E2E，本轮没有擅自消费额度，也没有单独重复构建。
