# spec-review 评审记录:授权判定原生化 SPEC(license verdict → verdict-bound handshake token)

- **被审 SPEC**:`docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.md`
- **review_mode**:`cross-family`(独立上下文 subagent,只喂宪法 + 本 SPEC 全文,未暴露作者身份/上游任务/代码 memory)
- **日期**:2026-07-21
- **verdict**:`CONCERNS` — 无 blocker(方案理论成立且合宪法);有 1 个 major 需在开工前定死(web-mode 绕道),另有 2 major + 4 minor 需澄清/补锚。
- **传递纪律**:仅读了「宪法(`docs/产品定位.md`)+ 本 SPEC 全文」,以及 SPEC §1 声明的 file:line 5 处(licensed.rs / lib.rs / activation-gate.server.ts / license-file.server.ts)用于核实复用真实性,未越读代码。

---

## Findings

### F1 — major / soundness:web-mode 绕道未闭环,本 SPEC 声称的「挡裸启」被 `isDesktopRuntime` 短路旁路

- **reviewer 指控**:SPEC 的核心承诺是「攻击者绕 Rust 壳裸启 sidecar → 拿不到 verdict-bound token → sidecar fail-closed 拒 → 白嫖失败」(§0/§3)。但 `activation-gate.server.ts:39` 现存的 web/dev 硬短路是 `if (!isDesktopRuntime(env)) return true`(即 `env.CREATOROS_DESKTOP !== "1"` 时立即放行)。攻击者裸启 sidecar 时**只要不设 `CREATOROS_DESKTOP=1` 这个 env**,activation-gate 立即返回 true,连读 verdict-token 都不用碰——本 SPEC 的整根信任边界被这一行绕过。SPEC §4.4 只说「activation-gate 改造:读 process.env.CREATOROS_VERDICT_MODE」,没有说明「攻击者伪装 web 模式」这一路径怎么挡。
- **证据/理由**:
  - `frontend/src/lib/activation-gate.server.ts:38-41` 现存代码:`if (!isDesktopRuntime(env)) return true;`
  - `frontend/src/server/activation/` 目录里 `isDesktopRuntime` 仅根据 `CREATOROS_DESKTOP` env 判断——env 完全在攻击者控制下。
  - SPEC §3「防」列的三条攻击链均假设 attacker 走桌面模式,遗漏了「伪装 web」这一更简单的旁路。
- **建议处置方向**(不重写):在 §4.4 sidecar 侧校验逻辑增加一条硬门:**sidecar 启动最早期(instrumentation.ts)判定「dev 分支入口」时必须绑一个 Rust 壳独有的、与 verdict-token 同源签发的 dev-mode marker,或直接把「有效 verdict-token」作为「进入 activation-gate 的前置」——即 `isDesktopRuntime` 判定的准入条件从 `CREATOROS_DESKTOP=1` 收紧为「或者:签名合法的 verdict-token 在 env 中」**。若 dev 场景需要保留 `CREATOROS_DESKTOP=0`,则要求 dev sidecar 必须由本地 `pnpm dev` 启动(与 dev 环境标志绑定),而非"没有任何标志就默认放行"。ac 里补一条:`ac-1b 攻击者不设 CREATOROS_DESKTOP 直接裸启 → sidecar 仍 exit(1)`。

### F2 — major / soundness:私钥「不进 app 二进制」的声明与「`env!()` + `obfstr!` 编译期注入」的实操自相矛盾

- **reviewer 指控**:SPEC §4.1 前半句「私钥只存开发者机器/CI secret,**从不进 app 二进制**」与后半句「构建期通过 `env!("CREATOROS_VERDICT_SIGNING_KEY_B64")` 注入 `license.rs`,再用 `obfstr::obfbytes!` 编译期混淆存储」直接冲突——`env!` 是编译期宏,展开后混淆字节**就是 Rust 二进制的一部分**。§8「私钥泄露 = 完全失守。故私钥只存开发者机器/CI secret,不进包」同样口径。ac-9 又说「grep 不到明文私钥」——若真「不进包」,ac-9 就不必存在(grep 什么都找不到,不是因为混淆而是因为不存在)。诚实边界表述前后不一,读者会误判防御强度。
- **证据/理由**:
  - SPEC §4.1「私钥」段(第 105 行)、§8 第三条(第 201 行)、ac-9(第 193 行)三处并读。
  - Rust `env!()` 宏语义:编译期把 env 值内联进二进制;`obfstr!` 只是对内联后的字节做编译期混淆,存储位置仍是二进制 rdata 段。
