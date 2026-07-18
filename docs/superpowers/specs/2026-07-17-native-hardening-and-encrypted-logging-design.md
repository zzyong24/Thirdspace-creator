# 发布前加固 SPEC(第二层):native 防逆向软加固 + 加密日志

> 状态:**实现 SPEC**(改架构 + 改信任边界)。**必过 spec-review gate**:①native 反制(反调试/去单点化/自校验)= 运行时信任边界变更;②master key 传递从 env 明文改受保护通道 = 密钥载体边界变更;③日志落盘从明文改非对称信封加密 = 新增开发者密钥信任根。
> 前置真值:产品定位 PRD(`docs/产品定位.md`,NFR-SECURITY/NFR-PRIVACY/§16/R-DESKTOP);[T-372 授权加固 SPEC](2026-07-17-license-hardening-and-dual-platform-design.md)(本 SPEC 是其 §18「明确非目标:不防专业逆向」之下一层);[防逆向加固调研](../../research/2026-07-17-anti-reverse-engineering-hardening-research.md)(5 路子代理,含全量对比表 + 用户 2026-07-17 拍板)。
> 需求来源:用户 2026-07-17 提供抖音教程视频(Frida+Claude Code 自动 hook 授权),要求「全面调研市面逆向技术 + 出更健壮破解成本更高的加密方案 + 日志加密只有我能解」;定性「内测前必须上加密防逆向 = 最高战略」。用户拍板见调研 §7。
> 关系:T-372 收口既有授权体系(六类低成本攻击);本 SPEC 补 native 层(Frida 运行时 hook + 密钥提取 + 日志明文)。不新建授权体系。

---

## 0. 背景与驱动

T-372 已把放行权威迁到 Rust,使抖音教程「hook JS 授权」这条 T1 路径失效(收益已落袋)。但调研钉死:①Frida 同样能 attach Rust 进程 hook `verify` 返回值;②master key 经 env 明文注入 sidecar + `.master-key` 明文文件兜底,进程/崩溃转储可捞;③诊断日志 `sidecar.log` 明文落盘,第三方拿到即读。这三点都在 T-372 §18 明确排除范围外。本 SPEC 按用户拍板收口**内测可交付子集**:Part A 加密日志 + Part B native 软加固。server 侧破解经济学(更新绑授权/遥测吊销)依赖 L1s 服务端(非本仓)且不阻塞内测,列 Part C 后续波次。

**诚实边界(全程不动摇,对齐宪法 §16 line 455)**:目标 = 挡跟教程的小白(已达成)+ 把 attach/提取/读日志从「分钟级」抬到「需真逆向」+ 让破解成本高于买断价;**非**「不可破解」。patch 编译后 Rust 二进制仍可绕过 Part B,这是理性接受的现实(兜底靠 Part C server 吊销 + 更新饥饿)。

---

## 1. 现网事实 / 仓内已有实现(带 file:line 证据)

| 断言 | 状态 | 证据 |
|---|---|---|
| sidecar 日志 tee 落盘 + 脱敏 + 轮转 | **已存在,加密改造** | `frontend/src-tauri/src/logging.rs:31-53`(`SidecarLogger`/`redact_log_line`/`init_sidecar_logger`;`Arc<Mutex<BufWriter<File>>>`,每行 flush);`sidecar.log`→`sidecar.prev.log` 两份轮转 |
| **诊断日志明文落盘** | **无加密(短板 H1)** | `logging.rs:6,15` 落 `appDataDir/logs/sidecar.log` 明文;脱敏仅遮机密字段,正文明文;设置页「打开日志文件夹」用户直发开发者 |
| master key 取/建 + 注入 sidecar | **已存在,传递加固** | `lib.rs:40,57,64`(`KEYCHAIN_KEY_NAME="master-key"`,base64 注入 env `CREATOROS_MASTER_KEY`) |
| **master key env 明文注入 + 文件明文兜底** | **无保护(短板 H2)** | `lib.rs:57`(env 注入,`ps e`/`/proc/<pid>/environ`/崩溃转储可捞);`lib.rs:71,83`(`<appDataDir>/.master-key` 明文文件兜底,未签名下 keychain 读不回时用) |
| Rust 校验决策链 + `.license` 放行权威 | **已存在(T-372),软加固叠加** | `license.rs:5-13`(`run_license_chain` 全端口注入;`.license` AES-256-GCM Rust 独占写=放行权威) |
| **放行判定单点 / 无反调试 / 无灭靶点** | **无实现(短板 H3)** | `license.rs` 决策链集中;内嵌 Ed25519 公钥为连续常量(T-372 §4);无 anti-debug/anti-Frida 自检;字符串常量未加密 |
| macOS 代码签名 / Hardened Runtime | **无实现(短板 H4)** | T-372 §12「内测不签名」;`tauri.conf.json` 无 hardened runtime entitlements;`codesign.mjs` 已备但缺证书 |
| Rust 现有加密依赖 | **已存在,复用** | `Cargo.toml`:`aes-gcm=0.10`、`ed25519-dalek=2`、`sha2=0.10`、`rand=0.8`、`base64=0.22`、`keyring=3`(加密日志仅需新增 `x25519-dalek`+`hkdf`,与 `ed25519-dalek` 共享 curve25519 依赖) |

