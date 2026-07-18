# 反 AI 自动化破解:欺骗层调研 + 方案(T-399)

> 调研日期 2026-07-18 · 3 路子代理并行(威胁模型 / 现有防线盘点 / 欺骗技术评估)· 主 agent 综合
> 性质:**防御性**(保护 CreatorOS 自研桌面软件)· 拍板人:用户(待就本方案定采纳范围)
> 母任务:T-391 native 加固 · 依赖硬前提见 §0

---

## 0. 一句话结论 + 硬前提(先读)

**结论**:2026 的破解主力已从人肉逆向转向「AI agent 静态循环」(编码 agent 挂 Ghidra/IDA/radare2 的 MCP:反编译→靠字符串/符号锚点定位授权判定→改跳转 patch→**重跑一次看 UI 通过就收工**)。它的三大死穴——**①沿最省力路径先扑最像/最浅的门 ②不敢做动态验证 ③靠表面重跑判成功**——全部可被针对性打击。**唯一"治本"的是服务端签名激活 + 每机指纹 + 每版本重生成(把破解从"一次 patch 通吃"变成"每版本每机器持续成本");其余客户端手段都是 security-by-obscurity——专坑自动化、给真门争取时间,不是城墙。客户端不存在"绝对不可破"(Frida 运行时 hook / 内存 dump 终究挡不住)。**

**三个硬前提(否则方案建在流沙上)**:
1. ⚠️ **源码泄露必须先堵死(T-392)**:sidecar 打包曾把整棵 `frontend/src/`(269 个 .ts 明文)+ `docs/`(含 SPEC)塞进 standalone trace。**AI 能读真 TypeScript 源码 + 读懂 gate 设计文档时,任何客户端欺骗层归零。** 已在修(T-392),是欺骗层生效的前置。
2. ⚠️ **验签当前休眠**:`CREATOROS_LICENSE_STRICT_VERIFY` 出厂默认 `"0"` 弱验签(L1s 服务端私钥待部署)——整条 Ed25519 验签/防重放链在发出去的构建里不生效。**治本层现在还没真正激活。**
3. **诚实定位写进 SPEC 非目标**:不追"绝对不可破";目标 = 抬高单位破解成本 + 让自动化不划算 + 让 AI 高概率误判成功。

---

## 1. 威胁模型:AI agent 破解流水线(子代理①)

**技术栈(2025-2026 已成熟模块化)**:反编译内核(Ghidra headless/GhidraMCP/pyghidra-mcp、IDA MCP、radare2、Binary Ninja)+ MCP 桥接(`decompile_function`/`list_strings`/`rename`/`set_comment` RPC)+ Agent/LLM 层(Cline/自研 orchestrator;云 Opus/GPT-5.x/Kimi 或本地 Devstral/Qwen3)。成品框架:DecompAI、RAVERSE 2.0(四 agent patch 小队)、Agent4Decompile。

**典型 6 步循环**:①triage(file/strings/nm 分诊)②入口下钻顺 call chain ③重命名/加注释建模伪代码 ④靠锚点锁授权判定 ⑤branch jamming(跳转改无条件/nop/翻返回值)⑥**重跑看是否进已授权分支 = 验证**。

**人在环仍剩**:任务分解、审 LLM 幻觉、**处理卡住的混淆代码**、上下文截断后重灌。→ **纯静态无混淆有锚点的目标已可端到端自动化;需动态执行确认或遇重混淆,人肉成本立刻回归。**

### AI vs 人 认知特性(靶心)

