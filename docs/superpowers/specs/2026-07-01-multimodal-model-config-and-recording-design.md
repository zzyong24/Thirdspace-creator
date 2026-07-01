# 多模态 model-config + L5 录制阶段设计

> 状态:**已过审(spec-review gate:CONCERNS→可开工,findings 已处置进本 SPEC)**。属**改架构**(新增多模态模型解析层 + 数据归属:生成素材落本地对象存储)。
> 关联:[生命周期重设计 §3.5/§5.3](2026-07-01-lifecycle-redesign-creation-first.md)、[产品定位](../../产品定位.md)、记忆 `multimodal-models-user-configurable`。
> 引用任务:BACKLOG **T-020(L5 录制)**。
>
> **⚖️ spec-review gate 裁决(独立跨上下文 reviewer + 2 探查子代理核实复用声明):verdict = CONCERNS,无 blocker → 可开工。** 合宪(多模态可配铁律真守住、AI 只产候选、不做成片合成)+ 抽象合理(MultimodalSpec 与文本 ModelSpec 并列、复用 resolveLlmConfig 优先级)+ 复用声明经探查全证实(ModelSpec/modelFor/resolveLlmConfig/model_configurations 自由 capability/secret_value 全存在)。3 major + 3 minor 已处置进下文(§2.2/§3/§6/§8/§9 内联「[gate-Fx]」标记):**F1** provider 工厂统一 image/video 上层返回契约(不 `bytes|taskId` union)+ 用假想非-MiniMax provider 签名证伪"上层不改";**F2** video 异步轮询状态机从开放问题**提升为 M2 必做**(+ fake 异步 provider 验轮询);**F3** 视频 aspectRatio **默认跟随项目横竖屏、竖屏优先**(合宪§8,不默认 16:9);F4 M1 先查死 `ai@7` `experimental_generateImage` 边界;F5 secret 明文存是继承债显式标注;F6 采纳门 §3/§9 二义 M2 回填收敛。

## 0. 背景 + 核心问题

L5 录制阶段要「凑齐这条内容要的素材」:①**素材清单**(AI 据脚本列需要哪些镜头/图,`material.match` 已做且跨模型健壮)②**用户上传**(拖拽绑定项目)③**AI 找/生成**(截图 + 文生图 + 文生视频)。

**③ 撞上项目铁律。** SPEC §5.3 定的正解 skill 是 `video-asset-kit`,但读其 SKILL.md 后发现:**它是 CLI(`mmx image/video generate`)且把 MiniMax 焊死**,并要用户在终端 `mmx auth login` 自己输 key。而项目铁律(记忆 `multimodal-models-user-configurable`)是:**多模态生图/生视频模型必须走 model-config 用户可配,绝不写死 MiniMax。** 直接 shell 出 `mmx` = 违铁律。

**所以 L5 的 AI 生成不能直接调 video-asset-kit 的 CLI。** 要建一个**多模态 model-config 抽象**(用户可配图/视频 provider + model + key),把 video-asset-kit 的**决策逻辑当方法论/UX 指导**(真证据 vs AI 隐喻 vs 数据卡、动态→文生视频/静态→文生图/抽象→别硬上),而不是当运行时依赖。

**问题:现有 model-config 是文本 LLM 形状。** `ModelSpec`(`apiFormat: anthropic|openai_chat`, baseUrl, model, token)+ `modelFor` 产出 Vercel AI SDK `LanguageModel`——图/视频不是 `LanguageModel`,API 形状也不同(MiniMax image API / Hailuo video API 各自异构)。需**新增一层多模态解析**,与文本 model-config 并列复用密钥存储/可配范式。

## 1. 设计原则(对照宪法)

