# T1301 新候选公开分类验收

本窗口仅验公共设置准备与一次真实新上传自动 `asset.classify`。分类闭环实际成功；内部调用来源与 `mediaMetadata.aiDescription` 的直接读取仍缺公共投影，不将该缺项写成通过。不完成任务、不覆盖完整组合前 RED 缺证处置。

- 构建源码：`2168294fef3f62bc8e0b4ca3254652b935daeb0d`；执行前 metadata HEAD：`c5f638fe58aced63adc4e775925d660f133ba15e`。
- 绑定：`acceptance/candidate/candidate-binding.json`；端点 `http://127.0.0.1:64881`；新 owned 主组 `grp-e2aea52e-6`，隔离组 `grp-e2aea52e-43`。
- Packet SHA256：`c9610823159bf8afcece6d2474a057520b88996babd57785daa35ba8792147ea`。
- 原始证据根：`acceptance/runs/final-2168294-a-classify/a/`；runner：`acceptance/public/a/`。未输出握手内容、未使用旧 candidate 数据。

| 实际操作 | 结果与证据 |
| --- | --- |
| 公共设置 UI | `A1301CFG` exit 0，1 passed。revision 1；text/vision/image 为 codex，video/audio/embed 保持 official；原始 `cfg-before.json`、`cfg-after.json`、`cfg-ui-witness.json`（其中 task 字段沿用父 T1300，当前子验收为 T1301）。 |
| 一次真实上传 | 监听注册在 `setInputFiles` 前；素材 `asset-e2aea52e-49`，文件 `afile-e2aea52e-53`。`U02-upload-create.json`、`U02-owned-upload.json`、`U02-classify-create.json`、`U02-classify-binding.json` 绑定原始请求与回执。 |
| 自动分类 | `ai-task-e2aea52e-55` → `exec_12266621-afc5-43bf-bf8e-8dcb2438d5e0`，attempt `cedb41b6-02d6-48ed-80ba-cacb16e42cb9`。公共 GET 捕获 queued → running → succeeded；execution attempt=1、无错误。20:06:37.792Z 接纳，20:06:51.459Z 完成（UTC）。taskModelKey 为 codex，不能代替不可见的底层 call 身份。 |
| 原结果与标签 | `ai.tasks.results.list` 返回 `asset-process:exec_12266621-afc5-43bf-bf8e-8dcb2438d5e0`、正确 assetId、真实描述“浅色背景上蓝色圆形与橙色方形，可用于形状或色彩对比讲解”、标签 B-roll；公共 taxonomy 回读同标签。 |
| 原文件 | 公共精确 file 下载 SHA256 与输入均为 `28e3ba6c252242ef9886b290cd089fb97f494fc644dee5b0323502a9e54bf8a2`；838 bytes，240×160。未为读字段新建文件。 |
| 跨组 | 真实隔离组对 assets.get、assets.fileDownloadUrl、ai.tasks.get、taxonomy.entityTags.listForEntity 全部 404/OwnershipError，原 JSON 保留。 |
| 单任务与资源 | 分类 attempt2 runner exit 0，1 passed / 22.3s；仅一次上传及一次自动分类，零视觉聊天、零模型重发。公共原任务已终态，Playwright worker 2769 及浏览器自然退出。 |
| timeout 必要门 | `node tools/timeout-policy/verify.mjs` exit 0；静态 2839 文件无失败、174 项回归通过，完整日志保留。 |

## 真实失败与证据限制

1. 分类 runner attempt1 因 helper 未导出 dispatch 在上传前失败（worker 2410、exit 1）。完整日志/截图/result 未覆盖。仅修 runner export 后执行 attempt2；失败发生于 setInputFiles 前，没有旧 task 被重发。两个 attempt 的 reporter 结果独立归档。
2. 已装通知 MutationObserver，但 `U02-classify-dom.json` 为 `[]`；没有捕获 data-task-id/status，不签通知 DOM 通过。`ai.tasks.steps.list` 实际也为空，不编步骤。任务生命周期由原公开 GET 证实。
3. `workbench.modelCalls.summary` 对非 chat execution 实际 409“模型摘要来源映射无效”；原响应保留，不写 calls=0，也不推断零成本。没有伪造 account 调用 inspect。
4. 公共 `assets.get.description` 实际为空，不能冒充 `asset_files.mediaMetadata.aiDescription`。原分类结果和标签可直接读回；annotate 与完成回执同事务只作为源码支持的间接证据。未打开或复制活动 PGlite。Root 后续允许在本来必要的 T1302 公共项目创作读取中，合法关联该素材并读取 images description（标注合并/截断语义）；当前尚未执行。
5. 当前结论不代签 T1302、父 T1300 矩阵、真实 call/provider 回执或历史缺失 RED。旧 unknown 未重发，旧库和已安装 App 未动。

## 清理与交接

CFG worker 2181、分类失败 worker 2410、成功 worker 2769、timeout verifier PID 3764 均已自然退出。最终进程检查仅匹配检查命令自身；没有本轮 Playwright/Chromium/Vitest/timeout 进程。controller 仍由 C 保持，未终止服务。两个 owned 组、素材与原任务保留供下一合法子窗口复用；未删除整库。本窗口未改 tracked 产品、测试或 metadata，未构建、安装、提交。A 释放 browser/model/ignored-writer 后由 C 串行切换 T1302。
