# 提示词/skill 服务端可配可更新 设计(T-040)

> 状态:草稿待过 spec-review gate(改提示词加载架构,verdict≠FAIL 才准开工)。
> 引用铁律:CLAUDE.md「任务流程铁律」§7/§8;宪法 [docs/产品定位.md](../../产品定位.md)。
> 复用范式:`model_configurations` 存库 + `resolveModelSpec` 优先库存回退默认(见 [multimodal-model-config](2026-07-01-multimodal-model-config-and-recording-design.md))——本设计是它的「提示词版」。

## 1. 背景与问题

用户 2026-07-02:「我们的提示词和 skill 就不能写死了,后面会有一个服务端去更新提示词的。」

现状(真实):所有 prompt 模板 + skill(system / template / tools / outputSchema)**硬编码**在 `ai-worker/src/prompt/templates/*.ts`(17 个文件),经 `registerAllTemplates()`(`registry.ts:83`)一次性注册进**进程内存 Map `REGISTRY`**,`getTemplate(id)`(`registry.ts:88`)只读内存。改一句提示词 = 改 TS 代码 + 重启进程。本会话修 `review-insights` / `chatbox.review` 就是这么硬改+重启的。

**痛点:** ①产品/运营改提示词要走代码发布;②无法灰度/热更;③无审计(谁改的、改了啥);④跨环境不一致(改代码才同步)。与「模型可配」`model_configurations`(已可库内配/热读)的成熟度不对齐。

## 2. 目标 / 非目标

**目标:**
1. **提示词/skill 存库可配**:模板(system/template/tools/version)可存进 DB,运行时读库。
2. **服务端可更新 + 热生效**:改库即生效(下次 `getTemplate` 拿到新值),不必改代码/重启。
3. **回退内置(零风险)**:库里没配某 id → 回退到硬编码内置模板(`registerAllTemplates` 那份)。删库/空库 = 现状行为,不崩、不丢。
4. **审计**:每次更新留版本 + updated_at(+ 谁改的),可回看/回滚。
5. **契约 op 读写**:`prompts.list` / `prompts.get` / `prompts.put`(照 model-config 的 `listModels`/`putModel` 模式),供未来管理端更新。

**非目标:**
- 不做提示词的可视化编辑器 UI(本期只做后端可配 + op;编辑端另起,先能用 op/直改库更新)。
- 不做多租户提示词隔离(单用户本地部署;`prompt_configurations` 全局或 user-scoped 一致按 model-config 现状——见 OQ-1)。
- 不改任何提示词的**语义**(只把「存哪、怎么读」从硬编码迁到「库优先+内置回退」);现有 17 个模板的文字不动。
- 不做提示词 A/B 实验分流(未来优化,先留 version 字段)。

## 3. 对照宪法

- **不造轮子(§9.5)**:直接复用 `model_configurations` 的存库+resolve+回退范式(表结构、repo、service、transport、resolve 优先级),只换「模型 spec」为「提示词模板」。不新造机制。
- **不摆假(§8)**:回退内置是**诚实降级**(库没配就用内置真模板),不塞假模板;审计留真版本。
- 纯基础设施(提示词加载层)——**不改产品方向、不改数据归属**(提示词是系统配置非用户内容资产);属新架构层,按铁律过 gate。
- 与「多模态模型可配」一脉(MEMORY [[multimodal-models-user-configurable]]):AI 的可变部分(模型、提示词)都该可配,不写死。

## 4. 设计

### 4.1 数据模型(迁移 `0013`——0012 已被 T-038 占,下一个 0013)

新表 `prompt_configurations`(照 `model_configurations` 结构裁剪):

```
id            TEXT PK        -- 模板 id,如 "chatbox.review" / "review.insights"
system        TEXT           -- skill/节点的 system(可空 → 该字段回退内置)
template      TEXT           -- 模板正文(带 {{占位符}};可空 → 回退内置)
tools         JSONB          -- string[](工具白名单;null → 回退内置)
output_schema JSONB          -- 可选;多数模板 outputSchema 是 zod、难存库 → 见 [OQ-2]
version       INTEGER        -- 每次 put 自增
updated_by    TEXT           -- 谁改的(user id / "system")
updated_at    TIMESTAMPTZ(TEXT ISO,与全仓惯例一致,不用 timestamptz 列型——见 T-038 [gate-F2] 教训)
```

