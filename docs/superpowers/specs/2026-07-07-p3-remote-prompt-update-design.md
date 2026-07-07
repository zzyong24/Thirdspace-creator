# SPEC — P3 Prompt 远程更新(T-147 P3):签名远程 override 源,守 D1 用户定制优先

> 状态:**待过 spec-review gate**(改架构:override 源从纯本地 → 本地+远程,铁律)· 2026-07-07 · 关联 T-147 P3 / T-040(override 引擎)/ T-165(版本历史)/ P6(Ed25519 签名)/ D1(用户定制优先)
> 一句话:把 skill prompt override 的**来源**从「纯本地表」扩成「**用户本地定制(最高优先,守 D1)+ 可选签名远程包**」,让产品方能**不发新版就迭代 prompt**;**复用** T-040 `reapplySkillOverrides` 热更 + T-165 版本历史 + P6 Ed25519 验签,**不重造引擎**。

## 1. 背景(verify-exists 核查坐实,2026-07-07)

- **P3 保护目标(prompt 不落客户端明文)已被 T-163+P6 实质达成**:prompt 模板在 ai-worker 独立包、经 backend/ai-runtime 调,**前端 bundle 零直引**(grep 坐实);P6 混淆覆盖 `.next/server/**`(ai-worker 编译落点)。**故本 SPEC 不做「防泄漏」**(那部分已达)。
- **D1 决策**:桌面端**保留用户可查看/定制 prompt** → P3 降级为「**只做远程更新/迭代,不做防泄漏**」。故本 SPEC = 纯**远程可更新性**,不碰保护叙事。
- **现状引擎(复用,不重造)**:`skill_config_overrides` 表(本地 override 行)+ `reapplySkillOverrides`(persistence-client:重读表 → 套进常驻 ai-worker REGISTRY,热更不重启)+ T-165 版本历史/回滚。P6 已有 minisign/Ed25519 签名基建(updater)。
- **缺口**:override **只有本地源**,无「远程拉一份产品方维护的 prompt 改进」通路。

## 2. 目标

- 产品方能维护一份**签名的远程 prompt 包**(skill overrides 集合),客户端启动/周期**拉取 → 验签 → 套进 REGISTRY 热更**,**不发新 app 版本**即迭代 prompt。
- **守 D1:用户本地定制永远优先**——远程包不覆盖用户已手改的 skill(优先级 用户本地 > 远程包 > 内置)。
- **复用**现有 override 引擎 + T-165 版本 + P6 签名,新增面最小。
- 托管通道**可配**(默认复用 P6 updater 式签名 endpoint);**服务端上传是产品方 op**(本 SPEC 出签名+打包脚本,不含起服务器)。

## 3. 设计

### 3.1 远程 prompt 包(签名 artifact)
- **形状**:JSON `{ version, signedAt, overrides: [{ skillId, system?, template?, tools?, requiredFacets?, outputSchema? }] }` —— 与 `skill_config_overrides` 行同字段(直接喂 override 引擎)。
- **签名**:Ed25519(**复用 P6 minisign 私钥/公钥**签);包旁 `.sig`;客户端**内置公钥验签**。验签失败 → 丢弃、不套用(诚实:不套未签/验不过的包)。
  - **⚠️ 验签基建是新增,非零成本(gate 关切③ 坐实)**:P6 的 Ed25519 验签在 **Tauri updater 的 Rust 插件内**,只服务 app 更新包,**没有暴露给 backend JS 的 verify 原语**;仓内 **无 `tweetnacl`/`@noble/ed25519`/`minisign` 依赖**、backend/frontend 无 `crypto.verify`/`createVerify` 用法。故本切片 **必须在 backend 侧新建一个 Node Ed25519 verify**:优先 **`node:crypto` 的 `crypto.verify(null, msg, publicKeyObj, sig)`**(Node 原生支持 Ed25519,零新依赖),配 **minisign `.sig` 格式解析**(base64 行 + trusted-comment;或改用裸 Ed25519 sig 简化)。**拆 Task 时单列此项,不当零成本。** 私钥签沿用 P6(`updater-keygen`/tauri signer),公钥内置进 backend 配置。
