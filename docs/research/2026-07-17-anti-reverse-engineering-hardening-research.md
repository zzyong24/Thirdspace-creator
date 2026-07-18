# 防逆向加固调研:运行时插桩 · 静态逆向 · 密钥管理 · 商用授权 SOTA · 加密日志

> 类型:research-as-asset 归档(5 路并行子代理,均带 web 检索 2025-2026)。
> 日期:2026-07-17。触发:用户提供抖音教程视频(小涛AI大讲堂《用AI绕过市面上的卡密系统》,video_id 7663405117219015986)——演示 **Frida + Claude Code 自动 hook JS 授权判断**解锁(显示 3650 天)。用户要求「全面调研市面逆向技术,出一个更健壮、破解成本更高的加密方案,日志打印也要加密只有我能解」。
> 关系:本调研是对 [T-372 授权加固 SPEC](../superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md) §18「明确非目标:不防专业逆向」那条边界的**下一层补强调研**。T-372 已覆盖 hosts 劫持/假服务器/MITM/重放/改 JS/改时钟六类低成本攻击;本调研聚焦其排除在外的 **native 层(Frida 运行时 hook + 二进制 patch + 密钥提取)** 与 **加密日志** 两块。
> 决策落点:见 §7「用户拍板」(待用户确认后回填)。派生方案 SPEC:`docs/superpowers/specs/2026-07-17-native-hardening-and-encrypted-logging-design.md`(待写,过 spec-review gate 后拆 Task)。

---

## 0. 全局结论(5 份报告的收敛点)

**5 路调研独立展开,收敛到同一个战略判断:对单人 + Agent 维护的本地优先买断制产品,继续在客户端「把 Rust 壳做更硬」是边际收益递减的死路;真正的杠杆是把信任根迁出设备 + 改变破解经济学。** 三条主轴,按 ROI 排序:

1. **把 `.license` 从「加密防伪」范式切到「签名防伪」范式**(密钥报告命门):放行文件不是秘密,是许可证——它要的是「不可伪造」(服务端私钥签),不是「不可读」(本地可派生的 AES key 是范式错误)。**这一条已在 T-372 落地大半,收口它即可**。
2. **让 patch 版沦为「冻结空壳」+ 服务端事后吊销**(SOTA 报告命门):把持续价值(更新、服务端能力)强绑授权,破解版拿不到更新与云端能力;服务端遥测异常激活(同码多机/时钟异常/心跳缺失)→ 吊销。这是对付 native patch 的**唯一现实手段**,且 fail-open 友好、不误伤离线正常用户。
3. **native 层低成本组合拳,不上重型 DRM**(运行时 + 静态报告命门):macOS **Hardened Runtime**(零成本废掉一整类注入)+ 放行决策去单点化(唯一同时治 Frida 与静态 patch 的设计手段)+ 代码签名全链(patch 即签名失效)+ 灭靶点(公钥拆分/字符串加密)。**VMProtect/Themida/白盒密码/全量混淆一律不做**(杀软误报 + 公证冲突 + 维护税,收益恰是明确非目标)。

**诚实边界(贯穿全 5 份,不可动摇)**:目标不是「不可破解」,而是「让跟抖音教程的小白 100% 失败(迁 Rust 已达成)+ 让破解成本高于买断价 + 让破解版拿不到更新/云端能力 + 服务端吊销异常激活」。绝不宣称客户端对专业逆向保密(对齐宪法 §16)。

---

## 1. 威胁分级(破解经济学视角)

| 级别 | 画像 | 手法 | 成本 | 我们的目标 |
|---|---|---|---|---|
| **T1 脚本小子** | 跟抖音教程 | Frida + Claude Code **自动 hook JS 授权** | 近 0(复制粘贴) | **100% 挡死**——迁 Rust 后教程直接失效,已达成 |
| **T2 进阶爱好者** | 会用工具 | Frida hook **Rust** 校验函数返回值 / Ghidra patch `.license` 放行门 | 小时级 | 不追求挡死;抬成本 + 让成果无价值(拿不到更新/云端)+ 遥测吊销 |
| **T3 专业 cracker** | 做 keygen/loader 分发 | 逆向签名逻辑做 keygen,或 patch loader 本地永远放行 | 天级 + 声誉动机 | 让真 keygen 造不出来(伪造服务端签名需私钥,私钥永在服务端);loader 版 = T2 的冻结版,同吃更新饥饿 + 吊销 |

