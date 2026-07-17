# spec-review: 2026-07-17-license-hardening-and-dual-platform-design

- **review_mode**: cross-family(MiniMax via `mmx text chat`)
- **model**: MiniMax(mmx CLI,api-key)
- **verdict**: CONCERNS(已处理)→ 全部接受内联,降级为可开工
- **传递纪律**:给审查者只喂 `docs/产品定位.md`(宪法)+ 被审 SPEC 全文,用第三方框架(「另一位同事交来的方案」),未暴露作者身份/自评/结论,防锚定。
- **summary**(reviewer 原文):Part I 激活加固方案论证充分、合宪、与宪法锚点一一对应;Part II 双端分发不改变产品能力边界、仅扩运行环境,DEC-W 修正路径合理。两处 major 需澄清方可降 PASS:①Rust `.license` 放行权威 vs BR-01 单一写者表面冲突;②L1s 服务端签名端点为阻塞前置,须明确「强验签全拒」的降级策略防内测被硬阻塞。

## findings 与处置(4 条:2 major + 2 minor,全部接受)

### F1 [major/approach] §9+§13 Rust `.license` 放行权威 vs BR-01

- **issue**:Rust 侧 `.license` 为放行权威 + sidecar `activation_state` 表降为只读展示副本,与 BR-01「schema 与领域写入由 backend 拥有;模块间不跨 repository」表面冲突。
- **suggestion**:论证为何是 BR-01 例外(防可 patch 的 JS 篡改是 NFR-SECURITY 更高优先级安全不变量),并明确 Rust 与 sidecar 写入协议。
- **处置**:**接受** —— §9 持久层归属段重写(标 [gate-F1]):区分「领域记录(activation_state,仍 backend 独占写,Rust 经 RPC 写)」与「安全门产物(.license,非领域 schema,Rust 独占)」;明确 `.license` 不是领域数据故不违 BR-01 意图;补写入协议(Rust 验签成功→写 .license→触发 sidecar RPC 同步展示字段)。

### F2 [major/completeness] §17 L1s + §15 验收8 服务端阻塞前置

- **issue**:L1s(服务端 Ed25519 端点)是外部依赖;客户端强验签(§5 缺签名即拒)在服务端上线前会 100% 全拒,内测(两天内)无法进入,除非服务端同步上线。
- **suggestion**:增加降级/保底(feature flag 强/弱验签)+ 明确 L1s 上线截止时点 + 在验收「诚实存疑」记录该风险已与发布负责人同步。
- **处置**:**接受** —— §5 增 `CREATOROS_LICENSE_STRICT_VERIFY` env flag(默认 1 强验签;服务端未就绪临时 0 回退仅校布尔+诚实标注,有显式开关+诚实标注非静默缩水,L1s 上线即置回 1 并移除过渡);§15 验收8 补 [gate-F2] 内测阻塞风险显式记录 + 首选 L1s 内测前上线。**同时已在对话向用户显式提示此为关键路径依赖。**

### F3 [minor/traceability] §15 验收8 诚实存疑无验证里程碑

- **issue**:「真机待验」条目无具体验证计划/里程碑,宪法 §13 发布门要求「真实运行场景」而非仅单测。
- **suggestion**:拆片卡标真机验证里程碑。
- **处置**:**接受** —— §15 验收8 补 [gate-F3]:L2 完成后 48h 内真机验离线宽限跨天(断网 25h)+ 回拨检测;L3 后真机验两码型 fail 语义;进 G-DESKTOP/G-SECURITY 门前须真实运行证据。

### F4 [minor/approach] §9 完整性哈希校验防御边界

- **issue**:哈希校验防「改 server.js 后重 spawn」,但防不了 patch Rust 二进制;§18 已诚实声明,但实现层应说明防御范围避免误解为全链路防篡改。
- **suggestion**:§9 加一句界定防御范围,指向 §18。
- **处置**:**接受** —— §9 完整性加固段补 [gate-F4]:此校验只防 JS 层篡改,Rust 二进制篡改归 §18,勿误以为全链路防篡改。

## 裁决

verdict = **CONCERNS(0 blocker / 2 major / 2 minor),4 条全部接受并内联**([gate-F1]~[gate-F4])。无 blocker、无 scope-reduction、无 fit-positioning 冲突(DEC-W 修正路径 reviewer 认可)。**按 gate 规则(verdict≠FAIL 且 findings 已处置)→ T-372 L1s/L2/L3/W-spike/W-core/W-ci 可开工。**

裁决人:moonlitclear(用户委派,主 agent 执行内联;F2 关键路径依赖已回报用户)。