| 维度 | AI 擅长 | AI 短板 | **AI 自信猜错点(防御靶心)** |
|---|---|---|---|
| 批量读伪代码 | 秒读上百函数 | 上百函数 context rot / lost-in-the-middle | 真校验淹没在大函数体→漏读或误判无关 |
| 模式匹配已知形态 | 秒认标准 license 形态 | 只认见过的;自定义判定识别骤降 | **诱饵当真;伪装成普通逻辑的真检查被放过** |
| 数据流跟踪 | 单链 XOR→rotate 尚可 | **组合式逆变换**中段重构失败 | 提取中间常量就自信"已解出",实际没拼对 |
| 超长控制流 | 弱 | CFF 体积爆炸、MBA 语义迷雾 | 平坦化后自信给错分支语义 |
| **需动态执行确认** | **弱且致命** | 静态 agent 天然回避运行时 | **把无法静态确认的假设当已确认,直接 patch 宣布成功** |
| 坚持 vs 收工 | 差 | 要么瞎逛到 timeout,要么过早收工 | 浅验证一次就宣布胜利 |
| 上下文健壮性 | 弱 | 输入越长全变差;**干扰项越像答案崩得越快** | 语义相似诱饵 + 长上下文 = AI 特异崩溃(人免疫) |

**关键不对称**:人靠动态分析(下断点跑一遍看内存)秒破的,恰是纯静态 AI 的盲区;AI 秒读百函数的优势,恰被"相似诱饵 + 上下文膨胀"抵消。**防御打两者交集的 AI 弱侧:强迫动态 + 灌语义相似噪声 + 破坏浅验证。**

### AI 依赖的定位锚点 → 污染后果

字符串(`license`/`trial`/`expired`,爆量→注意力稀释/context 爆炸)· 返回 bool 的短函数(→honeypot 诱饵)· 魔数比对(散射→无法定位真值)· 时间比较(真到期走非时间路径)· 网络请求(假端点)· **反编译文本本身(AI 完全信任→符号/注释污染,把真校验命名 `formatDate`、telemetry 命名 `validateLicense`)** · prologue/epilogue(anti-disassembler 让 Ghidra 出错误伪代码,AI 当 ground truth 错到底)。

### 验证闭环弱点(最高价值欺骗面)
AI 确认 patch 靠"重跑一次看 UI/返回 true",**几乎不做长回归/跨功能副作用/概率触发探测**。→ **延迟失效、概率失效、异地降级、表面成功实则功能阉割、honeypot 分支**,都让它自信收工。对人只是抬验证成本;对 AI 是**判定级欺骗**。

---

## 2. 现有防线盘点(子代理②)

现有 20 层已覆盖:六类低成本攻击(hosts 劫持/假服务器/MITM/重放/改 JS/改时钟)+ 静态灭靶点 + 密钥载体加固 + 加密日志 + **去单点化雏形**。可直接复用为欺骗地基的:

| 现有机制 | file:line | 作为欺骗地基的价值 |
|---|---|---|
| **去单点化 · 能力值指纹**(H-native) | `license.rs:497-567`,复算点 `1621/1782,1799/1818` | **真门地基**:「多证据→SHA-256→32B 能力值→比对指纹」+ 3 处独立复算已建好;植诱饵解锁路径/patch 假点后静默降级,直接复用 |
| **obfstr 灭靶点**(公钥拆片+XOR+交叉校验) | `embedded_pubkey_b64:283-334`,`license_key_context:62-64` | **藏真/植假机床**:已能藏真值,对称可植假公钥/假门字符串/假常量诱 AI |
| **注入式探针端口**(DebugProbe/LicenseHttp trait) | license.rs traits | 可挂多探针含诱饵探针 |
| **静默降级范式**(反调试/去单点化检测异常不硬崩) | `license.rs:551-565` | 已符合"不给判定点定位信号"的欺骗哲学 |
| **决策链 11 分支 + 多出口** | `run_license_chain:968` | 天然诱饵陈列面 |
| **JS 层前端 gate**(已知可 patch 弱层) | `activation-gate.server.ts:35`、`(creator)/layout.tsx:105` | 想让 AI "误判为真门"的现成假逻辑舞台 |
| **混淆管线** | `obfuscate.mjs` | 可扩"注入诱饵死代码" |