**视频那套(T1)对我们已失效**:放行权威迁到 strip 后的 Rust,攻击门槛从「读 JS 源码」跳到「逆向汇编 + Frida replace」——这一跳的收益是 T-372 迁移的主要落袋成果。

---

## 2. 攻击技术全景 × 现有门对照(运行时 + 静态)

### 2.1 运行时插桩(dynamic instrumentation)—— 我们的**主敌**

放行链 `ed25519-dalek verify → .license AES-GCM 解密 → 放行 bool → sidecar nonce 握手`,攻击点极集中:**翻转 verify 返回 / 翻转放行 bool / 伪造握手 token**。

| 攻击技术 | 平台 | 如何绕过 | 绕过成本 |
|---|---|---|---|
| **Frida attach**(`Interceptor.replace` 让 verify return true) | 双 | 抖音教程的 native 版;strip 后需先 pattern-scan 定位地址 | 低-中(熟练者分钟级) |
| **Frida spawn / gadget 预载** | 双 | 进程起点即接管,连启动期自校验也能提前 hook | 中 |
| **`DYLD_INSERT_LIBRARIES`**(macOS)/ `LD_PRELOAD` | mac | 预载 dylib 覆写验签符号 | 低,**但 Hardened Runtime 开启后直接失效**(见 §4) |
| **DLL injection / `CreateRemoteThread`**(Windows) | win | 远程线程 + IAT/inline hook | 低-中(Win 无 Hardened Runtime 等价物,天然更低) |
| **`ptrace`/`task_for_pid`/`DebugActiveProcess`** | 双 | 调试器断点改寄存器/内存 bool | 中,**mac 上 Hardened+签名进程即使 root 也拿不到 task port** |
| **DBI:DynamoRIO/Intel Pin/QBDI** | 双 | 指令级重写,无视符号插桩 | 中-高(单授权点属杀鸡用牛刀,实战少见) |
| **内存 patch / inline hook** | 双 | `.text` 覆写跳转字节 | 中(已接近静态 patch,自校验可测) |

**关键**:所有**纯静态混淆(strip / 公钥拆分 / 字符串加密)对 Frida 几乎零价值**——程序一跑内存里全还原,Frida 直接 dump/hook。对 Frida 有用的只有:反注入检测 + 放行去单点化。

### 2.2 静态逆向 + 二进制 patch —— T2/T3 进阶路径

| 攻击步骤 | 工具(2025-2026) | strip 后 | +公钥拆分/字符串加密 | +控制流混淆 |
|---|---|---|---|---|
| 定位内嵌 Ed25519 公钥(32B 高熵常量) | binwalk/熵扫描/IDA | 极低(strip 不动数据) | **显著抬高**(无连续 32B 靶点) | 抬高 |
| 定位 `.license` 解密后放行 bool | Ghidra 反编译 + crypto API 交叉引用 | 中 | 中 | **显著抬高**(平坦化后无单一 bool/跳转) |
| patch(nop verify / 反转跳转 JE→JNE) | hex 编辑 / radare2 `wa` | 低 | 低(patch 简单,难在定位) | 中 |
| **AI 辅助**(GhidraMCP/ReVa/RevEng.AI/Claude Code) | 2025 成熟工具链 | 明显加速 | 部分抵消 | **AI 反混淆对 CFF/MBA 明显吃力**(收益最大一档) |

**AI 辅助逆向现实**:2025 年 GhidraMCP / RevEng.AI plugin / Decyx 已把 LLM 接进 Ghidra 反编译器,自动重命名/解释语义/定位校验点。对零保护的 Rust gate,AI 几乎清零了「需要逆向技能」这个前提——这正是必须补 native 层的直接原因。

---

## 3. 密钥体系弱点 × 升级方案(密钥报告)

### 3.1 现有弱点

