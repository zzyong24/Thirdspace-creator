# T-837 MiniMax H3 提交 404 修复验证

## 真机故障与根因

- 本地 1.1.0 包任务 `ai-task-b269a0a7-610` 在 H3 submit 阶段返回 HTTP 404，尚未进入轮询或下载。
- 本机已保存的脱敏配置地址为 `https://api.minimaxi.com/v2/video_generation`；旧实现再次追加
  `/v2/video_generation`，实际形成重复路径。
- MiniMax H3 官方协议为 `POST /v2/video_generation` 与
  `GET /v2/query/video_generation/{task_id}`；对官方 `.com` 和 `.io` 正确路径做无 Key 探测均到达
  鉴权层，而不是 404。未发送有效生成内容，未创建付费任务。

## 红绿证据

- 红测：`ai-worker` 新增 Base URL 矩阵后，v2 根、官方完整提交接口、中转完整提交接口 3 项失败，
  收到值均明确包含重复 `/v2` 或重复 `/v2/video_generation`；既有 18 项通过。
- 红测：`frontend` 设置探测新增完整提交接口用例后失败，唯一一次调用命中重复路径；既有 27 项通过。
- 绿测：H3 adapter 聚焦 21 项通过；设置探测 28 项通过。
- 扩展回归：多模态 factory、MiniMax、OmniHi/Seedance 共 40 项通过；确认旧 v1、Seedance、H3
  checkpoint 恢复只 GET 和下载链未被修改。
- `ai-worker`、`frontend` typecheck 通过；`git diff --check`、物理边界与语义边界门通过。
- 项目级 `reconcile` 确认 T-837 新增 LED-028、required artifacts、orphan、asset、boundary、knowledge
  全部通过；总对账仍被既有 BACKLOG 体积、T-770/T-765/T-746 过期评审回执、T-828 非法验收值和
  多项历史 frontend receipt 漂移阻断。本任务未修改这些范围外台账，也不把全局结果写成全绿。

## 修复口径

- 新增共享纯函数，把纯域名、v2 根、完整提交接口、带路径中转前缀确定性归一到唯一 v2 根。
- H3 真生成和设置页无计费探测共同使用该函数，提交 URL 与查询 URL 从同一结果派生。
- 没有加入 404 后的备选提交重试；每次用户确认的生成最多仍只有一个 POST，防止重复计费。

## 尚待真机验收

- 本次未获真实 H3 付费 smoke 预算授权，因此没有调用有效生成请求，也不把 mock 测试冒充成片验收。
- 旧本地包仍包含旧实现；需要重新构建并安装新本地包后，用用户现有官方配置生成一条 6 秒/768P
  素材，确认任务进入轮询、返回候选卡并可采纳进项目素材。
