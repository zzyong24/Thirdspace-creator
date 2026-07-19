# CreatorOS 0.1.0 桌面分发包 —— 红队逆向报告(攻击者视角)

- **日期**:2026-07-18
- **目标物**:`desktop-darwin-aarch64.zip`(779 MB,sha256 `a67b338d…c49a`)
- **交战规则**:只碰分发产物,**不看源码**。静态盘点 + 已授权的动态实操(隔离环境、外呼指向本地死端口、绝不触碰生产 license/prompt 服务)。
- **视角**:本文以「我(攻击者)拿到你的安装包后做了什么、拿到了什么」第一人称叙述;结论对照你 BACKLOG 的 T-391 / T-392 / T-399 防护意图。
- **一句话结论**:**「防偷 IP」这条线全线失守,「防改授权」这条线的客户端侧被我用一条命令完全绕过。** 真正达标的只有「源码树剥离」和「无硬编码密钥/未误打私钥」两项;`T-391` 的多数加固被「混淆只混标识符不加密字符串」和「授权强制点只在 Rust 壳、不在 sidecar」两个结构性缺口大面积抵消。

---

## 0. 战果一览

| 我想要的 | 拿到了吗 | 代价 | 靠什么 |
|---|---|---|---|
| 全部 AI 系统提示词(产品核心 IP) | ✅ 逐字 | 分钟级 | 解 `sidecar.tar.gz` → grep 中文串 |
| 完整功能:**不激活直接用整个 app** | ✅ **实测 HTTP 200** | ~10 分钟 | `node server.js` 裸拉 sidecar |
| 解密一切的 master key | ✅ 明文文件 | 秒级 | 读 `~/Library/Application Support/…/.master-key` |
| 模型密钥加密的降级 key | ✅ 可复现 | 秒级 | `SHA256("creatoros-dev-fallback-master-key-v1")` |
| 完整数据库 schema | ✅ | 秒级 | `backend/drizzle/*.sql`(49 个迁移) |
| 后端基础设施拓扑 | ✅ | 秒级 | env 键名 + 明文域名 |
| 授权「严格校验」开关 | ✅ 一眼 | 秒级 | 明文 env `CREATOROS_LICENSE_STRICT_VERIFY` |
| 原始 `.ts` 源码树 | ❌ 扑空 | — | 已被剥离(唯一挡住我的防线) |
| 硬编码 API key / 私钥 | ❌ 无 | — | 凭据走 env、日志私钥未进包 |
| license 验签 Ed25519 公钥(明文) | ❌ 未见 | — | obfstr 生效 |

---

## 1. 开箱:我拿到了什么

zip 里是标准 Tauri 更新四件套:

```
CreatorOS.app.tar.gz          390 MB   app bundle
CreatorOS.app.tar.gz.sig      408 B    minisign 更新签名
CreatorOS_0.1.0_aarch64.dmg   391 MB   DMG 安装器(内容同 app)
latest-darwin-aarch64.json    673 B    updater manifest
```

`latest-darwin-aarch64.json` 直接泄露更新源仓库 `github.com/zzyong24/Thirdspace-creator` 和 minisign 公钥。

解开 app bundle:

```
CreatorOS.app/Contents/
├─ MacOS/
│   ├─ CreatorOS            5.9 MB   Rust/Tauri 主二进制(授权信任根在这)
│   ├─ creatoros-server     133 MB   打包进去的 Node.js 运行时
│   ├─ creatoros-logdec     369 KB   加密日志解密工具
│   └─ creatoros-logkeygen  336 KB   日志密钥生成工具
├─ Resources/
│   ├─ sidecar.tar.gz       344 MB   ← 真正的业务代码在这(运行时解压)
│   └─ icon.icns
└─ Info.plist               Bundle ID: cloud.aitongban.creatoros
```

**关键:业务逻辑不在主二进制里,在 `Resources/sidecar.tar.gz`**(Next.js standalone 整棵树,运行时解压到 appDataDir)。这是本次几乎所有战果的来源。

