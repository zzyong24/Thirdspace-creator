# 成熟视频项目的画幅、转码与平台清晰度交付方案（T-761）

## 一句话结论

CreatorOS 当前问题不是单纯把 `CRF 18` 调低就能根治，而是正式链路把“代理文件”当成最终渲染源，并连续进行了多次有损 H.264 编码。成熟项目普遍把预览代理与正式渲染源分离，并只做一次可控制、可验证的平台交付编码。

## CreatorOS 当前链路

```text
原始素材（本例 HEVC 1080×1920 / 60fps / 约 22.15Mbps）
  ↓ 全部视频强制转 H.264 proxy（CRF 18 / veryfast / GOP 30）
正式合成读取 proxy
  ↓ HyperFrames 默认 standard（H.264 / CRF 18 / medium）
render_raw.mp4
  ↓ CreatorOS 再次 H.264（CRF 18 / medium）
final.mp4（本例 1920×1080 / 30fps / 约 3.25Mbps）
  ↓ 抖音再次转码，网页“智能”档实播 1280×720
```

也就是说，原始画面在上传平台前已经经历最多三代有损编码，之后还要承受平台二次转码。

## 其他成熟项目怎么做

| 项目 / 规范 | 成熟做法 | CreatorOS 当前差距 |
| --- | --- | --- |
| Kdenlive | 项目 profile 在制作前锁定尺寸、画幅、fps、色彩；低清 proxy 只用于编辑，正式渲染自动换回原始素材 | proxy 被直接用于正式合成；存量项目无画幅时仍可静默兜底横屏 |
| HandBrake | 使用目标设备/发布用途 preset；Creator preset 会保留更高质量以减少平台再编码的代际损失；帧率可 Same as Source 或 Peak Frame Rate | 固定 30fps，不读取主素材帧率；没有“抖音横屏/竖屏交付 preset” |
| Remotion | 正式 renderer 原生暴露 CRF、目标视频码率、maxRate、bufferSize、x264Preset、pixelFormat 等交付参数 | CreatorOS 只有固定 CRF 18，没有目标码率、峰值约束或内容级 profile |
| HyperFrames | `standard=CRF18/medium` 只用于一般用途；正式交付可用 `high=CRF15/slow`，也可直接指定 `--video-bitrate 10M` | CreatorOS 只传 `--fps`，既未使用 high，也未使用目标码率；HyperFrames 已编码后又被 CreatorOS重复编码 |
| Netflix VMAF | 用 VMAF/SSIM 等感知指标比较参考与压缩版本，把质量验证自动化 | 只校验文件存在、布局和基础元数据，没有压缩代际质量门 |
| TikTok 官方创意规范 | 手机信息流优先 9:16、至少 720p，并要求在 UI safe zone 内保持文字可读 | 只保存画幅，不在源素材与交付画幅冲突时做发布前硬提醒 |
| Apple / YouTube 交付参考 | H.264 1080p 常见交付参考约 6–8Mbps（30fps）；YouTube 对 1080p60 给出 12Mbps，并建议保持原始录制帧率 | 本例 1080p30 实际仅约 3.25Mbps，且还要再被抖音压缩 |

## 行业方案带来的直接判断

### 1. 正式渲染不能继续读取 CRF18 proxy

Kdenlive 的 proxy 是性能优化，不是交付素材。正式渲染必须回到原始素材；如果原始 HEVC/VFR 不利于精确寻帧，应生成“编辑中间格式”，而不是普通发布级 H.264 proxy。

可选中间格式：

- 直接让 HyperFrames/FFmpeg从原始素材逐帧读取；
- 或临时生成高质量、短 GOP 的 mezzanine（例如 ProRes / FFV1 / 高质量 intra 编码），仅用于正式合成，完成后清理；
- 低清 H.264 proxy 继续只供预览和交互，不进入正式 render inputs。

### 2. HyperFrames 输出应当直接成为交付文件

HyperFrames 已完成 H.264 编码后，CreatorOS 不应再用 CRF18重新压一遍。若只需要 `faststart` 或容器整理，应使用无损 remux（`-c copy`），不重新编码视频流。

正式质量由 HyperFrames 一次决定：