| 密钥 | 落地点 | 被提取/伪造方式 | 严重度 |
|---|---|---|---|
| **master key** 32B | OS keychain + **env 明文注入** sidecar | keychain 项对同用户任意进程可读;env 经 `ps e`/`/proc/<pid>/environ`/内存 dump/崩溃转储捞明文 | 高 |
| **`.license` 解密密钥** | master key **本地派生** | 逆向 Rust 复现派生逻辑 → 任意设备造合法密钥 → **自造并加密一份 `.license`** | 高 |
| **内嵌 Ed25519 公钥** | Rust 常量(32B) | grep/熵扫描定位 → **patch 成攻击者公钥** → 自签假响应(key-swap) | 高(上服务端签名后升为命门) |
| **机器指纹** | 运行时计算 | hook `machine-uid` 返回 / patch 指纹比对分支 | 中 |

**病根**:防线全建在「设备上有的东西」(keychain 项、可派生密钥)之上,对本机攻击者天然可及。杠杆 = 把信任根迁走(服务端私钥 / 硬件不可导出密钥)。

### 3.2 升级方案(采纳/弃用全量)

| 方案 | 抵抗 | 可行性 | 对离线/换机影响 | ROI | 采纳 |
|---|---|---|---|---|---|
| **A. `.license` 改服务端 Ed25519 签名放行快照**(本地只验签不解密) | 本地伪造 .license(命门) | 极好,`ed25519-dalek` 验签;**T-372 已落地大半** | **零冲突**,验签纯本地离线,买断 fail-open 兼容 | ★★★★★ | **采纳,收口** |
| **B. 机器指纹进被签快照**(非仅 AES AAD) | .license 跨机复用 | 好 | 换机需重新申请签名(可接受) | ★★★★☆ | **采纳** |
| **C. master key 传递废 env 改 stdin/命名管道 + `zeroize`/`secrecy`** | 进程环境 dump/崩溃转储 | 好,sidecar 侧改读取入口 | 无影响 | ★★★★☆ | **采纳** |
| **E. 内嵌公钥拆分 + 运行时重组 + 多点交叉校验** | grep/patch 做 key-swap | 好(仅混淆,抬门槛非封死) | 无影响 | ★★★☆☆ | **采纳(诚实定位:防脚本小子)** |
| **D. master key 升级硬件不可导出**(macOS Secure Enclave ECIES 包裹 / Windows TPM CNG KSP) | keychain 直读 + 本机代码读 master key | 中,**两套互不复用 FFI + 迁移兜底 + Win 探测降级** | 换机/重装/清 TPM/改密码 → 密钥永久失效,须重加密迁移 | ★★★☆☆ | **观察(macOS 先行;只绑 master key,绝不绑 license)** |
| **F. 公钥 pinning + 硬件签名根** | 彻底封 key-swap | 中-高,依赖 D | 同 D | ★★☆☆☆ | **弃用(收益递减)** |
| **G. white-box AES/ECC** | 静态提取 master key | 差(学术已全破:2004 BGE / DCA / DFA) | — | ★☆☆☆☆ | **弃用(付最贵价买明确非目标)** |

**关键认知纠错**:`.license` 用「本地可派生密钥加密」防伪 = **范式错误**。加密(防看)≠ 认证(防造)。许可证内容可公开,它需要不可伪造。既然签名私钥不在设备上,本地就造不出合法签名。加密仅保留作防窥,防伪权威改为签名。

**硬件后端诚实边界**:keychain 只防「别的用户 + 丢设备拆盘」,**不防「以当前用户身份运行的本机代码」**——`keyring` 存的 master key 同用户进程可读,提取成本近零。要真抬门槛只有 D(硬件不可导出)。但 Secure Enclave 只持 P-256、不可导出不可备份,换机/抹盘/改密码即失效,与买断「永久离线」冲突——故 license 权威归服务端签名(A),硬件只服务 master key,且必须先设计好失效兜底(重输 API key / 联网重下发)。

---

## 4. native 层反制措施(运行时 + 静态报告)