---

## 2. 静态战果

### 2.1 源码树剥离 —— ✅ 你唯一挡住我的防线

解开 `sidecar.tar.gz` 后我第一件事是找 `.ts` 源码。**扑空了**:

| 期望能偷到的 | 实际 |
|---|---|
| `frontend/src`(269 个 .ts) | ✅ 已删 |
| `frontend/docs` `specs` `tests` `backend/src` | ✅ 全删 |
| 顶层设计文档 `*.md` | ✅ 无 |
| 非 node_modules 的 `.ts` | 只剩 1 个 `next.config.ts`(配置文件) |

**这一条(T-392)在实包里确认生效,是本次唯一完全达标的强防护。** 但如下所示,它只堵住了「原始源码」,没堵住「编译产物里的字符串」。

### 2.2 提示词 IP —— ✅ 逐字提取(明文)

源码树没了,但 `.next/server/chunks` 里 101/103 个 chunk 含明文中文。我 grep 中文串就把产品最值钱的东西——**全部 AI 系统提示词**——逐字拿走了。样本(均为原文片段):

- **选题拆解 agent**:「像一个专业自媒体主编那样,把这条选题想透——观众是谁、痛在哪、核心冲突、怎么开头钩住、内容怎么排…指标只给你有把握的,拿不准就给 null(别编)」
- **知识库管理员**:「你是短视频创作者的知识库管理员…判断这段材料属于哪一类知识、起一个一眼看懂的标题…只归类,不改写原文」
- **对标拆解 agent**:「绝不抄袭——不复制原作品的标题/文案/结构照搬,而是拆出它『为什么爆』的底层要素,再结合下面这位创作者自己的定位与人设,换一个属于本账号的角度重做」
- **文案改写约束**:「事实、数据、卖点必须忠于原文——不得改动、弱化,也不得编造原文未声明的卖点;但开头、切入角度、钩子、叙述结构由你自由创作」

> 你有 `PROMPT_BUNDLE_URL` + `PROMPT_BUNDLE_PUBLIC_KEY` 的服务端提示词分发+验签机制(方向对),但**大量提示词仍以明文兜底嵌在客户端**,分发机制形同没上。

### 2.3 混淆 —— ⚠️ 半吊子,对我几乎无效

编译产物确实过了混淆(102/103 chunk 带 `/* creatoros-obfuscated */`,标识符改成 `_0x5daa7c`、数字转 hex、route 入口用 `R['m'](0xc06fa)` 十六进制模块号)。**但字符串字面量零加密。**

结果:控制流我看不懂无所谓——我直接 grep 字符串,提示词、API URL(`https://api.minimax.io`、`/v1/image_generation`)、模型名、字段名全部命中。**混淆挡住的是没人会读的控制流,放行的是真正值钱的字符串。** 你在 T-392 备注写过「混的是编译产物,源码直接送上门」;现在的状态是**源码不送了,但产物里的字符串照样送**。

### 2.4 授权数据模型 + 基础设施拓扑 —— ✅ 完全透明

Rust 主二进制的 `strings` 里,**完整 license verdict 数据模型明文出现两次**:

```
installMode, id, currentVersion, rawJson, allowed, machineId, licenseMode,
projectKey, expiresAt, activatedAt, lastOnlineCheckMs, lastSeenMs, graceSeconds,
revoked, updatesBlocked, signatureVerified, verdictAtMs, strictVerify, success, valid
```

配合明文枚举 `perpetual / subscription / trial` 和命令面标识符(`license_activate`、`license_last_decision`、`next_pre_encrypt_action`、`handshake`、`reveal_item_in_dir`、`master_key`),整个授权状态机对我完全透明。

基础设施拓扑(全明文):