- **模型中立、用户可配(铁律)**:图/视频模型经 model-config 解析,provider/model/key 用户在设置里配;MiniMax 是**候选之一**、非写死。加 provider 只配 capability,不改业务代码。
- **AI 只产候选、人采纳(铁律②)**:生成的素材是**候选 asset**,人在录制页确认后才绑定项目/入用料链,不直接物化。
- **诚实**:真生图/生视频要真 key + 花钱,本环境无法零成本端到端验;链路做通 + 单测覆盖装配/解析,**真产物验收诚实标注"需用户配 key 后验"**,不假绿。
- **不做编辑器/不做成片合成(宪法§8)**:只补素材(截图/图/视频片段)进 assets,不做 Remotion 式 16:9 成片合成(那是 open-design-remotion-video 的活,不用)。
- **复用优先**:对象存储(P3 local-fs)、assets 模块、用料链(A4 BillOfMaterials)、`material.match`(素材清单)全复用;只新增「多模态解析层 + asset.generate 节点 + 录制页 UI + 拖拽上传接线」。

## 2. 多模态 model-config 架构(核心新增)

### 2.1 capability(复用现有 `model_configurations` 表,零 schema 改)
`capability` 是自由串(T-123 起),表已支持任意 capability。新增两个约定 capability:
- `image.generate` —— 文生图模型档。
- `video.generate` —— 文生视频模型档。

用户在设置的 ModelConfigurationCard 里为这两个 capability 配 provider/model/baseUrl/key(复用 T-128 的 cc-switch 表单 + T-125 的 secret 存储)。**未配 → 该能力在录制页显"未配置生图/生视频模型,去设置配"**(诚实禁用,不假装能生成)。

### 2.2 MultimodalSpec + provider 抽象(新增,与文本 ModelSpec 并列)
文本走 `ModelSpec`+`modelFor`(chat completions)。多模态另立一条,因 API 形状不同:

```
interface MultimodalSpec {
  provider: string;      // "minimax" | "openai" | …(provider 名做开关,非 apiFormat)
  baseUrl: string | null;
  model: string;         // 如 "image-01"(MiniMax 文生图) / "video-01"(Hailuo)
  token: string;         // 用户自带 key(复用 secret 存储)
  kind: "image" | "video";
}
```

- **解析**:`resolveMultimodalSpec(ctx, capability)` —— 复用 T-126 的 `resolveLlmConfig` 同款优先级(库存密钥 > env > default 回退),投影成 MultimodalSpec。
- **provider 工厂(统一上层契约,`[gate-F1]`)**:`generateImage(spec, {prompt, aspectRatio}) → { assetBytes }` / `generateVideo(spec, {prompt, aspectRatio, firstFrame?}) → { assetBytes }`。**两者上层都只返 `{ assetBytes }`——异步 video 的「提交→轮询 taskId→下载」由 minimax 适配器内部消化**(上层不感知 taskId;不用 `bytes|taskId` union)。按 `provider` 分派到各厂商适配器。
  - **`[gate-F1]` 抽象须被证伪**:M1 不止实现 `minimax` 适配器,还要用**一个假想的非-MiniMax provider 签名**(如 OpenAI images / Runway video)反推、确认「加 provider = 加适配器不改上层」这个承诺真成立(上层契约 `{assetBytes}` 能容纳异步 provider);否则接口只是照 MiniMax 长出来的空头支票。
  - **`[gate-F4]` SDK 边界 M1 开头先查死**:项目用 `ai@^7.0.4`(探查证实)。M1 第一步先核 `ai@7` 是否导出 `experimental_generateImage` 及支持的 provider 列表 → **就此定死「图走 SDK 抽象 还是 自建 REST」再往下**,不并存两条路径到落地。video 无 SDK 标准抽象,走自建 REST。

### 2.3 与 video-asset-kit 的关系(方法论,非运行时依赖)
不 shell 出 `mmx`/`capture.py`。**移植其决策逻辑**为本产品的 UX/prompt 约束:
- 录制页 AI 生成区显式标「AI 图/视频只当隐喻点缀,≤1-2 个;真证据你自己截/录」。
- prompt 模板内置「英文最稳 + 扁平/单色/no text + 主体+隐喻含义」的生成指导(video-asset-kit §2/§3)。
- 动态概念→引导文生视频、静态→文生图、抽象技术概念→提示"别硬上 AI,用真截图"。

## 3. asset.generate 节点/runner(新增)

