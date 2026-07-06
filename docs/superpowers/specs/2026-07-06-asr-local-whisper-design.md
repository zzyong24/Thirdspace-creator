# SPEC — 逐字稿 ASR 改选配 + 未配时本地 Whisper 回退(T-160)

> 状态:待用户过目 · 2026-07-06 · 关联 T-151 A(逐字稿)/T-147(桌面化)
> 一句话:ASR 从「必配 key 才能转写」变「选配」——没配 API 就**下载本地 Whisper(small/可选级)自己跑**,零 key。参考 msg-collect。

## 1. 问题

- 逐字稿走 `transcribe.audio` capability:`transcribe-runner` 的 `resolveTranscribeSpec(ctx)` 解析用户配的 ASR(OpenAI 兼容 provider,如硅基流动 SenseVoiceSmall)。
- **未配 → 抛 `TranscribeConfigError` → 整个逐字稿链停**(runner markFailed + 引导去配)。
- 后果:新用户开箱**必须先配一个 ASR key** 才能转写存量作品逐字稿(T-151 A 卡点)。门槛高。

## 2. 目标

ASR **选配**:
- 配了 API → 照旧走用户的 provider(硅基流动等,快、准)。
- **没配 → 回退本地 Whisper**:首次自动**下载 Whisper 模型(默认 small,用户可选 tiny/base/small/medium 级)**,本地跑推理,**零 key、零外部 API**。
- `resolveTranscribeSpec` 未配时不再抛错,而是返回**本地 whisper spec**。

## 3. 设计

### 3.1 本地 Whisper 适配器(ai-worker multimodal registry)
在 `multimodal-factory` 注册一个新 provider(如 `whisper-local`),实现 `transcribeAudio(spec, {audioBytes}) → {text, language?}`:
- 惰性加载模型(首次调用下载 + 缓存,后续复用)。
- 输入 audioBytes(runner 已从 iesdouyin 取到音频)→ 本地推理 → 文本。

### 3.2 实现选型(**关键决策,待定/参考 msg-collect**)
| 选项 | 说明 | 取舍 |
|---|---|---|
| **A. Transformers.js**(`@xenova/transformers`) | 纯 JS/WASM 跑 Whisper,从 HF 下载模型,无外部二进制/python | **推荐**:纯 JS、桌面化(T-147 Tauri/Electron)零依赖、跨平台一致。慢于原生但够用 |
| B. whisper.cpp 二进制 | 下载/内置 whisper.cpp binary + ggml 模型,spawn 子进程 | 快(原生),但要按平台分发二进制 + 编译,打包复杂 |
| C. nodejs-whisper / smart-whisper | node 绑定 whisper.cpp | 介于 A/B,需 native 编译 |

> **需你拍板 / 给 msg-collect 实现路径**:msg-collect 用的哪种?若能给我 msg-collect 那块代码/路径,我照它做;否则默认 **A(Transformers.js)**——最契合桌面化零依赖。

### 3.3 模型下载 + 缓存
- 缓存目录:`~/CreatorOS/models/whisper/<level>`(或复用存储 root 下 `models/`)。首次下载(small ~150–500MB)带进度。
- 级别:默认 `small`(中文效果/体积平衡);设置里可选 tiny/base/small/medium(选大更准更慢更占空间)。
- 幂等:模型在缓存则直接用,不重下。

### 3.4 resolveTranscribeSpec 回退
- 有用户配的 `transcribe.audio` provider/model/key → 返回该 spec(照旧)。
- 无 → 返回 `{ provider: "whisper-local", model: <settings 选的级别 ?? "small">, kind: "audio" }`,**不抛 TranscribeConfigError**。
- runner 不再因未配停整链;转写走本地。

### 3.5 进度 / UX
- 首次下载模型:进度反馈(复用 T-152 job 进度,阶段「下载 Whisper 模型 M/N MB」)。
- 转写:逐 aweme 进度照旧。
- 设置页:ASR 卡从「必配」改「选配」——加一句「不配则用本地 Whisper(免 key,首次下载模型)」+ 级别选择器(可选)。

### 3.6 改动面
- ai-worker:`whisper-local` 适配器(模型下载/缓存/推理)+ 注册进 factory。
- `resolveTranscribeSpec`:未配 → 本地 spec 回退(不抛)。
- 设置:ASR 卡文案「选配」+ 级别选择(可选,默认 small)。
- 依赖:加 `@xenova/transformers`(方案 A)或 whisper 二进制分发(方案 B)。

## 4. 测试(TDD)
- resolveTranscribeSpec:有配 → 用户 spec;无配 → whisper-local spec(不抛)。
- whisper-local 适配器:给定 audioBytes → 返回 {text}(测试用小模型/fake,不真下 500MB)。
- 模型缓存幂等:第二次不重下。
- runner:未配 ASR 不再 markFailed 整链(走本地)。

## 5. 不做(YAGNI)
- 实时流式转写(批处理即可)。
- GPU 加速(CPU 够用;桌面机型不定)。
- 多语言模型微调(用现成 Whisper 多语)。

## 6. 需不需要过 gate?
**加法能力(多一个 ASR 后端 + 回退),不改数据归属/方向**——按铁律不需新 spec-review gate。但**实现选型(A/B/C)需你拍板**(尤其 msg-collect 用哪种)。拆 1 Task(=本 T-160)。
