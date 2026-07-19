# 防逆向 / 防盗版 分层落地方案(基于实包实测)

- **日期**:2026-07-18
- **配套**:[红队逆向报告](./2026-07-18-desktop-redteam-reverse-engineering-report.md)(攻击面)+ 本文(防御面)
- **目标(用户拍板)**:**无限抬高攻击者「获取全部源码 + 跑起盗版」的成本**。不是防某段提示词(用户判定提示词非资产),是防整棵代码被读走、防软件被复制盗用。
- **审查约定**:本方案属防逆向/防AI破解类,**不送外部模型 gate**(送审=泄底牌),收尾走本地对抗自审。见 memory `security-obscurity-spec-no-external-gate`。

---

## 0. 威胁模型与诚实天花板

**三条攻击链(红队报告已实测全部走通):**

1. **读源码**:`tar xzf sidecar.tar.gz` → 读 `.next/server/chunks`。明文 JS,分钟级。
2. **白嫖跑起来**:系统 `node server.js` 裸拉 sidecar → HTTP 200 全功能,零授权。
3. **复制盗版**:拷 app 目录到别的机器即可跑(无机器绑定硬约束)。

**天花板(必须先认):核心逻辑是 JS,买了来逆的铁杆最终能逆。** 本方案不追求「不可破」,追求把攻击者从「分钟级 + 零技术」抬到「周级 + 需脱壳/字节码逆向/机器码逆向技能」——这就是「无限抬成本」在工程上的真实含义(100–1000×),绝大多数人在第 2 层就放弃。

---

## 1. 现状地基(实测,方案的事实依据)

| 项 | 实测值 | 影响 |
|---|---|---|
| sidecar 打包 | **明文 gzip**(`Resources/sidecar.tar.gz`,344MB),Rust 只解压不加密 | 攻击链 1 |
| 业务逻辑形态 | **明文 JS**(混淆了标识符,未加密字符串) | 攻击链 1 |
| 打包 node/V8 | **node v25.9.0**(package.json `"node":">=24"`),next 16.2.9,turbopack | 决定 L3 版本锁 |
| sidecar 拉起 | Rust 解压到 `~/Library/Application Support/…/runtime/0.1.0/sidecar/`,spawn `creatoros-server`,handshake token 经 `window.__CREATOROS_HANDSHAKE_TOKEN__` 注入前端 | 决定 L2/防盗版 |
| **handshake 校验** | **fail-open**:`return !token \|\| header===token`,token 未设即全放行 | 攻击链 2 命门 |
| 信任判定 | `isLoopbackRequest && (fail-open token)` —— loopback 对本地攻击者无意义 | 攻击链 2 |
| master key | 明文文件 `.master-key`(v2)+ 硬编码降级 `SHA256("creatoros-dev-fallback-master-key-v1")`;keyring-rs 在场但降级到文件 | 破坏 L2/L3 钥匙 |
| 已有可复用 | 反调试(PT_DENY_ATTACH+rlimit)、obfstr 灭靶点、license 服务端 `license.aitongban.cloud`、`ring` Ed25519、keyring-rs | 地基 |

---

## 2. 前置修复(P0,不做这两条后面全白干)

### P0-A:master key 去明文 + 去降级 —— L2/L3 的钥匙

**问题**:加密层再强也只等于钥匙强度。现在钥匙明文落盘 + 有硬编码降级。
**落地**:
- master key **只经 keyring-rs(macOS Keychain / Windows Credential Manager)**取;取不到时**fail-closed**(拒绝启动或进只读降级态),**删掉 `.master-key` 明文兜底文件路径**(`lib.rs`)。
- **删掉 `secret-crypto` 的 `SHA256("creatoros-dev-fallback-master-key-v1")` 降级分支**;开发态用随机临时 key(每次进程不同、不持久),绝不用确定性常量。
- master key 仍走 T-391 H-key 的 ChildStdin(fd)注入 sidecar,不进 env、不落盘。
- **验收**:实包内 `find … .master-key` 无命中;`grep dev-fallback` 无命中;`strings` 无降级常量。

### P0-B:handshake fail-open → fail-closed —— 堵白嫖命门

**问题**:`return !token || header===token`,token 未设即信任 → `node server.js` 直接白嫖。
**落地**:
- 改 **fail-closed**:`return !!token && header===token`(无 token = 拒绝,不是放行)。
- token 不再是静态 env,改为 **Rust 核每次启动生成的随机、带时效、签名的一次性 token**;sidecar 校验签名 + 未过期 + 未被重放(nonce)。
- **在全局中间件(或统一 route guard)对所有非公开 route 强制**,不是散落在部分 route;当前 `middleware-manifest.json` 为空,先补一个真中间件。
- loopback 检查**保留但不当主防线**(本地攻击者天然满足)。
- **验收**:不带 token `node server.js` 后,业务 API 返回 **403**(不是 405/200);带过期/伪造 token 同样 403。

