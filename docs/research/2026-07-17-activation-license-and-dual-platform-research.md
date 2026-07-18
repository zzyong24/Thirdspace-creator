# 发布前调研:激活码体系加固(防改时钟/防伪造/买断制)+ Mac/Windows 双端打包(T-368)

- **调研日期**:2026-07-17
- **触发**:用户(首席发布官视角)——两天后全面内测,提出三问:①限时内测码如何动态感知到期 + 防改系统时间 + 校验请求防伪造/防绕过;②买断制永久码激活后要不要定期复验;③双端(Mac+Windows)打包全依赖支持。
- **方法**:三路并行子代理——现有授权/服务端基建盘点(全仓 codegraph+grep)、双端平台耦合盘点、业界方案 Web 调研(Keygen/Cryptlex/LicenseSpring/WyDay 官方文档 + HN + Tauri 官方)。
- **拍板状态**:本报告为调研结论 + 推荐方案,**尚未拍板**;推荐架构(§5)待用户确认后写 SPEC → 拆片 → 过 gate → 开工。

---

## 0. TL;DR(三问三答)

1. **限时码**:激活体系**已存在**(T-147 P5,`license.aitongban.cloud` 在跑),但正对用户三个担忧点各有一个真实漏洞:**无防时钟回拨**(到期判定全用本机 `new Date()`)、**无响应签名**(hosts 劫持假服务器返回 `{"valid":true}` 即可永久白嫖)、**7 天离线宽限 > 3 天码时长**(断网即可躺过整个内测期)。修法(业界事实标准):服务端 Ed25519 响应签名 + 服务端时间锚 + 持久化 last-seen 回拨检测 + 内测码心跳收紧(启动必查 + 每 30–60 分钟)+ 宽限按 license 时长配比(3 天码给 12–24h)。
2. **买断制永久码**:**要复验,但必须软校验**——激活时联网一次拿签名 license,之后每 ~30 天机会性静默复验;**联不上网不锁不弹窗**(网络不通 ≠ 撤销),只有服务端**签名的「已撤销」响应**才降级,且降级 = 停更新 + 提醒,不锁核心功能。这是 JetBrains/Sketch/M365 一系的共识;买断制硬锁离线用户 = 自毁口碑。撤销的真实需求是退款/拒付欺诈(支付 webhook → 自动 revoke)。
3. **双端打包**:运行时代码的平台分叉大多已做(open/reveal/ffmpeg/keyring 等),原生依赖 Windows 全部可得;打包链有 **5 处必须改**(bundle target、Chromium 随包、Windows 进程树杀 Job Object、sidecar-lifecycle Win 分支、console 窗口),粗估 **2–3 周/1 人**,风险最高的是**进程树杀 + tar/junction 保真**,建议最先 spike 这两项。

---

## 1. 现状盘点:激活体系不是要新建,是要加固(T-147 P5 已上线)

### 1.1 已有的(完整成体系)

| 层 | 文件 | 要点 |
|---|---|---|
| 状态机 | `frontend/src/server/activation/activation-service.ts:14,103-249` | `inactive/active/grace/expired`;`activate()/check()/getStatus()`;`allowed = active\|grace` |
| 在线客户端 | `frontend/src/server/activation/license-client.ts:147-154` | POST `/api/license/activate`、`/api/license/status`;只归一布尔 `success+valid` |
| 配置 | `frontend/src/server/activation/activation-config.ts:20-22` | `DEFAULT_LICENSE_BASE_URL="https://license.aitongban.cloud"`;`DEFAULT_GRACE_DAYS=7` |
| 机器指纹 | `frontend/src/server/activation/machine-id.ts:35-53` | SHA-256 短哈希,优先 Rust 注入(machine-uid crate,Win=MachineGuid 已跨平台) |
| 持久层 | `frontend/src/server/activation/activation-repository.ts:23-104` + `backend/src/schema/activation.ts:13-30` | 表 `activation_state` 单行 singleton;`code` 列 AES-256-GCM 加密(master key 走 keychain+文件兜底);清库 PRESERVE |
| 门控 | `frontend/src/lib/activation-gate.server.ts:13-22` + `frontend/src/app/(creator)/layout.tsx:104-106` | 未激活 → `redirect("/activate")`;注释自陈是引导层非安全门 |
| licenseMode | `backend/src/schema/activation.ts` 注释 | 只用 TIME 型;`expiresAt=null` 即永久卡——**买断制的数据模型已预留** |

