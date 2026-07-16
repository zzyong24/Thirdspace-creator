# SPEC:制作阶段·脚本 tab「发布包生成」(T-350)

> 单平台(抖音)发布物料生成入口,落在制作阶段稿面。**本质=接线**:把系统已有的
> `platform.adapt` 生成+审核能力,暴露成稿面对话驱动的「一键生成发布物料」入口,采纳后回填
> 现有 publishPack。**不改数据归属、不改审核架构**(审核 SOP 单一真值化是正交任务 T-351)。
>
> 对齐 [docs/产品定位.md](../../产品定位.md):发布物料是创作产物(和脚本同级),不该手搓;
> 生成即过合规审核,把限流/删稿风险挡在发布前。

## 0. 一句话定义

制作阶段脚本 tab 的 `PublishPackSection` 加「生成发布物料」入口 → 触发新 chat 工具
`publish.package`(单平台抖音,复用 `platform.adapt` 模板/审核 SOP/schema)→ 右栏渲候选卡
(标题 / 简介 / 标签 / 封面文案 / 审核结论)→ 人采纳走现有 `publication_drafts` 物化链 →
publishPack 展示真物料。

## 1. AS-IS 现状(源码证据)

### 1.1 生成+审核能力已存在,只是没接到稿面
- **`platform.adapt` skill 完整可用**:`ai-worker/src/prompt/templates/platform-adapt.ts:46-90`——
  输出 `{drafts:[{platform,title,body,tags,coverIdea,auditFlags}]}`;**已内嵌 cheat-package 整套
  发布审核 SOP**(Tier1 硬规则5 命中自动改+记 auditFlags / Tier2 经验4 给建议 / 「工具名不算违规」更正),
  requiredFacets=positioning+targets,选填 topic/script。
- **runner 装配好**:`backend/src/modules/ai-runtime/platform-adapt-runner.ts:107`——
  `runPlatformAdapt(ctx,task,deps)`,`inputData.{outputId(必需),topic,scriptText,platforms}`;
  `platforms` 传 `["douyin"]` 即单平台(否则默认 4 平台 fan-out,:46)。按 `script.rewrite` capability
  解析模型(:143,未配回退默认,不写死)→ `runStructuredNode` → 产 `publication_drafts` 候选(:166-169)。
- **采纳物化链已通**:`backend/src/modules/ai/ai.service.ts:965-1003`——采纳 `publication_drafts` 候选
  逐 draft `createPublicationFromDraft(ctx, outputId, {platform,title,body,tags,coverIdea})`→
  真 Publication+revision(DATA-H06 稳定键 platform+title 去重防重铸)。

### 1.2 缺口:无生产入口 + 稿面纯占位
- **`publish.platform_adapt` 任务只有测试在建**(`ai.service.test.ts:439/859`),`frontend/src` 无任何
  生产触发点——dispatch 分支在 `persistence-client.ts:3601-3625` 等着,但没人建这个 task。
- **稿面 `PublishPackSection` 是被动占位**:`draft-workbench-page.tsx:186-284` 只读已存在 revision
  (`draft-workbench-data.ts:261-313` `readPublishPack`=listOutputs→listPublications→revisions),
  无发布行时显死文案「发布时会从脚本钩子生成标题草稿、选封面与标签」(:237),背后无生成逻辑。
- **chat 工具表无发布相关工具**:`backend/src/modules/ai-runtime/chat-tools.ts` 有
  topic.generate/script.draft/planning.thesis/material.*/calibration.diagnosis/review.* 等,
  **没有 publish/platform**——所以稿面对话驱动路径缺一个工具。

