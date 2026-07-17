# 生图/生视频主流厂商盘点与适配策略(T-379)

> 2026-07-17 · 背景:用户批评「生图只有 minimax 完全不够」,要求补齐主流生图/生视频模型支持。
> 本文盘点 2026 主流厂商 + API 形态,论证「一个 OpenAI images 兼容 adapter 覆盖一大片」的关键结论,并给出生视频的裁决依据。
> 结论拍板:**用户(2026-07-17)**。工程落点 = **T-379:ai-worker 新增 openai-images 兼容 adapter**。纯能力增强,不改数据归属/定位,无需 gate。

## ① 现状(仓内代码,已核实)

- 多模态适配层在 `ai-worker/src/runtime/multimodal-factory.ts`:统一契约 `MultimodalProviderAdapter`(generateImage / generateVideo / transcribeAudio),**工厂 keyed by `provider`**,上层只见 `{ assetBytes }`,同步/异步差异在适配器内消化([gate-F1] 注释已写死「加 provider = 加一个适配器,不改上层」)。
- 现有生图/生视频适配器**只有一个**:`multimodal-minimax.ts`(image-01 文生图 + video-01/Hailuo 文生视频,自建 REST)。
- ASR 已走 OpenAI 兼容(`multimodal-openai-asr.ts`),证明「兼容协议族 adapter」这条路在本仓已有先例。
- 文本层 T-325 已做 provider 预设目录(见 [2026-07-15-cc-switch-model-presets-research.md](2026-07-15-cc-switch-model-presets-research.md)),同样的「兼容格式收敛」判断:两 apiFormat(anthropic / openai_chat)覆盖国内主流。生图是同构问题。

## ② 2026 主流生图模型/厂商盘点

来源标注:【官方文档/已核实】= 本次 WebSearch/WebFetch 核过;【训练知识】= 凭已知,未逐一核实端点细节;【用户样例】= 用户 2026-07-17 提供。

| 厂商/模型 | 出品方 | 原生 API 形态 | 是否 OpenAI images 兼容 | 中转站(one-api/new-api 系)覆盖 | 结论 |
|---|---|---|---|---|---|
| gpt-image 系(gpt-image-1/2, DALL·E 3) | OpenAI | `POST /v1/images/generations`(即标准本身) | ✅ 原生 | ✅(new-api 官方文档明列)【官方文档/已核实】 | 兼容 adapter 直接覆盖 |
| Seedream(即梦图片) | 字节跳动/火山方舟 | 火山方舟专有 API;但聚合商已按 OpenAI images 格式转发(如 AIsa「Seedream via OpenAI-compatible Images API」)【已核实搜索结果】 | 中转后 ✅ | ✅ 常见 | 走中转即被兼容 adapter 覆盖 |
| Flux(Flux.1 pro/dev/schnell 等) | Black Forest Labs | 原生 BFL API 专有(异步 polling);Replicate/SiliconFlow/中转站普遍按 images/generations 暴露【训练知识】 | 中转后 ✅ | ✅ 常见 | 同上 |
| Nano Banana(Gemini 图像,gemini-*-image) | Google | 原生 Gemini generateContent(inline 图像);中转站普遍映射到 images/generations【训练知识】 | 中转后 ✅ | ✅ 常见(2026 国内中转站热门型号) | 同上 |
| MiniMax image-01 | MiniMax | 专有 `POST /v1/image_generation`(同步)【仓内代码】 | ❌ 原生不兼容;中转后 ✅ | ✅ | 已有专有 adapter,保留;走中转也可被兼容 adapter 覆盖 |
| 通义万相 / 混元图像 / 可图(Kolors)等国产 | 阿里/腾讯/快手 | 各家专有【训练知识】 | 中转后 ✅ | ✅ 部分 | 不单独适配,统一靠中转 |

### 关键结论(本文核心论证)

**one-api/new-api 系中转站(国内主流 LLM 网关)把生图统一暴露为 OpenAI 兼容 `POST /v1/images/generations`**:

