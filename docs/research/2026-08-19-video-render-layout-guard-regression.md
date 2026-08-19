# T-895 用户升级后视频渲染不可用诊断

## 结论

这次不是 ffmpeg、HyperFrames、Windows runtime closure、显卡、素材下载或固定超时失败。
当前 `1.1.0-e92e5bc1b004` 在真正写入 composition 和启动 HyperFrames 捕帧之前，执行
`assertVideoLayoutSafety`；只要竖屏主素材可见范围与固定左下人物框相交，便直接抛出
`人物框与素材可见边界重叠`，整条 `exec.video.render` 被标为 failed。

上一可用版本没有 T-860 新增的这道硬拦截，因此即使某些素材存在人物压边风险，也仍会继续
生成成片。当前版本把原来的视觉瑕疵升级成了所有相关素材都无法渲染的阻断性回归。

## 用户日志证据

来源：用户提供的 `sidecar-2026-08-19.log(1).zip`，内含两份加密轮转日志。解密仅在标准
输出中完成，没有把明文日志写入仓库，也没有重跑任务或改用户数据。

- 安装 runtime：`1.1.0-e92e5bc1b004`，Windows 路径位于
  `%APPDATA%/cloud.aitongban.creatoros/runtime-images/...`。
- `07:13:10Z` 到 `07:22:10Z`：`video.scenes`、`video.cards`、`video.broll`、
  `material.match`、两段 `video.subtitles` 与三轮 `video.director` 均完成；确定性时间线已闭合。
- `07:24:59Z`：再次 `material.match` 成功，新的 `video.decisions`
  `ai-task-fd303dad-423` 进入 `awaiting_confirmation`。
- 三次正式渲染任务分别为 `ai-task-fd303dad-447`、`ai-task-fd303dad-495`、
  `ai-task-fd303dad-643`；全部在领取后立即以同一错误失败：
  `人物框与素材可见边界重叠`。
- 日志没有出现 HyperFrames 捕帧进度、ffmpeg/ffprobe 退出码、runtime resolver 缺包、
  `MODULE_NOT_FOUND`、无进度超时或 OOM；代码顺序也证明异常发生在 HTML composition 写入和
  `engine.renderComposition` 之前。

首份日志里曾因渠道 authority 不可达导致两次 `video.decisions` 缺凭据，但第二份日志的完整
结构化决策链已经成功，随后仍稳定复现三次布局拦截，因此渠道配置不是本次渲染失败的直接根因。

## 代码与版本差异

引入提交：`fdd6d7ab123413a1954085e5a51e25e89671277b`（2026-08-16，T-860）。

该提交同时引入：

1. `assertPortraitPipSpacing`：素材可见底边与人物框相交时直接 throw；
2. 固定人物框 `264×469 @ (54,1188)`；
3. 竖屏非 overlay 素材缺 `speakerMode` 时默认 `pip_bottom_left`；
4. `executor.ts` 在正式渲染前无条件调用 `assertVideoLayoutSafety`。

T-860 的安全门只用 1920×1080 横录屏验证：在 1080×1920 画布中 contain 后素材范围为
`y=556..1164`，与人物框 `top=1188` 尚有间隔。它没有覆盖同一路径中的方图与竖图。

确定性复现：同一 `large_stage` 使用 1024×1024 方图时，素材在当前舞台 contain 后为
`(64,309,952,952)`，可见底边 `1261`；人物框从 `y=1188` 开始，因此安全门稳定抛出
`人物框与素材可见边界重叠`。现有聚焦测试也只证明旧冲突几何会被 throw，没有覆盖
“分镜组装默认 PiP → 方/竖素材 → 正式安全门”的贯通可用性。

用户日志没有记录触发异常的具体 `assetId`、源宽高与计算后矩形，因此不能诚实断言是清单中的
哪一个素材；这同时是需要补齐的诊断缺口。日志已证明当前项目至少有一个这样的正式 B-roll。

## 修复边界

正式修复登记为 T-896：

- 不删除遮挡安全门，也不回到“重叠但继续渲染”；
- AI 已选择 `pip_bottom_left`，但当前素材比例下不存在同时避开素材和字幕的安全区域时，渲染输入
  必须确定性降级为 `hidden`，或采用经过几何证明的安全布局；不得取消整单；
- 安全门只对无法修复的非法输入 fail，错误需携带脱敏 `assetId`、画幅、源宽高、素材矩形与人物
  矩形；
- 回归必须从真实 `assembleVideoRenderProps` 输出进入 `assertVideoLayoutSafety`，覆盖 16:9 横图、
  1:1 方图、9:16 竖图及显式 `hidden`/`pip_bottom_left`，不能继续只测孤立几何函数；
- 不修改用户已有项目、素材、分镜或历史失败任务；修复随新安装包生效。

## 修复结果（T-896，2026-08-19）

正式渲染执行器现在先调用 `stabilizeVideoLayoutSafety`，再执行原有
`assertVideoLayoutSafety`。遮挡门没有删除：16:9 横素材在真实 `contain` 几何下仍与人物框保持安全
间距时继续保留 `pip_bottom_left`；方图、竖图或缺少可靠尺寸导致无法证明安全时，只把可选人物层降级
为 `hidden`，主素材、字幕、方向和时间线保持不变，任务继续生成 HTML 并进入 HyperFrames。

每次降级都会在任务步骤中记录脱敏后的素材引用、源宽高、计算后的素材矩形、人物矩形和具体原因，
例如 `1024x1024` 方图会记录 `media=40,360,1000,1000`、
`pip=54,1188,264,469` 与“人物框与素材可见边界重叠”，不再只返回无法定位的抽象报错。

验证证据：

- frontend 正式 `assembleVideoRenderProps` 输出直接进入 backend 稳定器与原安全门，覆盖 1920×1080、
  1024×1024、1080×1920 三类素材；结果为 `pip_bottom_left / hidden / hidden`。
- backend 模板与执行器聚焦回归共 104/104 通过；方图冲突后仍写出 `index.html` 并调用
  `renderComposition`，没有人物 PiP tween。
- `verify-t896-video-layout-fallback.mts` 使用真实 ffmpeg 生成方图/竖图素材，真实 HyperFrames 渲染出
  1080×1920、30fps、3.029 秒 MP4；两项降级均记录完整几何。
- backend 与 frontend typecheck 通过，物理架构 boundary scan 无新增违规。

未修改真实用户项目、历史任务或素材；旧失败任务需要安装包含本修复的新版本后由用户重新发起渲染。