| 措施 | 落点/成本 | 抬高绕过成本 | 误伤风险 | 平台 | ROI |
|---|---|---|---|---|---|
| **macOS Hardened Runtime 全开 + 不给 `disable-library-validation`/`get-task-allow`** | 签名配置 ~0.5 天 | **高**:废掉 DYLD_INSERT/dylib 注入/非特权 task_for_pid,「随手 attach」变「要动 SIP」 | 极低 | **macOS 独有,mac 侧最高杠杆** | ★★★★★ |
| **代码签名全链**(mac notarization+stapling / Win Authenticode 争取 EV) | 证书年费 + 配置 | 中-高:patch 即签名失效;守二次分发 + 本地伪装正版 | 无(签名=信誉,**降低**杀软误报) | 双 | ★★★★★ |
| **放行决策去单点化**(结果参与后续真实计算,非一个 bool) | 纯 Rust 重构 ~2-3 天 | **中-高:唯一同时治 Frida 与静态 patch 的设计手段**;patch 掉判定则功能坏 | 低 | 平台无关 | ★★★★☆ |
| **多点冗余判定 + 时间随机化** | 纯 Rust ~2-3 天 | 中-高:hook 一处被别处推翻,延迟随机让「秒过」失效 | 低 | 平台无关 | ★★★★☆ |
| **反调试自检**(`secmem-proc` crate:mac sysctl P_TRACED+PT_DENY_ATTACH / Win IsDebuggerPresent+NtQueryInformationProcess) | 现成 crate + FFI 收尾 ~1-2 天 | 中:挡 lldb/x64dbg 断点改 bool 的懒人路径 | **中(检测到后静默降级,别硬崩——避免误伤+不给定位信号)** | 双(逻辑分叉) | ★★★★☆ |
| **灭靶点**(`obfstr`/`goldberg` 加密公钥+license 字符串 + 公钥拆分) | 加宏几行,近零成本 | 低-中:灭 grep/熵扫描靶点(**对 Frida 无效**) | 无 | 平台无关 | ★★★★☆ |
| **判定内联 `#[inline(always)]` + 删定位字符串** | 代码风格 ~1-2 天 | 中:配合 strip 抬 pattern-scan 定位难度 | 低(轻微增大体积) | 平台无关 | ★★★★☆ |
| **sidecar 运行时完整性 + 握手强化**(build 时 SHA-256 扩到运行时+覆盖 native) | 现有握手扩展 ~1 天 | 中:封死独立启动/replace sidecar | 低 | 无差异 | ★★★☆☆ |
| **`.text` 段运行时自校验 checksum** | 起线程周期 hash ~2-3 天 | 中:测运行时 inline patch | **中-高:ASLR/代码签名页/双平台段布局→误报崩溃,维护脆** | 双(分叉大) | ★★☆☆☆ |
| **RustAegis `#[vm_protect]` 只虚拟化 license gate** | 纯 cargo,v0.2.x research-grade | 高:自定义 VM+MBA,对 AI 逆向真有效 | 无(自研 VM 不被杀软打标) | — | ★★★☆☆(观察) |
| **VMProtect/Themida 全量加壳** | license 年费 + 集成调试 | 高 | **高:Defender `Trojan:Win32/VMProtect` 泛检测 + Themida 长期误报;与 hardened runtime/notarization 冲突;体积暴涨 10x-100x 慢** | — | ★☆☆☆☆ |
| **OLLVM/O-MVLL 全量控制流混淆** | 自建 LLVM fork,维护税重;O-MVLL 主打 arm64/C 非 Rust 一等 | 高(CFF/MBA 拖慢 AI) | 高(与 LTO/打包链冲突,**T-164 已有混淆崩 chunk 前科**) | — | ★★☆☆☆(仅 license 模块局部,慎) |

**Hardened Runtime 诚实边界**:macOS 默认**不是每次启动都重验签**——首次过 Gatekeeper(quarantine)后本地启动通常不再全量校验。所以签名+hardened runtime 主守①分发渠道(cracked 版过不了别人机器 Gatekeeper)②抬高本地 patch 后伪装正版门槛;**不**自动阻止本地攻击者在自己机器跑 patch 版(可 ad-hoc 自签,但丢 Team 签名+notarization = 失去对外分发)。建议 Rust 侧加一道运行时自校验自身 code signature(Team ID),补「首次后不验签」空档。

**Windows 因缺 Hardened Runtime 等价物,注入门槛天然更低,应在多点冗余判定 + 反调试上比 mac 多投入补齐。**

---

## 5. 纵深防御分层模型(SOTA 报告)

五层,外层失效由内层/上层兜,越靠服务端越权威:

| 层 | 放什么 | 失效兜底 |
|---|---|---|
| **L0 服务端权威** | 授权签发/续期、entitlement、**吊销**、更新签名分发、内测码 TTL 判定;私钥只在服务端 | 最后真值。本地 patch 也造不出真 server-signed token,也拿不到更新 |
| **L1 native 校验(Rust 壳)** | Ed25519 验签、`.license` 独占写=放行权威、机器指纹、防重放/防回拨、sidecar 握手签发 | L1 被 patch(§18 接受)→ L0 凭遥测吊销 + 拒发更新,patch 版退化冻结空壳 |
| **L2 完整性** | sidecar SHA-256(扩运行时+覆盖 native)、入口哈希、updater minisign | 被绕 → L1 握手使 sidecar 只认 Rust 壳 token;L0 更新签名仍拦篡改包 |
| **L3 密钥** | 内嵌公钥拆分、AES key 派生、字符串加密、strip、判定内联 | 密钥被提取(公钥本可公开)→ 私钥不在客户端无法伪造 L0 签发 |
| **L4 监测/遥测** | 服务端发现异常激活:同码多机/指纹漂移/时钟回拨/校验心跳缺失 → **事后吊销** | 对付 native patch 的**唯一现实手段**——客户端硬防挡不住,服务端「看见滥用→关掉激活」 |

**层间协作(非孤立堆叠)**:L1 给 sidecar 签短时 token(封死独立启动);L0 更新绑 L1 授权(过期/吊销拒发更新→Sketch 范式冻结);L4→L0 闭环(遥测异常→吊销→下次复验失败→**降级而非 kill**,fail-open)。

**「价值放云端」对本地优先的适用边界**:不全上云(违背定位),但能把三样留 L0——授权续期、更新、已有服务端 model-routing/skill 分发。这三样是持续价值,crack 拿不到 = 破解版天然降级。这是本地优先产品借鉴「让破解无意义」路线的最大可行边界。

### 业界做法对照(采纳/弃用)

| 厂商 | 路线 | 对我们适用性 |
|---|---|---|
| **JetBrains** | 服务端签名下发 + 每日复验 + 到期**降级免费功能集**非锁死 | **高**:该抄的 fail-open 范式,差「周期性复验 + 降级而非 kill」 |
| **Sketch** | 买断享 1 年更新,过期用旧版新版需续费 | **高**:把持续价值锚更新,破解版停在破解那一刻版本 |
| **10duke/keygen.sh** | 云端 entitlement + 遥测 + 吊销;静态 key 已淘汰 | **高**:遥测+吊销是当前最大缺口 |
| **Cursor/云端 AI** | 价值放服务端,本地破解=空壳 | 部分:本地优先不能全上云,取其钩子(服务端能力做能力锚) |
| **Adobe/游戏(Denuvo/Arxan)** | 重型 native DRM + 云端账户 | **低(过度)**:me3 已证 Arxan 可逆,单人投入产出极差 |
| **Setapp/MacPaw** | 订阅让盗版无意义 | 中:定价层面成立(买断价别定太高养 cracker),架构不适用 |

---

## 6. 加密日志方案(日志报告)

### 6.1 威胁模型与边界

**防**:拿到用户机器/日志文件的第三方(被盗、Time Machine/iCloud/OneDrive 意外上传、恶意软件外传)、用户自己无意泄露(贴公开 issue/群)、传输途中截获。攻击者拿到的只是密文,机器里**无任何解密秘密**(只内嵌公钥)。
**不防(诚实)**:运行时内存明文(另一层)、被篡改的 app 二进制(靠签名+完整性,非日志加密职责)、开发者本人(持私钥,设计目标)、定向国家级对手。
**与脱敏关系**:**叠加不放宽**。脱敏管「永不该存在的机密」(master key/cookie/token,连开发者也不该看),加密管「不该被外人看的一切正文」。私钥若失守,脱敏是最后一道墙。

### 6.2 密码学方案(候选对比 + 推荐)

核心:**非对称信封(hybrid)**——开发者持密钥对,**公钥内嵌 app**;客户端用公钥只加密一个随机会话密钥,正文用会话密钥流式对称加密。客户端不含任何解密秘密。