---

## 2. 现成方案调研与选型(≥2 候选 + 采纳/弃用 + ≥2 被否决形态)

全量对比表(含被否决项 + 理由)见[调研归档](../../research/2026-07-17-anti-reverse-engineering-hardening-research.md) §2-§6。选型权重:匹配度 > 维护成本(单人)> 抬高攻击成本,红旗(杀软误报/与打包链冲突/明确非目标)一票否决。

**加密日志密码学方案**:

| 候选 | 采纳/弃用 | 理由 |
|---|---|---|
| **自组 framed hybrid**(X25519 ECDH→HKDF-SHA256 包裹会话密钥 + 每 flush 一帧 AES-256-GCM) | **采纳(用户 2026-07-17 拍板)** | 唯一同时满足「崩溃留最后几行」+「部分可解密」两条硬约束;复用现有 `aes-gcm/sha2/rand`,仅增 `x25519-dalek+hkdf`;格式简单可自审 |
| age crate 整文件加密 | 弃用(留作省心退路) | 解密工具白送(`age`/`rage` CLI),但 STREAM 64 KiB 缓冲**违反「崩溃留最后几行」**(丢最近 <64 KiB);用户明确保留该硬约束 |
| libsodium sealed box(`crypto_box_seal`) | 弃用 | 语义精确但正文流式仍需自套 AEAD 帧 + 新依赖,无净收益 |
| RSA-OAEP + AES-GCM | 弃用(被否决形态①) | 密钥大/慢/padding 易误用,X25519 时代无理由 |
| HPKE(RFC 9180,`hpke-ng`) | 弃用(被否决形态②) | 对日志体量过重、生态新(2026) |

**native 软加固技术**:

| 候选 | 采纳/弃用 | 理由 |
|---|---|---|
| **macOS Hardened Runtime 全开 + 不给 `disable-library-validation`/`get-task-allow`** | **采纳** | 零成本废掉 DYLD_INSERT/dylib 注入/非特权 task_for_pid;mac 侧最高杠杆(ROI★★★★★) |
| **放行决策去单点化(结果参与后续真实计算)** | **采纳** | 唯一同时治 Frida 与静态 patch 的设计手段 |
| **反调试自检 `secmem-proc` crate(静默降级)** | **采纳** | 现成跨平台;检测到不硬崩,降级为静默失效(降误伤+不给定位信号) |
| **灭靶点 `obfstr` 加密公钥/license 字符串 + 公钥拆分** | **采纳** | 近零成本灭 grep/熵扫描靶点 |
| **master key 传递废 env 改 stdin/命名管道 + `zeroize`/`secrecy`** | **采纳** | 消灭 `ps e`/崩溃转储捞明文这条最廉价泄露路径 |
| VMProtect/Themida 全量加壳 | 弃用(被否决形态①) | Defender `Trojan:Win32/VMProtect` 泛检测 + Themida 长期误报 + 与 notarization 冲突 + 体积/性能 10x-100x + 年费维护税;收益(挡专业逆向)恰是明确非目标 |
| white-box AES/ECC | 弃用(被否决形态②) | 学术已全破(BGE/DCA/DFA);付最贵价买明确非目标 |
| 全量 OLLVM/O-MVLL 混淆 | 弃用 | 与 LTO/打包链冲突,T-164 已有混淆崩 chunk 前科;O-MVLL 非 Rust 一等 |
| `.text` 段自校验 checksum | 弃用(本轮) | ASLR/代码签名页/双平台段布局→误报崩溃,维护脆,单人 ROI 差 |
| master key 绑硬件(Secure Enclave/TPM) | 弃用(本轮,用户拍板排后) | 两套 FFI + 换机/重装失效需迁移兜底;与买断永久离线冲突;留未来演进 |

