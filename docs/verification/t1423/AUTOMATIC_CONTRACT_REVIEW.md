# T-1423 无感升级合同独立审查

审查时间：2026-10-23T11:12:22.186121+00:00。审查者：`/root/ci_contract`。源码基线：`7f67264f4ca700a2c6143ec0a8aa13ea03c68270`。

**最终结论：PASS（仅当前冻结规格）。** 下列三个首次审查缺口已由末尾“差异复审”列明的保守方案闭合；首次输入与反例保留用于追溯。允许在已授权准确写集内进入 RED 与本地实现，不签尚未发生的实现或安装验收。

## 首次审查实际输入

- `docs/features/t1423-legacy-license-one-click-upgrade.md`：`13531009d770ff8643d06068828171f6f262c73262ebdd645ecc504098ff310d`。
- `docs/verification/t1423/CLIENT_WIRE.md`：`4e6ebf583fa5a9413470f5984c76bc6859a0781789b3e6d81e7112ce4b59a207`。
- `orchestrator/context/T-1423.md`：`814534cb4e2b2b0f399e7d3c198c0fa47e1d48c87ca28773f5acd3d02d86e6f6`。
- `orchestrator/DECISION_LOG.md`：`cf8da421aea5fcde3e30c9b71ecd43a46f5954e767a5bbed568c9e8deb0ab13a`。

已读任务包 §1–5、§7–9 与准确 §6；本次仅写此审查工件。DEC-140202 明确以无感入口替代历史手动确认；旧安全、期限、钱包幂等、强验签和 checked 保存要求继续适用。

## 首次发现（已由末次修订闭合）

### 1. 唯一 token 不能保存跨窗口与重载后的原生 unknown

SPEC 111–114 行与 CLIENT_WIRE §11 只规定 Node 唯一 automatic token、墓碑和单 WebView 模块级 coordinator。现 Node `UpgradeObservation` 仅保存 actor/identity/proof/boot/expiry/inFlight/fulfillSent（`model-benefit.server.ts:152`），不知道 native 是否已调度或 checked 是否未知；旧组件的 `needsNative/nativePending` 为组件 ref（`channel-model-configuration.tsx:33–36`）。

确定反例：A 已调用 native，服务器可能已恢复，checked 保存结果 unknown；A 关闭或重载。B 取得同 token，fresh proof 与 credentials 均 ready，直接 sync 并发布整体 ready。Rust 同 token 拒绝二次消费只能防重复写，不能让 B 得知 A 的未确认保存，不能当作已成功回执。

必须在合同中指明同 boot 跨窗口/重载共享的、保守单调的 native-attempt/未确认状态来源，以及原子占用与实际 IPC 调度顺序。无可靠本次 checked 确认时不得整体 ready 或增加 successRevision。共享记录只限制执行/展示，不能替代 Rust/Activity 权威；不可只放组件 ref/sessionStorage。若新增报告或 lease 字段，应冻结 exact 枚举/校验/丢响应语义。

经济 unknown 与原生 unknown 必须区分：前者原 Key 只读查明确认后可 sync；后者不能用 fresh proof 抹去未确认。当前“只读 probe 和必要 sync”需明确原生未知时的保守分支。

### 2. 既有全局 generation 会让正常并发耗死唯一观察

现 `model-benefit.server.ts:127` 每次 access 都递增全局 observationGeneration；第129/133/142行因此拒绝此前操作。自动 sync 与另一窗口 probe、普通 bootstrap/scheduled 读取并发时，即使原许可/actor 未变，也可互相取消。唯一观察若因此被终止，既不能重建 token，又可能无法完成配置；若自动重复新观察则违反墓碑要求。

必须明确同观察的 singleflight/并发响应，以及普通只读、同许可其他 scope 与升级写的 generation/commit fence 协调。允许有界 pending/只读重试，不能由普通只读无条件废弃合法自动观察，也不能删掉真实身份/跨 scope 的提交屏障。TDD 应控制两个请求交错，而非仅顺序调用。