### 1.3 稿面交互范式(必须对齐,不新造)
稿面是**对话驱动候选**:按钮点击=`onOpenChat({functionKey, selection, autoSend:true, 话术})` 把话术
自动发进右栏常驻 Copilot(`DraftChatRail`)→ chat 工具 execute 产候选 → tool-result part 流回前端渲
`AdoptCandidateCard`/`chat-generate-card` → 人采纳走 confirm 门(铁律:AI 只产候选,不直接写实体)。
范本:`blind-predict-row.tsx`(functionKey=calibration.diagnosis)、`creation-flow-ctas.tsx`
(material.gather)、chat/route.ts:312-314(planning.thesis/script.draft 端口)。

### 1.4 已就位、复用不造
- 审核门整套:`script-review-runner`(L1 review_rules lint+L2 语义审)+ verdict 三态门
  `review-publish-gate.ts` + 报告卡 `script-review-gate.tsx` + 软门 `ReviewSoftGateHint`。
- 采纳物化链(§1.1)、候选卡渲染(`chat-generate-card.tsx` 轮询 task/candidate)。
- publishPack 读侧 `readPublishPack`、`CoverThumb`。

## 2. 目标不变量(TO-BE)

| ID | 不变量 |
|---|---|
| PP-01 | 脚本有版本(unlocked)即可在稿面**一键生成抖音发布物料**(标题+简介为主),不必绕去发布中心 |
| PP-02 | 生成物**逐条过 platform.adapt 内嵌审核 SOP**,审核结论(auditFlags)呈现给用户;硬规则命中已自动改成合规版 |
| PP-03 | 生成物是**候选**,人采纳才物化成 Publication+revision;AI 不直接写实体(铁律②) |
| PP-04 | 采纳后 publishPack **展示真标题/标签/封面创意**,替代占位文案;状态流转复用现有 revision |
| PP-05 | UI **复用稿面现有风格**(PublishPackSection 卡 + AdoptCandidateCard + 右栏对话),不新设计视觉 |
| PP-06 | 不改数据归属(走现有 publication_drafts→Publication 链)、不改审核架构(SOP 仍在 platform.adapt 模板内,重构见 T-351) |
| PP-07 | 文本生成走 model-config capability(script.rewrite,不写死模型),抖音单平台(targets=["douyin"]) |

## 3. 设计(接线方案)

### 3.1 新增 chat 工具 `publish.package`(单平台抖音)
- 落 `backend/src/modules/ai-runtime/chat-tools.ts`,加入 `ALL_CHAT_TOOL_NAMES`(否则 functionKey
  深链过不了 `function-key-invariant.test.ts` 不变量,T-265 病例)。
- execute:组装 `outputId + topic + scriptText`,以 `platforms:["douyin"]` 复用 `platform.adapt`
  模板+schema+审核(**不复制 prompt**,`getTemplate("platform.adapt")` 运行时取覆盖后对象)→
  产 `publication_drafts` 候选 `{drafts:[douyin 一条], outputId}`。
- 语义等价于把 `runPlatformAdapt` 的核心暴露成 chat 工具;实现上二者共用 template/normalize/
  采纳链,避免两套逻辑漂移(**SPEC 决**:是复用 runner 内核抽公共函数,还是 chat 工具内联同款
  `runStructuredNode` 调用——切片时按 codegraph 影响面定,优先抽公共不复制)。

### 3.2 稿面入口按钮(PublishPackSection)
- unlocked 且无发布行(publishPack=null 或非 published)时,卡内加「生成发布物料」按钮
  (**复用 blind-predict-row 按钮样式**,不新设计)。
- 点击 → `onOpenChat({functionKey:"publish.package", selection:content_output, autoSend:true,
  话术:"为这条内容生成抖音发布物料(标题+简介+标签),生成后过一遍发布审核"})`。

### 3.3 候选呈现 + 采纳
- 右栏渲候选卡(复用 `chat-generate-card`/`AdoptCandidateCard` 范式),展示:
  **标题 / 简介(body)/ 标签 / 封面文案(coverIdea)/ 审核结论(auditFlags)**。
