# 打包 / 加密 / 防逆向 现状对账与优化空间

- 日期:2026-07-21
- 触发:用户提问「打包和加密有没有优化空间,只需要保障攻击者不会随便逆向出代码」
- 视角:防御者对现状盘点 + 攻击面 diff(2026-07-18 复测 → 2026-07-20 T-446 后)+ 可选加固清单,按 ROI/风险打分
- 输出用途:决定是否新建/合并任务进 BACKLOG(**本文不落任务、不改代码**)
- 硬规矩:方案不送外部 gate(见 memory `security-obscurity-spec-no-external-gate`;送审=泄底牌)

---

## 0. 一句话结论

**攻击者从「grep 分钟拿源码」抬到「必须动态跑 sidecar 才能捞 prompt」这一步真做成了**(T-417 rc4 + T-419 字节码 + T-415 default-deny handshake,红队 2026-07-18 复测已实证)。但 **T-446 Windows 直装 sidecar 之后**,原本靠 `sidecar.tar.gz` 隔一层的 Windows 侧**磁盘明文暴露面显著扩大**——现在攻击者在 Windows 上 `dir "C:\Program Files\CreatorOS\resources\sidecar\..."` 就能直接读到 292 个 `.jsc` + 混淆 chunks + `libnode.dll` + 依赖闭包(不必再 tar 解压)。

**优化空间的真答案:**
1. **不是"再上更强的静态加密"**——L1(rc4)+ L3(bytenode)已把 90% 的 grep AI 挡在门外,再堆没有边际收益。
2. **真短板在动态旁路 + 磁盘明文暴露**:攻击者绕 Rust 壳直接跑 sidecar 就能拿运行时解密后的真 prompt(2026-07-18 §2.3 已证);T-446 之后 Windows 磁盘更好读。
3. **能拿的 ROI 排序** = ① 阻塞攻击者复用你的 node runtime 起 sidecar(binding 绑机 + 启动握手) > ② Windows 直装目录读权限收紧 + 关键文件加密 > ③ L1 chunks 加密提threshold 到 1.0 + client 端点表脱敏 > ④ mac 加解密 tar 存在时才做 > ⑤ 关键判定原生化(L4)。
4. **千万别做**的:整套 sidecar AES 加密解到 RAM disk / tmpfs(方案 B,ladder §4)——工程成本 = 数周,同时 Windows 无 RAM disk 原生支持,收益已被 L3 字节码大部分吃掉,ROI 极低。

---

## 1. 现状盘点(2026-07-21 事实基础)