- **建议处置方向**(不重写):把 §4.1 和 §8 中「不进 app 二进制」修正为「**私钥经 obfstr 混淆后进 Rust 二进制;明文私钥不进 git、不进 CI 制品、不进用户机器磁盘**」。诚实边界追加一条:「攻击者动态 dump `license.rs` 加载后的内存(Frida/gdb attach)仍可提取私钥,与 T-372 §18/本 SPEC §8「不防专业逆向」同边界」。ac-9 保留(它验证的是"静态 grep 拿不到"这一较弱但仍有价值的门槛)。

### F3 — major / completeness:activation-only → licensed 的过渡未定义,同一 sidecar 进程能否切模式?若不能则激活成功后必须重启 sidecar,但 SPEC 未说 UX

- **reviewer 指控**:SPEC §4.3 明确「verdict.allowed=false 时 Rust 签发 `mode=activation-only` 降级 token → sidecar 启动但 proxy.ts 只放 `/activate/*`」。用户在 /activate 输入激活码 → Tauri IPC 调 `license_activate`(§4.3 引用的 command)→ Rust 决策链跑通 → verdict.allowed 变 true。但**当前 sidecar 进程持有的 verdict-token 里 `mode` 还是 activation-only**,proxy.ts allowlist 也还是激活页;不重启 sidecar,用户激活成功后仍进不了主应用;要重启 sidecar,用户当前 UI 状态/未保存工作就断了。SPEC 只在 ac-7(revoked)场景说「当前进程用旧 token 跑到自然退出」,对 activate→licensed 这个正向过渡没有说明。这是决定用户第一次装机体验成/败的核心路径。
- **证据/理由**:SPEC §4.3、§4.4、ac-6 通读;ac-7 描述「revoked 广播 license-decision → sidecar 收到降级信号(既有 event 复用)」——若 revoked 有事件通道,那么 activated 也应该有对称通道,SPEC 却缺席。
- **建议处置方向**(不重写):明确二选一并在 ac 里锚死:(a) sidecar 内部通过既有 `creatoros://license-decision` 事件在**运行时刷新** `CREATOROS_VERDICT_MODE` 全局标志 + 通知 proxy.ts 放开 allowlist——但仍需说明这里的信任边界(事件通道可被 patch,但事件本身不是签发端)。(b) 由 Rust 壳在 activate 成功后**优雅重启 sidecar**(kill + spawn),前端显示「授权成功,应用初始化中」loading。补 ac-6b:`未激活→输入激活码→激活成功→主应用可访问`。

### F4 — major / soundness:setup 顺序改造依赖同步 verdict,但决策链含在线 status(需网络),会在离线首启阻塞或错判

- **reviewer 指控**:SPEC §4.3 说「lib.rs:946 附近生成 handshake token 处改为先跑一次 verdict,拿到结果后调 sign_verdict_token」——但当前 `lib.rs:991 license::startup_license_task` 是**异步**(启动线程 + 心跳循环),生产链路 `run_chain_and_persist` 会调 `ReqwestHttp` 联网(license.rs:1849-1852)。若改成同步阻塞 setup:(a) **离线首启**联网失败要么阻塞窗口不出,要么读旧 .license 快照 fallback——SPEC 未指定 fallback 策略(SPEC §6 兼容性只说了 allowed=true/false 两条,没说「同步跑不到、但有 .license 快照」这类瞬态)。(b) 网速慢时 splash 延长 → UX 灾难,与 PRD NFR-PERFORMANCE「冷启动到可交互 P95 ≤ 5s」冲突。
- **证据/理由**:
  - `license.rs:1847-1867 run_chain_and_persist`:同步调用 `ReqwestHttp` timeout 10s。
  - `lib.rs:991 startup_license_task`:异步 spawn。
  - SPEC §4.3「拿到结果后调 sign_verdict_token」隐含同步依赖,但未说时间预算。
  - 宪法 NFR-PERFORMANCE 冷启动 P95 ≤ 5s(第 372 行);"永久离线可用"含义见 P-04 本地优先(第 111 行)与 R-DESKTOP 断网条(第 302 行)。
- **建议处置方向**(不重写):§4.3 补一段「离线/慢网决策规则」:(a) setup 时先**读 .license 快照**(纯本地,无 IO 延迟),据此签 token;快照缺失且离线则签 activation-only + 提示「需联网首次激活」;(b) 在线心跳异步更新 .license,下次启动生效——与 T-372 已有的心跳节奏对齐;(c) 补 ac-10:`离线首启 + 有效 .license 快照 → 签 licensed token,sidecar 起,主流程可用`;`离线首启 + 无 .license → activation-only`。

### F5 — minor / fit-positioning:里程碑 M1/M2/M3 有「分阶段做减法」嫌疑,与 CLAUDE.md「一次从 0 到 1 做完」相冲

