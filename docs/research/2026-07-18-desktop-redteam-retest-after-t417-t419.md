# 桌面包防逆向 —— T-415/T-417/T-419 落地后红队复测(实测)

- 日期:2026-07-18
- 视角:授权模拟演练,攻击者第一人称。**只碰分发产物,不读源码树。**
- 被测产物:`frontend/src-tauri/target/release/bundle/macos/CreatorOS.app`(构建于 2026-07-18 19:15-19:17,**晚于** T-419 提交 706073a2@19:10,确认反映最新防护)。
- 前置:本文是 [2026-07-18-desktop-redteam-reverse-engineering-report](2026-07-18-desktop-redteam-reverse-engineering-report.md) 的复测。上一版结论是「静态可 grep 出全部 prompt/端点 + `node server.js` 全功能白嫖」。本轮检验 T-417(字符串加密)、T-419(V8 字节码)、T-415(P0-B handshake)三项落地后的真实效果。

---

## 0. 一句话结论

**两件真啃下来了,一件是最关键的、只做了一半——而这一半直接把另外两件的价值在 knowledge 路由上清零。**

| 项 | 声称 | 实测 | 判定 |
|---|---|---|---|
| T-417 字符串加密 | chunks prompt 明文归零 | server chunks 中文 0/294,`.jsc` 常量池只剩 RC4 密文碎片 | ✅ **真做成** |
| T-419 V8 字节码 | 292 .jsc + bytenode | 292 .jsc,残留 .js 全是 stub/glue;静态无可读串 | ✅ **真做成**(但价值有边界,见 §3) |
| T-415 P0-B handshake | 裸 `node server.js` 返 403 | **chat/settings 返 403,knowledge/* 进业务逻辑(400/500)** | ❌ **半成品·keystone 漏** |

---

## 1. 静态防护:真起效了(T-417 + T-419)

**复现:**
```bash
# 解包 .app 内 sidecar.tar.gz
CHUNKS=.../sidecar/frontend/.next/server/chunks
# 字节码覆盖
find $CHUNKS -name '*.jsc' | wc -l   # → 292
find $CHUNKS -name '*.js'  | wc -l   # → 294(全为 <180B 的 bytenode stub + 2 个 turbopack glue)
# 原始字节 grep 中文(不靠 strings,strings 不吐 UTF-8 多字节)
grep -rlP '[\x{4e00}-\x{9fff}]' $CHUNKS --include='*.jsc' | wc -l   # → 0 / 292
grep -rlP '[\x{4e00}-\x{9fff}]' $CHUNKS --include='*.js'  | wc -l   # → 0 / 294
```

**决定性取样** —— `strings` 一个必含 prompt 的路由字节码(comment-sift,评论甄别 AI):
```
DSo9WOhcGCkXv8kc / W53dI8kpCSofWQWBa27cSCon / _0x220094 / _0x47c311
abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=
evalmachine.<anonymous>
```
能捞到的**全部人类可读内容** = RC4 stringArray 密文碎片 + 混淆标识符 + base64 字母表 + V8 编译标记。**没有 prompt、没有端点、没有中文。**

高价值标记全量 0 命中(证明不是 grep 假阴性——RC4 密文碎片本身能被 grep 到):
`x-creatoros-handshake` `enc:v1` `systemPrompt` `你是` `claude-` `minimax` `gpt-image` `CREATOROS_` `api.anthropic` `IOPlatformUUID` `ActivationService` `LicenseClient` `CREATOROS_LICENSE_BYPASS` → **全 0 / 292**。

**攻击者结论:静态分析这条路(也是 AI 逆向最省事的一条)对 server 端 prompt IP 颗粒无收。** 机制是双层:L1 把整个 chunk 的字符串字面量搬进 RC4 加密数组 → L3 再字节码封装。要拿 prompt,只剩「跑起来在运行时解密」一条路。这把攻击面从「静态读」逼到「动态跑」——是实打实的进步。

---

## 2. keystone 漏洞:knowledge/* 裸奔,把 §1 的成果清零(T-415 半成品)

静态防护的全部价值,押在「攻击者不能直接跑这段代码」上。实测:**能跑,而且 knowledge 族没锁。**

**2.1 裸启 sidecar,不走 Rust 壳、不给 handshake、不给 license:**
```bash
NODE=.../sidecar/server.app/Contents/MacOS/creatoros-server   # 你自己发的 node(内嵌 libnode)
ln -sf .../sidecar/lib/libnode.127.dylib \
       .../sidecar/server.app/Contents/lib/libnode.127.dylib   # 10 秒修 @rpath
cd .../sidecar/frontend
PORT=39218 DYLD_LIBRARY_PATH=.../sidecar/lib "$NODE" server.js &
# → ▲ Next.js 16.2.9  ✓ Ready   —— boot 时无 license 门,无需 master key
```
> 注:攻击者用**你自己发的** `creatoros-server` 跑,字节码版本天然匹配。这印证 T-419 只挡静态、不挡「跑」。实测该运行时为 **node v22.22.2**(非此前记录的 v25.9.0)。

**2.2 不带 token 打各路由(handshake 缺失):**

| 路由 | HTTP | body | 判定 |
|---|---|---|---|
| `POST /api/chat` | **403** | `{"error":"forbidden: request must originate from the local application"}` | ✅ guard 生效 |
| `POST /api/v1/settings-transfer/models` | **403** | 同上(guard 话术) | ✅ guard 生效 |
| `POST /api/knowledge/search` | **400** | `{"error":"q 不能为空:请输入要搜索的内容"}` | ❌ **进了业务校验** |
| `POST /api/knowledge/distill` | **400** | `{"error":"content 不能为空:请先倒入要蒸馏的文本"}` | ❌ **裸奔** |
| `POST /api/knowledge/comment-sift` | **500** | (跑进 DB/逻辑) | ❌ **裸奔** |

**决定性区别在 body:** 403 说的是 guard 的话(`forbidden: ... local application`);400 说的是**路由自己的业务校验**(中文提示)。business error 只可能在**穿过 guard、进入 route handler** 后产生。→ knowledge 族没有 handshake 强制。

**2.3 后果链(为什么这一条抵消 §1):**
1. 攻击者裸启 sidecar(§2.1)→ 白嫖:knowledge 全家功能免 license 可用。
2. 打 `/api/knowledge/distill` 带合法 body → 路由**在运行时把 RC4 串解密** → 用**真 prompt** 调 LLM。
3. 攻击者拿 prompt 的三条现成路:① 配自己的 model key,读出站请求;② mitmproxy 拦出站 HTTPS;③ **自己用 `--inspect` 从头启动 sidecar**(自有进程无需 attach 授权,裸启路径无 PT_DENY_ATTACH——反调试在被跳过的 Rust 壳里),堆快照捞解密串。
4. → L1+L3 静态藏起来的 prompt,被这条没上锁的动态路径**原样交出**。

**根因不是「漏贴了 knowledge」,是打法本身错**:handshake 走**逐路由手贴 guard**(实测 chat 有、knowledge 无),必然持续漏。T-415 SPEC 本身要求的是「**全局 middleware 默认拒 + allowlist 放行(/activate /auth /updater /静态)**」——default-deny,不是 per-route opt-in。当前实现停在 opt-in,这正是 chat 守住、knowledge 裸奔的直接成因。

---

## 3. T-419 字节码的价值边界(诚实定位)

- **有效**:静态读被封死(§1 已证)。
- **无效**:防不了「跑」。攻击者用你随包发的 `creatoros-server` 跑,版本天然匹配;bytenode 的 .jsc 无签名校验、无完整性校验,可被 stub/preload 注入劫持。
- **版本锁更弱于预期**:运行时实测 node **v22.22.2**(常见系统版本),不是 v25.x。「换 node 跑不了」的门槛因此偏低——但这条本就 moot,因为攻击者用随包运行时,根本不换。
- 结论:字节码是「抬高静态成本」的有效一层,**不是**「防跑/防白嫖」的手段。防白嫖的唯一现成闸口是 §2 的 handshake + license,而它漏了。

---

## 4. 顺带捡到的次要泄露(非 IP,但降成本)

| 泄露 | 位置 | 影响 |
|---|---|---|
| 全量端点图 + 全部 model provider host | 客户端 `static/chunks`(不加密) | API surface 枚举:`/api/knowledge/*` `/api/v1/local/*` `/api/v1/activate` + anthropic/deepseek/minimax/moonshot/openai/siliconflow/stepfun/volces/modelscope |
| UI 中文文案 40 文件 | 客户端 `static/chunks` | 仅 UI 串(「删除排期」「扫码登录失败」),**非 prompt**,低价值 |
| 绝对构建路径 | `server.js` 的 `outputFileTracingRoot`/`turbopack.root` | 明文 `/Users/zyongzhu/Workbase/Thirdspace-creator` → 用户名 + 构建布局。T-417 里被 defer 的「CI 路径脱敏」未做 |
| 内部 schema | 裸启 DB 迁移错误信息 | 吐表名 `rubrics/rubric_versions/search_documents/knowledge_items` + T-332 隔离逻辑 |

客户端 chunk 漏 UI 中文属可接受(浏览器必需、非 IP);但**端点全图 + 绝对路径**建议清理(低成本)。

---

## 5. 对 T-399 欺骗层的直接含义

[t399-deception 设计](2026-07-18-t399-ai-targeted-deception-design.md) §0 写明:欺骗层是**纯静态防御**,硬前提 = P0-B fail-closed 堵死动态旁路,否则「白修」。本轮实测**证实该前提当前未满足**(knowledge/* 动态旁路开着)。→ **T-399 现在上线 = 白修**,与设计文档预警一致。修 T-415 到 default-deny 之前,不要动 T-399。

---

## 6. 修复优先级(实测导出,非分级教条)

1. **T-415 改 default-deny 全局 middleware**(唯一 keystone):非 allowlist 路由一律 403,allowlist = `/activate` `/auth` `/updater` `/_next/静态`。验收锚 = 本文 §2.2 那张表**全部翻红为 403**(除 allowlist)。这一条修好,§1 的静态成果才真正兑现为「静态读不到 + 动态进不去」。
2. server.js 绝对路径脱敏 + 客户端端点图能收则收(低成本,§4)。
3. DB 迁移错误信息脱敏(不吐表名/隔离逻辑)。
4. T-399 欺骗层:**等 1 完成后**再排。

---

## 7. 修复落地与验证(2026-07-18 当轮实施)

keystone(§6.1)已实施并真机复测通过。**不再是 per-route 手贴,而是全局 default-deny。**

**改动(4 文件 + 1 卡口 + 2 测试):**
| 文件 | 作用 |
|---|---|
| `frontend/src/lib/loopback-core.ts`(新) | 提纯 loopback+handshake 判定为无 `server-only` 的共享核,proxy 与 route handler 共用一份(杜绝 §2 那种覆盖漂移) |
| `frontend/src/lib/loopback-guard.server.ts`(改) | 薄壳:re-export core + 保留 `server-only`/`loopbackForbidden`;route 内检查降为纵深防御 |
| `frontend/src/proxy.ts`(改) | **全局 default-deny**:Next 16 proxy(Node runtime,可读运行时 token)。对 `/api/*` 与 server action(POST+`Next-Action`)强制握手;放行导航/RSC/静态 + allowlist(`/api/v1/blob` `/activate` `/auth`)。matcher 从排除 api 扩为含 api。保留原 x-pathname 注解 |
| `frontend/src/app/layout.tsx`(改) | 首帧前内联 `HANDSHAKE_FETCH_SCRIPT`:给所有**同源**请求自动附握手头(桌面壳才生效)——default-deny 的客户端配对,防真机自误伤 |
| `frontend/scripts/desktop/verify-handshake-gate.mjs`(新) | 回归卡口:裸启 standalone 双场景(攻击者无 token / 真机有 token)逐路由断言,不符非零退出 |
| `frontend/src/proxy.test.ts` `loopback-guard.server.test.ts`(测) | 9 + 14 单测,固化「谁被守/谁裸奔」 |

**验证(CREATOROS_DESKTOP=1 next build 的真 standalone 产物,非 dev):**
- 单测 23/23 绿;eslint / tsc 0 错。
- 卡口 `verify-handshake-gate.mjs` 全绿:
  - **场景 A(攻击者裸 `node server.js`,不设 token)**:§2.2 那张表**全部翻红为 proxy 403**——`chat` `knowledge/{distill,search,comment-sift,relate}` `dispatch` `web-session` `settings-transfer` + server action `/positioning` 一律 403;allowlist(blob/activate/auth)与导航 `/` 不被 proxy 拦。**knowledge/* 白嫖门堵死。**
  - **场景 B(真机有 token)**:上述路由**带对头全部放行**(进业务:400/404/500/401),缺头一律 403。**真机路径零误伤。**
  - 关键点:`CREATOROS_HANDSHAKE_REQUIRED="1"` 确认**内联进 proxy bundle**(裸 node 关不掉),这是单测验不到、必须真 build 才能证的一环。
- 客户端 fetch patch 六项行为独测通过(同源附头 / server action 附头 / 跨源不泄 token / Request 克隆保 method / 不覆盖已有头 / dev-web 不 patch)。

**仍需真机 smoke(本轮环境做不到,发版前必补):** 完整 Tauri 桌面包跑一遍——扫码/转录/渲染/更新四主链 + 激活页,确认 webview 里 token 注入时序 + fetch patch 真的让所有 AI 功能照常(服务端已严验,客户端仅内联脚本逻辑级验证)。依据「dev≠打包」铁律,不在真机点通前不宣称四主链无回归。

### §4 次要泄露的处置(当轮)

- **绝对构建路径泄露 → 已修 + 验证。** `build-sidecar.mjs` 新增 `sanitizeBuildPaths()`(打 tarball 前):把包内 `<REPO>`(本机 `/Users/zyongzhu/…`,CI `/Users/runner/work/…`)换成中性 `/creatoros`。落点实测 24 处全清(server.js + required-server-files.json 的 `outputFileTracingRoot`/`turbopack.root`/`appDir` + 22 个 pnpm `.bin` shim 的 NODE_PATH)。这些绝对路径在用户机上本就失效(运行时全走相对/__dirname),脱敏后 boot + 卡口仍全绿,零运行时风险。
- **客户端端点图 / UI 中文(§4)**:不动。浏览器必需(客户端要 fetch /api、渲染中文),非 IP;强收只会裂功能。
- **DB 迁移错误吐表名(§4)→ 评估后不动(判定,非遗漏)。** 三点:① RAISE 在**迁移 SQL** `backend/drizzle/0042_account_isolation_notnull.sql`——改它破 drizzle checksum/journal(存量装机迁移会挂);② stdout 那条(`db.ts:293`)即便 redact,`throw migErr` 上抛后 Node 未捕获异常照样把 `e.message` 打到 stderr——不改错误传播堵不住,而改传播=全员丢诊断;③ 触发条件苛刻(bare-boot + 存量 pre-0042 NULL 行库,**干净盗版装机根本不触发**)+ 真机走加密日志不可见 + 只露通用表名非机密。**成本(破迁移完整性 / 丢可操作诊断)> 收益。** 若真要系统性堵「bare-boot 从 stderr 读错误」,正解是**生产错误详略门**(独立任务),不是 gut 这一条迁移诊断。

---

## 附:诚实边界(本轮没做到的)

- **未从内存实拿一条解密 prompt**:lldb attach 被 macOS 授权挡(`could not pause execution`,需 sudo/开发者授权),我不提权。但这不代表 app 有防护——裸启路径无反调试;攻击者自启 `--inspect` 即可,无需 attach 授权。§2.3 的动态旁路已足以证明「prompt 运行时可得」。
- **未测 license 缓存篡改 / Rust 壳反调试**:裸启 sidecar 直接跳过整个 Rust 壳,壳里的 license/反调试/master-key 全部旁路——这本身就是结论:壳的防护对「直接跑 sidecar」的攻击者一律不生效,真正的闸口必须在 sidecar 进程内(即 §2 的 handshake)。