**真实授权决策链路**(欺骗层须知道真逻辑藏哪):放行真值 = Rust `run_license_chain`+`apply_runtime_gate`(原生二进制,多点复算);`.license` = AES-GCM 加密缓存(Rust 独占写);JS 层(sidecar `/license-sync` 展示副本 + 前端 `isActivationAllowed` 读 `.license.allowed`)= **只读消费者,已知可 patch 弱层**。→ 真门本已在 Rust 深处,JS 侧天然适合摆假门。

**完全缺失(T-399 要新建)**:针对 AI 静态分析的**主动误导**(现有全是"藏"和"散",无一"主动摆假线索")· 诱饵门/蜜罐分支 · 反-反编译 · 假成功陷阱。

---

## 3. 欺骗技术评估表(子代理③)

| 手段 | 对 AI 有效性 | 对人 | 成本 | 副作用 | 评级 |
|---|---|---|---|---|---|
| **1 Honeypot license 门**(JS 假门,真门 Rust) | 高(先扑最省力路径) | 中 | 低-中 | 假门须与真状态解耦防误伤 | **该做** |
| **2 去单点化多点复算**(真门) | 高(难拼全局) | 中-高 | 中-高 | 复算逻辑勿引真 bug | **该做** |
| **3 符号/字符串/假注释污染** | 高(LLM 靠名字/注释猜语义) | 低 | **极低** | 几乎无(留内部真实映射表) | **该做** |
| **4 opaque predicate**(限真门段) | 中(AI 不敢动态证伪) | 中 | 中 | 轻微性能 | **该做** |
| **5 bool 拆多层间接+算术恒等式** | 中(AI 难跨多跳数据流) | 中 | 中 | 勿滥用致 bug | **该做** |
| **6 控制流平坦化 CFF** | 高(saturate context) | 中 | 中-高 | **性能/体积/崩溃**(T-164 混淆崩前车) | **谨慎**(仅关键函数+必冒烟) |
| **7 假成功陷阱**(延迟/概率降级) | 高(打掉重跑=成功闭环) | 高 | 中 | **极高**:误伤正版=灾难 | **谨慎**(强防呆) |
| **8 被动 tripwire 遥测/honeytoken** | 高(patch 后无感被标记) | 中-高 | 低-中 | 隐私合规需披露;离线失效 | **该做**(被动不损坏) |
| **9 服务端签名+每机指纹+每版本重生成** | 高(抵消规模优势) | 高 | 中-高 | 需联网激活;指纹漂移误锁 | **该做(治本)** |
| 10 主动 prompt injection 攻对方 agent | 脆(换括号即降效) | 几乎无 | 低 | **法律灰区(近 hack-back)** | **谨慎偏别做**(只被动诱饵文本) |
| 11 chaff bugs 诱饵漏洞 | 中 | 中 | 高 | 场景错配(是 exploit 非 license) | **别做** |
| 12 主动 hack-back/破坏对方机器 | — | — | — | **违法(CFAA)** | **别做** |

---

## 4. 综合方案:分层反 AI 破解(主 agent 拍板建议)

**核心策略**:不追"藏住真门",而是**造一个比真门更诱人的假门 + 真门去单点化到 Rust 原生多点复算 + 服务端签名把破解变成持续成本**。三层 + 一条治本轴,按 ROI 与风险分阶段:

### 阶段 1(先做 · ROI 最高 · 近零副作用)
- **真门下沉 + 假门上浮**:真授权结论彻底进 Rust 原生多点复算(复用现有 `derive_capability`);Node sidecar 侧留一处 **honeypot license 门**——像模像样的 ed25519 验签调用 + `expiresAt` 比较 + `isPro`/grace-period,**其 bool 真的连到 UI 激活角标显示**(强化"patch 成功"错觉),但**功能解锁不依赖它**。天然梯度:JS 易读在浅处(AI 先扑)/ Rust 难逆在深处。
- **符号/字符串/假注释污染**(极低成本):真校验命名 `formatTimestamp`/`normalizeConfig` + `// deprecated, debug-only`;假门命名 `verifyLicense`/`checkEntitlement`。复用现有 obfstr 机床对称植假值。
- **被动 tripwire 遥测(只观测不损坏)**:假门被 patch / 真门复算矛盾 / 二进制 hash 变化 → 静默上报服务端。先只收数据,看破解者是否真扑假门、扑哪里。
- **治本轴前置**:部署 L1s 私钥 → strict 翻回 `"1"` → 服务端签名激活 + 每机指纹真正生效(这一步单独就把"一次 patch 通吃"打掉大半)。