- 采纳 → 现有 `publication_drafts` 物化链(§1.1,**零改动**)→ Publication+revision → publishPack 回填。
- **审核结论呈现**:auditFlags 逐条显(如「营销词『变现』→『跑通』」「✅ 无命中」),与
  `review-publish-gate` 三态门并存(门管脚本合规,auditFlags 管物料合规,正交)。

### 3.4 不做(明确边界)
- 不改审核架构 / 不动 review_rules / 不抽 SOP(→ T-351)。
- 不做真封面**图**生成(现只有 coverIdea 文本;coverAssetId 仍靠采集回填/手选,T-078)——SPEC §4 待决。
- 不做多平台入口(发布中心已有 platform.adapt 全平台链;稿面聚焦抖音单平台)。

## 4. 待决点(切片前定,不进 gate——不改架构/归属)

1. **标题候选数**:platform.adapt 每平台出**1 个标题**,非 cheat-package 的 3 候选。用户已弱化「×3」
   诉求(「不用刻意设计…参照现风格」)。**推荐**:单条标题 + 卡上「重新生成」换一版(最小改动);
   若要真 3 候选需扩 schema(单平台多 title 变体),留作可选增强不进本切片。
2. **采纳前可否编辑标题/简介**:推荐**采纳前允许内联改**标题+简介(手感更好,复用 chat-generate-card
   若已有编辑态则复用,否则采纳后在 publishPack/发布中心改)——切片时看现有卡能力定。
3. **封面**:本切片只透传 coverIdea 文本,不生成真图(硬缺口,单列不阻塞发布包)。

## 5. 复用清单(不重造)

| 复用 | 位置 |
|---|---|
| 生成+审核逻辑 | `platform.adapt` 模板 + schema + 内嵌审核 SOP(platform-adapt.ts) |
| 采纳物化链 | ai.service.ts:965-1003 → createPublicationFromDraft(**零改动**) |
| 候选卡渲染 | chat-generate-card.tsx / AdoptCandidateCard |
| 对话驱动入口范式 | onOpenChat/autoSend(blind-predict-row / creation-flow-ctas) |
| publishPack 读+展示 | readPublishPack + PublishPackSection + CoverThumb |
| 审核门 | review-publish-gate 三态门 + ReviewSoftGateHint(并存,不改) |

## 6. 验收(真机)

- AC-1:脚本存一版后,稿面 PublishPackSection 出现「生成发布物料」按钮;点击话术进右栏 autoSend。
- AC-2:生成候选卡显 标题/简介/标签/封面文案/**审核结论**;含营销词/绝对化用语的输入 → auditFlags
  记录已改成合规版(硬规则不漏)。
- AC-3:采纳 → publishPack 从占位文案变**真标题+标签**;发布中心/publications 出对应 douyin 行(platform=douyin)。
- AC-4:用户默认 MiniMax 下 `runStructuredNode` 稳定吐可解析 draft(不 cancelled)——真机跑一条验。
- AC-5:未选号/无 outputId 时按钮不误现或诚实禁用(account 隔离不破)。

## 7. 切片(写完本 SPEC 立即拆进 BACKLOG,hook 强制)

- **S1 chat 工具 `publish.package`**:chat-tools.ts 加工具 + ALL_CHAT_TOOL_NAMES + function-key 不变量测;
  复用 platform.adapt 内核产单平台候选。backend + ai-worker 侧。
- **S2 稿面入口 + 候选卡**:PublishPackSection 加按钮(onOpenChat)+ 右栏候选卡呈现
  标题/简介/标签/封面/审核结论 + 采纳回填 publishPack。frontend 侧。
- **S3 真机验收**:重打包/dev 真跑 AC-1~5(MiniMax 下走通),诚实记残留(封面图缺口)。

> 依赖:S1→S2→S3 顺序;S1/S2 文件簇不重叠可并行起草但 S2 依赖 S1 的工具名。审核架构不动(T-351 正交)。
