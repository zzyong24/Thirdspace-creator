# SPEC — 逐字稿 ASR 改选配 + 未配时本地 Whisper 回退(T-160)

> 状态:✅ 已实现(方案 A · main · 2026-07-06;真机端到端待验)· 关联 T-151 A(逐字稿)/T-147(桌面化)
>
> **实现落点(T-160)**:用户拍板方案 A(Transformers.js)。
> - ai-worker:`src/runtime/multimodal-whisper-local.ts`(`whisper-local` 适配器 + 默认 pipeline provider[memo 幂等] + `createFfmpegPcmDecoder`)+ `index.ts` 导出;依赖 `@xenova/transformers@^2.17.2`。
> - **音频解码定论**:douyin 采集音频是 **16kHz mono 64k MP3**(`streamAudioFromVideo`),采样率/声道已对但需解 MP3→f32le PCM。**复用项目已装的 ffmpeg**(douyin-cdp 抽音在用,**非新增重依赖**)`ffmpeg -i pipe:0 -f f32le -ar 16000 -ac 1 pipe:1` → Float32Array。decode/pipeline 可注入,单测用 fake(不真下模型、不 spawn 真 ffmpeg)。
> - `frontend/src/server/ai/multimodal/resolve.ts`:`resolveTranscribeSpec` 未配**不再抛**,回退 whisper-local spec(级别 env `CREATOROS_WHISPER_LEVEL` 或默认 small)。
> - host `persistence-client.ts`:asrRegistry 注册 `whisper-local`。设置 ASR 卡文案改「选配」。
> - **真机待验**:真下 whisper small(~几百 MB)+ 真 douyin 音频端到端转出中文;级别选择器进 UI + 首次下模型进度接 T-152 job 进度(均标 TODO,未做)。
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

### 3.2 实现选型(**关键决策 —— 已查 msg-collect**)
**msg-collect 实测用的是 Python `faster-whisper==1.2.1`**(`~/Workbase/Msg-collect`):`WhisperModel(size, device="cpu", compute_type="int8")`,模型首用自动下到 `~/.cache/huggingface`(tiny ~75MB / medium ~1.5GB),默认 tiny,可升 small/medium,支持 CPU/CUDA。**但它是 Python 应用**;CreatorOS 是 Node/Next.js(+ 桌面化 Tauri)—— faster-whisper **无法直接搬进 Node**。选型:

| 选项 | 说明 | 取舍 |
|---|---|---|
| **A. Transformers.js**(`@xenova/transformers`) | 纯 JS/WASM 跑 Whisper,同款 Whisper 模型从 HF 下载,无 Python/二进制 | **推荐**:Node 原生、桌面化零依赖、跨平台一致。**把 msg-collect 的 Whisper 能力移到 Node**(同模型同 UX:tiny/small 默认、HF 缓存),只是换库。CPU-WASM 慢些但够用 |
| B. spawn Python `faster-whisper` | 子进程调 Python(与 msg-collect 完全一致) | **与 msg-collect 逐行对齐**,但**要求用户机装 Python + faster-whisper**——桌面分发极重、非 Node 用户装不上,不推荐 |
| C. whisper.cpp 二进制 / node 绑定 | 原生二进制 spawn / native 绑定 | 快,但按平台分发/编译二进制,打包复杂 |

> **我的判断 + 推荐 A**:msg-collect 给的是**功能参照**(本地 Whisper、自动下模型、tiny/small 默认、CPU),这些 Transformers.js 都能在 Node 里等价实现,且不背 Python 依赖(对桌面化 T-147 至关重要)。B 逐行对齐但把 Python 运行时塞进 Node 桌面应用,得不偿失。**除非你要求与 msg-collect 完全同栈(B),否则我按 A 实现。**

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