### 阶段 2(阶段 1 真机验证有效后 · 抬自动化成本)
- **每版本重生成**校验布局/密钥/混淆种子 → 上版 patch 对新版失效。
- 对**真门那几个热点函数**上 opaque predicate + bool 拆多层间接(限热点,混淆后**必跑运行时冒烟**,吸取 T-164 教训);视需要对个别关键函数上 CFF。

### 阶段 3(最后 · 最谨慎 · 强防呆)
- **假成功陷阱**:仅在 tripwire **密码学确证**篡改(签名失败/hash 不符/多点复算自相矛盾——正版永不命中)时,注入延迟/概率性降级(先最轻的"概率隐水印/元数据标记",零误伤确认后再上"计数延迟失效")。**必须可逆 + 服务端远程豁免 + 指纹漂移申诉通道。**

### 红线(写进 SPEC)
- 损坏级响应(降级/封号)**只在密码学确证被 patch 时触发**,绝不用启发式怀疑;假成功打到正版 = 灾难级事故。
- 分层触发:tripwire 静默上报(最轻)→ 拒下次在线激活(中)→ 本地降级(重,门槛最高)。
- **绝不**本地删数据/改用户文件/破坏系统;响应上限 = 本软件功能降级不外溢。
- **不做**主动 prompt injection 攻对方 agent(CFAA 灰区)、chaff bugs、hack-back。
- 遥测采集范围须进 EULA/隐私政策披露。
- 诚实认知:阶段 1-2 的混淆/污染只延时不治本;唯一治本是治本轴(服务端信任根)。

---

## 5. 落地切片(待过审)
- **T-399a 诱饵门 + 符号污染 + 被动 tripwire**(阶段 1 客户端;近零副作用,先上)。
- **T-399b 治本轴**:L1s 私钥部署 + strict 翻 `"1"` + 每版本重生成(部分并入 T-372 遗留 + T-391 H-econ 服务端)。
- **T-399c 语义混淆纵深**(阶段 2;opaque predicate/拆 bool 限热点 + 必冒烟)。
- **T-399d 假成功陷阱**(阶段 3;强防呆 + 密码学确证门 + 可逆豁免,压最后)。
- 前置阻塞:T-392 源码泄露修复落地确认(否则全归零)。

---

## 6. 引用来源(节选)
- Elastic Security Labs《The Cost of Understanding: LLM-Driven RE vs Iterative LLM Obfuscation》(Matryoshka/Double Fond/Dispatch Maze,成本×4-5、heavy 组合破解率归 0)
- CrackMeBench (arXiv 2605.10597) · Deconstructing Obfuscation 4D Framework (arXiv 2505.19887) · Cisco Talos《LLM as RE sidekick》
- Prompt injection against RE AI agents (arXiv 2605.30677 / 2605.30667) · Check Point《AI evasion prompt injection》
- Delayed and Controlled Failures in Tamper-Resistant Software (PSU/MSR) · US Patent 7818799B2
- Defeating Opaque Predicates via ML (arXiv 1909.01640) · Can LLMs Recover Program Semantics (arXiv 2511.19130)
- Chaff Bugs (arXiv 1808.00659) · Booby Trapping Software (NSPW'13) · CFAA (EveryCRSReport R46536) · Frida/Approov(运行时 hook 天花板)