| 候选 | 机制 | crate | 判断 |
|---|---|---|---|
| **⭐ 自组 framed hybrid(推荐)** | X25519 ECDH→HKDF-SHA256 包裹会话密钥一次;正文**每 flush 一帧 AES-256-GCM**(counter 作 nonce,Mutex 串行化保证不复用) | 现有 `aes-gcm`+`sha2`+`rand` + 新增 `x25519-dalek`+`hkdf`(与已有 `ed25519-dalek` 共享 curve25519 依赖近乎免费) | **唯一同时满足「崩溃留最后几行」+「部分可解密」两条硬约束**;格式简单可自审;需自写 ~150 行解密 CLI |
| age(X25519 recipient) | STREAM 64 KiB/块 ChaCha20-Poly1305 | `age` | 解密工具白送(`age`/`rage` CLI 零维护);**但 64 KiB 缓冲违反「崩溃留最后几行」**(丢最近 <64 KiB)。若哪天不再把逐行崩溃当硬线 = 最省心替身 |
| libsodium sealed box | `crypto_box_seal` 匿名信封 | `crypto_box` | 语义精确,但正文流式仍需自套 AEAD 帧 + 新依赖 |
| HPKE(RFC 9180) | 标准 hybrid PKE | `hpke-ng`(2026) | 对日志体量过重、生态新,不值当 |
| RSA-OAEP + AES-GCM | RSA 包裹 AES key | `rsa` | **否决**:密钥大/慢/padding 易错,X25519 时代无理由 |

### 6.3 封包格式(兼顾流式 flush + 部分可解密)

```
文件 = HEADER || FRAME*
HEADER(写一次):magic "CRLOG\x01" | recip_count | wrap_block[]{ key_id(4B) | eph_pubkey(32B) | wrap_nonce(12B) | wrapped_key(48B=32ct+16tag) }
  K_wrap = HKDF-SHA256(ikm=X25519(eph_priv, dev_pubkey), info="creatoros-log-v1|"+key_id)
FRAME(每 flush 一个,append):len(u32 LE) | ct=AES-256-GCM(session_key, nonce=counter, aad=counter, 脱敏后一行)
```
- **崩溃**:已 flush 帧全部可解,丢的只有未 flush 那行(与现明文实现同等)。
- **部分可解密**:解密器逐帧解,遇半截帧/tag 失败停在此处并输出已解全部行(截断照样读前面)。
- **counter 唯一性**:writer 结构体持 counter,`Arc<Mutex<>>` 串行化天然不复用 nonce;轮转开新文件换会话密钥、counter 归零。
- **多开发者/轮换**:HEADER 多 `wrap_block`(同 session_key 用每个公钥各包一次,任一私钥可解);换钥靠 `key_id`,旧日志留旧私钥仍可解;**私钥丢=对应日志永久不可解**(设计使然,备份进密码管理器,不做找回后门)。

### 6.4 logging.rs 改造 + 解密 CLI

- `SidecarLogger` 现有 `Arc<Mutex<BufWriter>>` + 每行 flush 骨架**几乎原样**,只在「写字节」层换成「加密成帧再写」;`redact_log_line`/`format_rfc3339_utc` 完全不动,**脱敏永远在加密之前**。
- 文件名 `sidecar.log`→`sidecar.log.enc`;init 先写 HEADER。
- **降级(诚实)**:加密初始化几乎不可能失败(内嵌公钥常量、无 I/O);万一失败**降级为不写日志**(宁缺毋滥,别悄悄明文破坏机密性承诺),或写明文但文件头打 `WARNING: plaintext fallback`。每帧级错误一律吞掉丢行(延续 best-effort)。
- 开发者 CLI `creatoros-logdec --key <私钥> sidecar.log.enc > sidecar.log`,尾部容错(截断正常退出保留已解行)。**私钥从不进 app**。若走 age 备选则免写 CLI(`age -d -i key.txt`)。
- 导出闭环:设置页「打开日志文件夹」拿到 `.enc`,可增「导出诊断包」一键 zip(版本+OS/arch);因是密文,渠道不可信也 OK(现在明文用户不敢随便发)。

### 6.5 MVP vs 完整