| 用途 | 端点/键名 |
|---|---|
| 授权服务端 | `https://license.aitongban.cloud`(env `CREATOROS_LICENSE_BASE_URL` 可覆盖) |
| 提示词分发 | `https://creatoros.aitongban.cloud/prompts/bundle.json` |
| 更新源 | `https://creatoros.aitongban.cloud/updates/latest.json` + `github.com/zzyong24/Thirdspace-creator` |
| 严格校验开关 | env `CREATOROS_LICENSE_STRICT_VERIFY`(明文,一眼可试 `=0`) |
| CI 构建路径(信息泄露) | `/Users/runner/work/Thirdspace-creator/Thirdspace-creator`(GitHub Actions) |
| 其它 | `DATABASE_URL`、S3 全套、`CREATOROS_BLOB_SECRET`、`CREATOROS_DEV_PASSWORD` 等键名全暴露 |

### 2.5 代码签名 —— ⚠️ ad-hoc,可随意重签

主二进制 `flags=0x20002(adhoc, linker-signed)`、`TeamIdentifier=not set`、空 entitlements。与你「内测不签名如实标 signed:false」一致、诚实。但攻击者视角:**Hardened Runtime 并未真正生效**(ad-hoc 不携带 runtime flag),我可以任意 patch 后 `codesign -s -` 重新 ad-hoc 签名。运行时自校验是 **shell out `/usr/bin/codesign -dv --verbose=4`**——这本身可被 PATH 劫持,且 ad-hoc 态下本就降级放行。

### 2.6 我没偷到的(你守住的)

- **无硬编码长格式密钥**(sk-/AKIA/JWT/私钥都没有,凭据走 env)。
- **日志解密私钥未误打进包**:包内嵌的是 `DEV_LOG_PUBKEYS_B64`(X25519 公钥,负责加密,公开无害);解密私钥 `creatoros-log-privkey.key` 是 `creatoros-logdec --key` 的必填入参、只在你手里。加密日志密钥卫生**达标**。
- **license 验签 Ed25519 公钥**未见明文(`ring::signature::ED25519` + obfstr 灭靶点生效)。
- **反调试在场**:`Failed to disable ptrace-ability of the process` / `Failed to disable core-dumps via rlimit`(PT_DENY_ATTACH + rlimit 关 core dump)——只是错误串明文把机制写在脸上。

---

## 3. 动态战果(已授权实操,隔离环境)

### 3.1 裸拉 sidecar = 完整绕过授权壳 —— ✅ 实测通过(最高价值)

`sidecar/frontend/server.js` 是**原版 Next.js standalone 启动器,没有任何 license 门、没有 handshake 校验、没有 master-key 要求**,直接 `startServer` 绑 `0.0.0.0:PORT`。`middleware-manifest.json` 是空的(`"middleware":{}`)——**没有中间件级授权拦截**。

我用系统 `node v22`、零授权、外呼指死端口、DB 指向全新空目录,直接启动:

```bash
env PORT=38072 CREATOROS_DB_DIR=<fresh> \
    CREATOROS_LICENSE_BASE_URL=http://127.0.0.1:9 \
    node sidecar/frontend/server.js
```

**结果:`GET /` → HTTP 200,59529 bytes,`<title>CreatorOS</title>`,完整 app UI 渲染,没有激活墙。** 业务 API 路由可达(`/api/knowledge/search`、`/api/v1/local/path` 返回 **405 方法不对**,而不是 401/402/403 授权拒绝)——请求进了业务逻辑,没被 license 拦。

> **结论:授权强制点只在 Rust 外壳(决定是否弹窗)。整个 Next 业务层无授权约束。任何人 `node server.js` 指向 app 目录,浏览器开 localhost,就得到一个完全可用的 CreatorOS,授权壳形同虚设。** 这是本次最彻底的一击。

### 3.2 master key 明文落盘 + 降级 dev key —— ✅ 双重失守

**(a) master key 明文文件。** 真实安装态下,`~/Library/Application Support/cloud.aitongban.creatoros/.master-key` 是**磁盘上的明文文件**(83 bytes,`v2` 前缀,对应二进制里 `creatoros-master-key-file-v2` 标签,权限 600)。任何以该用户身份运行的进程、或拿到磁盘备份/时间机器快照的人,读这个文件就拿到解密一切(日志、模型密钥)的 master key。这正是你 BACKLOG H-key 标注「明文文件兜底应改受保护存储」那条——**本包里仍是明文落盘**。

