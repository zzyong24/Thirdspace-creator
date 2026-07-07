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
- **签名**:Ed25519(**复用 P6 minisign 私钥/公钥**);包旁 `.sig`;客户端**内置公钥验签**(同 P6 updater 姿势)。验签失败 → 丢弃、不套用(诚实:不套未签/验不过的包)。
- **托管**:`PROMPT_BUNDLE_URL`(config/env,默认占位);产品方把 `bundle.json`+`.sig` 传到 R2/CDN/activation-manager/GitHub release(**其 op**)。

### 3.2 客户端拉取 + 套用(backend 侧,复用 reapply)
- **拉取**:`fetchRemotePromptBundle(url)` —— GET bundle + .sig → 验签 → 解析。网络失败/验签失败/无 URL → **静默跳过**(远程是增益,不阻断;本地 override 照常生效)。
- **套用精度(守 D1 优先级)**:remote override 作为 override 引擎的**一个新层**,优先级:
  1. **用户本地 `skill_config_overrides` 行(非空字段)** —— 最高,远程绝不覆盖用户手改的 skill。
  2. **远程包 override** —— 用户未手改的 skill 上套远程改进。
  3. **内置模板** —— 兜底。
  实现:`reapplySkillOverrides` 装配 REGISTRY 时,先套远程包、再套本地行(本地后套即覆盖 = 本地赢),与现有「本地行套一次进 REGISTRY」链天然叠加。
- **落地为本地行?否**:远程 override **不写 `skill_config_overrides` 表**(那是用户定制层,写进去会污染 D1 优先级判定 + T-165 版本历史)。远程层是**运行时叠加**(内存 REGISTRY),独立于本地表。
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
- **验签**:fake 一个 bundle + 签 → 客户端内置公钥 verify 通过;篡改 bundle/坏签 → 拒绝套用(单测)。
- **优先级(守 D1)**:本地 override 手改 skill A + 远程包也含 A → 装配后 REGISTRY 里 A = **本地值**(远程不覆盖);远程含 B、本地无 B → B = 远程值(单测断言 REGISTRY 投影)。
- **降级**:无 URL / 网络失败 / 验签失败 → 纯本地生效、不崩(单测)。
- **端到端(真机=产品方)**:`prompt-bundle sign` 产签名包 → 传到真 endpoint → 客户端启动拉取套用 → 改一条远程 prompt 不发版即生效。**实时拉取+真 endpoint 需产品方跑**(单测只证验签+优先级+降级逻辑)。

## 6. Gate
**改架构(override 源 本地→本地+远程)→ 必须过 spec-review gate(verdict≠FAIL)才准开工**(reviewer=orchestrator spec-reviewer,预设 MiniMax)。gate 关注点预判:① D1 优先级(用户本地永远赢)是否被优先级链真正保证、远程不写本地表是否守住 T-165 版本纯净 ② 验签失败/无 URL 的降级是否真零副作用 ③ 与 T-165 版本历史是否冲突(远程层不进版本表,澄清) ④ 是否夸大(明确「非保护、D1 降级、远程更新增益」)。

**下一步**:本 SPEC 过 gate(≠FAIL)后 → 拆 Task 进 BACKLOG → 从看板开工(客户端拉取+验签+优先级 + 打包签名脚本;托管 endpoint 待产品方拍板,先配置占位可跑）。
