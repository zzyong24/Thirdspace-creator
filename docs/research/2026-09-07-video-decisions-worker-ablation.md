# T-915：视频决策编排迁移与静态消融

本次由原 `video.decisions` 业务任务经 structured business adapter 进入同一 execution Worker；不新增视频生成任务或模型账本。主线负责替换 persistence 旧调用及注入真实项目服务。

## 保留与删除

| 原 backend 实现 | 原行数 | Worker 行数 | 核对 |
| --- | ---: | ---: | --- |
| video-decisions-runner | 3501 | 3501 | 除 retry-policy 导入路径外逐字一致 |
| srt | 163 | 163 | 逐字一致 |
| chunk-and-merge | 193 | 193 | 逐字一致 |
| error-diagnostics | 196 | 196 | 除 retry-policy 导入路径外逐字一致 |

原 backend 路径只保留兼容导出，不保留第二份实现。分场、卡片、B-roll、material.match、字幕分块和总导演统筹仍按原算法执行；保留 retryOfTaskId 输入指纹与分阶段 checkpoint、补充选材模式、人工绑定、排除素材和已有安全降级。删除的是宿主中的实现归属，没有消融真实阶段。

准备阶段冻结真实项目 inventory/storyboard、仅原视频检查点、每个实际需要的 Skill 无秘密模型身份。补充选材仅准备 material.match；配置缺失保留为不可用事实，由原对应阶段决定失败或安全降级，不在准备阶段拖垮整单。

每次 provider 请求在原 execution_calls 预留、启动、结算，模型配置发生变化拒绝改用另一模型重烧；原执行取消和预算仍生效。最终候选经同任务本地结果调用保存，真实 0 模型调用路径不伪造供应商回执。存在未知调用时不能提交候选。候选服务继续进入原 video_decisions 待采纳投影，素材 ID 必须属于冻结项目清单。

## 局部验证与边界

esbuild 0.28.1 / Node 24 / CJS：Worker entry、dispatcher、adapter 局部打包通过；使用 `--packages=external`，因此不等同于正式打包或全部依赖验收。`git diff --check` 通过。没有运行测试、全量类型检查、模型、浏览器或用户媒体。

生产装配必须注入 `createVideoDecisionsBusinessAdapter` 和 dispatcher 的 `video.resolveModelSpec`，并移除旧宿主调用，才能完成入口消融。本提交不声称主线已经接线或业务实测通过，也不改变 T-915 全局未完成状态。