### 3. 重载复用 opaque token 时必须继承原绝对截止

第729秒新窗口取得原 opaque token，现响应仅含 token 和闭合 DTO，JS 无法获知原到期时间；若从挂载重新设730000ms则续期。旧 server 下游 fetch 使用120000ms独立上界，token仅前后检查，剩1秒仍可等待120秒。

必须冻结原截止的安全传递/约束方式：例如响应仅新增原 expiry 的闭合 UTC header，客户端取自身观察上限与 server 原截止的较早值，后续同 token 不接受延长；同时 Node 对 automatic 每阶段及下游 signal 收紧到原 entry 剩余预算。不得因 reload、scope 返回、重试或 joined flight 续730000ms。native仍独立保持min(370000,token剩余)及真实收尾互斥。

## 已确认可沿用的窄设计

- 正常 authenticated desktop layout 将 bootstrap 移入 WorkspaceInitializationProvider，等待真实 ready 与 licensed/未撤销判定；web/SSR/未就绪不发请求。不增加 license_check 轮询。
- creationScopeKey 以 group 优先、组内 account 过滤不作为独立经济身份；真实 actor 继续由 server cookie/RequestContext 决定，旧结果按 scope/generation 拒绝追写。
- automatic 索引按 actor/boot/稳定原许可绑定并保 tombstone，256满 fail-closed、不驱逐后重复写；普通 scheduled/bootstrap 不获 fulfill 能力。
- 设置只订阅安全状态。sync 加 fresh routing 成功且不存在未确认 native 才允许 successRevision 增加；只清同 scope、早于该成功的旧错误，正在打开额度中心的新错误不得被迟到成功清掉。无 router.refresh/自动切个人模型来源/自动充值。
- 下次真实冷启动可按当前权威原对象新观察，不自动沿用旧摘要或新建经济身份；原钱包、首赠、期限和其他有效绑定规则不变。

## 证据边界

本轮仅文档与当前源码只读审查，未发送许可/Growth/Activity 请求，未执行 native IPC、测试、打包或安装；不签实现、浏览器、桌面、生产或性能 PASS。已真实恢复的本机不是缺绑定场景的替代测试。以上缺口闭合后须绑定新 SPEC/CLIENT_WIRE SHA 差异复审，不改旧审核收据。

## 差异复审：最终冻结规格 PASS

末次复审时间：2026-10-23T11:13:51.264649+00:00。逐字重读 SPEC“无感升级修订”与 CLIENT_WIRE §11，核对协调者最终冻结摘要。

最终实际输入：

- `docs/features/t1423-legacy-license-one-click-upgrade.md`：`ec21ef98e66b266f88dacc217480b12eb3c351d49ef035de754d28e8e7747808`。
- `docs/verification/t1423/CLIENT_WIRE.md`：`d730be398988dda422a8652bbfea27eaefe1baed821f9ff84deb28e3fb63184d`。
- `orchestrator/context/T-1423.md`：`814534cb4e2b2b0f399e7d3c198c0fa47e1d48c87ca28773f5acd3d02d86e6f6`。
- `orchestrator/DECISION_LOG.md`：`cf8da421aea5fcde3e30c9b71ecd43a46f5954e767a5bbed568c9e8deb0ab13a`。

闭合判断：

