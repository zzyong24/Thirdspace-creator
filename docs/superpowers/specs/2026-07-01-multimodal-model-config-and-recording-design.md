# 多模态 model-config + L5 录制阶段设计

> 状态:草案(待 spec-review gate)。属**改架构**(新增多模态模型解析层 + 数据归属:生成素材落本地对象存储),按 CLAUDE.md 铁律须**过审(verdict≠FAIL)才准开工**。
> 关联:[生命周期重设计 §3.5/§5.3](2026-07-01-lifecycle-redesign-creation-first.md)、[产品定位](../../产品定位.md)、记忆 `multimodal-models-user-configurable`。
> 引用任务:BACKLOG **T-020(L5 录制)**。

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
- **provider 工厂**:`generateImage(spec, {prompt, aspectRatio}) → bytes` / `generateVideo(spec, {prompt, firstFrame?}) → bytes|taskId`。按 `provider` 分派到各厂商适配器(先实现 `minimax` 适配器:调 MiniMax image/video REST API;结构留口子,加 provider = 加适配器不改上层)。
  - **优先探 Vercel AI SDK 的 `experimental_generateImage`**:若它已支持某 provider 的 image model,图这条直接用 SDK 抽象(与文本同栈);SDK 不支持的(video、MiniMax 专有)走自建 REST 适配器。落地时先验 SDK 能力边界再定。

### 2.3 与 video-asset-kit 的关系(方法论,非运行时依赖)
不 shell 出 `mmx`/`capture.py`。**移植其决策逻辑**为本产品的 UX/prompt 约束:
- 录制页 AI 生成区显式标「AI 图/视频只当隐喻点缀,≤1-2 个;真证据你自己截/录」。
- prompt 模板内置「英文最稳 + 扁平/单色/no text + 主体+隐喻含义」的生成指导(video-asset-kit §2/§3)。
- 动态概念→引导文生视频、静态→文生图、抽象技术概念→提示"别硬上 AI,用真截图"。

## 3. asset.generate 节点/runner(新增)

一个生成素材的 AI 任务(dispatch 同 script.draft 那样经 persistence-client):
- **入**:`{ projectId, prompt, kind: "image"|"video", aspectRatio? }`(prompt 由用户在录制页填,或从分镜"画面"字段带)。
- **跑**:`resolveMultimodalSpec(ctx, kind==="image"?"image.generate":"video.generate")` → `generateImage/Video(spec, …)` → 拿 bytes。
- **落**:bytes → 对象存储(P3 local-fs,presigned PUT 或直写) → 建 `asset`(assets 模块)→ 记为**候选**(`resultType: "generated_asset"` 或复用 asset 采纳门)。
- **采纳**:人在录制页确认候选 → 绑定项目 + 入用料链(A4)。未采纳不占用/不污染料库。
- **失败**(无 key / provider 报错 / 内容审核)→ cancelTask + UI 显失败+原因,不假成功。

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

- **M1 多模态解析层**:MultimodalSpec + resolveMultimodalSpec(复用 resolve 优先级)+ provider 工厂 + minimax image/video 适配器(先探 Vercel SDK `experimental_generateImage` 边界)。单测优先级/投影/适配器。
- **M2 asset.generate 节点**:runner + dispatch(persistence-client)+ 落对象存储 + 建 asset + 候选/采纳绑定用料链。fake 生成器注入验装配+落盘。
- **M3 设置页多模态配置**:image.generate/video.generate 两 capability 的 model-config 表单(复用 T-128 cc-switch);未配诚实态。
- **M4 录制页 UI**:素材清单(material.match)+ 拖拽上传绑定(P3)+ AI 生成区(asset.generate + video-asset-kit 决策提示 + 未配引导)。
- **M5 验收**:各片三步验证 + 真链路(有 key 则真出图/视频;无则 fake 注入 + 诚实标注)。

## 9. 开放问题(实现时定,默认假设先走)

- Vercel AI SDK `experimental_generateImage` 对 MiniMax/用户 provider 的支持边界 —— M1 落地时先探,支持就用 SDK 抽象、不支持走自建 REST。
- MiniMax image/video REST API 的鉴权/入参/异步 taskId 轮询细节 —— M1 读 MiniMax 官方文档定(video 是异步任务,需轮询下载,和文本同步不同)。
- 生成 asset 的候选采纳走哪条门:复用 material_list/asset 采纳,还是新 `generated_asset` resultType —— M2 看现有 assets 采纳链定,优先复用。
- aspectRatio 默认:抖音竖屏 9:16(文生图直接配;文生视频 MiniMax 默认 16:9 需后期裁,先只标注不自动裁)。
