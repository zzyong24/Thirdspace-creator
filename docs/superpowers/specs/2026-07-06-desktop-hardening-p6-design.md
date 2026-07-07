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
- **安全排除**(⚠️ 整 bundle 混淆的核心风险,provably 碰坏必须排除并 log):
  - `node_modules/**` 第三方(drizzle-orm/pg/@aws-sdk/pglite 等含动态 require、字符串键 require、原生绑定)——**不混淆**(混淆第三方是已知反模式)。
  - `**/*.wasm`(pglite WASM)、`**/*.node`(native 绑定)——二进制,跳过。
  - Next standalone 运行时靠**固定 chunk 名/动态 require** 的文件(`.next/server` 里 Next 自身产物):`server.js` 入口 + Next runtime chunk 走**白名单谨慎**——先只混淆 `@creatoros/*` traced 输出 + app 自写 server 代码,Next 自身 chunk 默认排除(可后续实验放开)。
  - **「整 bundle」的诚实口径**:实际 = 所有**可安全混淆**的 first-party JS;碰坏面(WASM/native/Next 动态)排除,脚本 log 出「混淆 N 个文件 / 排除 M 个(原因)」——不假装混了全部。
- **幂等 + 可重跑**:对已混淆文件跳过(标记或对 source 做);流水线每次 package 自动跑,改代码无需手动。
- **验收闸(内置脚本尾)**:混淆后**真起 sidecar**(复用 P1 TCP ready-probe:spawn node server → 探 PORT ready → 命中即通过、超时即 fail 并回滚/报哪个文件)。**不 ready 不算成功**(dev-server-restart-for-server-code memo:声称修好前必真起验证)。

### 3.2 Updater 签名(minisign/Ed25519)—— `scripts/desktop/updater-keygen.mjs` + `release.mjs`
- **keygen**:`updater-keygen.mjs` 生成 minisign keypair(用 tauri 的 `tauri signer generate` 或 minisign)。**私钥**进 OS keychain(复用 P2 keyring 通道)或 env `TAURI_SIGNING_PRIVATE_KEY`(绝不入 git);**公钥**写 `tauri.conf.json` 的 `plugins.updater.pubkey`。
- **updater 配置**:tauri updater plugin 开启;`endpoints` 默认 GitHub-releases 式 `latest.json`,**可配**(P5 最终定 R2/CDN)。
- **release**:`release.mjs` = tauri build →(tauri 自动用私钥签更新包产 `.sig`)→ 生成/更新 `latest.json`(version + 签名 + url)。
- **验收**:内置公钥对签名 verify 通过(单测 fake 一个更新包 + 签 + 验);私钥缺失时 release 报清楚(不产未签更新包)。
- **划界**:更新**分发通道**(R2/CDN vs GitHub)是 P5「更新分发」的最终决策;P6 只把签名 + latest.json 生成脚本化,endpoint 留可配默认。

### 3.3 代码签名 / 公证占位 —— `scripts/desktop/codesign.mjs` + `notarize.mjs`
- **codesign.mjs**:读 env `APPLE_SIGNING_IDENTITY`(+ Windows `WINDOWS_CERTIFICATE_*`)。**未配 → skip + 打印**「未配代码签名证书,跳过;拿到证书后 export APPLE_SIGNING_IDENTITY 即启用(零改码)」。配了 → 调 `codesign`(mac)/ signtool(win)对 .app/.exe 签。
- **notarize.mjs**:读 env `APPLE_ID`/`APPLE_TEAM_ID`/`APPLE_APP_PASSWORD`。未配 → skip + 引导;配了 → `xcrun notarytool submit` + staple。
- **tauri.conf.json**:bundle.macOS 预留 `signingIdentity`(读 env)、bundle.windows 预留证书占位。
- **原则**:占位 = **未配零副作用、配了零改码**。你拿到证书只填 env,不动脚本。

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
- **混淆**:obfuscate.mjs 单测(排除规则命中 node_modules/wasm/node);**集成**:混淆后 spawn sidecar → TCP ready-probe 过(真起,不 ready 不算过)。
- **updater 签名**:keygen 产 keypair → 签一个 fake 更新包 → 内置公钥 verify 通过;私钥缺失 → release fail-fast。
- **占位脚本**:env 未配 → codesign/notarize skip + 退 0(不崩);env 配了(mock) → 调对应命令。
- **端到端**:`desktop:package` 真机跑产可运行 .app(**真机=用户跑**,SPEC 只保证脚本逻辑 + 单测/集成绿;实时打包产物只能真机验)。
- **诚实边界**:验收不宣称「防逆向」——只宣称「防篡改重打包 + 抬业余门槛 + 签名更新链」。

## 6. Gate
**改构建/分发架构 → 必须过 spec-review gate(verdict≠FAIL)才准开工**(reviewer=orchestrator `prompts/spec-reviewer.md`,预设 MiniMax)。gate 关注点预判:① 整 bundle 混淆的碰坏风险是否被排除规则+ready-probe 充分兜住 ② updater 签名与 P5 分发的边界是否清 ③ 占位脚本「未配零副作用」是否真无副作用 ④ 诚实边界是否夸大防护。

**下一步**:本 SPEC → 拆 Task 进 BACKLOG(每切片一条,引用本 SPEC)→ 过 gate(≠FAIL)→ 从看板开工。