**(b) 降级 dev key(硬编码、可复现)。** master key 缺失/非法时,`secret-crypto` 回退到一个内嵌确定性 key。启动日志实录:

```
[secret-crypto] 未取到 master key … 使用开发降级 key
[persistence] 模型密钥本地加密使用降级 master key(未取到 keychain key)
```

从 chunk 提取到它的派生方式:

```
算法:  aes-256-gcm,密文前缀 'enc:v1:'
降级key: SHA256("creatoros-dev-fallback-master-key-v1")   // 32B,任何人可算
```

即:**任何在降级态下写入的模型 API 密钥(用户配置的 Anthropic/OpenAI/MiniMax token,存成 `enc:v1:…`)可被任何人用 `SHA256("creatoros-dev-fallback-master-key-v1")` 解密。** 硬编码 seed = 无秘密可言。

### 3.3 本地库明文 + 全量 schema —— ✅

- **`backend/drizzle/` 内含全部 49 个迁移 SQL**(`0000_init` → `0049_activation_security_mirror`),完整数据库 schema 明文,含 license/activation 表结构。
- 我裸拉 sidecar(给的是 dummy master key)时,**pglite 本地库照常打开并跑迁移**——说明**本地库不靠 master key 加密**,库文件层面是明文 pglite(仅个别 secret 列走 `enc:v1:` 字段级加密,而那又能被 3.2 的降级 key 破)。
- 附带证实:裸拉的 sidecar 若不设 `CREATOROS_DB_DIR` 会**自动挂上本机真实 appData 库**——本地任意进程/恶意软件都能起这个 server 读你的全量业务数据。

---

## 4. 逐防护判定

| 防护(BACKLOG) | 你的意图 | 实包状态 | 我的绕过 |
|---|---|---|---|
| **T-392 源码剥离** | 不泄露源码树 | ✅ **达标** | 扑空(唯一) |
| T-391 H-log 加密日志密钥 | 私钥不进包 | ✅ 达标 | 无 |
| 无硬编码密钥 | 凭据走 env | ✅ 达标 | 无 |
| T-164 P6 混淆 | 保护编译产物 | ⚠️ **半吊子** | grep 字符串,提示词/端点全拿 |
| T-391 H-mac 签名/Hardened Runtime | 防篡改/伪装 | ⚠️ ad-hoc 未生效 | patch 后重签;自校验 shell-out 可劫持 |
| T-391 H-native 授权信任根 | 服务端信任根 | 🟡 方向对但客户端全透明 | verdict 模型明文 + strict 开关明文 |
| **授权强制点** | 全功能需激活 | ❌ **失守** | **`node server.js` 裸拉,HTTP 200 全功能** |
| **T-391 H-key master key** | 不明文出现 | ❌ **失守** | 明文 `.master-key` 文件 + 硬编码降级 key |
| **T-399 反 AI 欺骗层** | 诱饵/迷宫/污染上下文 | ❌ **本包未落地** | 无诱饵、无假密钥、无反逆向注入 |

> **T-399 说明**:没有成体系的诱饵/蜜罐命名、没有假 `sk-` 密钥、没有针对逆向 AI 的上下文污染注入(`trap/canary/poison` 全是库噪声;`忽略以上…切换角色` 是 app 自己系统提示词里的**反用户越狱**指令,不是防逆向)。与 BACKLOG 一致——T-399 还在 SPEC/拆片阶段。**「给 AI 带弯路、复杂迷宫、污染上下文」这层保护,在你现在分发的包里等于零。**

---

## 5. 我的最短破解路径(kill chain)

