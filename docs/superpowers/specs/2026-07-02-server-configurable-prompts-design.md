# 提示词/skill 服务端可配可更新 设计 v2(T-040)

> 状态:v1 被 spec-review gate 判 FAIL(造轮子)→ 本 v2 按 findings 重写为「接线已有通道」,待 re-gate。
> 引用铁律:CLAUDE.md「任务流程铁律」§7/§8;宪法 [docs/产品定位.md](../../产品定位.md)。
> **v1→v2 关键更正(gate 逮的):** 仓内**已有** `overrideTemplatesFromConfig`(`ai-worker/src/prompt/registry.ts:208`)整套「服务端下发覆盖模板」通道 —— 覆盖 system/template/tools/requiredFacets/**outputSchema(JSON Schema)**、`ov.x ?? base.x` 逐字段回退(undefined=未配)、已导出(index.ts:133)已测(template.test.ts:234/276),**只差接一张表 + 一次装配调用**。v2 = 接线它,**不新造** `prompt_configurations`/`resolveTemplate`(§9.5 不造轮子)。

## 1. 背景与问题

用户 2026-07-02:「提示词和 skill 不能写死了,后面会有服务端去更新提示词。」现状:18 个模板(`registry.ts:56` `BUILTIN_TEMPLATES`,含 chat 三面 + 15 个节点模板)硬编码在 `templates/*.ts`,`registerAllTemplates()` 注册进内存 `REGISTRY`。改一句提示词=改 TS+重启(本会话改 review-insights/chatbox.review 就这么干的)。

**已有但未接线的通道:** `overrideTemplatesFromConfig(SkillConfigOverride[])` 能就地把「配置面下发」的覆盖套进 `REGISTRY`,注释白纸黑字写「后台改 system/template/tools/outputSchema 不改代码」——但**全仓无任何生产调用**(grep 仅命中 export + test)= 建好了没接。真正缺的是「持久化 + 装配时读表套用 + 更新 op」这三步。

**两个必须正面处理的现状(gate 逮的):**
- **A. 结构化 runner 绕过 registry**:11 个节点 runner 直接 `import { X_TEMPLATE }` 常量、`template: X_TEMPLATE` 传给 runStructuredNode(如 `planning-runner.ts:183`),**不调 getTemplate**。override 改的是 REGISTRY 里的对象,runner 持 import 快照 → **吃不到覆盖**。只有 `chat-runner.ts:140` 走 `getTemplate`(chat 三面 skill 可配)。
- **B. 空串 ≠ null**:override 用 `ov.system ?? base.system`(nullish 才回退);TEXT 列存空串 `'' ?? base` 取空串(非回退)→ 读库后必须归一「空串→undefined」。

## 2. 目标 / 非目标

**目标:**
1. **接线已有 override 通道**:建持久化表存 `SkillConfigOverride` 字段,装配时读表 → `overrideTemplatesFromConfig` 套进 REGISTRY。
2. **全 18 模板都可配**(含结构化 runner 的 review-insights/planning 等)→ 需**把 11 个结构化 runner 从 import 常量改为运行时 `getTemplate(id)`**(读被覆盖后的 REGISTRY)。这是让「review 提示词可配」(用户最在意的)成立的必要改动。
3. **服务端可更新 + 热生效**:`prompts.put` op 写表 → 重新读表 + 重套 `overrideTemplatesFromConfig`(套进常驻内存)→ **下一次装配即用新值,不重启**。
4. **回退内置零风险**:表空/某 id 未配 → 该字段 `undefined` → `?? base` 回退硬编码内置。删表=现状行为。
5. **审计**:表存 version + updated_by + updated_at,可回看。

**非目标:** 不做可视化编辑器 UI(本期只后端可配 + op;更新走 op 或直改库,编辑端另起);不做 A/B 分流(留 version 字段);不改任何模板**语义**(只迁「存哪、怎么读」);不做多租户提示词隔离(单用户本地,按 model-config 现状)。

## 3. 对照宪法

- **§9.5 不造轮子(v1 违反、v2 修正)**:v2 直接接线已建成的 `overrideTemplatesFromConfig` + `SCHEMA_OVERRIDES` + `applySchemaOverride`,不另造 resolve。表结构照 `storage_configs`(0002,`created_at/updated_at TEXT NOT NULL` 惯例)+ 新增 version/updated_by 审计列(诚实标注:范本 model_configurations 无这些列,是本设计新增)。
- **§8 不摆假**:表空/未配 → 诚实回退内置真模板,不塞假;审计留真版本;override 目标 id 未注册 → `overrideTemplatesFromConfig` 抛错(registry.ts:213)显式失败,不静默。
- 纯基础设施(提示词加载层)——不碰产品方向/数据归属(提示词是系统配置非用户资产)。改架构 → 过 gate。

## 4. 设计

### 4.1 数据模型(迁移 `0013`——0012 被 T-038 占,下一个 0013)

新表 `skill_config_overrides`(字段对齐 `SkillConfigOverride`,每列可空=未配):

```
id             TEXT PK        -- 目标 skill id(必须是已注册的 18 个之一;put 时校验)
version        TEXT           -- 覆盖版本标记(纯标记,可空)
system         TEXT           -- 覆盖 system(空/null → 回退内置)
template       TEXT           -- 覆盖 template 正文(空/null → 回退内置)
tools          JSONB          -- string[](工具白名单;null → 回退内置)
required_facets JSONB         -- string[](null → 回退内置)
output_schema  JSONB          -- JSON Schema(null → 回退内置 zod;override 通道已支持,见下)
updated_by     TEXT           -- 谁改的(user id / "system")
updated_at     TEXT NOT NULL  -- ISO(照 storage_configs 惯例,非 timestamptz)
```

> **outputSchema 纳入本期**(gate 逮:v1 说「zod 难存库不做」是错的)——`overrideTemplatesFromConfig` 已支持 JSON Schema 覆盖(`SCHEMA_OVERRIDES` + `applySchemaOverride`,registry.ts:229-231),存 JSON Schema 文本即可,非法 schema 装配时显式抛错。

### 4.2 装配:读表 → 归一 → 套用(核心接线)

新增 `applySkillConfigOverridesFromDb(store)`(persistence-client 装配期,`registerAllTemplates()` **之后**调):
1. 读 `skill_config_overrides` 全表。
2. **[gate 修]归一空串→undefined**:每个文本字段 `row.system?.trim() ? row.system : undefined`(空串=未配=回退,不当显式空值覆盖);jsonb 字段 null→undefined。
3. 组装 `SkillConfigOverride[]` → 调 `overrideTemplatesFromConfig(overrides)`(既有函数,套进 REGISTRY + SCHEMA_OVERRIDES)。
4. 目标 id 未注册 → 既有函数抛错;装配期 catch + 记日志(单条坏配置不阻塞其余),诚实不静默。
- **时机**:进程启动装配一次;`prompts.put` 后重新调一次(热更,见 §4.4)。

### 4.3 [gate 修·blocker#3] 结构化 runner 改走 getTemplate

11 个 runner(planning-thesis/contract/outline、review-insights、topic-generate/enrich、platform-adapt、calibration-diagnose/score、material-match、reconstruct、research-gather、positioning、script-draft 等——**逐个列进 T-040b 验收 checklist**)当前 `import { X_TEMPLATE }; template: X_TEMPLATE`。改为运行时取:`template: getTemplate("<id>")`(REGISTRY 已注册全 18 个,getTemplate 惰性 bootstrap 保底;拿到的是被 override 覆盖后的对象)。
- **不改 registration**(18 个已在 BUILTIN_TEMPLATES);只改 runner 的「拿模板」从编译期常量 → 运行时 getTemplate。
- **保留 getTemplate 惰性 bootstrap**(registry.ts:93 `size===0` 自愈),不破坏「无显式 registerAllTemplates 也能取内置」。
- outputSchema:结构化输出走 `resolveOutputSchema(id)`(已优先 SCHEMA_OVERRIDES),runner 侧确认按 id 取 schema(而非 import 的 zod 常量)才吃得到覆盖——逐 runner 核。

### 4.4 更新路径 + 热更机制([gate 修·major])

- op `prompts.put`(id + 要改的字段)→ service:校验 id ∈ 已注册 18 个 → upsert `skill_config_overrides` + version++ + updated_at/by → **重新调 `applySkillConfigOverridesFromDb`**(重读全表 + 重套 override 进常驻 REGISTRY)。
- **热更语义写死**:override 是「套一次进内存常驻」,**不是每次 getTemplate 查库**(与 registry.ts:88 同步只读内存不冲突)。put 后重套 → 下一次装配(新对话/新任务)读到新值;**已在跑的对话/任务沿用旧值**(常驻覆盖下一轮生效,可接受)。
- op `prompts.list`/`prompts.get`(读表,供未来管理端)。

## 5. 测试策略

- **归一 + 套用单测**(注 fake store):库有全字段→override 全覆盖;库空→REGISTRY 保持内置;**库存空串→归一 undefined→回退内置**(gate 点名的坑,必测);坏 id→catch 不阻塞其余;outputSchema JSON Schema→SCHEMA_OVERRIDES 生效。
- **runner 走 getTemplate 回归**:11 runner 改后,无 override 时 `getTemplate(id)===内置`,各 runner 单测不回归。
- **持久化集成测(pglite)**:put→表有行→重套→getTemplate 读到覆盖值;version 自增。
- **热更冒烟**:put 改某 skill system→不重启→新一次 buildChatAssembly/runner 读到新 system;结构化 runner 改 outputSchema(JSON Schema)→ resolveOutputSchema 生效。

## 6. 切片(过 gate 后拆进 BACKLOG)

- **T-040a** 迁移 0013 `skill_config_overrides` + schema + `applySkillConfigOverridesFromDb`(读表+归一空串→undefined+调 `overrideTemplatesFromConfig`)+ 启动装配接线 + 确定性单测(覆盖/回退/空串/坏id)。**chat 三面 skill 本片即可配**(它们已走 getTemplate)。
- **T-040b** 11 结构化 runner 从 import 常量 → `getTemplate(id)`(+ outputSchema 走 resolveOutputSchema),逐个 file:line checklist + 回归全绿 → **结构化模板(review-insights 等)也可配**。
- **T-040c** contract+backend `prompts.list/get/put` op + service/repo(put 校验 id + upsert + 重套热更)+ 装配 + 热更冒烟。
- (UI 编辑端=未来,不在本 SPEC。)

## 7. Open Questions

1. **user-scoped vs 全局**:提示词覆盖全局(产品统一一套)还是 user-scoped?→ **默认全局**(提示词是产品级系统配置,非用户资产;`skill_config_overrides` 不带 user_id)。gate 若认为该 user-scoped 可加列。
2. **进行中任务一致性**:已决(§4.4)——常驻覆盖下一轮装配生效,在跑的沿用旧值,可接受。
3. **outputSchema 覆盖范围**:本期纳入(override 通道已支持 JSON Schema);runner 侧需确认走 `resolveOutputSchema(id)` 而非 import 的 zod 常量(T-040b 逐 runner 核)。