> **部分覆盖**:每列可空 → 只覆盖库里非空的字段,其余回退内置(如只想改 system、不动 tools)。避免「配一个字段就得整份重填」。

### 4.2 resolve 优先级(核心,照 resolveModelSpec)

`getTemplate(id)` 改为(或新增 `resolveTemplate(id, deps)`):
1. 读 `prompt_configurations` 行(经注入的读端口 `PromptConfigReader`,依赖倒置、可测)。
2. **库有该 id** → 用**库值覆盖内置**(逐字段:库非空字段覆盖,空字段回退内置);
3. **库无该 id / 读失败** → 用内置(`registerAllTemplates` 那份),**诚实降级不崩**。
4. `outputSchema`:zod 难存库 → **始终用内置的 outputSchema**([OQ-2]),库只覆盖 system/template/tools(文本+白名单,覆盖这些已满足「改提示词」诉求)。

> **纯 + 可测**:resolve 是纯合并逻辑(内置模板 + 库 override → 有效模板),注入 fake reader 单测(库有→覆盖、库空→回退、部分字段→部分覆盖)。

### 4.3 集成点

- **ai-worker `registry.ts`**:`getTemplate` 保持同步只读内存的**内置**;新增 `resolveTemplate(id, { reader })` 做「内置 + 库 override」合并。**运行时读点**(chat-runner `buildChatAssembly` 取 skill、各 runner 取模板)改调 `resolveTemplate`(带 reader);reader 由 composition root(persistence-client)绑到库读端口。
- **persistence-client**:建 `PromptConfigReader`(读 `prompt_configurations`,user-scoped 或全局按 OQ-1)注入到 chat/runner 装配链。照 `makeReviewSubjectReader` 那种端口注入法。
- **contract + backend**:加 `prompts.list/get/put` op(照 `listModels/putModel`)。

### 4.4 更新路径

- 后端 op `prompts.put`(id + 要改的字段)→ service upsert `prompt_configurations` + version++。
- 无 UI 本期:通过 op(或直改库)更新;下次 `resolveTemplate` 即读到新值(热生效,无需重启)。
- 未来:管理端 UI(照 ModelConfigurationCard)。

## 5. 测试策略

- **resolve 合并纯函数单测**:内置+空库→内置;库全字段→全覆盖;库部分字段→部分覆盖其余回退;库读抛错→回退内置不崩。
- **持久化集成测(pglite)**:put→库有行→resolveTemplate 读到覆盖值;版本自增。
- **回归**:现有 chat-runner/review/topic 等模板测**不回归**(无库配置时 resolveTemplate === 内置,行为不变)。
- **热更冒烟**:put 改某 skill 的 system → 不重启,新一次装配读到新 system。

## 6. 切片(过 gate 后拆进 BACKLOG,垂直真做)

- **T-040a** 数据模型(迁移 0013 + schema)+ `PromptConfigReader` 端口 + `resolveTemplate` 合并纯函数 + 确定性单测(内置回退/库覆盖/部分覆盖)。**不接线**。
- **T-040b** contract+backend op `prompts.list/get/put` + service/repo + 装配读端口进 persistence-client。
- **T-040c** 运行时读点切到 `resolveTemplate`(chat-runner + 各 runner 取模板处)+ 回归全绿 + 热更冒烟。
- (UI 编辑端 = 未来,不在本 SPEC。)

## 7. Open Questions

1. **user-scoped vs 全局**:提示词配置是全局(所有用户共享一套)还是 user-scoped?→ **默认跟 `model_configurations` 现状**(它是 user-scoped 还是全局,查了对齐;单用户本地部署下两者等价)。gate 若认为提示词应全局(产品统一)可改全局。
2. **outputSchema 存库**:zod schema 难序列化存库。→ **本期不存**,库只覆盖 system/template/tools;outputSchema 恒用内置。够满足「改提示词文字/工具白名单」。若未来要改结构化输出契约,再设计 schema 的可配表达(如 JSON Schema 存库 + 运行时编译)。
3. **热更一致性**:`resolveTemplate` 每次读库(实时)还是带缓存(TTL)?→ 默认**每次读**(单用户低频,实时最简);高频再加缓存。