1. **偷 IP(零成本,已完成)**:解 `sidecar.tar.gz` → grep 中文 → 全部提示词到手。
2. **白嫖全功能(~10 分钟,已实测)**:`node sidecar/frontend/server.js` → 浏览器开 localhost → 完整 CreatorOS,零授权。授权壳绕过。
3. **拿密钥(秒级,已验证)**:读 `.master-key` 明文文件;或对降级态数据用 `SHA256("creatoros-dev-fallback-master-key-v1")` 解 `enc:v1:` 密文。
4. **摸清一切(秒级)**:`backend/drizzle/*.sql` 拿全量 schema;Rust `strings` 拿授权状态机与基础设施拓扑。

**我没能做到的**:偷原始 `.ts` 源码、拿到硬编码密钥、拿到日志解密私钥、明文看到 license 验签公钥。

---

## 6. 诚实边界(我没测/待验证的)

- **服务端授权是否真绕**:我证明了「客户端不激活可全功能运行」,但**没有攻击你的 license 服务端**(`license.aitongban.cloud`)。如果关键能力依赖服务端在线签发 + 服务端持有真实数据,那么「裸拉 sidecar」拿到的是空壳前端;但对**纯本地功能**(知识库、编辑、本地 AI 调用——AI 走用户自己的模型 key)已经是完整白嫖。
- **`CREATOROS_LICENSE_STRICT_VERIFY=0` 的真实效果**:我看到了这个明文杠杆,但没在真实 Rust 授权路径上动态验证它到底降级到什么程度。
- **Rust 侧 H-native 去单点化/多点冗余的鲁棒性**:静态看到痕迹,未做 Frida/patch 级动态对抗。
- 未触碰你的生产服务;真实 appData 库仅被只读迁移探测且**当时安全中止、原库未改动**;两个测试 server 已停、隔离数据已删。

---

## 7. 给防守方:对应关系(供另一 session 建任务)

按严重度排序,映射到你的 BACKLOG:

| # | 缺口 | 严重度 | 对应 |
|---|---|---|---|
| 1 | **授权强制点只在 Rust 壳,sidecar 无授权约束** → `node server.js` 全功能绕过 | 🔴 高 | 新(T-391/授权体系) |
| 2 | **master key 明文落盘 `.master-key`** | 🔴 高 | T-391 H-key(未闭环) |
| 3 | **降级 key = 硬编码字符串 SHA256**,模型密钥可解 | 🔴 高 | 新(secret-crypto) |
| 4 | **混淆不加密字符串** → 提示词 IP + 端点明文 | 🔴 高 | T-164 P6 / T-392 延伸 |
| 5 | 本地 pglite 库明文 + 全量 schema 随包 | 🟡 中 | 新 |
| 6 | codesign 自校验靠 shell-out `/usr/bin/codesign` 可劫持 | 🟡 中 | T-391 H-mac |
| 7 | 授权 verdict 数据模型 + `STRICT_VERIFY` 开关明文 | 🟡 中 | T-391 H-native |
| 8 | T-399 欺骗层未落地(现分发包保护=0) | 🟡 中 | T-399a/b/c |
| 9 | CI 构建路径 / 更新仓库 / 基础设施拓扑信息泄露 | 🟢 低 | — |

**守住的(值得肯定)**:源码树剥离(T-392)、加密日志密钥卫生(T-391 H-log)、无硬编码密钥、反调试在场、license 验签公钥 obfstr。

**一句话给你**:客户端无绝对不可破——这是你自己在 T-399 研究里写过的诚实边界。但当前包的问题不是「客户端理论上可破」,而是**几处本可低成本堵上的门根本没关**:授权强制点放错层(该在 sidecar 请求路径上加校验)、master key 明文落盘(该进 keychain)、降级 key 硬编码(该随机化或直接拒绝降级)、混淆缺字符串加密层(该给提示词/端点上 string-encryption)。这四条堵上,能把「一条命令白嫖」的攻击者挡在门外——治不了顶尖逆向,但足够劝退绝大多数。

---

*本报告仅基于分发产物的黑盒逆向;全程未阅读源码。动态实操在隔离环境完成,未触碰生产服务,真实用户数据未被修改。*
