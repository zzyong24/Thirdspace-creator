# 发布前加固 SPEC:激活码防破解加固 + 买断制软校验 + Mac/Windows 双端分发

> 状态:**实现 SPEC**(改架构 + 改产品范围)。
> **必过 spec-review gate**:①校验逻辑从 sidecar 迁 Rust 壳层 = 架构变更;②新增服务端 Ed25519 响应签名 = 信任边界变更;③Windows 纳入正式分发 = **产品方向/范围变更**(与宪法 §2.3/§16/§17 现口径冲突,本 SPEC §10 带宪法修正案 DEC-W)。
> 前置真值:产品定位 PRD(`docs/产品定位.md`,verifiedAt 2026-07-15);已上线的 T-147 P5 激活门(`docs/superpowers/specs/2026-07-06-p5-activation-gate-design.md`);T-368 调研报告(`docs/research/2026-07-17-activation-license-and-dual-platform-research.md`)。
> 需求来源:用户 2026-07-17(首席发布官 + 系统架构师视角,两天后全面内测),对激活码提出三问 + 双端分发要求;决策点见调研报告 §9(2026-07-17 用户拍板)。

---

## 0. 背景与驱动

CreatorOS 即将全面内测(用户口径:2026-07-17 起两天内)并规划买断制商用。T-147 P5 已上线「一机一码 + 在线校验(`license.aitongban.cloud`)+ 离线宽限」激活门,但 T-368 调研(三路子代理:现网基建盘点 + 双端耦合盘点 + 业界方案)钉死了**四个正对「防破解」的真实短板**与**双端分发的工程缺口**。本 SPEC 是把这些缺口一次性收口的实现设计,不新建授权体系,而是加固既有体系并把分发扩到双端。

本 SPEC 分两部分,拆片时分两个任务簇,可并行:
- **Part I 激活加固 + 买断软校验**(§3–§9):对齐宪法 R-IDENTITY / NFR-SECURITY / P-04。
- **Part II Mac/Windows 双端分发**(§10–§12):需宪法修正案 DEC-W(§10),对齐修正后的 R-DESKTOP / §2.3 / §16 / §17。

---

## 1. 现网事实 / 仓内已有实现(不造轮子维度:带证据,不从零造)

「已存在」断言均带 `file:line`;「无实现」断言均附反证(P5 SPEC 已坐实的 grep 结果 / 调研报告钉死的行号)。证据源:T-368 调研报告 §1、§7 + P5 SPEC §5。

| 断言 | 状态 | 证据 |
|---|---|---|
| 激活状态机(inactive/active/grace/expired) | **已存在,复用** | `frontend/src/server/activation/activation-service.ts:14,103-249` |
| 在线客户端(POST activate/status) | **已存在,扩验签** | `frontend/src/server/activation/license-client.ts:147-154` |
| 激活配置集中(base URL / graceDays) | **已存在,改配比** | `frontend/src/server/activation/activation-config.ts:20-22` |
| 机器指纹(SHA-256,Rust 注入,Win=MachineGuid) | **已存在,跨平台已就绪** | `frontend/src/server/activation/machine-id.ts:35-53` |
| 激活态持久层(单行 singleton,code 列 AES-256-GCM) | **已存在,扩字段** | `frontend/src/server/activation/activation-repository.ts:23-104`;`backend/src/schema/activation.ts:13-30` |
| 门控(未激活 redirect /activate,web/dev 跳过) | **已存在,迁 Rust** | `frontend/src/lib/activation-gate.server.ts:13-22`;`frontend/src/app/(creator)/layout.tsx:104-106` |
| 永久卡数据模型(`expiresAt=null`) | **已存在,买断复用** | `backend/src/schema/activation.ts` 注释;`activation-service.ts:70-75` |
| Rust 内嵌 Ed25519 公钥验签外部资源的**范式** | **已存在,照抄到 license** | `frontend/src-tauri/src/lib.rs:39-41`(验签 prompt-bundle) |
| **服务端响应无密码学签名** | **无实现(短板 S3)** | P5 SPEC §5 坐实:全仓 license 流程 `grep signature/Ed25519/nacl/hmac/privateKey` 零命中;`license-client.ts:5-6` 只校布尔 |
| **防时钟回拨 / 服务端时间锚 / 单调时钟** | **无实现(短板 S2)** | `activation-service.ts:67,70-86,201-206` 全用注入 `now()=new Date()`;无 last-seen 回拨检测 |
| **心跳节奏硬约束(启动必查 + 定时)** | **无实现(短板 S1)** | 现 `check()` 存在但宽限写死 7 天(`activation-config.ts:22`)> 内测 3 天码时长 |
| **校验逻辑在 Rust 壳层** | **无实现(短板 S4)** | 现全在 sidecar JS(可 patch);sidecar 无握手 token(`loopback-guard.server.ts:18` 列 follow-up) |
| Windows bundle target / 进程树杀 / Chromium 随包 | **无实现(Part II 缺口)** | `tauri.conf.json:19-22` 只 app+dmg;`lib.rs:208-211` Win 只单进程 kill;`build-sidecar.mjs:371-418` Chromium 写死 darwin |