- **MVP(半天~一天)**:单开发者公钥 + 每 flush 一帧 GCM(保崩溃留行)+ 30 行解密脚本。或直接上 `age` crate 整文件加密(放弃逐行崩溃粒度)。
- **明确不做**:HSM/安全芯片;每行独立非对称(慢且无谓);证书链/密钥服务器/在线撤销;会话密钥进 keychain(临时的、公钥非秘密,都不需要)。

---

## 7. 用户拍板(待回填)

> 待用户确认 §8 方案与优先级、日志方案选型(framed hybrid vs age)、是否派生 SPEC 后回填:谁拍板/何时/条件。

---

## 8. 该做/不值得做汇总(ROI 排序,派 Task 用)

### ✅ 该做(高 ROI)
1. **收口 `.license` 服务端签名放行快照**(T-372 已落地大半)+ **机器指纹进被签快照**。
2. **更新强绑授权 + 服务端异常激活遥测/吊销 + 周期性复验/降级而非 kill**(改破解经济学,最高战略 ROI;L0/L4;服务端为主,非本仓)。
3. **macOS Hardened Runtime 全开 + 审计 entitlements**(零成本废注入类)+ **代码签名全链**(patch 即签名失效)。
4. **放行决策去单点化 + 多点冗余 + 时间随机化**(纯 Rust,唯一同时治 Frida 与静态 patch)。
5. **反调试自检(`secmem-proc`,静默降级)+ 灭靶点(`obfstr` 公钥/字符串)+ 判定内联去字符串**。
6. **master key 传递废 env 改 stdin/命名管道 + `zeroize`**。
7. **加密日志(framed hybrid X25519 信封 + 每 flush 一帧 GCM + 开发者解密 CLI)**。

### 🟡 值得做(中 ROI,权衡)
8. **master key 升级硬件不可导出**(macOS Secure Enclave 先行;只绑 master key 不绑 license;失效兜底先设计)。
9. **sidecar 运行时完整性 + 握手强化**。
10. **RustAegis 选择性虚拟化 license gate**(观察项,隔离分支 spike 验稳定性/启动性能再定)。

### ❌ 不值得做(成本/风险 > 收益,均为明确非目标)
- VMProtect/Themida 全量加壳(杀软误报 + 公证冲突 + 维护税)。
- white-box AES/ECC(学术已破,付最贵价买非目标)。
- 全量 OLLVM/O-MVLL 混淆(与 LTO/打包链冲突,T-164 崩 chunk 前科)。
- `.text` 自校验 checksum(ASLR/签名页/双平台误报崩溃,维护脆)。
- 把 `.license` 权威绑硬件(与买断永久离线冲突,换机锁死合法用户)。
- 端口 27042/固定线程名检测当主防线(Frida 一行配置绕,只挡懒人)。
- DPAPI non-exportable 当硬保护(仅软件策略,只作 Win 无 TPM 降级档)。
- 追求「不可破解」的硬壳军备竞赛 / 硬件 dongle / 全功能上云 / 客户端假装对专业逆向保密(违背定位+§16)。

---

## 附:来源

运行时插桩:Appdome anti-Frida/DBI、Fingerprint detecting Frida、OWASP MASTG、`secmem-proc`/`debugoff` crate、Alexander O'Mara macOS ptrace anti-debug、AFINE get-task-allow。
静态逆向:eShard/vrls.ws Rust OLLVM、O-MVLL docs、RustAegis、`obfstr`/`goldberg`/`litcrypt`、GhidraMCP/RevEng.AI、VMProtect 官方 + Defender/Themida 误报、Apple Hardened Runtime/notarization/Gatekeeper。
密钥管理:Apple Secure Enclave docs、`keychain-services.rs`/`secured-enclave`/Secretive/Prompt、Windows TPM in Rust(DEV.to)、`rust-tss-esapi`、CNG NCrypt、DPAPI non-exportable、Keygen offline crypto、`local-secrets`/`secrecy`、white-box crypto Wikipedia/IACR 2014-688/DCA。
商用授权:JetBrains 2025.1 降级、Sketch/Setapp 定价、keygen.sh/10duke entitlement+遥测、me3 Arxan 可逆、Cursor 云端。
加密日志:`age` crate + C2SP age spec(STREAM 64 KiB)、libsodium sealed box、RFC 9180 HPKE + `hpke-ng`(2026)、`rust-hpke`。