**被否决的整体形态(≥2)**:①「上重型商用 DRM(VMProtect/Themida)一步到位」——被杀软误报 + 公证冲突 + 明确非目标否决;②「本轮即上硬件不可导出密钥(SE/TPM)」——被用户 2026-07-17 拍板排后(维护重 + 失效兜底未就绪)。

---

# Part A — 加密日志(短板 H1;`logging.rs`,独立文件,可先并行开工)

## 3. 威胁模型与边界

- **防**:拿到用户机器/日志文件的第三方(设备被盗、Time Machine/iCloud/OneDrive 意外上传、恶意软件外传 `logs/*`)、用户无意泄露(贴公开 issue/群)、传输截获。攻击者拿到只是密文,机器内**无任何解密秘密**(只内嵌开发者公钥)。
- **不防(诚实)**:运行时内存明文(另一层)、被篡改二进制(靠 Part B + 签名)、开发者本人(持私钥=设计目标)、定向国家级对手。
- **与脱敏关系**:**叠加不放宽**(纵深)。脱敏(`redact_log_line`)管「永不该存在的机密」(master key/cookie/token,连开发者也不该看),加密管「不该被外人看的正文」。私钥若失守,脱敏是最后一道墙。对齐 NFR-SECURITY line 348「日志进入任何 sink 前脱敏」+ NFR-PRIVACY line 353「不能明文出现在…日志」。

## 4. 密码学方案(framed hybrid,用户拍板)

- **密钥**:开发者本地生成 X25519 密钥对,**公钥内嵌 app**(Rust 常量,base64);私钥仅存开发者机器(备份进密码管理器/冷备),**从不进 app**。
- **信封**:客户端每个日志文件生成随机 32B `session_key`;用临时 X25519 密钥对与内嵌开发者公钥 ECDH → HKDF-SHA256 派生 `K_wrap` → AES-256-GCM 包裹 `session_key`,写进文件 HEADER(只一次)。
- **正文**:每次 flush 一帧,`AES-256-GCM(session_key, nonce=counter, aad=counter, 脱敏后一行)`;`counter` 存 writer 结构体,`Arc<Mutex<>>` 串行化保证 nonce 不复用。
- **多开发者/轮换**:HEADER 支持多 `wrap_block`(同 session_key 用每个公钥各包一次,任一私钥可解);换钥靠 `key_id=sha256(pubkey)[:4]`,旧日志留旧私钥可解;私钥丢=对应日志永久不可解(设计使然,不做找回后门)。

## 5. 封包格式(兼顾流式 flush + 部分可解密)

```
文件 = HEADER || FRAME*
HEADER(写一次):magic "CRLOG\x01"(7B) | recip_count(u8) | wrap_block[]{ key_id(4B) | eph_pubkey(32B) | wrap_nonce(12B) | wrapped_key(48B=32ct+16tag) }
  K_wrap = HKDF-SHA256(ikm=X25519(eph_priv, dev_pubkey), info="creatoros-log-v1|"+key_id)
FRAME(每 flush append):len(u32 LE) | ct=AES-256-GCM(session_key, nonce=counter||0x00, aad=counter, plaintext=脱敏后一整行)
```

- **崩溃**:已 flush 帧全部完整可解,丢的仅未 flush 那行(与现明文实现**同等**保证)。
- **部分可解密**:解密器逐帧解,遇半截帧/tag 失败停在此处并输出已成功解出全部行(截断照读前面)。
- **轮转**:开新文件换 `session_key` + counter 归零,不同文件不同密钥,无跨文件复用。文件名 `sidecar.log`→`sidecar.log.enc`、`sidecar.prev.log.enc`。
- **降级(诚实)**:加密初始化几乎不可能失败(内嵌公钥常量、无 I/O);万一失败**降级为不写日志**(宁缺毋滥,不悄悄明文破坏机密性承诺)。每帧级错误吞掉丢行(延续 best-effort,绝不因落盘失败拖垮主流程)。
- 开销:每行固定 `4(len)+16(tag)=20B`,对诊断日志可忽略。

**开发者解密 CLI**(独立 Rust bin `creatoros-logdec`,复用帧格式常量 + `x25519-dalek/hkdf/aes-gcm`):`creatoros-logdec --key <私钥> sidecar.log.enc > sidecar.log`;读 HEADER 按 `key_id` 匹配私钥→ECDH+HKDF 解 `session_key`→逐帧解;尾部截断正常退出保留已解行。