---

## 2. 现成方案调研与选型(不造轮子维度:≥2 候选 + 采纳/弃用 + ≥2 被否决形态)

全量对比见调研报告 §6。选型权重:匹配度 > 新鲜度 > stars > 维护响应,红旗一票否决。

| 候选 | 采纳/弃用 | 理由 |
|---|---|---|
| **加固自有 `license.aitongban.cloud`**(服务端加 Ed25519 签名端点 + 客户端验签) | **采纳** | 服务已在跑、客户端全链已上线;迁移成本最低;两天窗口唯一现实解 |
| Keygen Cloud 免费档 | 弃用(取其签名协议范本) | 替换已上线自有服务 = 净增迁移量,无净收益;防回拨照样要自写 |
| Keygen CE self-host | 弃用(留作未来演进目标) | 两天内新起生产级 Postgres+Redis = 时间红旗 |
| Cryptlex / LicenseSpring(付费 SaaS) | 弃用 | 付费 + 原生 SDK 依赖链重 + 替换已有服务;LicenseSpring 无 self-host 退路 |
| WyDay TurboActivate | 弃用 | 闭源黑盒 + security-by-obscurity,与本地优先/可审计诉求相悖 |
| 自建 Cloudflare Workers 新服务 | 弃用 | 与「加固现有服务」重复造轮 |

**被否决形态(≥2)**:①「内测先 sidecar 校验、Rust 迁移放买断后」的分阶段方案——被用户 2026-07-17 决策否决(选一步到位放 Rust,token 充足);②「引入第三方 licensing SaaS 替换自有服务」——被选型否决(净增迁移量)。