一个生成素材的 AI 任务(dispatch 同 script.draft 那样经 persistence-client):
- **入**:`{ projectId, prompt, kind: "image"|"video", aspectRatio? }`(prompt 由用户在录制页填,或从分镜"画面"字段带)。
- **跑**:`resolveMultimodalSpec(ctx, kind==="image"?"image.generate":"video.generate")` → `generateImage/Video(spec, …)` → 拿 bytes。
- **落**:bytes → 对象存储(P3 local-fs,**直写**:M2 给 `ObjectStoragePort` 加了服务端 `putObject(storageKey, bytes)`,三适配器 mock/local-fs/s3 全实现——后台 runner 已持有字节,不走 client presigned PUT 的 HTTP 回环;AssetsService 仍是唯一存储调用方 SPEC §15) → 建 `asset`(assets 模块新增 `createGeneratedAsset`:mint key → putObject → insertAsset+insertAssetFile,asset 生下来 active 但**未绑项目**;字节此刻已持久化,不管采纳与否都在) → 记为**候选**(`resultType: "generated_asset"`,assetId 走 recordCandidate 的 assetId 列 + resultData)。
- **采纳门(`[gate-F6]` 定论)**:**新增 `generated_asset` resultType**,其 confirm 分支**复用现有 asset 绑定门的端口/动作**(与 `material_link_list` 同一个 `AiMaterialLinksPort.link`),把已建的 asset 绑到当前项目 + 入用料链 A4(`entityType:"asset", role:"clip", stage:"production"`)。**依据**:探查确证现有唯一的 asset 采纳门 `material_link_list` 绑定的是**素材库里已存在**的 asset(assetId 已在库);asset.generate 的 asset 是从 AI 字节**新生**的,是 create-then-bind 语义——asset 在生成期就建好(与 research-runner 产出具体候选同构),故必须有一条自己的薄 resultType,但**绑定动作/端口复用**、不新造 link 逻辑。未采纳不绑项目/不污染料库(asset 仍在素材库可见)。
- **采纳**:人在录制页确认候选 → 绑定项目 + 入用料链(A4)。项目缺失时 confirm 成功但不绑(asset 仍在素材库)。
- **失败**(无 key `MultimodalConfigError` / provider 报错 / 内容审核 / **video 轮询超时**)→ cancelTask + UI 显失败+原因,不假成功。

## 4. L5 录制页(UI,复用为主)

三区:
1. **素材清单**(复用 `material.match`):AI 据脚本/分镜列「这条需要哪些镜头/图/素材」,每条标类型(真证据要自截 / 可截图 / 可 AI 生成 / 数据卡走图表)。
2. **用户上传**(新增接线):拖拽文件 → presigned PUT(P3)→ 建 asset → **绑定当前项目**(用料链)。复用 P3 上传 + assets + A4,只加前端拖拽区 + "上传即绑定"。
3. **AI 生成**(新增):对清单里"可 AI 生成"的条目,填/带 prompt → dispatch `asset.generate` → 候选素材 → 采纳绑定。显式挂 video-asset-kit 决策提示 + 未配模型时禁用引导去设置。

素材统一进作品 `assets/`,命名对位分镜(video-asset-kit §典型流水线)。

## 5. 复用 vs 新增

| | 复用 | 新增 |
|---|---|---|
| 存储 | 对象存储 P3(local-fs)、assets 模块、用料链 A4 | asset.generate 落盘→建 asset→绑定接线 |
| 素材清单 | `material.match`(已跨模型健壮) | 录制页清单 UI(标真证据/可生成分类) |
| 上传 | P3 presigned PUT | 前端拖拽区 + 上传即绑定 |
| 模型 | model-config 表 + secret 存储 + resolve 优先级范式 | **多模态解析层**(MultimodalSpec + resolveMultimodalSpec + provider 工厂 + minimax 适配器)、image/video capability、设置页多模态配置 UI |
| 生成 | dispatch/候选/采纳门范式 | asset.generate 节点 |

## 6. 数据归属

生成/上传的素材字节落**本机对象存储**(local-fs,与抖音 cookie `.auth/`、DB 同属本机私有);多模态模型 key 存 `model_configurations.secret_value`(复用),本机私有、不入 Git。与本地优先存储(L0)一致。