---

# Part B — native 软加固(短板 H2/H3/H4;须与 T-372 session 协调串行改 `license.rs`)

> **施工排序硬约束**:另一 session 正活跃改 `license.rs`(T-372 L2/L3)。Part B 动 `license.rs` 的 §7/§8 须在 T-372 该文件收口后串行开工,避免并发冲突;§6(Hardened Runtime,改 `tauri.conf.json`/签名配置)、§9(master key 传递,改 `lib.rs` + sidecar 读取入口)与 `license.rs` 解耦,可与 Part A 并行。

## 6. macOS Hardened Runtime + 代码签名准备(H4)

- `tauri.conf.json` macOS bundle 开 Hardened Runtime;entitlements plist **不含** `com.apple.security.cs.disable-library-validation` 与 `get-task-allow`(debug entitlement)——废掉 DYLD 注入/dylib 注入/非特权 `task_for_pid`。
- Rust 侧加一道**运行时自校验自身 code signature**(校验 Team ID/签名有效性),补 macOS「首次过 Gatekeeper 后不再全量验签」的空档。
- 内测不签名期:Hardened Runtime 配置就绪但 `signed:false` 如实标(对齐 T-372 §12);证书公测前采购(遗留项)。诚实边界:签名主守二次分发 + 本地伪装正版,**不**阻止本地攻击者自签跑 patch 版。

## 7. 放行决策去单点化 + 反调试自检(H3,改 `license.rs`,串行)

- **去单点化**:放行判定不是「一个 bool 一个 if」——校验结果参与后续**真实计算**(如派生某运行时必需的 key/偏移),patch 掉判定则功能坏而非「跳过判定照常跑」。判定散布多个调用路径 + 不同时机复检 + 失败延迟随机化。
- **反调试自检**(`secmem-proc`):macOS `sysctl(KERN_PROC)` 查 `P_TRACED` + 启动期 `ptrace(PT_DENY_ATTACH)`;Windows `IsDebuggerPresent`/`CheckRemoteDebuggerPresent`/`NtQueryInformationProcess(ProcessDebugPort)`。**检测到静默降级失效,绝不硬崩**(降误伤 + 不给「崩溃点=判定点」定位信号)。
- **Windows 加固的范围归属([gate-A1] 处理 spec-review major)**:Windows 防逆向不是本 SPEC 独立扩张产品范围——它**挂靠 T-372 DEC-W**(该宪法修正案已把 Windows 从「不承诺」升为「与 macOS 并列的正式分发目标」,T-372 W-core/W-ci 已过审)。故:①内测目标平台是 macOS,Windows 加固**不在内测子集**,不预埋执行;②Windows 分支代码以 `cfg(target_os = "windows")` 条件编译,macOS 内测构建**完全不编译不执行**,测试面 §12 内测轮只跑 macOS 场景;③Windows 加固**随 T-372 W-cluster 落地时同波交付**(去单点化/反调试在 Win 比 mac 多投入是因 Win 无 Hardened Runtime 等价物),不早于 T-372 Windows 分发,不独立宣称 Windows 支持。这样既不静默扩张(挂靠已过审的 DEC-W),又不为不存在的范围铺路(条件编译 + 随 W-cluster)。

## 8. 灭靶点(H3,改 `license.rs`/常量,串行)

- `obfstr`/`goldberg` 加密内嵌 Ed25519 公钥 + 所有 license 相关字符串常量(灭 grep/熵扫描靶点)。
- 内嵌公钥**拆分存储 + 运行时重组 + 2-3 处交叉校验**,去掉连续 32B 高熵靶点。
- 判定逻辑 `#[inline(always)]` 摊进多处 + 删「license invalid」类定位锚点字符串,配合 strip 抬 pattern-scan 难度。
- 诚实定位:灭靶点**只对静态逆向有效,对 Frida 运行时几乎无效**(程序一跑内存还原)——它抬的是 T2 静态 patch 门槛,不是主敌。

## 9. master key 传递加固(H2,改 `lib.rs` + sidecar 读取入口,与 license.rs 解耦可并行)