---

## 3. L1 — JS 硬化(cheap,table-stakes,几天)

**目标**:让「grep 直取」失效(我这次的打法),把攻击者逼到「跑/hook decoder」。

**落地细节:**
- **字符串加密**:`javascript-obfuscator` 的 `stringArray` + `stringArrayEncoding:['rc4']` + `stringArrayThreshold:1` + `splitStrings`。
- **必须白名单排除 turbopack 运行时 glue(否则崩,见 memory `desktop-hardening-p6-obfuscation`)**:
  - chunk 名字符串(`server/chunks/*._.js`)、模块号 `R['m'](0x…)` / `R['c'](…)`、`R['i'](0x…)`
  - `require()/import()` 的 specifier
  - 指令前缀 `'use strict'` / `'use client'` / `'use server'`
  - Next 内部标记 `__next_*`、`__NEXT_PRIVATE_*`
  - 用 `reservedStrings` 正则覆盖以上。
- **属性名 mangle**:仅对内部对象开,**排除上 wire 的 JSON 字段**(license verdict 字段、API 契约字段)——否则 client↔server 契约断。保守起见先不开 `transformObjectKeys`,只做 string+identifier。
- **chunk 文件名哈希化**:把 `ai-worker_src_runtime_…`、`…_api_knowledge_comment-sift_route_actions_…` 等泄露内部结构的名字,rename 成哈希 + 同步改所有 `R['c']('server/chunks/…')` 引用。这是「rename-only 安全区」——改名不改内容,不崩。
- **manifest / CI 路径脱敏**:清掉 `required-server-files.json`、`next.config`(`server.js` 内联)里的 `/Users/runner/work/Thirdspace-creator/…` 绝对路径与 `outputFileTracingRoot`。
- **强制运行时冒烟**:混淆后必跑真机四主链(启动/转录/渲染/更新),turbopack 混淆崩得静默。

**天花板**:低。会跑代码的人 `node` 载入 chunk 调 decoder / hook `stringArray` 就 dump 出明文。所以 L1 只是把 90% 的伸手党挡在门外,不是主力。

---

## 4. L2 — sidecar 加密落盘(主力之一,中高)

**目标**:打掉攻击链 1(`tar xzf` → 读 JS)。让攻击者拿不到明文文件,必须脱壳 + dump 运行时。

**现状**:`sidecar.tar.gz` 明文 → Rust 解压到 `runtime/0.1.0/` 磁盘 → spawn。
**改造**:tar 用 **AES-256-GCM 加密**(build 时),Rust 核运行时解密再拉起。

**核心难点:node 必须从文件系统读整棵树,「纯内存」不现实。** 三个方案,按强度/难度:

| 方案 | 做法 | 明文暴露窗口 | 难度 |
|---|---|---|---|
| A. 解密到 temp + 用后擦 | 解密到随机临时目录,spawn 后立即 `chmod 000`/进程退出即 `rm -rf` | 有窗口:运行期间明文在磁盘,攻击者可读该 temp | 低 |
| B. RAM disk / tmpfs | 解密到内存盘(mac `hdiutil` APFS RAM disk / `diskutil erasevolume`),进程退出卸载 | 窗口小:明文只在内存盘,重启即失;但 root 仍可 dump | 中 |
| C. fd/命名管道 + 改造 | 让 sidecar 从 fd 读关键 chunk(需改 next standalone 加载器) | 最小;但工程量大、易碎 | 高 |

**推荐 B(RAM disk)+ 反调试联防**:明文不落持久磁盘,配合你已有的 PT_DENY_ATTACH,attach dump 也被挡一层。
**密钥来源**:解密 key 走 P0-A 的 keychain + 机器绑定派生,**绝不静态常量、绝不落盘**(否则等于没加密——我脱壳时先读你钥匙)。
**验收**:分发包内 `sidecar` 是密文(`file` 认不出 gzip,`tar tzf` 失败);运行期间 `find / -name server.js` 在持久盘无命中(方案 B)。

---

## 5. L3 — V8 字节码(主力之二,JS 应用的实际上限,中)

**目标**:打掉攻击链 1 的「读懂」环节。发字节码不发 JS 文本,攻击者即使拿到也没有源码,只能逆 V8 字节码。