## 7. 验证策略(诚实)

- **可零成本验**:多模态解析层(resolveMultimodalSpec 优先级、MultimodalSpec 投影)单测;asset.generate 装配 + 落盘 + 建 asset + 绑定(用 fake 生成器注入已知 bytes)单测;录制页 UI 渲染/上传接线组件测;设置页多模态配置读写。
- **需用户配 key 才能端到端验**(诚实标注):真 MiniMax(或用户配的其它)生图/生视频出真产物——本环境无 image/video key,链路做通 + 注入 fake 生成器验装配,**真产物验收标注"待用户配 image.generate/video.generate key 后验"**,不假绿。

## 8. 实现切片拆解(过审后拆进 BACKLOG,全做无阶段)

- **M1 多模态解析层**:MultimodalSpec + resolveMultimodalSpec(复用 resolve 优先级)+ provider 工厂 + minimax image/video 适配器。**`[gate-F4]` 第一步先核 `ai@7` `experimental_generateImage` 边界,定死图走 SDK 还是自建 REST 再往下。`[gate-F1]` 上层契约统一 `{assetBytes}`(异步 video 轮询在适配器内消化,不 union);用一个假想非-MiniMax provider 签名反推证伪"上层不改"。** 单测优先级/投影/适配器。
- **M2 asset.generate 节点**:runner + dispatch(persistence-client)+ 落对象存储 + 建 asset + 候选/采纳绑定用料链。**`[gate-F2]` video 异步轮询状态机是 M2 必做子任务(非开放问题)**:定义 task 态(submitted/polling/succeeded/failed/timeout)+ 轮询间隔与上限 + 超时即 cancelTask+UI 失败态;**fake 生成器除注入已知 bytes 外,加一个 fake 异步 provider(先返 taskId、N 次轮询后返 bytes)验轮询装配**,否则异步链路零覆盖。`[gate-F6]` 采纳门定论后回填 §3/§9 二义(优先复用现有 asset 采纳门)。
- **M3 设置页多模态配置**:image.generate/video.generate 两 capability 的 model-config 表单(复用 T-128 cc-switch);未配诚实态。
- **M4 录制页 UI**:素材清单(material.match)+ 拖拽上传绑定(P3)+ AI 生成区(asset.generate + video-asset-kit 决策提示 + 未配引导)。**`[gate-F3]` 生成区 aspectRatio 默认跟随项目横竖屏、竖屏优先**(合宪§8):能配竖屏(如 MiniMax 支持 9:16)就直接生成竖屏,别默认 16:9;provider 只出横屏时**显式提示"该 provider 仅出 16:9,需你自行裁 9:16"**,不静默产横屏低质候选。
- **M5 验收**:各片三步验证 + 真链路(有 key 则真出图/视频;无则 fake 注入 + 诚实标注)。

## 9. 开放问题(实现时定,默认假设先走)

- Vercel AI SDK `experimental_generateImage` 对 MiniMax/用户 provider 的支持边界 —— M1 落地时先探,支持就用 SDK 抽象、不支持走自建 REST。
- MiniMax image/video REST API 的鉴权/入参/异步 taskId 轮询细节 —— M1 读 MiniMax 官方文档定(video 是异步任务,需轮询下载,和文本同步不同)。
- ~~生成 asset 的候选采纳走哪条门:复用 material_list/asset 采纳,还是新 `generated_asset` resultType~~ **[gate-F6 M2 已定]**:**新增 `generated_asset` resultType**,confirm 分支**复用现有 asset 绑定门的端口/动作**(`AiMaterialLinksPort.link`,与 `material_link_list` 同)。理由:现有唯一 asset 采纳门 `material_link_list` 绑的是**库里已存在**的 asset;asset.generate 是 create-then-bind(runner 生成期就建好 asset,字节先落盘、候选带真 assetId),confirm 只做「绑项目 + 入用料链」。绑定逻辑零重造,仅加一条薄 resultType 承载「先建后绑」语义。见 §3。
- aspectRatio 默认:抖音竖屏 9:16(文生图直接配;文生视频 MiniMax 默认 16:9 需后期裁,先只标注不自动裁)。