- 废弃 env `CREATOROS_MASTER_KEY` 明文注入,改经 `ChildStdin`/命名管道传给 sidecar;Rust 侧 `secrecy::Secret` 包裹 + 注入后立即 `zeroize` buffer。
- `<appDataDir>/.master-key` 明文文件兜底(`lib.rs:71,83`)加密存储或以 OS 保护(未签名下 keychain 不持久的现实约束下,至少不明文;权衡换机/重装可用性)。
- 对齐 NFR-PRIVACY line 353「模型 key 存 OS keychain 或受保护加密载体,不能明文出现在响应和日志」。

---

# Part C — 破解经济学(后续波次,依赖 L1s 服务端,非本仓,不阻塞内测)

## 10. 更新绑授权 + 服务端遥测吊销(标 depends-on-L1s)

> 与 T-372 L1s 同属服务端(`license.aitongban.cloud`,非本仓)。列为后续任务簇,非本轮内测子集的缩水——是独立信任层(L0/L4),依赖 L1s 部署,单独拆片。

- 更新请求携带 L1 出示的 server-signed entitlement,L0 对过期/吊销激活拒发更新(Sketch 范式,patch 版冻结)。
- 服务端记录 激活码↔机器指纹↔last-seen↔校验心跳,规则引擎发现同码多机/指纹漂移/时钟回拨/心跳缺失→吊销。
- 周期复验 + 到期**降级而非 kill**(fail-open,绝不误伤离线正常用户;内测 3 天码是唯一 fail-close 例外)。

## 10.5 L0→L1s 接口契约(占位,[gate-A2] 处理 spec-review minor)

Part C 的客户端集成**复用 T-372 已定义的契约,不另起**,故本 SPEC 只锚接口不复述:
- **端点/字段**:沿用 T-372 L1s 的 `activate`/`status`(签名头 `X-License-Signature`/`X-License-Date`/`X-License-Digest` + 响应体 `serverTime/expiresAt/revoked/graceSeconds/nonce`,见 [T-372 SPEC §4](2026-07-17-license-hardening-and-dual-platform-design.md))。更新绑授权 = 更新请求头**附带 status 返回的 server-signed entitlement**;遥测 = status 请求已携带 machineId/nonce/last-seen,服务端侧聚合(非本仓)。
- **L1s 不可达时客户端行为**:**复用 T-372 L3 买断码 fail-open 语义**(网络不可达绝不降级,至多设置页显示「上次确认于 X 天前」;仅签名 `revoked=true` → 停更新不锁功能)。内测 3 天码走 fail-close(T-372 §7)。
- **降级而非 kill 的具体行为**:到期/吊销 → `updatesBlocked`(设置页更新卡 warning + 检查/安装按钮停用),核心功能照常(与 T-372 L3 `updatesBlocked` 同一机制,不新建)。
- 本节仅证明 Part C 客户端集成**可执行**(有契约可依);Part C 仍是后续波次(依赖 L1s 服务端部署),不进内测子集。

---

## 11. 数据 / 文件变更

- 日志文件:`logs/sidecar.log`→`sidecar.log.enc`、`sidecar.prev.log.enc`(密文);reset PRESERVE 规则不变。
- 新增 Rust 依赖:`x25519-dalek`、`hkdf`、`secmem-proc`、`obfstr`(或 `goldberg`)、`secrecy`+`zeroize`。
- 新增开发者 bin:`creatoros-logdec`(解密工具,不进分发包)。
- 内嵌常量:开发者 X25519 日志公钥(base64,拆分存储)。

## 12. TDD 测试面(不真联网/不真调试器)

- **加密日志**:HEADER 包裹/解包往返;每帧独立可解;**部分可解密**(注入截断文件→解出前 N 行且不 panic);counter 单调不复用;脱敏在加密前跑(密文解开后仍是脱敏文本);降级路径(公钥缺失→不写日志不崩);`creatoros-logdec` 往返 + 尾部截断容错。
- **去单点化**:patch 掉放行判定→后续依赖计算失败(断言不是「跳过照常」)。
- **反调试**:注入 fake「被 traced」信号→走静默降级(断言不 panic、不放行)。
- **灭靶点**:二进制内 grep 内嵌公钥连续 32B 无命中(构建后断言);license 字符串加密后不明文出现。
- **master key 传递**:env 不再含明文 key;sidecar 经新通道读到正确 key;注入后 buffer zeroize。
- **回归**:`license.rs` 决策链 T-372 既有测试零回归;web/dev P5 不变式(桌面态外不参与)不被卡。

## 13. 验收标准(量化)

