# SPEC — 桌面端客户端加固(T-147 P6):混淆 + updater 签名 + 签名/公证占位,全脚本化

> 状态:**待过 spec-review gate**(改构建/分发架构,铁律)· 2026-07-06 · 关联 T-147 总纲 §3 P6 / §5.5 [D5] · 前置 P1(Tauri 壳+sidecar 已建)/ P2(keychain 加密)/ P5(激活)/ T-163(AI 逻辑已下沉 backend/ai-runtime)
> 一句话:把「防篡改重打包 + 抬业余逆向门槛」的高 ROI 加固**沉淀成 `desktop:package` 流水线里的自动化步骤**——整 sidecar bundle JS 混淆 + updater 签名(minisign,不需 Apple 证书)+ 代码签名/公证占位(拿到证书填 env 即启用),改代码后零手动重做。

## 1. 背景与现状(勘查坐实)

- **P1 已建**:`frontend/scripts/desktop/{build-sidecar,package,master-key,activation}.mjs` + `desktop:*` npm scripts + `src-tauri/`(Cargo.toml / lib.rs / main.rs / tauri.conf.json / capabilities / sidecar binary / icons)。sidecar = Rust 壳 spawn 打包好的 node 跑 Next standalone server,TCP ready-probe 后 WebView 连 127.0.0.1:PORT。
- **P2 已建**:`secret-crypto`(AES-256-GCM)+ Rust keyring master key(OS keychain),模型 key 落库透明加解密。
- **P5 已建**:activation-service 状态机 + `(creator)/layout` 激活门 + activation-config。
- **T-163 已完成**:全部 AI 生成逻辑 + prompt 模板 + 模型 key 用点集中到 `backend/src/modules/ai-runtime`,前端只留 useChat + UIMessage 类型。**敏感资产面已收窄且集中**。
- **参考项目 SkillsManager**(用户指定,`~/Workbase/skills-manager`)真实加固姿态勘查:① Tauri updater 用 **minisign/Ed25519 pubkey**(`updater.pubkey` + GitHub endpoints)签**更新包** ② 关键逻辑走 Rust CLI ③ **不做 JS 混淆**(package-lock obfuscat=0)④ **无 Apple 代码签名**(bundle.macOS 仅 minimumSystemVersion,无 signingIdentity)——**与本项目「无 Apple 证书」现实一致**。
- **用户裁决(2026-07-06,brainstorming)**:P6 重心 = 高 ROI 套件 **+ 加 JS 混淆**;混淆范围 = **整个 sidecar bundle**(非仅敏感面);**不做**业务逻辑 Rust 化(§5.5 [D5] 未选,工程量大且 AI 逻辑在 Node sidecar 不好搬——靠现有 Rust 壳 + P2 keychain)。

## 2. 目标

- P6 三件事全部**沉淀成 `desktop:package` / `desktop:release` 流水线的自动化步骤**(用户铁律:业务代码常改,加固不能每次手动重做)。
- 敏感资产(prompt/rubric/编排/key 用点,已在 backend/ai-runtime)+ 全 sidecar first-party JS 经混淆,抬业余逆向门槛。
- 更新包签名(minisign),挡篡改更新包注入——**不需 Apple 证书**。
- Apple 代码签名 + 公证留**可插入占位**:未配证书 skip 不崩,拿到证书填 env 零改码启用。
- **诚实边界写进 SPEC**:此套挡篡改重打包 + 业余一键 patch + 抬门槛,**挡不住专业逆向**(§5.5 已认)。真护城河仍是激活授权(P5)+ 快速迭代 + 数据飞轮在本机(宪法 §7)。

## 3. 设计

