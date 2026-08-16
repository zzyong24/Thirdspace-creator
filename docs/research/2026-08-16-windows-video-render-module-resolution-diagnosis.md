# Windows 用户机成片失败诊断（2026-08-16）

## 结论

本次是 **Windows 安装包内的 HyperFrames 子进程没有加载 CreatorOS 分层运行时模块解析器**，导致正式成片在渲染引擎启动阶段以 `ERR_MODULE_NOT_FOUND` 退出。它不是分镜生成失败、素材匹配失败、补帧失败、FFmpeg 编码失败或模型额度不足。

同一用户操作触发的两次正式渲染分别在 07:20:23 和 07:22:41 失败，错误形状完全一致：`hyperframes render 退出码 1`、Node.js `v25.9.0`、`ERR_MODULE_NOT_FOUND`。重复点击不会自行恢复，必须修复 Windows 运行时启动契约并重新出包。

## 证据范围与隐私边界

- 只读解密并解析用户提供的 `sidecar-2026-08-16-1.log.zip` 中四段安全日志。
- 未修改用户项目、素材、账号、模型配置或任务状态，也未自动重试失败任务。
- 报告不记录用户目录名、账号标识、平台身份标识或任何密钥。
- 解密后的明文只输出到受控进程标准输出，没有写入仓库或持久化为明文文件。

## 真实任务时间线

| 时间 | 环节 | 结果 |
| --- | --- | --- |
| 07:18:06 | `video.scenes` | 成功 |
| 07:18:12 | `video.cards` | 成功 |
| 07:18:28 | `video.broll` | 成功 |
| 07:18:41 | `material.match` | 成功 |
| 07:18:51 / 07:19:02 | `video.subtitles` | 成功 |
| 07:19:12 / 07:19:24 / 07:19:34 | `video.director` | 成功 |
| 07:19:34 | `video.decisions` | 已生成 1 个候选，进入待确认 |
| 07:20:23 | 首次 `exec.video.render` | HyperFrames 启动即 `ERR_MODULE_NOT_FOUND`，任务失败 |
| 07:22:41 | 第二次 `exec.video.render` | 同一错误再次失败 |
| 07:24:41 | 应用退出 | 数据库正常刷盘，sidecar 正常退出 |

因此失败边界非常清楚：上游编导和素材链已经完成，正式渲染进程已被拉起，但还没有出现 `Capturing frame` 或 `Encoding video`，即在捕帧、缺帧修复和 FFmpeg 编码之前就退出。

## 代码级根因

Windows 少文件运行时把依赖拆到多个并列 vendor 目录，并提供 `frontend/creatoros-module-resolver.cjs` 统一解析：

- HyperFrames CLI 位于 `layers/core/render/vendor/hyperframes/dist/cli.js`；
- 其 bundle 明确保留 `sharp`、`onnxruntime-node` 等外部模块；
- 这些模块位于其他分层 vendor 目录，Node 原生向父目录查找无法命中；
- CreatorOS 主 server 启动时预加载了解析器，但 Node 的模块 hook 只对当前进程有效，不会自动传给之后新拉起的 HyperFrames Node 子进程。

打包 RAT 的 CLI smoke 和真渲染 smoke 都显式使用：

```text
node --require frontend/creatoros-module-resolver.cjs <hyperframes-cli> ...
```

而生产执行器当前实际使用：

```text
node <hyperframes-cli> render ...
```

同时安全收窄环境明确禁止透传 `NODE_OPTIONS`，所以子进程没有任何其他渠道加载解析器。结果是：**构建验收路径能通过，用户机生产路径却稳定报模块找不到**。

日志里的错误截断逻辑只保留 stderr 末尾 300 个字符，把 Node 报错开头的具体模块名裁掉了，因此不能从本份日志诚实声称缺失模块的确切名称；结合 bundle 的 external 清单与分层位置，`sharp` 是首要嫌疑，但确定根因是“生产子进程缺模块解析器”，不依赖猜中某一个包名。

## 已排除项

- **不是 AI/编导失败**：分镜、卡片、B-roll、素材匹配、字幕、导演决策均成功。
- **不是补帧超时**：渲染未进入捕帧，不可能到缺帧检测或补帧阶段。
- **不是 FFmpeg**：日志中没有编码启动、ffmpeg 或 ffprobe 失败。
- **不是重试型网络抖动**：两次独立渲染均在同一启动点、以同一模块加载错误失败。
- **不是应用崩溃或数据未刷盘**：应用最后正常关闭，sidecar 退出码为 0。

## 同日志中的其他非本次主因问题

- 本地转写曾报 `@xenova/transformers` 无法加载，属于另一处 Windows 运行时依赖闭包问题。
- 智能检索使用的随包 Chromium 曾在 180 秒内未就绪，属于浏览器启动/资源问题。
- 早先有文本模型额度不足记录，但后续脚本和视频决策已成功，不是这次成片渲染失败原因。

这些旁证说明该用户所用 Windows runtime 的依赖消费路径需要整体复核，但不能把它们混成同一个失败。

## 最小安全下一步

1. 让生产 HyperFrames 子进程显式、按绝对路径加载同一 `creatoros-module-resolver.cjs`，不能靠 `NODE_OPTIONS`，也不能扩大子进程密钥环境。
2. 把正式执行器的 argv 形状纳入测试，确保 Windows 分层 runtime 下生产路径与 RAT 路径完全一致。
3. Windows 真机从安装包启动，走一次短视频真渲染，必须观察到捕帧、编码和有效 MP4 后才算通过。
4. 改善错误保留：记录脱敏后的首段和末段错误，避免再次裁掉 `Cannot find package '<name>'` 中的包名。
5. 修复后重新出 Windows 安装包；旧包上的重复重试没有意义。

本任务只完成诊断，不把尚未实施的代码修复或新安装包写成已完成。