- **reviewer 指控**:SPEC §10 三阶段里程碑,M1「密钥脚本 + Rust setup 改造」、M2「proxy allowlist + 公钥烘焙 + ac 测试」、M3「双平台真机 + CI + 老装机升级」。虽然可读作「实施拓扑」而非「先发减法版本」,但 M2 里的 ac-1~ac-9 是 SPEC §7 声明的必测锚,把它放到 M2 意味着 M1 完成时**验收锚未跑**——形式上是分期。宪法/CLAUDE.md 铁律:任务定义清楚即一次做完,分期做减法禁止。
- **证据/理由**:SPEC §10;CLAUDE.md §4「严禁多阶段执行」。
- **建议处置方向**(不重写):把 §10 改为「实施依赖顺序」而非「里程碑」(与产品定位 §15 修复实施依赖顺序表述对齐),明确「所有 ac-1~ac-9 + 双平台真机 + CI 全绿是一次交付边界」。

### F6 — minor / completeness:Windows 平台差异未有独立 ac,历史证据表明 mac/win 分支频繁踩坑

- **reviewer 指控**:ac-8 只说「dev 桌面」,ac-1~ac-7 均未指定平台;M3 才提「mac + Windows 真机四主链」。T-372 家族的 win 分支差异不小(见 SPEC §1 表格 `lib.rs:1082 mac 分支 / :1185 win/linux 分支`—— env 注入两处独立),win 环境 sidecar 是 `app.shell().sidecar()` 而 mac 是直接 `std::process::Command`,ChildStdin 传 master key 的时序、env 传递的编码差异都可能踩坑。缺 win 单独 ac 会漏。
- **证据/理由**:SPEC §1 表格 `lib.rs:1082/1185` 双分支;SPEC §7 ac 无平台维度。
- **建议处置方向**(不重写):把 ac-1~ac-7 加一列「mac / win 各跑一遍」;或明确补 ac-8b「Windows 真机装包 → 未激活 → 激活 → licensed 四主链全绿」。

### F7 — minor / completeness:老装机升级 + 弱验签用户存量 ac 缺失

- **reviewer 指控**:SPEC §6 承认「若真的还有仅靠 sidecar service.check() 才认的存量激活...这类用户升级后需重新走一次激活。风险面小」——但没有 ac 覆盖此群体升级后的 UX(重激活提示是否清晰?已保存创作数据是否保全?)。产品定位 R-DESKTOP 「升级失败保留原数据并给恢复路径」是硬约束。
- **证据/理由**:SPEC §6 兼容性段末;PRD 第 300、302 行。
- **建议处置方向**(不重写):补 ac-11「老 gate-F2 弱验签存量装机升级 → 弱验签路径删除后 → verdict 决策链跑通 → 无感继续;若跑不通 → 明确提示需重新激活 + 领域数据 hash 前后不变」。

### F8 — minor / completeness:.license 保留作「展示副本」+ verdict-token 双数据源可能漂移,UX 未说明

- **reviewer 指控**:SPEC §4.4 明确 `.license` 快照仅作设置页展示副本,verdict-token 才是放行凭证。运行中若心跳更新 .license(比如授权 revoked/expiresAt 变化),但当前 sidecar 进程持有的 verdict-token 未刷,用户看到「设置页显示已撤销」但主应用照常跑到自然退出。SPEC §11 OQ-2 提到 revoked 强杀风险但保守选择「下次启动拒」;UX 侧「显示已撤销但仍能用」的说明缺席,可能造成用户困惑或客服工单。
- **证据/理由**:SPEC §4.4、§11 OQ-2。
- **建议处置方向**(不重写):在 §4.5 或 UX 影响段追加一句「settings 页面显示 verdict 状态时,同时展示『本次会话使用启动时判定,重启后生效』说明」。或直接把 OQ-2 收敛为「已确认保守方案 + 明确 UX 提示」。

---

## 五问自检