- **托管**:`PROMPT_BUNDLE_URL`(config/env,默认占位);产品方把 `bundle.json`+`.sig` 传到 R2/CDN/activation-manager/GitHub release(**其 op**)。

### 3.2 客户端拉取 + 套用(backend 侧,复用 reapply)
- **拉取**:`fetchRemotePromptBundle(url)` —— GET bundle + .sig → 验签 → 解析。网络失败/验签失败/无 URL → **静默跳过**(远程是增益,不阻断;本地 override 照常生效)。
- **套用精度(守 D1)——skill 粒度锁(gate 关切① 处置,最高优先)**:优先级 = 用户本地 > 远程 > 内置,**锁到 skill 粒度**:
  1. **用户本地 `skill_config_overrides` 行** —— 最高。**凡本地表出现过的 skillId,该 skill 的远程 override 整条丢弃**(非字段级合并)。
  2. **远程包 override** —— 仅套在**本地未出现**的 skillId 上。
  3. **内置模板** —— 兜底。
  - **为何 skill 粒度而非字段级(gate 坐实的 D1 缺口)**:`overrideTemplatesFromConfig`(`registry.ts`)是**字段级合并**(`ov.system ?? base.system`)。若字段级叠加,用户只手改 skill A 的 `system`、远程改 A 的 `template` → 合并 = A.system(本地)+ A.template(远程),**远程悄改了用户手改过的 skill = 违 D1**。故锁 **skill 粒度**:`const localIds = new Set(rows.map(r => r.id))`,远程 override `.filter(o => !localIds.has(o.skillId))` 后才套。用户手改过的 skill,远程一个字段都不碰。
- **实现落点(gate 关切② 纠偏)**:现 `reapplySkillOverrides` → `applySkillConfigOverridesFromDb`(`backend/src/modules/ai-runtime/skill-config-overrides.ts`)是**全量重建**——每次先 `registerAllTemplates()`(REGISTRY 清回内置)+ `clearAllSchemaOverrides()`,再逐行套本地表。**远程层必须织进这个重建序列内部**:`registerAllTemplates()` → **套远程(过滤掉 localIds)** → 套本地表循环。**不能**在该函数外「先叠一层远程」——会被函数内 `registerAllTemplates()` 清掉(gate 坐实踩坑点)。故给 `applySkillConfigOverridesFromDb` 加可选 `remoteOverrides` 参数(缺省 undefined = 纯本地,向后兼容)。
- **落地为本地行?否**:远程 override **不写 `skill_config_overrides` 表**(写进去污染 D1 skill 锁判定 + T-165 版本历史)。远程层是**运行时叠加**(内存 REGISTRY,重建序列内套一次),独立于本地表。gate 坐实:该函数全在内存 `REGISTRY.set` 操作、本地表只被 `loadAll()` 读,远程内存套用不冲突、可行。
- **时机**:启动装配 `reapplySkillOverrides` 时拉一次(fire-and-forget,失败不阻断启动);可选周期/手动刷新(后续,不在本切片)。

### 3.3 打包 + 签名脚本(产品方 op,本 SPEC 交付)
- `scripts/prompt-bundle.mjs`:① `export` —— 从当前 REGISTRY/本地表导出一份 overrides → `bundle.json`;② `sign` —— **复用 P6 Ed25519 私钥**签 → `.sig`;③ 打印上传引导(传哪、endpoint 配哪)。**不含起服务器/上传到具体桶**(托管是产品方选型)。

### 3.4 托管决策(SPEC 决策点,默认可跑)
- 默认 = `PROMPT_BUNDLE_URL` 配置项(未配 → 远程层关,纯本地,零副作用)。
- 推荐复用**已有签名分发基建**:P6 updater 的 endpoint 模式 / activation-manager / R2·CDN。**产品方拍板**;客户端只认「一个可 GET 的 signed bundle URL」,与托管选型解耦。