- 请求 body:`model` / `prompt` / `size` / `n` / `response_format`("url" | "b64_json",另有 quality/style 等可选);响应:`created` + `data[]`,每项 `url` 或 `b64_json`。【官方文档/已核实:[new-api OpenAI Image 文档](https://doc.newapi.pro/en/api/openai-image/)】
- 即:上游无论是 gpt-image、Seedream、Flux 还是 Nano Banana,中转站在网关层已做协议归一,**下游只需说一种方言**。
- 用户真实样例佐证【用户样例,2026-07-17】:
  ```bash
  curl https://dudu.mom/v1/images/generations \
    -H "Authorization: Bearer <key>" \
    -d '{"model":"gpt-image-2-4K","prompt":"...","size":"1024x1024"}'
  ```
  dudu.mom 即 new-api 系中转;用户实际用法就是「一个兼容端点 + 换 model 字符串」。

→ **所以一个 OpenAI images 兼容 adapter(provider = "openai" 或 "openai-images",baseUrl 可配)能同时覆盖:OpenAI 官方、所有 new-api/one-api 系中转站、以及一切自称 OpenAI images 兼容的聚合商** —— 与文本层 openai_chat 的收敛逻辑完全同构。这正是 T-379 的做法。

## ③ 2026 主流生视频盘点

| 厂商/模型 | 出品方 | 原生 API 形态 | 是否有统一兼容标准 | 中转站暴露形态 | 结论 |
|---|---|---|---|---|---|
| Sora(sora-2 等) | OpenAI | `POST /v1/videos` 异步任务(create → poll → download content)【训练知识】 | OpenAI /v1/videos 是**事实候选**但尚未成行业标准 | 部分中转按 /v1/videos 转发,部分走专有透传 | 观察;若中转站收敛到 /v1/videos,做兼容 adapter 的首选目标 |
| Veo(veo-3.x) | Google | Gemini API 长时任务(operations 轮询)专有【训练知识】 | ❌ | 各站映射不一 | 不做通用适配 |
| Kling 可灵 | 快手 | 专有 API(JWT 签名鉴权 + 异步任务)【训练知识】 | ❌ | 多为专有透传 | 不做 |
| Seedance 即梦视频 | 字节/火山方舟 | 方舟专有异步任务【训练知识】 | ❌ | 同上 | 不做 |
| Hailuo 海螺(video-01 等) | MiniMax | 专有 `video_generation` 提交 + `query/video_generation` 轮询 + files 下载【仓内代码,已实现】 | ❌ | — | **已有专有 adapter,保留** |

### 裁决依据:本期只做生图兼容 adapter,生视频不做兼容层

1. **生图协议已收敛,生视频没有**。images/generations 是十年级标准(DALL·E 时代定型),中转站实现一致;视频各家仍是「专有异步任务 + 各自轮询/下载协议」,连 OpenAI 自己的 /v1/videos 也未被中转站普遍归一。**形态不统一硬做兼容层 = 每接一家都要 if-else,兼容层名存实亡,还不如专有 adapter 诚实。**
2. **仓内契约已为此留好口**:multimodal-factory 按 provider 分派、异步性封装在适配器内 —— 视频天然适合「一家一 adapter」,生图适合「一个协议族 adapter」。两种粒度并存不冲突。
3. **本期视频保留 minimax 专有 adapter**(已在跑、用户已配 key),不动。

### 后续视频适配建议(优先级)

1. **Sora(OpenAI /v1/videos)先做** —— 理由:①格式最有希望成为中转站归一目标(与 images 同一家、同一鉴权);②做完即同时覆盖官方 + 已按 /v1/videos 转发的中转站,杠杆最大。
2. 其次 **Kling 可灵**(国内创作者生态占有率高、抖音向内容适配好),专有 adapter。
3. Veo/Seedance 视用户需求再排;若届时中转站已把它们归一到 /v1/videos,直接被第 1 条覆盖,不用单写。

## ④ 被否决项及理由

| 被否决项 | 理由 |
|---|---|
| 为每家生图厂商各写专有 adapter(Seedream/Flux/Nano Banana/…) | 重复劳动:中转站已在网关层归一,N 个 adapter 的活一个兼容 adapter 就干完;且用户实际入口就是中转站(dudu.mom 样例),直连各家官方反而要用户配 N 个 key |
| 本期做生视频 OpenAI 兼容 adapter | 视频协议未收敛(见 ③ 裁决依据 1),现在硬做会按想象写协议、接第二家就崩;等 /v1/videos 被中转站普遍采用再做 |
| 用 Vercel AI SDK `generateImage`/`ImageModelV2` 走 SDK 抽象 | multimodal-factory.ts [gate-F4] 已查死:ai@7.0.4 下 @ai-sdk/openai image 导出为空、无 MiniMax provider 包、video 无 SDK 抽象;自建 REST 工作量相当且分层更干净(前次已拍板,本次维持) |
| 把 minimax 专有 image adapter 删掉、全走中转 | 用户已配 MiniMax 直连 key 且在跑;直连与中转并存零成本(工厂按 provider 分派),删了是无谓回归 |

## ⑤ 结论

- **拍板人 = 用户(2026-07-17)**:要求补主流生图模型,批评「生图只有 minimax 完全不够」;并提供 dudu.mom 中转样例指明真实使用形态。
- **工程落点 = T-379**:ai-worker 新增 **openai-images 兼容 adapter**(`multimodal-factory` 注册新 provider;实现 `POST {baseUrl}/v1/images/generations`,body: model/prompt/size/n/response_format,响应取 `data[0].url` 下载或 `data[0].b64_json` 解码 → `{ assetBytes }`;aspectRatio 翻译成 size)。baseUrl/model/key 全走 model-config 用户可配(项目铁律:多模态模型不写死)。
- 生视频本期不动:保留 minimax 专有 adapter;后续优先 Sora(/v1/videos),其次 Kling。

## 来源

- [new-api OpenAI Image 文档](https://doc.newapi.pro/en/api/openai-image/)(端点/字段/响应,已核实)
- [AIsa: OpenAI-Compatible Image Generations API(Seedream)](https://aisa.one/api/openai-compatible-image-generations)(搜索结果,佐证中转归一)
- [OpenAI image generation API 发布文](https://openai.com/index/image-generation-api/)
- 用户样例:dudu.mom curl(2026-07-17)
- 仓内代码:`ai-worker/src/runtime/multimodal-factory.ts` / `multimodal-minimax.ts` / `multimodal-openai-asr.ts`
- 其余各家原生 API 形态为训练知识,未逐一核实,已在表内标注
