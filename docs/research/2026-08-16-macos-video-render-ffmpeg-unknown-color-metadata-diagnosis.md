# macOS 整片渲染 FFmpeg 失败诊断

> 任务：T-852  
> 日期：2026-08-16  
> 范围：只读核对当前 CreatorOS 正式运行态、加密日志、正式 contract 回读、原始素材元数据与随包 FFmpeg 6.0 无落盘复现；未取消、重试或修改任务、素材、模型配置和业务代码。

## 结论

本次失败不是 `ffmpeg version 6.0` 本身，也不是整片过长、字幕、磁盘空间或捕帧编码阶段失败。真实根因是：

1. AI 生成视频素材 `asset-693b96ef-9803` 是可正常完整解码的 H.264/yuv420p MP4，但没有声明
   `color_space`、`color_primaries`、`color_transfer`，随包 ffprobe 全部读成 `unknown`。
2. 当前执行器把任何“不是明确 BT.709”的素材都送入
   `colorspace=all=bt709:fast=0,format=yuv420p`。
3. 随包 FFmpeg 6.0 无法从未知输入色彩原色推导转换矩阵，确定性返回：
   `Unsupported input primaries 2 (unknown)`，随后滤镜网络以 `Invalid argument` 退出。
4. 错误包装只保留 FFmpeg stderr 的前 400 字符。FFmpeg 先打印版本和编译配置，真正错误位于尾部，
   因而用户和任务记录只看到启动横幅，根因被截掉。

重试任务使用完全相同的输入和转换参数，因此在相同位置再次失败；继续盲目重试无效。

## 锁定的真实上下文

| 对象 | 真实 ID / 状态 |
| --- | --- |
| 账号 | `acct-ae1a8346-9`（月明水清深） |
| 项目 | `project-693b96ef-9087`（20260817｜AI 的问题不是不会写，而是上下文会断） |
| 主输出 | `output-693b96ef-9104` |
| 口播稿 | `artifact-693b96ef-9112` / current `artifactversion-693b96ef-9120` |
| Production | `production-693b96ef-9879`；两次任务失败后仍回读为 `rendering` |
| 首次渲染 | `ai-task-693b96ef-10252`，13:13:52Z 开始，13:15:44Z 失败 |
| 重试渲染 | `ai-task-693b96ef-10434`，13:16:47Z 开始，13:18:29Z 同因失败 |

两次任务都物化相同 7 项输入。步骤流均显示：

1. 工具链检测通过；
2. 主口播 `asset-693b96ef-10107`（HEVC、75.0 秒）完成高质量 mezzanine；
3. 刚进入 `asset-693b96ef-9803`（H.264、6.6 秒）高质量 mezzanine 即失败；
4. 尚未进入 HyperFrames 捕帧、补帧、整片编码或交付检查。

因此故障边界精确落在这一条 B-roll 的 FFmpeg 输入预处理，而不是整条时间线。

## 素材与工具链证据

正式 `assets.get` 回读 `asset-693b96ef-9803`：

- MIME：`video/mp4`
- 大小：1,303,762 bytes
- 尺寸：768×1344
- 时长：6.583 秒
- 视频：H.264 High / yuv420p / 24 fps
- 音频：AAC LC

随包 ffprobe 6.0 的关键结果：

```text
color_space=unknown
color_transfer=unknown
color_primaries=unknown
```

同一个随包 FFmpeg 6.0 对源文件执行完整解码可成功；加入生产代码当前使用的
`colorspace=all=bt709:fast=0,format=yuv420p` 后，无落盘复现立即失败：

```text
[Parsed_colorspace_0] Unsupported input primaries 2 (unknown)
Error while filtering: Invalid argument
Failed to inject frame into filter network: Invalid argument
Error while processing the decoded data for stream #0:0
```

作为对照，主口播 `asset-693b96ef-10107` 与后续真人 B-roll `asset-693b96ef-9856` 都明确携带
BT.709 三项标签；前者预处理已完成，后者没有同类元数据缺失。

## 代码因果链

- `backend/src/modules/execution/video-render/executor.ts` 的 `isStaticSafeH264` 要求三项色彩标签全部
  明确等于 `bt709`；unknown 素材不会走安全 remux。
- 同文件预处理逻辑把任一 unknown 视为“需要 SDR 转换”，对非 HDR 统一拼入
  `colorspace=all=bt709:fast=0`，但没有为未知输入声明安全的输入原色/传递/矩阵。
- `execFileAsync` 在失败时使用 `stderr.slice(0, 400)`，只留下横幅；同文件的 HyperFrames 错误已经
  有脱敏 head+tail 范式，但 FFmpeg 路径尚未复用。

现有单测覆盖已知 BT.709、已知 HDR 和最终交付缺标签失败，但没有覆盖“输入是可解码的
H.264/yuv420p，三项色彩元数据全部 unknown”的真实生成视频形状。

## 排除项与影响

- **不是 FFmpeg 缺失**：随包 ffmpeg/ffprobe 已成功发现并运行。
- **不是视频损坏**：源文件可被随包 FFmpeg 完整解码。
- **不是磁盘空间**：素材盘仍有约 76 GiB 可用。
- **不是字幕、卡片或整片捕帧**：失败发生在进入 HyperFrames 前。
- **不是随机故障**：首次与重试在同一素材、同一步骤、同一错误下退出。
- **影响面**：任何色彩三项为 unknown/缺失的生成视频或第三方 MP4 都可能触发；图片、明确 BT.709
  视频和已知 HDR 视频不属于这次同一根因。
- **附带状态问题**：正式回读中 Production 在两次任务失败后仍为 `rendering`，需要与根因修复一起
  关闭“永久渲染中”的状态残留。

## 用户当前可选与永久修复约束

在代码修复前，移除/替换 `asset-693b96ef-9803`，或先把它转成明确带 BT.709 色彩标签的视频，可以
绕开本次确定性失败；本次诊断未替用户执行这些修改。

永久修复应同时满足：

1. unknown SDR 输入采用经真实 FFmpeg 6.0 验证的安全归一策略，不把 unknown 冒充已知 HDR；
2. 已知 BT.709 继续优先无损路径，已知 HDR→SDR 色调映射不回归；
3. FFmpeg 错误保存脱敏首尾及首条因果错误，UI 不再只显示版本横幅；
4. 失败终态同步解除 Production 的 `rendering`；
5. 用当前素材形状补先红后绿测试，并以随包 FFmpeg 6.0 真实夹具和隔离全链验证。

对应实现任务：T-853。