1. **不再跨 realm 发放原 token。** 首次无 token automatic probe 原子占位，创建前后异步边界二次核对；仅首响应拥有 token。其他窗口/reload/首响应丢失后的无 token 请求返回既有 closed proof/unknown/UPGRADE_SERVICE_UNAVAILABLE 投影，无 token 响应头、无下游、不接管。索引到 cold boot 才清空，过期/失效也保墓碑，不因返回旧 scope 新发写资格。其他 realm 因而不能 fresh-probe 后绕过原生 unknown；代价是该启动内保守待确认，下一正常冷启动才重新核对，合同已明确且不要求用户点击。
2. **原 realm 仍保完整原生门。** coordinator 共享 flight 与原截止，卸载订阅不解除实际原生互斥；native unknown 仅 probe，禁止 sync、整体 ready 与 successRevision。pending/blocked 沿既有合法 DTO 分支停止经济链。经济 unknown 可在只读确认原 Key ready 后 sync，未确认不能重发 fulfill。该策略无需新增报告协议、数据库或 Rust 命令；Node 索引不是许可或钱包权威。
3. **明确全局 generation 并发优先级。** automatic stage 的 inFlight 覆盖 access 前准入及整个阶段；普通会进入 model-benefit access 的读/履约/link 在 ++generation 前返回既有 retryable MODEL_BENEFIT_REFRESH_PENDING。此前已开始的普通读取继续被原 generation/commit fence 拦迟到提交；自动跨阶段使用 fresh access，阶段之间允许普通读取。既不删除真实身份/提交屏障，也不把延期伪装成功。必须以交错 RED/GREEN 验证。
4. **预算不续期。** 唯一 owner 的客户端730000ms从首次 ensure 入场开始，早于 Node issuedAt；同 realm 重挂复用同 promise/deadline。其他 realm 无 token，无法另开原操作链。Node每stage及下游signal同时 clamp 到原entry剩余；native保持min(370000,token剩余)及真实收尾guard。故不需新到期header，剩1秒/网络读体跨截止仍须由实现与测试证实硬停。

其余审查结果：

- 同 group 下账号筛选使用既有 creationScopeKey，不误造独立经济主体；真实授权仍沿 server RequestContext，scope切换/异步迟到只停止旧提交与展示，不能把旧native成功投到新组。
- 最近许可判定与后续事件须以实际 desktop、workspace ready、licensed 且未撤销为门；无轮询 license_check、web/SSR/未就绪无副作用，许可事件不得重入已有 flight。
- 设置页只订阅安全状态；完整 sync 与 fresh routing 后才记成功，原生未确认不得成功；旧错误仅在同scope且该成功新于错误创建时清除，正在打开额度中心的新错误保留。个人来源不改，无自动充值/消费、无整页刷新。
- 严格 token/AES/boot/stable identity、Activity强验签、checked保存、期限/次数/其他有效绑定、原经济幂等合同未变。本次准确新增五文件及已列旧TS路径，不涉及新Rust/Activity/Growth产品源码。

**未闭阻断：无（限上述冻结规格）。** 后续源码独审必须核首次占位的真实原子性、native unknown分支、普通请求交错、原剩余signal、双窗口/reload无token不下游、scope切换与旧错误revision；不得用历史手动链通过替代这些新增实际RED/GREEN。

本次只写此审查工件；未改产品/规格/控制面、未发真实请求或执行native/测试/打包安装。SPEC PASS 不代表源码、浏览器、真实桌面自动启动、生产或性能验收 PASS。

## reviewctl Round 3 输入建议

已只读核 `reviewctl.mjs` 的真实 `spec-review-round/v2` 校验：packet只允许schema/review_kind/summary/findings；round由真实历史计算，不能在packet伪填。当前按Root确认的历史第二轮之后记录第三轮recheck；以下JSON可由Root提取为新输入，再真实record，不覆盖原round2收据。本审查者未写控制面或运行record。

```json
{
  "schema": "spec-review-round/v2",
  "review_kind": "recheck",
  "summary": "T-1423 无感修订独立差异复审通过，仅冻结规格：SPEC ec21ef98e66b266f88dacc217480b12eb3c351d49ef035de754d28e8e7747808，CLIENT_WIRE d730be398988dda422a8652bbfea27eaefe1baed821f9ff84deb28e3fb63184d。首次无token唯一owner不交接，后续跨窗口/reload/丢响应无token且零下游并保墓碑；native unknown仅probe禁止sync/整体ready；普通access在自动inFlight时于generation递增前retryable延期；原客户端截止与entry剩余下游signal均不续期。原强验签/checked/稳定对象/钱包幂等不变。无未闭阻断，允许准确授权写集内RED和本地实现；不签尚未发生的源码、浏览器、桌面或生产验收。",
  "findings": []
}
```