自有云端共 3 个端点:`license.aitongban.cloud`(许可)、`creatoros.aitongban.cloud/prompts/bundle.json`(skill 下发,**Rust 内嵌 Ed25519 公钥验签**,`frontend/src-tauri/src/lib.rs:39-41`)、`creatoros.aitongban.cloud/updates/latest.json`(Tauri updater,minisign 公钥已配)。无遥测。激活按机器不按用户(与账号全域隔离正交,切号不影响激活)。

### 1.2 正对用户三个担忧点的真实短板(逐条钉死)

| # | 用户担忧 | 现状漏洞 | 证据 |
|---|---|---|---|
| S1 | 动态感知到期 | `check()` 存在但**宽限 7 天 > 内测码 3 天时长**——用户断网即可躺过整个内测期;心跳节奏无「启动必查+定时」硬约束 | `activation-config.ts:22` |
| S2 | 改系统时间 | 到期/宽限判定全用注入 `now()`(本机 `new Date()`);**无服务端时间锚、无单调时钟、无回拨检测**;`lastOnlineCheckAt` 也是本机时刻——往前拨延命、拨回抹痕迹均可行 | `activation-service.ts:67,70-86,201-206` |
| S3 | 伪造校验请求/绕过 | 客户端只校布尔 `success+valid`,**服务端响应无密码学签名**(SPEC 自陈短板)——hosts 把 `license.aitongban.cloud` 指到本地假服务返回 `valid:true` 即永久使用;重放旧响应同理 | `license-client.ts:5-6` |
| S4 | (衍生)本机绕过 | 校验逻辑全在 **Node sidecar 的 JS**(可读可改,混淆只是减速带);sidecar 无握手 token(loopback+Host/Origin 而已);**代码签名仍是占位未真签**(`codesign.mjs`、`tauri.conf.json:40` signingIdentity:null)→ keychain 不持久只能文件兜底明文存 master key | `loopback-guard.server.ts:18`;`frontend/scripts/desktop/codesign.mjs:2-7` |

已到位的加固资产(可直接复用的信任根):`.next/server` 混淆(javascript-obfuscator,T-164)、updater minisign 验签(不可关闭)、**Rust 内嵌 Ed25519 公钥验签 bundle 的现成范式**(`lib.rs:39-41`)——license 响应签名照抄这套即可。

---

## 2. 业界调研 A:限时激活码

### 2.1 服务端权威 vs 客户端签名 license 文件——不是二选一,是标准组合

业界(Keygen/Cryptlex/LicenseSpring)全部采用「**服务端权威做真值 + 非对称签名的离线 license 文件做缓存/离线凭证**」:

- Keygen 时限码:`expiry = created + policy.duration`,到期返回 `EXPIRED`;离线形态推荐 license file(Ed25519 签名证书快照,含 expiry+TTL)或 `ED25519_SIGN` signed key。(https://keygen.sh/docs/choosing-a-licensing-model/timed-licenses/ 、https://keygen.sh/docs/choosing-a-licensing-model/offline-licenses/)
- Cryptlex/LexActivator:激活后本地持有签名 activation 数据,「本地验签 + 周期性回连同步」。(https://cryptlex.com/docs/node-locked-licenses/using-lexactivator)
- LicenseSpring:每次启动 localCheck(离线验签)+ 周期 online check。(https://docs.licensespring.com/sdks/tutorials/best-practices/license-checks)

**对 3 天内测码的结论:必须服务端权威**。时限太短,纯客户端方案会被改时钟轻松绕过,且撤销/防滥用都需要服务端。当前 CreatorOS 的在线校验方向是对的,缺的是签名与节奏。

### 2.2 心跳 cadence 与离线宽限业界典型值

- Cryptlex:sync interval 官方建议 ≥1 小时;grace 可配。LicenseSpring:grace 自失败起算,成功一次即重置。M365(大厂锚点):≥每 30 天校验,离线宽限约 30 天。(https://forums.cryptlex.com/t/disable-server-sync-grace-period-and-server-sync-interval/495 、https://office-watch.com/2023/check-microsoft-365-licence-grace-period/)
- **通则:宽限期必须远小于 license 时长才有意义**(约 1/6~1/3)。
- **内测 3 天码建议**:启动必查 + 每 30–60 分钟后台心跳 + **离线宽限 12–24 小时**,UI 显示离线剩余倒计时。**现配 7 天宽限对 3 天码等于没有门**(S1)。

---

## 3. 业界调研 B:防系统时间篡改(clock tampering)

| 手段 | 原理 | 被绕过方式 | 评价 |
|---|---|---|---|
| **持久化 last-seen 最大时间戳** | 每次运行记 `max(已见墙钟, 服务端时间)`;当前 < last_seen − 容差 ⇒ 回拨 | 删还原存储文件 → 需多点冗余(app data + 注册表/defaults) | 单机手段性价比最高;LicenseSpring 明文档化(`ClockTamperedException`,纯 UTC 比较) |
| **服务端时间锚定** | 用签名响应里的服务端 `Date` 作可信时间 | 断网(被宽限窗兜住)/劫持(被响应签名挡住) | **有服务端时的黄金锚点**;Keygen 把 `date` 头纳入签名数据 |
| NTP 对比 | 客户端查 NTP 比对 | NTP 无认证可劫持可封端口 | 只做旁证 |
| 单调时钟(`Instant`/CLOCK_MONOTONIC) | 不受墙钟影响,度量进程内流逝 | 重启归零 | 会话内计时用,须与 last-seen 组合 |
| 安装时间/文件 mtime 旁证 | 交叉验证、检测「来自未来」的 mtime | 重装/改文件时间 | 弱旁证,防小白 |

商业 SDK 实况:Cryptlex 回拨阈值约 **1 小时**(容忍 DST/校时,`LA_E_TIME_MODIFIED`);TurboActivate 明确「检测时间欺诈但故意不文档化」。(https://docs.cryptlex.com/changelog/lexactivator 、https://wyday.com/forum/t/5135/avoid-time-tampering-onlineoffline-activation/)

**组合结论(业界事实标准)**:`服务端 Date 锚(在线时) + 持久化单调递增 last-seen(多点冗余,容差 1h) + 会话内单调时钟`。内测码心跳频繁(30–60 分钟),时间篡改窗口天然被压到极小——**服务端权威一上,防改时钟九成消解**。

---

## 4. 业界调研 C:防校验请求伪造/绕过(重点)

### 4.1 攻击面 → 对策

| 攻击 | 手法 | 对策 | 效果 |
|---|---|---|---|
| hosts 劫持假服务器 | `127.0.0.1 license.aitongban.cloud` + 假服务回 `valid:true` | **响应 Ed25519 签名,公钥内嵌客户端**——没私钥签不出 | 彻底封死(验签代码未被 patch 前提下)。**这正是现状 S3 漏洞** |
| 本地 MITM 代理 | mitmproxy + 自签 CA | 同上(响应签名与 TLS 无关,CA 被绕也没用);证书 pinning 是补充非必需 | 封死 |
| 重放旧合法响应 | 录 `valid` 响应过期后回放 | 签名覆盖 `date` 头,**响应时间偏离 >5 分钟即拒**(Keygen 官方建议);更强加 nonce 回显入签名 | 封死 |
| 改客户端代码跳过校验 | sidecar JS 直接编辑(等价 Electron 抽 asar);Rust 二进制需真逆向 | 见 4.2 分层 | **无法彻底防,只能抬成本** |

Keygen 响应签名机制(业界标准范本):默认 Ed25519,签名数据 = `(request-target)` + `host` + `date` + `digest`(响应体 SHA-256)四段按序拼接,客户端用内嵌公钥验 `Keygen-Signature` 头;官方明确用于对抗 MITM/假服务器/重放/离线缓存篡改。(https://keygen.sh/docs/api/signatures/)

### 4.2 诚实评估:防线放哪层

- **JS sidecar 是最弱一环**:Electron 破解实录(抽包读源码改逻辑)对 Node sidecar 完全成立,混淆只是减速带。(https://taner-dev.com/articles/crack-electron)
- **licensing 厂商自己的话**(Keygen):「装在用户设备上的一切都可被破解;licensing 的价值是威慑随手盗版 + 分发可见性,不是防死」。HN 共识「keep honest people honest」。(https://keygen.sh/blog/how-to-generate-license-keys/ 、https://news.ycombinator.com/item?id=14538351)
- **分层结论**:①校验/验签/防回拨逻辑**迁 Rust shell 层**,公钥硬编码进 Rust 二进制,向前端只暴露 `{licensed, expires_in, offline_remaining}`——patch 编译后 Rust 比改 JS 高一个量级;②Rust 层可加 sidecar 入口文件哈希校验,逼攻击者必须动 Rust;③**接受上限**:patch Rust 二进制可破,不再投入——目标是让 hosts 劫持/假服务器/MITM/重放/改 JS/改时钟六类低成本攻击全部失效。
- **CreatorOS 现实排期**:两天内测窗口内 Rust 迁移做不完 → 内测期先在 sidecar 层补验签+防回拨(配合已有混淆,防内测小圈子足够);**买断制商用前完成 Rust 层迁移**(S4 收口)。

---

## 5. 业界调研 D:买断制永久 license 要不要定期验证

- **JetBrains**:perpetual fallback(订阅满 12 个月得旧版本永久权);离线激活码激活后**不强制 phone-home**;撤销走管理面。(https://sales.jetbrains.com/hc/en-gb/articles/207240845)
- **indie mac 主流**(Sketch/Nova/Tower/DevUtils):永久 license + 更新权按年;激活时联网一次拿签名 license 文件,之后不强制回连;DevUtils 明文承诺 works offline。(https://devutils.com/perpetual_license/)
- **Keygen 官方买断模型**:`MAINTAIN_ACCESS` 策略——到期不失效,只限「只能用有效期内发布的版本」,把**使用权和更新权解耦**。(https://keygen.sh/docs/choosing-a-licensing-model/perpetual-licenses/)
- **revocation 真实需求 = 退款/拒付欺诈**(买→激活→第 29 天 chargeback):解法是支付平台 refund/dispute webhook → 自动 revoke。(https://licenseseat.com/licensing-for-macos-apps)

**共识策略(可直接抄的参数)**:
1. 激活时联网一次,签发 Ed25519 签名离线 license(含 key、机器指纹、购买版本上限、签发时间)。
2. 之后**每 7–30 天机会性软校验**(启动时静默尝试):成功刷新本地 license + last-seen;**失败不锁不弹窗**。
3. **只有服务端签名的「已撤销」响应才降级**;网络不通 ≠ 撤销,无限期离线可用(至多设置页显示「上次确认于 X 天前」)。
4. 若要「连续 M 天联不上才行动」,典型 M=30–90 天,动作 = 提醒/停更新,**绝不锁核心功能**。

CreatorOS 落法:数据模型已预留(`expiresAt=null` 即永久),买断码走同一套签名协议,只是 cadence 从「30–60 分钟」放宽到「30 天」、失败策略从「宽限后锁」改为「fail-open 仅撤销才降级」。

---

## 6. 选型对比(oss-scout 权重:匹配度>新鲜度>stars>维护响应;红旗一票否决)

> Web 调研在「无自有服务端」假设下推荐 Keygen Cloud;**盘点推翻了该假设**——`license.aitongban.cloud` 已在跑、客户端全链已上线。故最终推荐修正为「加固自有服务」,Keygen 降级为协议范本/备选。对比表全量保留:

| 候选 | 成本 | 时限码 | 防回拨 | 离线签名 license | 集成 | self-host | 红旗/否决理由 | 判定 |
|---|---|---|---|---|---|---|---|---|
| **加固自有 license.aitongban.cloud** | 服务端加签名端点 + 客户端验签,约 1–2 人日 | ✅ 已在跑 | 自实现(§3 组合,客户端 ~50–100 行) | 可后续加 | 已集成(全链上线) | 本身即自有 | 无;唯一风险=签名/防重放细节自己踩,**但协议可逐条照抄 Keygen 公开签名规范** | ✅ **主推**:迁移成本最低、两天窗口唯一现实解 |
| Keygen Cloud 免费档 | $0(≤100 ALU) | ✅ | ⚠️ 无内建,需自实现 last-seen | ✅ license file/`ED25519_SIGN` | 纯 REST | 可迁 CE | 无硬红旗,但**替换已上线自有服务 = 净增迁移量**;防回拨照样要自己写 | ❌ 否决(现状下无净收益);其签名规范作协议范本 |
| Keygen CE self-hosted | $0 + Postgres/Redis 运维 | ✅ | 同上 | ✅ | 同上 | ✅ FCL 允许商用 | 两天内新起生产级 Postgres+Redis = 时间红旗 | ❌ 否决(同上;若未来自有服务要重写可重估) |
| Cryptlex(付费 SaaS) | 付费 | ✅ | ✅ 最强内建(1h 阈值) | ✅ | 原生 SDK(重) | 企业版贵 | 付费 + 原生 SDK 依赖链重 + 替换已有服务 | ❌ 否决 |
| LicenseSpring(付费 SaaS) | 付费 | ✅ | ✅ 内建 | ✅ | SDK+REST | ❌ 无 | 付费 + 无 self-host 退路 = 锁定红旗 | ❌ 否决 |
| WyDay LimeLM/TurboActivate | 付费 | ✅ | ✅ 但机制刻意不公开 | ✅ | 原生 SDK | ❌ | 闭源黑盒 + 文档不透明(security by obscurity) | ❌ 否决 |
| 自建 Cloudflare Workers 新服务 | 免费额度 + 1–2 人日 | ✅ | 自实现 | ✅ | HTTP | 自有 | 与「加固现有服务」重复造轮 | ❌ 否决(已有服务在跑) |

出处:Keygen 定价/许可 https://keygen.sh/pricing/ 、https://keygen.sh/blog/keygen-is-now-fair-source/ ;其余见各节。

---

## 7. 双端(Mac+Windows)打包盘点

打包链:`package.mjs` → `build-sidecar.mjs` → `obfuscate.mjs` → `tauri build` → `codesign.mjs` → `notarize.mjs`;`release.mjs` 外层做 updater 签名 + `latest.json`。当前纯本机 Mac 手跑,无打包 CI(`.github/workflows` 只有 verify/harness,均 ubuntu)。

### 7.1 必须改(不做 Windows 就崩/缺功能)

| # | 项 | 现状 | 证据 |
|---|---|---|---|
| W1 | `tauri.conf.json` bundle.targets 加 `nsis`/`msi` | 现只 `["app","dmg"]`;`bundle.windows` 骨架已在(`certificateThumbprint:null`) | `tauri.conf.json:19-22,41-45` |
| W2 | `bundleChromiumBrowser()` 补 Windows | 写死 `platform!=='darwin'→return`,Chromium(~344M)不进 Win 包 → 首启视频渲染/扫码要运行时下载,失败率高;需补 `%LOCALAPPDATA%\ms-playwright` 路径 | `build-sidecar.mjs:371-418` |
| W3 | **Windows 进程树杀(Job Object)** | Win 分支只 `CommandChild::kill()` 杀 sidecar 自身,**不带走 node 拉起的 Chrome/ffmpeg** → 重现 T-365 孤儿进程;需 Job Object(kill-on-close)或 `taskkill /T` | `lib.rs:208-211` |
| W4 | `sidecar-lifecycle.ts` Win 分支 | `proc.kill(-pid)` 负 pid 进程组广播、SIGTERM 监听、`ppid===1` 孤儿自检**全是 POSIX 语义,Win 上整套失效**;需重写或依赖 W3 壳侧兜底 | `sidecar-lifecycle.ts:49,77-78,81` |
| W5 | console 黑窗 | externalBin node.exe spawn 弹黑窗(`lib.rs:460` 注释自认未解决);需 `CREATE_NO_WINDOW` | `lib.rs:460` |

### 7.2 需验证(逻辑已备,Windows 实机确认)

1. **系统 `tar.exe`(bsdtar)对 pnpm symlink/junction 的打包-解压保真**(打包 `build-sidecar.mjs:91-97`,解压 `lib.rs:297`)——**整个 sidecar 方案在 Win 的地基,建议第一个 spike**。
2. Windows pnpm 用 junction:`cpSync(verbatimSymlinks/dereference)` 与 `obfuscate.mjs` `isSymlinkEscape`(:85-95)对 junction 的行为(判失效则混淆可能误写 store)。
3. node.exe 裸拷是否自足(mac 需 co-ship libnode dylib,Win 通常不需,`otool` 段已被 darwin 分支圈住天然跳过)。
4. onnxruntime-node `.dll` / sharp@0.32 win 预编译在打包机根 node_modules 到位(`ensureOnnxRuntimeDylib`/`ensureSharpNative` 已含 win 分支,缺则硬卡)。
5. signtool 可用(`codesign.mjs:87-90` 已就绪 `signtool sign /sha1 /fd sha256 /tr`,差证书 + Windows SDK)。
6. `release.mjs:70-76` 只写本机平台键 → 双端 `latest.json` 需合并 platforms 键(或两机各跑手工合并)。
7. `package.mjs` `precleanDmgLeftovers()`(:63-96,hdiutil)无平台守卫,Win 上靠命令不存在静默跳过——建议加 `darwin` 守卫(清洁性,非阻塞)。

### 7.3 天然跨平台(已抽象,无需动)

运行时平台分叉已齐:open-url/reveal-logs/reveal-data-dir 的 win32 分支、`ffmpeg-path.ts`(exe/`;`/`\`)、`which/where` 探测、keyring(Win=Credential Manager)+ machine-uid(MachineGuid)、PGlite(WASM)、photon(WASM)、`fetch-ffmpeg.mjs` 含 win32-x64 资产(已核实可下载)、codesign/notarize 平台守卫、路径全走 `node:path`/Tauri `app_data_dir`、chmod 均已加 win 守卫。**无 osascript/hdiutil/xattr 运行时调用**(hdiutil 仅打包脚本)。faster-whisper/better-sqlite3 未使用(ASR 走 Transformers.js+onnxruntime,DB 走 PGlite),无额外原生风险。

### 7.4 缺口汇总与工作量粗估(1 人)

| 环节 | 工作量 |
|---|---|
| config+签名接线(W1、latest.json 合并、证书 env) | S(0.5–1 天) |
| build-sidecar Win 适配(W2 + 验证 1–4) | M(2–4 天,多为实机踩坑) |
| 进程生命周期 Win 化(W3+W4+W5,唯一要写新 Rust/Node 逻辑的硬骨头) | M–L(3–5 天) |
| 打包 CI(GitHub Actions matrix:macos-latest + windows-latest 跑 `tauri build`,官方 `tauri-apps/tauri-action` 范式) | S–M(1–2 天) |
| 端到端真机回归(扫码/转录/渲染/更新四主链在 Win 重验,历史坑 T-169/170/225/284/313 全重走) | L(3–5 天) |
| **合计** | **约 2–3 周**;最可能超期:W3 进程树杀 + tar/junction 保真 → **先 spike 这两项** |

Windows 签名与分发:不签名触发 SmartScreen 拦截;2025–2026 主流 = **Azure Trusted Signing**(按月订阅,免 EV 硬件 token,Tauri v2 官方支持,CI 配 AZURE_* env 即可),签了仍需积累 SmartScreen 信誉(可向 Microsoft 提交加速)。**内测期可接受不签名**(附「仍要运行」指引),公测前必须签;Mac 同理(Developer ID + notarization,内测可右键打开)。Tauri updater 双端天然支持(minisign 验签不可关,Win 出 NSIS/MSI+`.sig`,`release.mjs` 正则已含)。(https://v2.tauri.app/distribute/sign/windows/ 、https://v2.tauri.app/plugin/updater/)

---

## 8. 推荐架构(待拍板)

### 分层原则

- **在线校验是唯一硬约束点**:本地态(加密 DB + machineId + 系统时钟)在未真签名 + 无 sidecar token + 无可信时间下均可被本机用户绕过——「放行」的最终权威压在签名的在线校验上,离线宽限是**可用性妥协而非安全边界**。
- **明确接受的上限**:patch Rust 二进制可破(业界含 licensing 厂商自己都判定不值得继续投入);目标 = 六类低成本攻击(hosts 劫持/假服务器/MITM/重放/改 JS/改时钟)全部失效。

### 第 1 层:内测前必做(两天窗口,S1–S3 收口)

1. **服务端**(license.aitongban.cloud):`/api/license/activate|status` 响应加 **Ed25519 签名**(协议照抄 Keygen 规范:签 `(request-target)`+`host`+`date`+`digest(body)`;私钥只在服务端)+ 响应体带**服务端时间与 expiresAt**(权威到期时间)。
2. **客户端**(先 sidecar 层,复用 `lib.rs` prompt-bundle 验签范式的公钥内嵌思路):
   - `license-client.ts` 验签 + `date` 偏离 >5 分钟拒绝(防重放);
   - **防回拨**:持久化 `last_seen = max(本地墙钟, 服务端 date)`,双点冗余(activation_state + macOS defaults/Win 注册表),当前 < last_seen − 1h ⇒ 视同过期;
   - **心跳**:启动必查 + 每 30–60 分钟后台 revalidate;
   - **宽限按码型配比**:内测 3 天码宽限 12–24h(服务端下发 graceDays,替换写死的 7 天),UI 倒计时。
3. **内测码策略**:服务端建 3 天 TIME 码批量发放;绑定机器指纹(已有);撤销即时生效(下次心跳)。

### 第 2 层:买断制上线前(1–2 周)

1. 永久码(`expiresAt=null`)+ **软校验**:每 30 天机会性静默复验,fail-open,仅签名「revoked」才降级(停更新+提醒,不锁功能);使用权/更新权解耦(Keygen `MAINTAIN_ACCESS` 模型)。
2. 支付 webhook(Stripe/Paddle/LemonSqueezy 或国内渠道)→ 自动发码;refund/dispute → 自动 revoke。
3. **license 校验迁 Rust shell 层**(S4 收口):公钥硬编码 Rust,Rust 完成取码→校验→验签→防回拨→放行,向前端只暴露结果;可加 sidecar 入口哈希校验。
4. 真代码签名:Mac Developer ID+notarization、Win Azure Trusted Signing——同时解锁 keychain 持久化(现文件兜底明文 key 的固有弱点随之消除)。

### 第 3 层:双端打包(并行推进,2–3 周)

按 §7:先 spike(tar/junction + Job Object)→ W1–W5 → CI matrix → Win 真机四主链回归。需要一台 Windows 打包/验证机(用户已表态后面会准备构建机)。

---

## 9. 决策点(2026-07-17 用户拍板)

> ✅ 已定 / ⏳ 待用户确认最后两点

1. ✅ **验签/校验逻辑一步到位放 Rust 层**,不走 sidecar 过渡。⏳ **代价待取舍**:两天内测窗口内 Rust 层大概率赶不上 → 内测推迟 1–2 天等 Rust 完成 vs 内测先用现有 sidecar 校验(有已知短板)Rust 随后补——待用户选,影响切片顺序。
2. ✅ **内测码**:3 天**到期即硬跳激活页,无宽限延命**(到期由 last-seen 防回拨兜住,改时钟无效);离线宽限 24h 仅指「连不上服务器」的容忍,超 24h 也跳激活页;**心跳 60 分钟一次**。
3. ✅ **买断码**:心跳继续但**放宽到每次启动 + 每 30 天**(不用 60 分钟);**fail-open**——「连不上网」绝不降级(不误伤离线正常用户),**只有服务端签名的「已撤销」响应**才 → **停更新 + 提示(挂更新入口旁边),不锁核心功能**。⏳ 「心跳没了就停更新」的语义待用户确认为「仅指服务端明确撤销」(非网络不通)。
4. ✅ **双端构建**:CI(GitHub Actions matrix)负责打包 + 自备 Windows 实机负责真机验收(分工)。
5. ✅ **证书暂不申请**:内测期 Mac/Win 均不签名,发装机绕过警告说明;公测前再定(遗留项:Apple Developer $99/年 审批周期 + Azure Trusted Signing 的 SmartScreen 信誉需时间积累,晚申请晚受益)。

---

## 附:三路子代理原始报告要点索引

- 现有授权/服务端基建盘点:§1(全表含 文件:行号)
- 双端平台耦合盘点:§7(三档清单+缺口+工作量)
- 业界方案 Web 调研:§2–§6(全部出处 URL 内联)