- 优先验证 `--quality high`（CRF15 / slow）；
- 或为平台交付使用目标码率，例如从 `--video-bitrate 8M` / `10M` 做真实作品 A/B；
- 具体目标值必须用文字密集、录屏密集、人物运动三类样片测出，不能只凭单一视频定死。

### 3. 画幅必须是“本次交付 profile”，而不是静默兜底

- 在正式分镜前显示：主素材 `1080×1920 / 60fps`，本次成片 `1920×1080 / 30fps`；
- 画幅不一致时展示真实裁切/留白预览，并由用户确认；
- 存量项目缺画幅不得静默使用 landscape；
- 抖音可提供“竖屏 9:16”和“横屏 16:9”两个明确 preset，不强制所有抖音作品竖屏。

### 4. 帧率不应无条件固定为 30

成熟工具通常采用 Same as Source 或 Peak Frame Rate：

- 24/25/30fps 主素材维持原帧率；
- 50/60fps 素材允许保留，或在用户选择“体积优先”时限制为 30fps；
- 对纯口播而言 30fps通常可接受，但降帧属于可见的交付选择，不能隐式发生。

### 5. 成片必须有机器可执行的质量门

基础门：

- ffprobe：codec/profile、width/height、DAR、fps、pix_fmt、BT.709、音视频时长、平均与峰值码率；
- 画幅与用户确认的 delivery profile 必须一致；
- 正式成片不得引用 proxy assetId；
- 最终步骤若发生二次视频编码，测试直接失败。

质量门：

- 以无损/高质量合成主版本为 reference，对平台交付版本抽样跑 VMAF/SSIM；
- 增加文字密集帧、录屏细线条和人物运动三类固定回归样片；
- 低于质量阈值时阻止标记为“可发布”，但仍保留产物供诊断。

## 建议的 CreatorOS 根治链路

```text
原始素材 ───────────────┐
  └→ 低清 proxy（只预览）│
                         ↓
用户确认 delivery profile（横/竖、30/60fps）
                         ↓
正式渲染从原始素材或高质量 mezzanine 取帧
                         ↓
HyperFrames 一次编码（high 或平台目标码率）
                         ↓
无损 remux（如确有需要）
                         ↓
ffprobe + VMAF/SSIM + 文字可读性样片 Gate
                         ↓
平台上传文件
```

## 推荐实施顺序（尚未授权、未实施）

1. 去掉 `render_raw.mp4 → final.mp4` 的第二次 H.264 编码，改无损 remux。
2. 正式渲染换回原始素材；proxy 只留给预览。
3. 接入 HyperFrames `high` / `video-bitrate`，先以本次 5 分 32 秒真实项目做 3 个版本 A/B。
4. 增加画幅冲突确认与真实导出参数展示。
5. 加 ffprobe 硬门和 VMAF/SSIM 回归，再决定正式平台 preset 的最终数值。

前两项能直接消除两代无意义的有损压缩，是当前最优先的根治点；只把最终 CRF 从 18 改到 15，而继续使用 proxy并重复编码，不能算根治。

## 主要来源

- Kdenlive Project Profile: <https://docs.kdenlive.org/en/project_and_asset_management/project_settings/general_settings.html>
- Kdenlive Proxy Settings: <https://docs.kdenlive.org/en/project_and_asset_management/project_settings/proxy_settings.html>
- HandBrake Frame Rate: <https://handbrake.fr/docs/en/latest/technical/frame-rates.html>
- HandBrake Official Presets: <https://handbrake.fr/docs/en/latest/technical/official-presets.html>
- Remotion renderMedia: <https://www.remotion.dev/docs/renderer/render-media>
- Remotion Encoding Guide: <https://www.remotion.dev/docs/encoding>
- HyperFrames Rendering: <https://hyperframes.app/docs/3-guides/4-rendering>
- FFmpeg Codec Options: <https://www.ffmpeg.org/ffmpeg-codecs.html>
- Netflix VMAF: <https://github.com/Netflix/vmaf>
- TikTok Creative Best Practices: <https://ads.tiktok.com/help/article/creative-best-practices>
- Apple HLS Authoring Specification: <https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices/>
- YouTube Upload Encoding: <https://support.google.com/youtube/answer/1722171>

本报告只做调研和方案对照，未修改 CreatorOS 产品代码或已发布作品。