1. 日志文件落盘为 `.enc` 密文;`file`/`strings` 看不到明文日志正文;`creatoros-logdec --key <私钥>` 完整还原,**私钥错误/缺失时 0 字节可读**。
2. 模拟崩溃(kill -9 sidecar)后:已 flush 帧 100% 可解;仅丢最后未 flush 一行(与明文基线同等)。
3. 日志被截断(截掉尾部)→ 解密器解出截断点前**全部**行且退出码 0(不 panic)。
4. macOS 构建开 Hardened Runtime;entitlements 不含 `disable-library-validation`/`get-task-allow`;`codesign -d --entitlements` 验证。
5. `DYLD_INSERT_LIBRARIES` 注入 dylib 对 Hardened+签名构建失效(真机验,签名后)。
6. patch 放行判定字节→功能坏(非「跳过照常跑」);注入 traced 信号→静默降级不放行不崩。
7. 构建产物 `grep`/熵扫描内嵌 Ed25519 公钥连续 32B **0 命中**;license 字符串明文 0 命中。
8. env `CREATOROS_MASTER_KEY` 不再存在;`ps e`/`/proc/<pid>/environ` 无 master key 明文。
9. `pnpm verify`(相关包 typecheck+测试)+ `cargo test` 绿;不真联网。web/dev 激活门/日志行为不变。
10. **诚实存疑(真机待验)**:Hardened Runtime 反注入(§13.5)与 code signature 自校验须签名构建 + 干净 macOS 真机;反调试静默降级两平台真机验;进 G-SECURITY 发布门前须真实运行证据(宪法 §13),不以单测替代。

## 14. 合定位追溯

| 本 SPEC 功能 | 宪法条款 |
|---|---|
| 加密日志(信封,只开发者私钥解) | NFR-PRIVACY line 353「不能明文出现在…日志」;NFR-SECURITY line 348「日志进入任何 sink 前脱敏」(叠加) |
| master key 去 env 明文 + 文件兜底加密 | NFR-PRIVACY line 353「模型 key 存 OS keychain 或受保护加密载体」 |
| 反调试/去单点化/灭靶点/Hardened Runtime | NFR-SECURITY「不可信内容不能改变 policy」;R-DESKTOP line 415「sidecar 可信握手」 |
| 更新绑授权/遥测吊销(Part C) | R-DESKTOP;P-04「允许出网:激活/更新服务」 |
| 诚实边界(不假装防专业逆向) | §16 line 455「不承诺客户端 prompt/JS 对专业逆向完全保密」 |

## 15. 拆片(进 BACKLOG,一次做完不分阶段做减法)

- **H-log**(可先并行,独立文件):加密日志 framed hybrid(`logging.rs` 信封改造 + 封包格式 + 降级)+ `creatoros-logdec` 解密 CLI + 测试面 §12。内嵌开发者 X25519 公钥(用户生成,占位空串诚实全降级)。
- **H-mac**(与 license.rs 解耦,可并行):macOS Hardened Runtime + entitlements 审计 + Rust code signature 自校验。
- **H-key**(与 license.rs 解耦,可并行):master key 传递废 env 改 stdin/命名管道 + `zeroize` + `.master-key` 文件兜底加密。
- **H-native**(**须待 T-372 `license.rs` 收口后串行**):放行去单点化 + 多点冗余 + 反调试自检(`secmem-proc` 静默降级)+ 灭靶点(`obfstr` 公钥/字符串 + 公钥拆分)。
- **H-econ**(后续波次,依赖 L1s 服务端,非本仓,不阻塞内测):更新绑授权 + 遥测吊销 + 周期复验降级。

## 16. 明确非目标 / 诚实边界

- **不防专业逆向**:patch 编译后 Rust 二进制可绕过 Part B(与 T-372 §18 一致,业界含 licensing 厂商共识)。目标 = 把 Frida attach/密钥提取/读日志从分钟级抬到需真逆向,兜底靠 Part C server 吊销 + 更新饥饿。
- **本轮不上硬件不可导出密钥**(SE/TPM,用户拍板排后);不上 VMProtect/Themida/白盒/全量 OLLVM/.text checksum(均明确非目标,详见调研 §8)。
- **加密日志不防运行时内存明文 / 不防被篡改二进制**(另一层职责);私钥丢失=对应日志永久不可解,不做找回后门。
- **不放宽脱敏**:加密与脱敏正交叠加,tier2 遮盖不因加密调松。