### 3.1 JS 混淆(整 sidecar bundle)—— `scripts/desktop/obfuscate.mjs`
- **落点**:流水线 build-sidecar 之后、tauri build 之前跑,原地混淆 sidecar 目录(`src-tauri/sidecar/frontend/**` 及打进去的 `@creatoros/*` / ai-worker)里的 first-party JS。
- **引擎**:`javascript-obfuscator`(devDependency)。
- **强度 = medium-conservative**(必须,否则 Node sidecar 启动崩):`renameGlobals:false`、`stringArray:true` + `stringArrayEncoding:['base64']`、`controlFlowFlattening:true`(threshold≤0.5)、`deadCodeInjection:false`、**`selfDefending:false`、`debugProtection:false`、`disableConsoleOutput:false`**(self-defending/debug-protection 在 Node 下会误伤/崩)。identifierNamesGenerator=hexadecimal。
- **混淆范围 = 可执行边界(gate 关切① 处置:按 sidecar 真实物理结构校准,不用做不到的切分)**。勘查坐实:Next/Turbopack 已把 first-party 应用代码(原 monorepo `@creatoros/*` 包 + app + traced 的 backend/ai-runtime 逻辑)**编译内联进 `frontend/.next/server/**/*.js`(~301 个)+ `.next/server/chunks/**`**,**无独立 `@creatoros/*` 目录**。故「只混淆 @creatoros、排除 Next chunk」靠路径**无法机械执行**——删掉此不可实现的中间态,改**方案 A(取,ROI 稳)**:
  - **混淆对象** = `.next/server/**/*.js` + `.next/server/chunks/**/*.js` 里**全部** .js(接受 first-party 逻辑与 Next SSR chunk 混在一起一起混——真资产 prompt/rubric/编排就在这批 chunk 里)。
  - **硬排除**(provably 碰坏,必须跳过并 log 原因):
    1. `**/server.js` 入口 —— 头部硬依赖 `__dirname`/`process.chdir(__dirname)`/`require('next')` 字符串 require,混淆必崩(已 dump 证实)。
    2. `node_modules/**` 全部第三方(含 `serverExternalPackages` 被 external 化的 `@electric-sql/pglite`/`pg`/`ai`/`@ai-sdk/*` 等,以 `require()` 动态从 node_modules 加载)。
    3. `**/*.wasm`(pglite `postgres.wasm`)、`**/*.node`(`fsevents`/`sharp`/`onnxruntime` native 绑定)。
  - **🔴 symlink 逃逸防护(gate 关切② 处置,P1 独有碰坏/污染面)**:build-sidecar.mjs 用 `verbatimSymlinks:true` **保留 pnpm 相对 symlink**(`node_modules/next → .pnpm/…`,脚本 146-152 明确不物化)。混淆脚本遍历时必须 **`lstatSync` 判 symlink,只对 real regular file 写入,绝不跟随 symlink**——否则会沿 symlink 污染 `.pnpm` store 里的真实第三方包(把「排除 node_modules」从 symlink 后门破掉)。判据:目标是 symlink、或 realpath 落在任何 `node_modules`/`.pnpm` 下 → 跳过。
  - **动态 require 字符串保护(gate 关切③)**:混淆器 **`stringArray` 不得编码 `require`/`import` 的字面路径参数**(`stringArrayThreshold` 调低 + `reservedStrings` 保 `/^(next|@creatoros|\.\/|\.\.\/)/` 类模块字面量);对仍含 `require('next…')`/`__dirname`/`require.resolve` 的文件**降级(仅 rename,不 stringArray/controlFlow)或排除**。
- **诚实口径(不夸大覆盖)**:混淆覆盖 `.next/server` chunk 里的 first-party 编排/prompt/rubric;**`ai`/`@ai-sdk/*`(AI SDK 本体)因 `serverExternalPackages` 留 node_modules 明文、不被混淆覆盖**——但核心编排/rubric 已在 chunk 里(T-163 下沉的成果),SDK 本体是通用库无自有资产,可接受。脚本 log「混淆 N 个 .js / 排除 M 个(逐类原因)」,不假装混了全部。
- **幂等 + 可重跑**:对已混淆文件跳过(sidecar 目录每次 build-sidecar 重建 → 天然从干净源混淆);流水线每次 package 自动跑,改业务代码无需手动。
- **验收闸 = boot + 运行时冒烟(gate 关切④ 处置:ready-probe 只证 boot,不证运行时)**:混淆后 ①**真起 sidecar**(复用 P1 TCP ready-probe:spawn node server → 探 PORT ready);②**运行时冒烟**:`GET /`(200)+ 至少打一条经 `backend/modules/ai-runtime` 的路由(命中 chunk 里 first-party 逻辑,证混淆没让运行时动态 require 崩)——沿用 P1 已有的 `dispatch 200` 冒烟先例。任一不过 → fail + 报哪个文件 + 回滚。**不 ready / 冒烟不过不算成功**([[dev-server-restart-for-server-code]]:声称修好前必真起验证)。