**落地细节:**
- 工具:`bytenode`(或直接 `vm.Script` + `produceCachedData`),把 chunk 编译成 `.jsc`。
- **版本锁**:字节码与 V8 强绑定,**必须用打包的 node v25.9.0 编译**(你自己控运行时,可行);升级 node 必须重编全部 `.jsc`,进 CI。
- **哪些能编 / 会崩**:
  - 业务 chunk(route actions、ai-worker runtime、知识库逻辑)→ 能编,收益最大。
  - **turbopack 运行时 glue chunk(`[turbopack]_runtime.js`、`R['m']/R['c']` 调度)→ 谨慎**,字节码化后模块解析可能崩;先留 JS,只编叶子业务 chunk。
  - 顶层 await / 动态 `import()` 的 chunk 要单测。
- **与 L1/L2 叠加顺序**:先 L1(混淆)→ 再 L3(字节码编译混淆后的 JS)→ 最后 L2(把 `.jsc` 树打包加密)。顺序反了字节码里就是明文字符串。
- **验收**:`.next/server/chunks` 里是 `.jsc`,`strings` 无业务字符串;真机四主链通过。

**天花板**:高(JS 能到的顶)。有 View8 等 V8 字节码逆向工具,但版本特定、只能部分还原、无变量名——从「读混淆 JS」抬到「逆字节码」,周级成本。

---

## 6. L4 — 关键逻辑原生化(选择性,最高,最贵)

**目标**:把最舍不得的少数逻辑抬到机器码层——无源码可还原。

**落地细节:**
- 用 **napi-rs** 把 2–3 个「皇冠」函数抽成 Rust 原生 `.node` 插件,JS 调用;不整体重写。
- **授权强制的最终判定**搬进 Rust 主二进制(license verdict 的 `allowed` 决策点),JS 只拿结果不做判定——即使 JS 被 patch,授权判定仍在机器码里。
- 不追求把业务全搬 Rust(代价=拿 Rust 重写产品,算账再定)。

**天花板**:最高(客户端能到的顶,需反汇编 + 真 RE 技能,无源码恢复)。

---

## 7. 防盗版层(与 L1–L4 正交,必须做)

1. **堵白嫖**:P0-B(handshake fail-closed + Rust 签发时效 token + 全局中间件)。这是攻击链 2 的直接修复。
2. **机器绑定**:license verdict 里 `machineId` 已有(Rust 走 `IOPlatformUUID`/`ioreg`);激活时把 license 绑机器指纹,换机不激活跑不起来。
3. **偶尔在线激活(不是每请求,你服务器扛得住)**:每次启动 / 每 N 天一次向 `license.aitongban.cloud` 验一次「license 有效 + 未吊销 + 未超设备数」;宽限期内离线可用(`graceSeconds` 已有字段)。AI 调用照走用户自己 model key,**不碰你服务器**。
4. **吊销名单**:发现盗版 license 直接吊销,下次在线校验即失效。

---

## 8. 叠加顺序与优先级(给实施者)

```
P0-A master key 去明文/去降级   ← 前置,不做则 L2/L3 白加
P0-B handshake fail-closed      ← 前置,直接堵白嫖(攻击链2)
      │
      ├─ L1 JS 硬化(混淆+chunk名哈希+脱敏)   ← 先,cheap
      ├─ L3 V8 字节码(编译混淆后的 JS)        ← 中,主力
      ├─ L2 加密落盘(打包 .jsc 树 + RAM disk 解密) ← 后,主力
      └─ 防盗版层(机器绑定 + 偶尔在线激活 + 吊销)
      
L4 原生化 ← 选择性,只给最舍不得的 2-3 个函数 + 授权终判
```

**顺序要点**:L1 → L3 → L2(先混淆、再编字节码、最后加密打包),反了就白做。

---

## 9. 成本账(诚实)

| 攻击者当前 | 做完 P0+L1+L2+L3+防盗版后 |
|---|---|
| 读源码:`tar xzf`+grep,**分钟** | 脱 AES 壳(密钥在 keychain)+ dump RAM disk + 逆 V8 字节码 + 无变量名,**周级,需专门技能** |
| 白嫖:`node server.js`,**一条命令** | handshake fail-closed + 时效签名 token,**403,得先伪造 Rust 签发的 token** |
| 盗版:拷目录,**复制粘贴** | 机器绑定 + 在线吊销,**换机跑不起来 / 被吊销** |

**「无限」的真相**:真正无限的只有 L4(全原生),代价是重写。P0+L1+L2+L3+防盗版 = 把 99% 的攻击者挡住、把剩下 1% 从分钟拖到周;这是这个 Tauri+JS 架构下性价比最高的「无限」。

---

*本方案基于分发产物黑盒实测,未阅读源码。落地后须本地对抗自审(自己再逆一遍验成本),不送外部 gate。*