## 4. 不做(YAGNI / 划界)
- **防泄漏 / prompt 加密下发**(D1 已降级;保护由 T-163+P6 达成)。
- **prompt CMS / 后台编辑界面**(产品方本地维护 + 脚本打包即可)。
- **周期自动刷新 / 灰度分发**(首切片只做「启动拉一次」;灰度是后续)。
- **起 prompt-server**(托管是产品方 op;本 SPEC 只做客户端拉取 + 打包签名脚本)。

## 5. 测试与验收
- **验签(新增 Node Ed25519,gate③)**:fake bundle + 用 P6 私钥签 → backend 内置公钥 `crypto.verify` 通过;篡改 bundle/坏签/换公钥 → 拒绝套用(单测)。
- **skill 粒度锁(守 D1,gate①——补部分覆盖场景)**:①本地手改 skill A 的 `system` + 远程含 A 且改 A 的 `template` → 装配后 REGISTRY 里 **A 整条 = 本地值,A.template 保持内置(远程一个字段都没进)**;②远程含 B、本地无 B → B = 远程值;③本地有 A、远程也有 A(同字段)→ A = 本地值。(单测断言 REGISTRY 投影,**尤其覆盖①的不同字段部分覆盖**——gate 坐实的原缺口。)
- **重建织入(gate②)**:单测直接调 `applySkillConfigOverridesFromDb(db, { remoteOverrides })`,断言 `registerAllTemplates → 套远程(过滤 localIds)→ 套本地` 序列生效,远程层没被重建清掉。
- **降级**:无 URL / 网络失败 / 验签失败 → `remoteOverrides` 传 undefined/[] → 纯本地生效、不崩(单测)。
- **端到端(真机=产品方)**:`prompt-bundle sign` 产签名包 → 传到真 endpoint → 客户端启动拉取套用 → 改一条远程 prompt 不发版即生效。**实时拉取+真 endpoint 需产品方跑**(单测只证验签+skill 锁+重建织入+降级逻辑)。

## 6. Gate
**改架构(override 源 本地→本地+远程)→ 必须过 spec-review gate(verdict≠FAIL)才准开工。**

**首审(2026-07-07)= CONCERNS**(独立子代理对抗式,现状逐条 grep 核实;方向合 D1/合定位、复用判断正确、远程不写表可行、降级成立——不 FAIL)。**3 条澄清级处置(gate 明示「修订后放行、不需重走 gate」)**:
- **① D1 语义缺口(字段级合并会让远程改到用户手改过 skill 的其他字段=违 D1)→ ✅ 处置**:§3.2 改 **skill 粒度锁**(本地表出现的 skillId 整条远程丢弃)+ §5 补「本地远程改不同字段」验收用例。
- **② 叠加点纠偏(`applySkillConfigOverridesFromDb` 是全量重建、外部先叠远程会被清)→ ✅ 处置**:§3.2 明确远程层织进 `registerAllTemplates()` 之后、本地循环之前,加可选 `remoteOverrides` 参数。
- **③ 验签基建低估(P6 验签在 Rust 插件,backend JS 无 Ed25519 verify、仓无 tweetnacl/@noble)→ ✅ 处置**:§3.1/§5 显式新增 `node:crypto` 的 `crypto.verify`(Node 原生 Ed25519,零新依赖)+ minisign `.sig` 解析,拆 Task 单列。
- 补(非阻塞):**为何现在做而非等 P5 托管**——客户端侧与托管解耦(只认一个可配 signed URL,未配则关、纯本地),**可独立开工**;产品方定托管后填 URL 即启用,不阻塞。总纲把远程更新标「缓」是就**整条通路含托管**而言;客户端侧先备好、成本已由 gate 核实(主要是 Ed25519 verify),风险可控。

**下一步**:CONCERNS 已处置(gate 明示不需重走)→ 拆 Task 进 BACKLOG → 开工客户端侧(拉取+`crypto.verify` 验签+skill 锁+重建织入 + 打包签名脚本;托管 endpoint 配置占位可跑,真 endpoint 待产品方拍板)。