### 3.2 Updater 签名(minisign/Ed25519)—— `scripts/desktop/updater-keygen.mjs` + `release.mjs`
- **keygen**:`updater-keygen.mjs` 生成 minisign keypair(用 tauri 的 `tauri signer generate` 或 minisign)。**私钥**进 OS keychain(复用 P2 keyring 通道)或 env `TAURI_SIGNING_PRIVATE_KEY`(绝不入 git);**公钥**写 `tauri.conf.json` 的 `plugins.updater.pubkey`。
- **updater 配置(从零新增,非"预留"——gate 关切⑤a)**:现状 `tauri.conf.json` 的 `plugins:{}` 为空。需**新增** `plugins.updater.{pubkey,endpoints}` + `bundle.createUpdaterArtifacts:true`(SkillsManager 实证同款)+ Cargo 加 `tauri-plugin-updater` 依赖 + lib.rs 注册插件。`endpoints` 默认 GitHub-releases 式 `latest.json`,**可配**(P5 最终定 R2/CDN)。
- **release**:`release.mjs` = tauri build →(tauri 自动用私钥签更新包产 `.sig`)→ 生成/更新 `latest.json`(version + 签名 + url)。
- **验收**:内置公钥对签名 verify 通过(单测 fake 一个更新包 + 签 + 验);私钥缺失时 release 报清楚(不产未签更新包)。
- **划界**:更新**分发通道**(R2/CDN vs GitHub)是 P5「更新分发」的最终决策;P6 只把签名 + latest.json 生成脚本化,endpoint 留可配默认。

### 3.3 代码签名 / 公证占位 —— `scripts/desktop/codesign.mjs` + `notarize.mjs`
- **codesign.mjs**:读 env `APPLE_SIGNING_IDENTITY`(+ Windows `WINDOWS_CERTIFICATE_*`)。**未配 → skip + 打印**「未配代码签名证书,跳过;拿到证书后 export APPLE_SIGNING_IDENTITY 即启用(零改码)」。配了 → 调 `codesign`(mac)/ signtool(win)对 .app/.exe 签。
- **notarize.mjs**:读 env `APPLE_ID`/`APPLE_TEAM_ID`/`APPLE_APP_PASSWORD`。未配 → skip + 引导;配了 → `xcrun notarytool submit` + staple。
- **skip 防误判(gate 关切⑥)**:codesign/notarize skip 时,在 release manifest / 产物旁写 `signed:false`(对齐 §3.2 updater 「不产未签但被误当已签」的同类声明)——防未签 .app 被下游/自动更新链误当已签分发。
- **tauri.conf.json(新增,非"预留"——gate 关切⑤b)**:现状 `bundle.macOS` 无 `signingIdentity`、`bundle.windows:{}`。需**新增** `bundle.macOS.signingIdentity`(读 env,未配为 null=不签)+ Windows 证书字段。
- **原则**:占位 = **未配零副作用(且如实标 `signed:false`)、配了零改码**。你拿到证书只填 env,不动脚本。

### 3.4 流水线整合(沉淀自动化,用户铁律)
- `desktop:package` 串成:`build-sidecar` → **`obfuscate`** → `tauri build` → **`codesign`(占位)** → **`notarize`(占位)** → 产物 .app/.dmg/.exe。
- `desktop:release` = `desktop:package` + **updater 签名 + 产 latest.json**。
- 每步是独立 `.mjs`(可单跑、可 CI 串),失败 fail-fast + 清晰报错。**改业务代码 → 重跑一条命令 = 全加固自动重做**。