1. **合宪法**:大方向合。SPEC §3/§8 声明的「不防专业逆向」「不防 patch Rust 二进制」「不防内存 dump」与产品定位 §16 line 455「不承诺客户端对专业逆向完全保密」一致;NFR-SECURITY(loopback token / 精确校验)沿用并加强。**无违宪法**。有一处静默扩范围嫌疑:SPEC 表述「不进 app 二进制」实为「混淆后进包」,可能让读者误认为防御强度高于宪法上限——F2 已列。
2. **方案成立**:Ed25519 签名方案正确(sidecar 只需公钥即可 verify,私钥单向不可伪造);token 结构(machineId + expiresAt + port + nonce)覆盖了跨机重放、过期、跨端口复用三类攻击。理论上成立。**但**有两处硬钉子:F1(web-mode 绕道未挡)与 F4(setup 同步/异步时序)——不解决,方案的实际信任边界会显著弱于声明。
3. **关键漏洞**:
   - F1「activation-only 状态下攻击者能否通过它绕整个 gate?」——**能**(通过 `CREATOROS_DESKTOP=0` 伪装 web,连 activation-only 都不用领);SPEC 未考虑。
   - F4「网络不通/服务器挂,签发路径怎么走?」——SPEC 未明确;可能触发离线灾难或加长冷启动。
   - F3「activation-only → licensed 过渡」——SPEC 未定义;直接影响首启用户体验。
   - `.license` 双数据源漂移(F8):非致命,但需要 UX 说明。
4. **复用真实性(抽 5 条)**:
   - `license.rs:1-16 mod doc` ✅ 属实(T-372 L2 决策链模块说明);
   - `license.rs:188-206 GateDecision` ✅ 属实(结构体定义在此,含 licensed/status/mode/revoked/updates_blocked/signature_verified 等字段);
   - `license.rs:2017-2023 gen_handshake_token` ✅ 属实(32B hex OsRng 生成);
   - `lib.rs:946 handshake_token = license::gen_handshake_token()` ✅ 属实(在 setup 内同步生成);
   - `activation-gate.server.ts:44 return verdict.allowed === true` ✅ 属实(第 44 行确实是这句;整段 gate 逻辑与 SPEC 描述一致);
   - 额外抽到 `activation-gate.server.ts:47-52` 弱验签回退 ✅ 属实;
   - `license.rs:67 obfstr::obfbytes!(b"creatoros-license-v1")` ✅ 属实(license_key_context 函数)。
   
   **file:line 复用声明全部真实,无造假**。SPEC 基于的现网事实前提可信。
5. **验收覆盖**:ac-1~ac-9 覆盖了签名伪造、过期、端口不匹配、licensed 主链、activation-only、revoked、dev、私钥自审——**核心密码学面覆盖到位**。**漏洞**:
   - 平台维度(F6);
   - activate→licensed 正向过渡(F3);
   - 离线首启/在线心跳失败瞬态(F4);
   - 老装机存量升级(F7);
   - web-mode 绕道 ac-1b(F1)。

---

## Verdict 与开工建议

- **verdict:CONCERNS**
- **CONCERNS 逐条处置后可开工**:
  1. F1(web-mode 绕道)——**必须先在 SPEC 内明确闭环方案**(推荐:sidecar 启动时 `isDesktopRuntime` 门条件收紧为「CREATOROS_DESKTOP=1 且 verdict-token 存在且验签通过」;dev sidecar 走独立 dev-mode 分支);
  2. F2(私钥进包表述)——修正 SPEC §4.1 和 §8 表述,校准诚实边界;
  3. F3(activate→licensed 过渡)——决定「运行时事件刷新」vs「优雅重启 sidecar」二选一并补 ac-6b;
  4. F4(离线/慢网 setup 时序)——补「先读 .license 快照签 token,心跳异步更新」规则 + ac-10。
- **minor(F5/F6/F7/F8)** 可与实施并行:里程碑改「实施拓扑」;ac 加平台维度;补老装机 ac-11;补 UX 提示句。
- **T-447 合并(OQ-1)建议合并**:verdict-bound token 在语义上是 T-447「Rust 壳独有 magic」的严格超集(magic 只挡「随包 node 裸启」,verdict-bound token 挡的更广且带密码学身份);合并后可减少一份 SPEC 与一次 gate,风险面同一处;若 T-447 已产生独立 BACKLOG task,建议在本 SPEC 通过后归并/关掉。**用户须在 gate 关闭时拍板确认合并**。
- **若通过后建议开工顺序**:
  1. 修 F1(收紧 isDesktopRuntime 门 + web/dev 分支绑 dev-only marker,决定信任边界);
  2. 密钥生成脚本 + CI secret 落定 + F2 表述修正;
  3. `sign_verdict_token` + F4 离线 fallback + setup 顺序改造;
  4. `verdict-token-gate.ts` + activation-gate 重写 + F3 过渡决策 + proxy allowlist;
  5. 公钥烘焙 build-sidecar;
  6. ac-1~ac-11(含新增)单测 + 集成 + 双平台真机;
  7. 老装机升级验证 + release CI 加双 secret。

---

*本评审基于独立上下文;file:line 引用均来自读被审 SPEC 与其明确声明的现网证据文件,未越读其他任何代码/memory/上游任务。SPEC 作者身份未知。*