| 层 | 当前实现 | 落点 | 状态 | 备注 |
|---|---|---|---|---|
| **打包组装** | `frontend/scripts/desktop/build-sidecar.mjs`(1683 行) | mac/linux:tar.gz;Windows:安装目录直装 `sidecar/` | ✅ 平台各自可用 | Windows CI 目前另有 STATUS_STACK_OVERFLOW(T-446 后 tauri_build 递归 resources,已在 task #1 跟踪) |
| **L1 服务端混淆** | `obfuscate.mjs` — `chunk-stringarray`(rc4,threshold 0.75)+ `rename-only` + full | `.next/server/**/*.js` | ✅ 已落地 | reservedStrings 保 turbopack glue;冒烟护栏兜底 |
| **L1 客户端混淆** | 同上,client 侧 `static/chunks/` 也走 rc4 | `.next/static/chunks/*.js` | ✅ 落地 | T-417 补丁,浏览器执行 chunk 也加密 |
| **L3 V8 字节码** | `bytecode.mjs` — bytenode 编 chunks 业务 chunk | 292 `.jsc` + 294 stub `.js` | ✅ 落地(T-419) | 版本靠本机 node = 打包 node;bytenode 无第三方依赖 |
| **反 AI 诱饵** | `decoy.mjs` — 独立文件、零引用、不进 build manifest | `.next/static/chunks/` | ✅ 落地(T-399a) | 静态诱饵,严格 R1/R2/R3 |
| **法律声明盖章** | `legal-stamp.mjs` — 版权/DMCA §1201 顶部注释 | 每个可读 chunk | ✅ | 触发读代码 AI 拒绝协助盗版 |
| **绝对路径脱敏** | `sanitizeBuildPaths()` `<REPO> → /creatoros` | server.js / required-server-files.json / .bin shim | ✅ 落地(T-417 补) | 消开发者用户名 + 目录布局 |
| **handshake default-deny** | `proxy.ts` + `layout.tsx` 内联 fetch patch | `/api/*` + server action | ✅ 落地(T-415) | 全局中间件,allowlist=/activate /auth /updater /静态 |
| **handshake fail-closed 烘焙常量** | next.config `CREATOROS_HANDSHAKE_REQUIRED="1"` 编译期烘焙 | 桌面构建 | ✅ 落地(T-415 baked) | 裸 `node server.js` 关不掉 |
| **master key 混淆** | `.master-key` v2 XOR(machine_seed + nonce) | `<appDataDir>/.master-key` | ✅ 落地(T-391 H-key) | keychain best-effort + 文件兜底 |
| **入口完整性哈希** | build.rs 注 `CREATOROS_SIDECAR_SHA256`(mac)/`_ENTRY_SHA256`(win) | Rust 二进制内嵌 | ✅ 落地(T-372 L2) | mac 对 tar 全量算;Win 对 `sidecar/frontend/server.js` 单文件 |
| **反调试(mac)** | PT_DENY_ATTACH + rlimit | Rust 壳 | ✅ | 只保护 Rust 壳,不保护「攻击者直接跑 sidecar」路径 |
| **机器绑定 license** | Ed25519 + machineId(IOPlatformUUID/MachineGuid) | Rust 壳 | ✅ 落地(T-372 L2/L3 + T-408) | 每启动生成 32B nonce handshake token |
| **Windows 反重复启动** | tauri-plugin-single-instance | Rust 壳 | ✅ 落地(T-446) | 官方 single-instance 插件 |

---

## 2. 攻击面 diff:T-446 之后什么变了

### 2.1 mac 侧:基本不变

- `sidecar.tar.gz`(344 MB)明文 gzip 仍作为 Resource 打入 `.app`。
- 攻击者路径不变:`tar xzf CreatorOS.app/Contents/Resources/sidecar.tar.gz` → 拿到 `.jsc` + stub;grep 中文 0/294(见 2026-07-18 复测 §1)。
- **真攻击链**仍是「拷贝随包 node → 裸启 sidecar → 运行时捞解密 prompt」。

### 2.2 Windows 侧:磁盘明文暴露面**并未**如初稿所述扩大

> **勘误(2026-07-21 T-449 调研发现):** 本节初稿断言 "T-446 之后装到 `C:\Program Files\CreatorOS\...`,所有本机用户默认可读", **该断言错误——主 agent 未核对配置就推断**。真实:`frontend/src-tauri/tauri.windows.conf.json` 的 `bundle.windows.installMode` **未显式设** → Tauri v2 默认走 `currentUser` → 装到 `%LOCALAPPDATA%\Programs\CreatorOS\`(**当前用户目录**),**其他本机账号 Windows 默认 ACL 本就读不到**。基于此错的 §4.2 已作废,T-449 撤销。见 [T-449 调研归档](2026-07-21-t449-windows-acl-hardening-research.md)。

**变化(实际情况):**
- **旧(T-446 前):** `sidecar.tar.gz` 首启解压到 `%APPDATA%/…/runtime/0.1.0/sidecar/`。用户目录,仅该用户可读。
- **新(T-446 后):** Windows **构建期就把 pnpm junction 全部物化成真文件**,`sidecar/` 目录随 NSIS/MSI 装到 **`%LOCALAPPDATA%\Programs\CreatorOS\resources\sidecar\`**(用户目录内,`installMode=currentUser` 默认)。**零解压、零 tar**。

**攻击面变化(实际,以攻击者视角):**

| 项 | 旧(tar) | 新(直装,currentUser) | 影响 |
|---|---|---|---|
| 文件是否在磁盘 | 首启后解压落盘 | **一装完就落盘** | 对同一用户攻击者:更早暴露 |
| 是否需要 tar 解包 | 是(小门槛) | **否**,`dir` 直看 | 对同一用户攻击者:门槛下降 |
| 目录默认权限 | `%APPDATA%\<user>\` — 该用户可读写 | `%LOCALAPPDATA%\Programs\<user>\` — **仍仅该用户可读**(Windows ACL 天然) | **多用户机其他账号仍读不到** |
| SHA-256 完整性 | 对整个 tar 算,进 build.rs | 只对 `sidecar/frontend/server.js` 单文件算 | **完整性验证颗粒度变粗**(→ T-450) |

**真实判定:** T-446 之后 Windows 磁盘暴露面**对同一用户攻击者**变化不大(旧版首启后也解到同一用户目录);**对多用户机其他账号**仍读不到。**只有当 installMode 显式切 `perMachine` 装到 `C:\Program Files\` 时**,才需要 T-449 那种 icacls 收紧——当前 CreatorOS 未走该路径,T-449 撤销。

真短板仍在动态旁路(§4.1)和完整性验证颗粒度(§4.3)。

### 2.3 完整性验证颗粒度诚实边界

Windows 侧现在只查 `frontend/server.js` 一个入口文件的 SHA-256。攻击者:
- 改 `frontend/server.js` → 拒绝启动(能拦)。
- 改任意 `chunks/*.jsc`、任意依赖 → **拦不住**。攻击者可以 patch `.jsc` 里的 handshake 判定或 license 判定,壳不查。

这在 SPEC ladder §9 的诚实边界里已经写明("此校验只防 JS 层入口篡改,不假装形成全链路防篡改")。

---

## 3. 现有防线的**真价值**盘点(不是每一层都值得再加)

对照 [ladder 设计文档](2026-07-18-anti-reversing-defense-ladder-design.md) §9 的成本账:

| 防线 | 目标攻击链 | 现在真挡住了什么 | 边际投入的下一档收益 |
|---|---|---|---|
| L1(rc4) | 攻击链 1 静态读 | 静态 grep 中文/端点 0 命中(2026-07-18 §1 实证) | 提 threshold 0.75 → 1.0 = 极少额外收益;可全覆盖但增崩险 |
| L3(bytenode) | 攻击链 1 静态读 | 逻辑 + 部分 UTF-16 中文串藏进字节码常量池 | 无 —— 字节码已是 JS 应用天花板 |
| 反 AI 诱饵 | AI 快攻矛盾定位 | 让 grep license/verify/token 命中矛盾 | Class B(误导真符号)/Rust 蜜罐,后续增量 |
| default-deny handshake | 攻击链 2 白嫖 | 通过 Rust 壳走的路径全 403;chat/knowledge/dispatch/settings 全线守住 | **仍有旁路——攻击者不走壳直接跑 sidecar(§4)** |
| 机器绑定 license | 攻击链 3 复制盗版 | 换机不激活 → 拒 spawn | 在线吊销 + 定期在线激活(ladder §7 已列) |
| 入口哈希 | Rust→sidecar 之间 JS 篡改 | 改 tar / 改 Windows server.js 拒 spawn | Windows 侧扩到多文件 hash 树,收益中等,工程量大 |

**关键观察:** 静态一侧已达 JS 应用天花板;**真正未堵的是"绕 Rust 壳,直接用你随包发的 node runtime 起 sidecar"**——这条路径:
- 版本天然匹配(用你发的 node → bytenode 版本对上)
- Rust 壳的反调试/master key/机器绑定**全部旁路**
- 只要打进 sidecar 进程内运行时,rc4 解密后的字符串一定在堆里
- 攻击者用 `--inspect` 从头拉起自己的 sidecar,不需要 attach 授权

**这是当下唯一有实际 ROI 的加固方向。**

---

## 4. 优化清单(按 ROI/风险打分,不列 P0/P1,决定权在用户)

### 4.1 【收益最大】阻塞"用随包 node 裸启 sidecar"

**问题:** 现在攻击者能这样做——
```
NODE=<app>/…/creatoros-server            # 你自己发的 node
cd <app>/…/sidecar/frontend
PORT=39218 DYLD_LIBRARY_PATH=…/lib "$NODE" server.js
# → sidecar 起来了,handshake require=1 也真守,但攻击者可 patch .jsc 里的 handshake 判定
```
更狠的路径是攻击者带 `--inspect`,`console.log(手动 require 的 chunk)` 直接把解密后的 prompt 打出来——完全绕 handshake。

**加固思路(几个可选):**

**(a) 随包 node 加"启动 magic + Rust 壳双向握手"** — 强度中·工程中。
- 打包时给 `creatoros-server`(mac)/ `node.exe`(win)在 Rust 侧加 code sign / 或直接嵌一段 stub:sidecar 启动时读一个只有 Rust 壳知道的 magic env,不匹配即拒。
- 攻击者可 patch node 二进制去掉这个 check,但门槛从"复制粘贴"抬到"改 mach-o/PE + 重签"。
- 变种:随包 node 用 Node 21+ 的 SEA(Single Executable Applications)把 loader 内嵌成一次性入口,不再是通用 node。
- 诚实边界:阻挡不了改 Rust 壳的高级攻击者,但把批量伸手党挡在门外。

**(b) 关键 chunk 用 fd/pipe 由 Rust 壳按需喂给 sidecar** — 强度高·工程高。
- 参考 ladder §4 方案 C。把 comment-sift / distill 等"皇冠 prompt chunk"从 `.jsc` 挪进 Rust 内嵌资源,启动时经 anonymous pipe / fd 交给 sidecar 加载。
- 磁盘上根本没有这几段字节码;裸启 sidecar 起不来这几个路由。
- 工程成本高(需改 Next 加载器),回退风险大。**不建议第一步就上**。

**(c) sidecar 入口 self-check "我是不是被 Rust 壳拉起来的"** — 强度低·工程低,先做。
- server.js 顶部或 instrumentation 里加一次自检:检查父进程是不是 CreatorOS,或读一次 Rust 壳注入的 fd。不满足 → `process.exit(1)`。
- 攻击者可以删掉这段自检,但需要动到已被 rc4 + bytecode 保护的一段——门槛提到了 §3 里所述的"运行时动态跑"层面。
- **诚实:** 这一条是 sidecar 内的软自检,对 patch 敏感;但和 (a) 叠加时形成两把锁,单挑一把成本 × 2。

**推荐组合:** (a) 轻量 magic env + (c) sidecar 内自检。工程量小,把"复制随包 node → 白嫖"这条路的 ROI 拉到"值不值得逆 Rust 壳"级别。

### 4.2 【收益次高】Windows 直装 sidecar 磁盘保护

- **降权限:** 装完后把 `sidecar/frontend/.next/server/` 目录的 ACL 收紧到只读 + 只有 SYSTEM/Administrators 读——普通用户 `dir` 看不到内容(NSIS/msi 后置脚本设 icacls)。
- **限制:** 用户机上跑的 CreatorOS 进程是普通用户身份,依然读得到;但**其他用户 / 其他账号**读不到——多用户机(公司电脑、共享机)的静态盘点门槛显著抬升。
- **变种:** 关键 `.jsc` 转成 Rust 壳资源(见 4.1b),Windows 目录里干脆不存在这几个文件。

**风险:** icacls 太紧可能让升级脚本或 auto-repair 走不通;需在 T-446 计划里测。

### 4.3 【收益中】完整性验证从"单文件入口"扩到"清单 hash 树"

- 现在 Windows 只查 `frontend/server.js`;攻击者可以 patch 任意 `.jsc` / 任意依赖 → 不拦。
- 建议:build 期算一份**受保护清单**(所有 `.jsc` + `server.js` + 关键 node_modules 的 dylib/dll + Rust 壳自身)的 SHA-256,写进 Rust 壳嵌入的 `include_bytes!` 或经 obfstr 保护;启动时抽 N 个随机项校验,不匹配拒 spawn。
- **诚实:** 每启动全量校验 292 个 `.jsc` 会让冷启动多几百 ms;抽样 N=8~16 是平衡点。攻击者要绕就得改 Rust 壳。
- **不做全量原因:** 攻击者早晚会 patch 掉这段;抽样 + 秘密清单给他增加"猜哪几个被抽"的成本比全量更实用。

### 4.4 【收益中低,可选】L1 chunks 加密再抬一点

- 当前 `stringArrayThreshold=0.75`,可以试 1.0(全部字符串进 stringArray)。红队 §1 已实证 0.75 下静态 grep 中文 0 命中,再抬只是保险丝式的余量。
- 客户端端点表(§4 §2 "全量端点图 + 全部 model provider host")当前明文可 grep——**判定为可接受**(浏览器必需 fetch,强收会裂功能),但可以加一层:把 provider host 从静态串搬到运行时组装(拼接 base64 + 反混淆)。**低价值,不急**。

### 4.5 【战略性,ROI 长期】关键判定原生化(L4,ladder §6)

- 把 `license verdict.allowed` 的最终判定搬进 Rust 主二进制,JS 只拿结果——授权判定不在 sidecar,不管 sidecar 怎么被 patch/裸启,授权都在机器码里。
- **工程量:** 中(2~3 天,已有 Ed25519 + machineId,只是决策点搬家)。
- **收益:** 攻击者要绕就得逆 Rust,不再是逆 JS/字节码。**是防"复制盗版"的真终局**,不是防"读代码"的一层。
- **提醒:** 只搬 verdict 判定,别整体重写产品。

### 4.6 【别做】整套 sidecar 加解密 → RAM disk / tmpfs

- ladder §4 方案 B。工程 = 数周(改 lib.rs 解密器 + Windows 无 RAM disk 原生支持要 pagefile hack)。
- **收益已被 L3 大部分吃掉:** 静态就算读到明文 tar,里面还是 `.jsc` + 混淆 chunks,拿不到 prompt。
- 只有当 ladder §5 L3 字节码被完全逆掉才需要考虑;当前收益/成本比 < 0.1。

---

## 5. 与已有任务对账(不出仓;供用户判定是否新建/合并)

| 优化 | 是否已在 BACKLOG | 归属建议 |
|---|---|---|
| 4.1(a) magic env + (c) sidecar 自检 | ⚠️ 无(T-415 只解决 handshake,不解决"绕壳直启") | **建议新建任务:sidecar 反裸启防线** |
| 4.2 Windows 直装 sidecar 目录降权限 | ⚠️ T-446 计划未涵盖 ACL 收紧 | 可作为 T-446 的 follow-up |
| 4.3 完整性验证扩到 hash 树 | ⚠️ T-372 L2 只做入口 | 建议新建独立小任务(Windows 侧尤其) |
| 4.4 L1 threshold 抬升 | ⚠️ T-417 定 0.75 冒烟稳 | 低价值可选,不急 |
| 4.5 L4 关键判定原生化 | ⚠️ ladder §6 已提但未拆任务 | 长期战略,建议单独立任务 |

---

## 6. 决定谁拍板

- 4.1 / 4.2 / 4.3 = **本文提出的三条真加固**,合起来把"绕 Rust 壳裸启 sidecar → 拿运行时 prompt"这条唯一未堵的动态旁路顶到"需专门逆向技能"层——完全对齐用户「不让攻击者随便逆向」的目标。
- 4.5 = **战略层加固**,回答"是否要把授权判定搬 Rust"——工程量 2~3 天,值不值看产品阶段。
- 4.4 / 4.6 = **不建议先做**(4.4 收益边际、4.6 收益已被 L3 覆盖)。

**下一步的选项(供用户选):**
- A. 只做 4.1 + 4.2(收益最高、工程小,预计 2~3 天,直接把最后一条动态旁路的 ROI 拉到攻击者不划算)。
- B. A + 4.3(完整性 hash 树,再多 1~2 天)。
- C. A + 4.5(补 L4 原生化,把授权判定搬 Rust,再多 2~3 天)。
- D. 全上(A+B+C)。

方向定了之后再走 CLAUDE.md 铁律:**先建任务进 BACKLOG,再写 SPEC(如需改架构则过 gate),再开工**。本文不落任务、不改代码。

---

## 附:核心事实索引(便于验证与追溯)

- [ladder 设计](2026-07-18-anti-reversing-defense-ladder-design.md) — 分层方案原文
- [红队初测](2026-07-18-desktop-redteam-reverse-engineering-report.md) — T-417/T-419 前
- [红队复测](2026-07-18-desktop-redteam-retest-after-t417-t419.md) — T-417/T-419 后,含 §2 keystone 修复
- [T-399 欺骗设计](2026-07-18-t399-ai-targeted-deception-design.md)
- 打包脚本入口:`frontend/scripts/desktop/package.mjs`(六步:build-sidecar → obfuscate → bytecode → decoy → legal-stamp → smoke → tauri build)
- Rust 壳 sidecar 拉起:`frontend/src-tauri/src/lib.rs:643 resolve_sidecar_dir` / `lib.rs:2018 gen_handshake_token`
- Windows 直装校验:`frontend/src-tauri/src/lib.rs:537 verify_direct_sidecar_dir_with_hash`
- Windows conf:`frontend/src-tauri/tauri.windows.conf.json`(`resources: ["sidecar/"]` — task #1 的 CI STATUS_STACK_OVERFLOW 根因,与本次研究不冲突)