## 4. 不做(YAGNI / 划界,§5.5 [D5])
- **业务逻辑 Rust 化**(用户未选;AI 逻辑在 Node sidecar 不好搬;现有 Rust 壳 + P2 keychain 已护敏感 key/激活)。
- **重度 anti-tamper**:anti-Frida / 白盒加密(WBC)/ VMProtect / bytenode 全量字节码编译(§5.5 [D5] 明确排除,ROI 负、碰坏面大)。
- **Next 自身 runtime chunk 的激进混淆**(默认排除;碰坏风险高,后续可实验性放开,不在本 SPEC 承诺)。
- **更新分发通道最终选型**(R2/CDN vs GitHub)= P5 事,P6 只留可配默认。

## 5. 测试与验收
- **混淆**:obfuscate.mjs 单测(排除规则命中 node_modules/wasm/node/server.js;**symlink 逃逸**:注一个指向 fake `.pnpm` 的 symlink,断言脚本 lstat 判定后跳过、不写);**集成**:混淆后 spawn sidecar → ① TCP ready-probe 过(boot)+ ② **运行时冒烟** `GET /`(200)+ 一条经 ai-runtime 的路由不崩(gate 关切④,真起,任一不过不算过)。
- **updater 签名**:keygen 产 keypair → 签一个 fake 更新包 → 内置公钥 verify 通过;私钥缺失 → release fail-fast。
- **占位脚本**:env 未配 → codesign/notarize skip + 退 0(不崩)+ **标 `signed:false`**(gate 关切⑥);env 配了(mock) → 调对应命令。
- **端到端**:`desktop:package` 真机跑产可运行 .app(**真机=用户跑**,SPEC 只保证脚本逻辑 + 单测/集成绿;实时打包产物只能真机验)。
- **诚实边界**:验收不宣称「防逆向」——只宣称「防篡改重打包 + 抬业余门槛 + 签名更新链」;混淆覆盖不含 external 化的 AI SDK 本体(§3.1 诚实口径)。

## 6. Gate
**改构建/分发架构 → 必须过 spec-review gate(verdict≠FAIL)才准开工**(reviewer=orchestrator `prompts/spec-reviewer.md`,预设 MiniMax)。

**首审(2026-07-06)= CONCERNS**(独立子代理对抗式审,现状逐条 grep 核实)。合定位、合总纲、诚实边界优秀、updater/占位设计健全;但 §3.1 混淆范围界定与 sidecar 物理现实脱节 + 漏碰坏面。**本版逐条处置**:
- **① 混淆范围不可执行**(Next 已内联 first-party 进 `.next/server/*.js`,「只混 @creatoros」做不到)→ **✅ 改**:§3.1 换成方案 A(混淆 `.next/server/**` + chunks 全部 .js,硬排除 server.js 入口 + node_modules + wasm/native)。
- **② symlink 逃逸污染**(P1 `verbatimSymlinks` 保留 pnpm symlink,原地混淆会沿 symlink 污染 `.pnpm` store)→ **✅ 补**:§3.1 加 lstat 判 symlink、只写 real first-party file、绝不跟随 symlink 防护。
- **③ 动态 require 字符串碰坏**(`require('next')`/`__dirname`/`require.resolve`)→ **✅ 补**:§3.1 排 server.js + stringArray 不编码模块字面量 + 含动态 require 文件降级/排除。
- **④ ready-probe 只证 boot 不证运行时** → **✅ 补**:§3.1/§5 验收加运行时冒烟(`GET /` 200 + 一条 ai-runtime 路由)。
- **⑤ updater/签名字段是"新增"非"预留"**(现 `plugins:{}`、`bundle.macOS` 无 signingIdentity)→ **✅ 修**:§3.2/§3.3 显式列为新增步(含 Cargo tauri-plugin-updater + lib.rs 注册)。
- **⑥ codesign skip 防误判** → **✅ 补**:§3.3/§5 skip 时标 `signed:false`。
- 非阻塞记录:`ai`/`@ai-sdk` 因 `serverExternalPackages` 留 node_modules 明文、混淆不覆盖 → **✅ 已在 §3.1 诚实口径 + §5 点破**。

**下一步**:本改版**重过 gate**;≠FAIL 后按 §3 一次 0→1 做完 T-164(不分阶段)。

**下一步**:本 SPEC → 拆 Task 进 BACKLOG(每切片一条,引用本 SPEC)→ 过 gate(≠FAIL)→ 从看板开工。