**签名协议范本**:采用 Keygen 公开的响应签名规范(签名数据 = `(request-target)` + `host` + `date` + `digest(body)` 四段按序拼接,Ed25519),证据:调研报告 §4.1(https://keygen.sh/docs/api/signatures/)。这是**协议照抄**,非引入其服务。

**防回拨组合**:采用 LicenseSpring/Cryptlex 公开的「持久化单调递增 last-seen + 服务端时间锚 + 会话内单调时钟」组合,容差取 Cryptlex 同款 1 小时,证据:调研报告 §3(https://docs.licensespring.com/sdks/tutorials/best-practices/license-checks 、https://docs.cryptlex.com/changelog/lexactivator)。

---

# Part I — 激活码加固 + 买断制软校验

## 3. 四短板 → 目标(对齐宪法 R-IDENTITY / NFR-SECURITY)

| # | 短板(§1 证据) | 目标 | 宪法锚点 |
|---|---|---|---|
| S1 | 宽限 7 天 > 内测 3 天码,断网即躺过内测期 | 宽限按码型下发;内测码到期即硬跳激活页 | R-IDENTITY「离线宽限到期」空态;§11 登录过期补偿 |
| S2 | 到期判定全用本机 `new Date()`,改时间可绕 | 服务端时间锚 + last-seen 回拨检测(容差 1h)+ 会话单调时钟 | NFR-SECURITY;BR-05 日期时区 |
| S3 | 响应无签名,hosts 劫持假服务器即白嫖 | 服务端 Ed25519 响应签名 + 客户端验签 + 防重放 | NFR-SECURITY「不可信内容不能改变 policy」 |
| S4 | 校验全在可 patch 的 sidecar JS | 校验/验签/防回拨迁 Rust 壳层,前端只拿结果 | R-DESKTOP「sidecar 可信握手而非只测 TCP」 |

## 4. 服务端 Ed25519 响应签名协议(新增,S3)

> 服务端 `activation-manager`(license.aitongban.cloud)不在本仓,本节定义客户端要求的**契约**;服务端改造为 Part I 的前置依赖(拆片 L1s,见 §17)。

- **密钥**:服务端生成 Ed25519 密钥对,私钥仅存服务端;公钥硬编码进 CreatorOS **Rust 壳二进制**(照抄 `lib.rs:39-41` 内嵌 prompt-bundle 公钥的范式)。
- **签名端点**:`POST /api/license/activate` 与 `/api/license/status` 响应新增头 `X-License-Signature`(base64 Ed25519 签名)。签名数据 = `(request-target)` + `\n` + `host` + `\n` + `date`(服务端 RFC1123 时间)+ `\n` + `digest`(响应体 SHA-256 的 base64),四段严格按此序换行拼接。
- **响应体新增字段**:`serverTime`(ISO UTC,权威当前时间)、`expiresAt`(ISO UTC | null,权威到期)、`revoked`(boolean,吊销标志)、`graceSeconds`(number,该码型的离线宽限秒数,内测 3 天码下发 86400=24h,买断码下发 2592000=30d)、`nonce`(回显客户端请求 nonce,防重放)。
- **兼容**:旧客户端忽略新头/新字段仍工作(渐进);新客户端**强制要求签名头存在且验签通过**,缺失即判不可信(等价校验失败)。

## 5. 客户端验签 + 防重放(新增,S3)

- **验签**:Rust 层用内嵌公钥验 `X-License-Signature`;验签失败 → 视同「校验失败(不可信响应)」,不放行(不落 active)。
- **服务端未就绪的保底([gate-F2],防内测被硬阻塞)**:强验签依赖 L1s 服务端签名端点上线(§17);未上线前强验签会 100% 全拒,桌面激活门无法进入。故 L2 实现一个 **env feature flag `CREATOROS_LICENSE_STRICT_VERIFY`**:默认 `1`(强验签);服务端 L1s 未就绪时可临时置 `0` 回退到「仅校布尔 `success+valid`(即 P5 现状)+ 界面诚实标注『签名校验未启用』」。**这是有显式开关、有诚实标注的降级,非静默范围缩水**;flag 仅为「服务端上线前」的过渡,L1s 一上线即置回 `1` 并移除过渡路径。发布纪律:内测启动前须确认 L1s 已上线且 flag=`1`,否则内测在弱验签模式下进行的风险须与发布负责人显式确认(§15 验收第 8 条)。
- **防重放**:①请求带客户端随机 `nonce`(每次请求新生成),响应 `nonce` 必须回显一致;②响应 `date` 头与客户端可信时间(§6)偏离 **> 5 分钟(300 秒)** 即拒绝。
- **防假服务器/MITM**:验签基于非对称签名,与 TLS/CA 无关——改 hosts 指向本地假服务、mitmproxy 装自签 CA 均无法伪造合法签名。证据:调研报告 §4.1。
- **诚实边界**:见 §18——patch Rust 二进制可绕,本 SPEC 不假装防专业逆向(对齐宪法 §16「不承诺客户端 prompt/JS 对专业逆向完全保密」)。

## 6. 防时钟回拨(新增,S2)

三源组合,任一判「不可信/已过期」即拒:

1. **服务端时间锚**:每次在线校验成功后,把响应 `serverTime` 作为可信当前时间,并更新 last-seen。
2. **持久化单调递增 last-seen**:记 `last_seen = max(已存 last_seen, 本机墙钟, 服务端 serverTime)`。**双点冗余存储**(抗删除还原):①`activation_state.last_seen_at` 列;②平台侧独立位置(macOS `defaults`/`~/Library` plist,Windows 注册表 `HKCU\Software\CreatorOS`)。判定:**当前墙钟 < max(两点 last_seen) − 3600 秒(1h 容差)⇒ 视同过期**(判定回拨,回激活页/降级)。容差 1h 容忍 DST 与合法小幅校时。
3. **会话内单调时钟**:进程内宽限倒计时用 Rust `std::time::Instant`(不受墙钟影响);跨会话由 last-seen 兜底。

对齐 BR-05:持久时间 ISO UTC;比较用 UTC,时区无关。

## 7. 内测码策略(S1,用户 2026-07-17 拍板)

- **到期硬跳**:内测 3 天 TIME 码,本地 `expiresAt`(§6 可信时间判)已过 → **立即 `expired` → 硬跳激活页,无宽限延命**。到期由 last-seen 防回拨兜住,改系统时间无效。
- **离线宽限 24h(仅指连不上服务器)**:`expiresAt` 未过但在线校验网络不可达时,允许离线运行;`当前可信时间 − lastOnlineCheckAt > 86400 秒(24h)` ⇒ 也跳激活页(强制重新联网校)。宽限窗内 UI 显示离线剩余倒计时。
- **心跳 60 分钟**:桌面运行时,应用启动**必查一次** + 后台每 **3600 秒(60min)** 一次 `status` 复校。心跳命中 `revoked=true` 或 `valid=false` → 立即跳激活页(内测码吊销即时生效)。
- **服务端策略**:activation-manager 后台建 3 天 TIME 码批量发放,绑机器指纹(已有一机一码约束),`graceSeconds=86400`。

## 8. 买断制永久 license 软校验(新增,用户 2026-07-17 拍板)

买断码 = TIME 型但 `expiresAt=null`(永久,数据模型已预留,§1)。与内测码**反向语义**:

- **心跳继续但放宽**:买断码不用 60min;改为**启动时一次 + 每 30 天(2592000 秒)**一次机会性静默复校(`graceSeconds=2592000` 由服务端下发区分码型)。
- **fail-open(关键)**:「连不上网」**绝不降级**——网络不可达 ≠ 撤销,无限期离线可用(设置页至多显示「上次确认于 X 天前」)。这是买断与内测的根本区别,防误伤离线正常用户。对齐调研报告 §5(JetBrains/Sketch/M365 共识)。
- **仅签名撤销才降级**:只有服务端**签名(§5 验签通过)的响应**返回 `revoked=true` → **停止接收更新 + 界面提示(提示挂在设置页「更新」入口旁边),不锁核心功能**。降级动作对齐宪法 §16「不做变现中心」的克制与用户离线权利。
- **撤销来源**:退款/拒付欺诈——支付渠道 refund/dispute webhook → 服务端置码 `revoked`(服务端职责,非本仓;拆片 L2s 标为服务端待办)。

**内测码 vs 买断码 语义对照(实现须显式分支,不可共用)**:

| 维度 | 内测 3 天码 | 买断永久码 |
|---|---|---|
| `expiresAt` | now + 3d | null |
| 心跳周期 | 60 分钟 | 30 天 |
| 到期 | 硬跳激活页 | 无到期 |
| 连不上网 | 超 24h 跳激活页(fail-closed) | 永久可用(fail-open) |
| 签名 revoked | 立即跳激活页 | 停更新+提示,不锁功能 |
| `graceSeconds` 下发 | 86400 | 2592000 |

## 9. 校验逻辑迁 Rust 壳层(S4,架构变更,用户选一步到位)

- **迁移范围**:「取本地激活态 → 组装带 nonce 请求 → 调 activate/status → 验签 → 防重放(date/nonce)→ last-seen 回拨检测 → 决定放行」整条**校验决策链**从 sidecar(`activation-service.ts`)迁到 Tauri Rust 壳(`src-tauri/src/`)。公钥硬编码 Rust。
- **前端只拿结果**:Rust 经 Tauri command/IPC 只向前端暴露 `{ licensed: bool, expiresIn: number|null, offlineRemaining: number, mode: "trial"|"perpetual", revoked: bool }`;前端/sidecar 不再持有验签逻辑与私密判定。
- **持久层归属(BR-01 单一写者的处理,[gate-F1])**:两类数据严格分开,不冲突——
  - **领域记录**:`activation_state` 表**仍由 sidecar backend 独占写**(遵守 BR-01),它是「激活这件事发生过」的领域事实(machineId/加密 code/licenseMode/expiresAt/activatedAt),供设置页展示。Rust 要更新领域记录时**经既有 sidecar RPC 写**,不跨 repository 直改表。
  - **安全门产物**:Rust 侧 `<appDataDir>/.license`(Ed25519 验签结果 + AES 加密的放行快照,Rust `ring`/`ed25519-dalek`)**不是领域 schema,是安全门缓存**——只承载「本次是否放行」的判定,由 Rust 独占。放行决策读它,不读 sidecar 表。
  - **为何是 BR-01 的合理例外而非违背**:BR-01 的意图是「防跨模块越权写领域数据」;`.license` 不是领域数据,是把「放行权威」压到 Rust 才能落实 S4 安全不变量(不经可 patch 的 JS)——NFR-SECURITY 的防篡改优先级高于「放行判定也走 JS 后端」的字面统一。写入协议:Rust 验签成功 → 写 `.license`(放行权威)→ 触发 sidecar RPC 同步 `activation_state.revoked/grace_seconds/last_seen_at`(仅供展示)。两者以 Rust `.license` 为放行真值、以 sidecar 表为展示副本,写入来源各自单一。
- **web/dev 不变**:`isDesktopRuntime()` 为 false 时,Rust 门不参与,主应用照常(保持 P5 SPEC §4.2 不变式,web 绝不被卡)。
- **完整性加固**:Rust 层对 sidecar 入口文件(`server.js` / `sidecar.tar.gz`)做 SHA-256 完整性校验,哈希内嵌 Rust;不匹配 → 拒绝 spawn(逼攻击者必须动 Rust,不能只改 JS)。**防御边界([gate-F4])**:此哈希校验只防 **JS 层篡改**;patch Rust 二进制本身(绕过验签)不在此机制防御范围内,见 §18 诚实边界——不要误以为形成了全链路防篡改。
- **信任边界补强**:借本次迁移落地 `loopback-guard.server.ts:18` 列为 follow-up 的**启动级 nonce 握手 token**(Rust 生成、注入 sidecar env、前端请求携带)——对齐 R-DESKTOP「sidecar 可信握手而非只测 TCP」。

---

# Part II — Mac/Windows 双端分发

## 10. 宪法修正案 DEC-W(产品范围变更,需 gate 批准)

**现宪法口径**:§2.3「Windows:代码与打包证据不足,当前不得宣称支持」;§16「当前不承诺 Windows 正式分发」;§17「Windows 包…未实现,不进入当前发布范围」。

**DEC-W 提案**:本 SPEC 的 Part II 正是要**补齐 Windows 打包证据**。请求把 Windows 从「不承诺」升为「与 macOS 并列的正式分发目标」,条件是 Part II 全部退出条件(§11/§12)达成 + Windows 真机四主链(扫码/转录/渲染/更新)回归通过。**在退出条件达成前,§2.3/§16/§17 口径不变**(即:代码可以做,但产品对外宣称仍以真机证据为准,不提前宣称)。修正落点:Part II 验收通过后同步更新 `docs/产品定位.md` §2.3/§16/§17 + R-DESKTOP。

> 此修正是 gate 的核心审议项:若 reviewer 认为「双端分发不合当前定位聚焦(单人 macOS 创作者)」,应在此驳回;本 SPEC 主张双端分发不改变**产品能力边界**(仍是同一款本地优先编导系统),仅扩**运行环境**,与 §1.1 定位句「本地优先的编导式桌面生产系统」不冲突。

## 11. 平台耦合改动清单(证据:调研报告 §7)

### 11.1 必须改(5 项,不做 Windows 即崩/缺功能)

| # | 改动 | 现状证据 | 目标 |
|---|---|---|---|
| W1 | `tauri.conf.json` bundle.targets 加 `nsis` + `msi` | `tauri.conf.json:19-22`(现只 app+dmg;`bundle.windows` 骨架已在:41-45) | 双端 target 各出安装包 |
| W2 | `bundleChromiumBrowser()` 补 Windows 缓存路径 | `build-sidecar.mjs:371-418`(写死 `platform!=='darwin'→return`) | 补 `%LOCALAPPDATA%\ms-playwright\chromium-<rev>` 拷贝,Chromium 随包不靠首启下载 |
| W3 | Windows 进程树杀(Job Object) | `lib.rs:208-211`(Win 只 `CommandChild::kill()` 杀 sidecar 自身,不带走 Chrome/ffmpeg) | Win 分支接 Job Object(`AssignProcessToJobObject` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`),进程树随壳退出全杀,对齐 T-365 数据损坏防线的 Win 等价 |
| W4 | `sidecar-lifecycle.ts` Windows 分支 | `sidecar-lifecycle.ts:49,77-78,81`(`kill(-pid)`/SIGTERM/`ppid===1` 全 POSIX,Win 失效) | Win 分支重写:依赖 W3 壳侧 Job Object 兜底 + Win 可靠信号(SIGINT/SIGBREAK),移除负 pid/ppid 假设 |
| W5 | Windows console 黑窗抑制 | `lib.rs:460` 注释自认未解决 | externalBin node.exe spawn 加 `CREATE_NO_WINDOW` |

### 11.2 需验证(逻辑已备,Windows 实机确认;先 spike 前 2 项)

1. **系统 `tar.exe`(bsdtar)对 pnpm symlink/junction 打包-解压保真**(`build-sidecar.mjs:91-97` 打包 / `lib.rs:297` 解压)——sidecar 方案在 Win 的地基,**第一个 spike**。
2. **Windows pnpm junction**:`cpSync(verbatimSymlinks/dereference)` 与 `obfuscate.mjs:85-95` `isSymlinkEscape` 对 junction 的行为——**第二个 spike**(判失效则混淆可能误写 store)。
3. node.exe 裸拷自足性(mac 需 co-ship libnode dylib,Win `otool` 段已被 darwin 分支圈住天然跳过)。
4. onnxruntime-node `.dll` / sharp@0.32 win 预编译在打包机根 node_modules 到位(`ensureOnnxRuntimeDylib`/`ensureSharpNative` 已含 win 分支,缺则硬卡)。
5. `release.mjs:70-76` 单平台 `latest.json` → 双端合并 platforms 键。
6. `package.mjs:63-96` `precleanDmgLeftovers()`(hdiutil)加 `platform==='darwin'` 守卫(清洁性)。

### 11.3 天然跨平台(已抽象,不动)

open-url/reveal-logs/reveal-data-dir 的 win32 分支、`ffmpeg-path.ts`、`which/where` 探测、keyring(Win=Credential Manager)+ machine-uid(MachineGuid)、PGlite(WASM)、photon(WASM)、`fetch-ffmpeg.mjs` win32-x64 资产、codesign/notarize 平台守卫、路径 `node:path`/Tauri `app_data_dir`、chmod 已加 win 守卫。证据:调研报告 §7.3。

## 12. 双端 CI + 签名

- **CI matrix**(现无桌面打包 CI,纯本机手跑,证据:调研报告 §7.1 结尾):新建 GitHub Actions workflow,matrix = `macos-latest`(aarch64 + x86_64)+ `windows-latest`(x86_64-pc-windows-msvc),用官方 `tauri-apps/tauri-action` 跑 `tauri build`,产双端安装包 + updater artifact + `.sig`。Windows runner 需装 Rust 工具链 + `pnpm install` + `playwright install chromium`。
- **签名(内测不签,用户 2026-07-17 拍板)**:内测期 Mac/Win 均不签名,发装机绕过警告说明(Mac 右键打开、Win SmartScreen「更多信息→仍要运行」)。代码已就绪:`codesign.mjs:87-90` Win `signtool sign /sha1 /fd sha256 /tr <timestamp>`;缺证书 + Windows SDK。**遗留项(公测前)**:Apple Developer($99/年)+ Azure Trusted Signing(免 EV 硬件 token,Tauri v2 官方支持),SmartScreen 信誉需时间积累——晚申请晚受益(调研报告 §7.4)。
- **updater 双端天然支持**:minisign 验签不可关,Win 出 NSIS/MSI + `.sig`,`release.mjs` 正则已含 msi/nsis(§1)。

---

## 13. 数据模型变更

`activation_state` 表(现 `backend/src/schema/activation.ts:13-30`)新增:

```sql
ALTER TABLE activation_state ADD COLUMN last_seen_at TEXT;        -- ISO UTC,防回拨单调递增
ALTER TABLE activation_state ADD COLUMN grace_seconds INTEGER;    -- 服务端下发的宽限秒数(内测 86400 / 买断 2592000)
ALTER TABLE activation_state ADD COLUMN revoked INTEGER DEFAULT 0; -- 签名响应的吊销标志
-- expires_at 已存在(null=永久,买断复用);license_mode 已存在
```

- Rust 侧独立加密 license 文件(`<appDataDir>/.license`,Ed25519 验签结果 + AES 加密激活态镜像)为**放行权威**;sidecar 表为展示副本(§9)。
- last-seen 平台侧冗余点(macOS defaults / Win 注册表)由 Rust 写。
- reset 保留:`activation_state` 与 `.license` 文件均进 PRESERVE(现表已在,`activation.ts` 注释;新增文件同规则)。

## 14. TDD 测试面(不真联网,注入 fake client / clock)

**Part I**:
- 状态机扩展(`activation-service.test` / Rust 单测):内测码到期硬跳(无宽限)、买断码 fail-open(网络不可达不降级)、买断码签名 revoked → 停更新态、内测码 revoked → 跳激活页。
- **验签**:合法签名通过;篡改响应体/伪造签名/缺签名头 → 拒绝(断言不落 active)。
- **防重放**:nonce 不回显拒绝;`date` 偏离 > 300s 拒绝。
- **防回拨**:注入墙钟 < last-seen − 3600s → 判过期;双点 last-seen 取 max;删除单点后另一点仍拦。
- **码型分支**:内测/买断两套 cadence + fail 语义各自断言(§8 对照表逐行)。
- **Rust 门**:桌面态未激活 redirect;web 态(`isDesktopRuntime=false`)永远放行(保持 P5 不变式);sidecar 入口哈希不匹配拒绝 spawn。

**Part II**:
- 平台分支单测(`build-sidecar` / lifecycle):Win target 产 `.exe`/Job Object 路径、Chromium Win 缓存路径拷贝、lifecycle Win 分支不调 POSIX API。
- spike 验证(真机,非单测):tar/junction 保真、cpSync junction 行为——出 spike 报告归 `docs/research/`。
- CI:matrix 双端 `tauri build` 绿(先不签名,`signed:false` 如实标)。

## 15. 验收标准(量化,完整性维度:无模糊词)

**Part I**:
1. web/dev(`pnpm dev`):激活门不触发(`isDesktopRuntime=false`)。
2. 桌面态假服务器(改 hosts 指本地返回 `{valid:true}` 无签名)→ **验签失败,不放行**(S3 闭环)。
3. 桌面态改系统时间前拨延命:last-seen 回拨检测触发(墙钟 < last-seen − 1h)→ 判过期(S2 闭环)。
4. 内测 3 天码到期:硬跳激活页,无宽限;断网 ≤ 24h 可用、> 24h 跳激活页;心跳 60min 命中 revoked 即跳(S1 闭环)。
5. 买断码:断网任意时长可用(fail-open);仅签名 `revoked=true` → 停更新 + 提示,核心功能不锁。
6. 校验放行权威在 Rust(前端只拿 `{licensed,...}`);sidecar 入口哈希被改 → 拒绝 spawn(S4 闭环)。
7. `pnpm verify`(相关包 typecheck + 测试)绿;不真联网。
8. **诚实存疑(真机待验)**:①真码端到端(真机 + 联网 + 服务端签名端点上线);②服务端 Ed25519 签名端点为前置依赖(未上线前客户端强验签 = 全拒,需服务端先交付,见 §17 L1s);③离线宽限跨天真机验。**[gate-F2] 内测阻塞风险已显式记录**:L1s 未上线前若以 `CREATOROS_LICENSE_STRICT_VERIFY=0` 弱验签模式内测,该风险须与发布负责人确认后方可,不是实现疏漏;首选是 L1s 在内测启动前上线、flag=`1`。**[gate-F3] 真机验证里程碑**:L2 完成后 48h 内于干净 macOS 真机完成离线宽限跨天验证(模拟断网 25h 验证超 24h 跳激活页)+ 改系统时间前拨验回拨检测;L3 完成后真机验内测/买断两码型 fail 语义;此三存疑点进 G-DESKTOP/G-SECURITY 发布门前须有真实运行证据(宪法 §13),不以单测替代。

**Part II**:
9. CI matrix 双端 `tauri build` 出安装包(macOS app+dmg / Windows nsis+msi),updater artifact + `.sig` 齐。
10. Windows 真机:扫码/转录/视频渲染/更新四主链跑通;退出时 Job Object 带走全部子进程(0 孤儿,对齐 T-365)。
11. spike 报告(tar/junction)归档,结论明确「保真/需替代方案」。
12. DEC-W 退出条件达成后,`docs/产品定位.md` §2.3/§16/§17 + R-DESKTOP 同步更新。

## 16. 合定位追溯(合定位维度:每功能指宪法条款)

| 本 SPEC 功能 | 宪法条款 |
|---|---|
| 激活门(未激活拦、web 跳) | R-IDENTITY;§7 范围与成熟度「身份、激活、首启」 |
| 出网目的地=激活/更新服务 | P-04「允许出网:激活/更新服务」 |
| Ed25519 验签 / 防重放 / Rust 迁移 / sidecar 握手 token | NFR-SECURITY;R-DESKTOP「sidecar 可信握手」 |
| 防时钟回拨(UTC 比较) | BR-05 日期与时区 |
| 单一写者(表由 backend 写) | BR-01 |
| 激活态加密、key 不明文 | NFR-PRIVACY「加密载体,不明文出现在响应/日志」 |
| Windows 纳入分发 | **DEC-W(§10)** 修正 §2.3/§16/§17;不改 §1.1 定位句 |
| 进程树杀(timeout 杀完整进程树) | NFR-RELIABILITY「timeout 杀完整进程树」 |
| 诚实边界(不假装防逆向) | §16「不承诺客户端 prompt/JS 对专业逆向完全保密」 |

## 17. 拆片(进 BACKLOG,一次做完不分阶段做减法)

**Part I 任务簇(激活加固)**:
- **L1s**(服务端前置,标外部依赖):activation-manager 加 Ed25519 响应签名端点 + `serverTime/expiresAt/revoked/graceSeconds/nonce` 字段 + 内测/买断码型区分下发。**非本仓,列为阻塞项;客户端验签强制 = 全拒,须此片先交付**。
- **L2**:Rust 校验门纵切——校验决策链迁 Rust(`src-tauri/`)+ 内嵌公钥验签 + 防重放(nonce/date>300s)+ last-seen 回拨检测(双点冗余,容差 1h)+ 会话单调时钟 + `.license` 加密文件放行权威 + `activation_state` 三列迁移 + sidecar 入口哈希校验 + 启动级 nonce 握手 token + Rust/状态机单测。
- **L3**:码型分支——内测(到期硬跳/宽限 24h/心跳 60min)vs 买断(fail-open/心跳 30d/签名 revoked→停更新+提示)显式分支 + 设置页「上次确认于 X 天前」/更新旁提示 UI + 对照表逐行单测。

**Part II 任务簇(双端分发)**:
- **W-spike**(先行):tar.exe/junction 保真 + cpSync junction 行为,出 spike 报告归 `docs/research/`。
- **W-core**:W1–W5(bundle target / Chromium 随包 / Job Object 进程树杀 / lifecycle Win 分支 / console 黑窗)+ 验证项 3–6 + 平台分支单测。
- **W-ci**:GitHub Actions matrix 双端 `tauri build` + updater artifact 双端合并 + 不签名如实标 + Windows 真机四主链回归 + DEC-W 退出后同步宪法。

（各簇内一次从 0 到 1 做完;Part I / Part II 可并行,W-spike 先行探两个地基风险。）

## 18. 明确非目标 / 诚实边界

- **不防专业逆向**:patch 编译后 Rust 二进制可绕过本方案(业界含 licensing 厂商共识,调研报告 §4.2)。目标 = 让 hosts 劫持/假服务器/MITM/重放/改 JS/改时钟六类低成本攻击全部失效,把门槛抬到真逆向。对齐宪法 §16。
- **不自建离线 Ed25519 签发**:采用「服务端签响应 + 客户端验签」,非客户端离线签发(旧 T-045 路线已被在线服务替代,P5 SPEC §1 已记)。
- **不做 COUNT 次数型**:CreatorOS 仅 TIME 型(内测 3d / 买断永久)。
- **内测期不签名**:代码就绪,证书公测前采购(§12 遗留项)。
- **服务端改造非本仓**:L1s 为外部前置依赖,客户端强验签在服务端签名端点上线前会全拒——须 L1s 先交付。
