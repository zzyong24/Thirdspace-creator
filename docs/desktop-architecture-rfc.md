# CreatorOS 桌面化与资产保护技术方案(RFC)

> 状态:草案,供外部技术评审 · 日期:2026-07-05 · 作者:CreatorOS 架构组
> 评审目的:请评审本方案的架构合理性、技术选型、可行性论证与遗漏风险。文末列有针对性的评审问题。

---

## 摘要(Abstract)

CreatorOS 是一套**编导式自媒体内容生产系统**,当前形态为 Next.js 16 全栈单机应用。本 RFC 阐述将其演进为**加密桌面双端软件(Windows / macOS)+ 轻量服务端**的技术方案:客户端用 Tauri v2 打包、本地 PGlite 离线存储;服务端仅承担自动更新、Prompt 远程管理与授权校验,**不存任何用户数据**;授权复用已部署的自建激活码系统(activation-manager),并以 Ed25519 签名加固。

**核心论点(经原型验证)**:①桌面化本身工程量小——现有架构已是「本地优先、进程内、零 docker 可跑」,`next standalone` + PGlite WASM 端到端已真跑通;②真正的挑战不是打包而是**资产保护**,而客户端代码在密码学上无法真正防逆向,故防护重心应放在**核心 IP 服务端化能力 + 激活授权 + 持续迭代**,而非客户端加壳。

**范围界定**:本期**不做**中转站 / API key 归集 / 计费(用户自配各家 LLM key)。

---

## 1. 背景与目的

### 1.1 产品定位

CreatorOS 是**单机、本地优先**的内容生产工具:一机一个创作者,真实创作数据(项目、作品、发布指标、评论)全部存在用户本机,系统不做多租户 SaaS、不上传用户数据。其护城河是「越用越准」的数据飞轮——数据是用户拿不走的资产。

### 1.2 为什么要桌面化 + 资产保护

当前形态需要用户 `pnpm install` + 手动起 dev server + 依赖 docker Postgres,不具备商业分发能力。目标是产出**一键安装的 `.exe` / `.dmg`**,并解决随之而来的四个诉求:

1. **分发形态**:双端桌面软件,一键安装即用。
2. **授权控制**:一机一码激活,未授权不可用。
3. **资产保护**:核心 prompt / 算法 / 业务逻辑尽量不被轻易逆向。
4. **可维护性**:服务端可远程更新客户端、迭代 Prompt。

### 1.3 目标形态

| 层 | 职责 | 关键技术 |
|---|---|---|
| **客户端**(Tauri v2) | UI(Next.js/React)+ 本地离线数据(PGlite 落盘)+ 全部业务编排(进程内库调) | Tauri v2 · Rust · Node sidecar |
| **服务端**(轻量,零用户数据) | 自动更新分发、Prompt 远程管理、激活授权校验 | 静态签名分发 + activation-manager |
| **AI 调用** | 用户自配各家 LLM key(本期不做中转) | Vercel AI SDK + 用户 key |

---

## 2. 现状技术栈(技术调研:现状勘查)

对现有代码库的系统勘查得出以下结论(附代码锚点),这些事实直接决定了迁移路径。

### 2.1 结构与运行形态

- **Monorepo**:pnpm workspace,五子包:`frontend`(Next 16.2.9 + React 19)、`backend`(**纯库**,无 server 进程)、`ai-worker`(**纯库**,Vercel AI SDK)、`contract`(zod schema/op)、`mcp-server`(stdio MCP)。
- **前后端边界**:`POST /api/v1/dispatch`(`frontend/src/app/api/v1/dispatch/route.ts`)接收 `{id, input}` → `compositeTransport`(`persistence-client.ts`)→ **直接 `import` backend/ai-worker 模块工厂,同进程构造 service/repo**。**全程无内部 HTTP,是纯进程内库调。**
- **无外部常驻依赖**:调度用 `node-cron` 进程内轮询(非独立 daemon);对象存储默认本地落盘(`S3ObjectStorage` 仅当 `S3_BUCKET` 存在才启用);无 `child_process` 跑 AI(仅 ffmpeg 抽音频用到)。

### 2.2 数据层(关键:已支持离线本地)

`backend/src/db.ts` 的 `resolveDbDriver()` 已实现三态优先级:

1. `DATABASE_URL` → 真 Postgres(node-postgres);
2. `PGLITE_DATA_DIR` / `CREATOROS_DB_DIR` → **file-PGlite 落盘**(Postgres-WASM,纯本地零 docker);
3. runtime 无配置 → 默认落盘 `~/.creatoros/db`。

**结论**:桌面离线本地运行**不缺数据库**——PGlite 是纯 WASM Postgres,Docker 从「默认」降为「可选高级项」。这是现成能力,非改造项。

### 2.3 单机鉴权

T-046 已落地「单机免登录」:dispatch 无 session cookie 时回落「本机主用户直通」。桌面单机场景天然契合,无需多租户登录。

### 2.4 资产泄漏面(桌面打包后的真问题)

| 资产 | 现状 | 严重度 |
|---|---|---|
| **Prompt 模板** | 21 个模板(~2044 行)打进 ai-worker 包;**且设置页「技能」页签有意把内置 prompt 全文序列化下发到浏览器**(产品功能,让用户查看/定制) | 🔴 高(但见 §5.3 用户决策) |
| **API key** | `model_configurations.secret_value` **明文 DB 列**,落盘 PGlite 文件无加密 | 🔴 高 |
| **业务逻辑** | backend/ai-worker 全部 TS 源随包,无编译混淆 | 🟡 中 |

---

## 3. 目标架构(经 P1 原型验证)

```
┌─────────────────── Tauri v2 app (单窗口) ───────────────────┐
│  Rust core (main process)                                  │
│    · 管理窗口 / 托盘 / 自动更新                                │
│    · 启动时 spawn sidecar,注入 env:                          │
│        PORT=<随机空闲口>  HOSTNAME=127.0.0.1                  │
│        CREATOROS_DB_DIR=<appDataDir>/.creatoros/db          │
│    · 退出时 kill sidecar                                     │
│                                                            │
│  WebView  ──HTTP──►  Sidecar (Node: next standalone)       │
│  (指向 127.0.0.1:PORT)   server.js                          │
│                          ├─ 前端页面 (SSR/RSC)               │
│                          ├─ /api/v1/dispatch (进程内库调)     │
│                          │     └─ compositeTransport         │
│                          │          └─ backend / ai-worker   │
│                          │               (同进程 import)      │
│                          └─ PGlite (WASM) ──落盘──► appDataDir│
│                                              /.creatoros/db  │
│  外部 LLM API (MiniMax/OpenAI…) ◄──fetch── ai-worker         │
└────────────────────────────────────────────────────────────┘
```

**数据流**:用户操作 → WebView `fetch 127.0.0.1:PORT/api/v1/dispatch` → sidecar 进程内库调 → PGlite 本地读写;AI 节点经 Vercel AI SDK 出网调用户配置的 LLM。**除 LLM API 外全本地。**

---

## 4. 桌面化可行性验证(技术调研:P1 原型 spike)

我们没有停留在纸面论证,而是搭建原型对**最大的两个存疑项**做了真机验证。

### 4.1 验证环境

`cargo 1.94.1` / `rustc 1.94.1` / `cargo-tauri 2.11.2` / `node v22.22.2` / `pnpm 10.32.1` —— Rust + Tauri toolchain 就位。

### 4.2 验证一:Next standalone 产物 + PGlite WASM 打包(通过)

给 `next.config.ts` 加 `output: "standalone"` 后 `pnpm -C frontend build` **exit 0**,产出 `.next/standalone/frontend/server.js`(约 203MB)。**关键正面证据**:Next output file tracing **自动将 PGlite 的 `postgres.wasm`(8MB)+ `postgres.data`(5.4MB)trace 进 standalone 的 node_modules**,与 `index.js` 同目录——满足 PGlite 运行时 `new URL("postgres.wasm", import.meta.url)` 的加载前提。

> **技术要点**:PGlite 在运行时相对自身位置 `fs.readFile` 读取 wasm/data,这正是它必须留在 `serverExternalPackages`(不被 bundler 内联)、也因此能被正确 trace 的原因。

### 4.3 验证二:端到端全链路(通过)

用 `node server.js` 启动 standalone server(注入 `PORT` + `CREATOROS_DB_DIR`),实测:

- `GET /` → **HTTP 200**,返回 75KB 真实 HTML;
- `POST /api/v1/dispatch {projects.list}` → **HTTP 200**,合法契约 envelope `{"data":[],"meta":{"total":0}}`;
- PGlite 在指定目录**真落盘建立完整 Postgres 数据目录(30MB,migrator 跑完)**。

### 4.4 唯一踩坑(已定位并修复验证)

首轮 `GET /` 返回 500:`Can't find meta/_journal.json`。根因:`db.ts` 用相对路径定位 drizzle 迁移目录,而迁移是 **non-JS 数据文件**(`meta/_journal.json` + `*.sql`),Next output tracing 只 trace `import` 的 JS,不带这些。**修复**:`next.config.ts` 加 `outputFileTracingIncludes` 显式 include `../backend/drizzle/**/*`。重 build 后全链路复测 200 + PGlite 落盘成功。

### 4.5 集成方案选型:Tauri sidecar(方案 B)

- **方案 A(静态前端 + Rust 重写后端)不可行**:CreatorOS 是 Next.js 全栈(有 `/api` route + 进程内 backend),方案 A 要重写整个 `/api` 层与 backend。
- **方案 B(Tauri webview 指向 sidecar 跑的 next standalone `server.js`)是唯一合理路线**:全栈本就是一个自包含 Node 进程,恰好落进 Tauri sidecar 能力范围。

### 4.6 可行性结论

**有条件可行,条件已验通,无重大障碍。** 唯一中等风险未验项是 **sidecar 二进制化**(见 §8)。正式迁移工作量约 **3-5 个切片**。

---

## 5. 保护策略(技术调研:威胁模型与诚实边界)

### 5.1 诚实前提:客户端代码无法真正防逆向

这是本方案最重要的立场,也是与「深度加密防逆向」营销话术的分野:

- 任何桌面软件(Electron / Tauri 皆同),前端是 JS/HTML,可解包;
- 代码混淆只挡「业余一键 patch」,挡不住系统性逆向;
- Rust binary 可被 Ghidra / IDA 在数小时内反编译;
- 白盒加密(WBC)学术界共识**已全部被破**,商业价值是 traceability 而非密钥不泄露;
- `VMProtect` / `Themida` 在 macOS 支持弱,ROI 仅对金融级软件为正。

**结论:挡得住业余破解者与篡改重打包,挡不住认真的攻击者。** 这不是本项目的缺陷,是整个客户端软件行业的现实。

### 5.2 真正有效的策略:让「逆向了也没用」

保护重心不应是「加密客户端」,而应是「什么值得保护 + 怎么让拿到客户端也没价值」。CreatorOS 真正的 IP 只有三样:①Prompt / skill 编排 ②审核 rubric / 校准算法 ③采集逻辑。三条真护城河(优先级最高):

1. **激活授权**(§6):代码逆向了,无有效激活码照样不可用——商业层面控制,不依赖代码不可读。
2. **持续快速迭代**:逆向的永远是旧版本。
3. **数据飞轮在用户本机**:逆向代码拿不到别人的真实创作数据资产。

### 5.3 产品取舍(已决策)

- **核心 IP 归属 = 客户端自含**(接受可逆向):核心 prompt / 编排 / rubric 也在客户端、可离线跑,以换取「离线可用 + 用户可定制 prompt」的产品形态。这是明知可被逆向后的理性取舍——不为无法真正实现的目标牺牲产品体验。
- **Prompt = 保留用户定制**(暴露):设置页「技能」页签继续让用户查看 / 修改 prompt;P3(Prompt 远程管理)降级为「只做远程更新迭代,不做防泄漏」。

### 5.4 客户端加固:只做高 ROI

| 做(高 ROI) | 不做(ROI 负) |
|---|---|
| 代码签名 + 公证(macOS notarize/staple + Win Authenticode)——防篡改重打包 | 重度 anti-Frida(永远晚一步) |
| 关键逻辑 Rust 化(比 JS 难逆) | 商业 WBC(已被破) |
| 适度 JS 混淆(挡一键 patch) | VMProtect / Themida on macOS |
| Tauri CSP + capability deny-all | bytenode 全编(Electron 已知 SIGTRAP) |

---

## 6. 授权与防盗版(P5:复用 activation-manager)

### 6.1 现状:自建激活系统已上线

一套自建的一机一码授权系统 **activation-manager** 已部署上线(`license.aitongban.cloud`):

- 技术栈:Next.js 14 + Prisma + SQLite,单容器 Docker,自带 Web 管理后台;
- 两种授权模型:`TIME`(时间型 / 订阅)、`COUNT`(次数型 / 按量);
- 多项目:每接入方一个 `projectKey`;`@@unique([projectId, usedBy])` 保证一机一码;
- 并发安全(原子条件更新 + `requestId` 幂等)、激活码 64 位熵强随机、后台 bcrypt + 登录限流。安全审查已过。
- 内置 JS/TS SDK(`license-sdk.ts`,`createLicenseClient`),客户端可直接复用。

### 6.2 接入方式

后台建 `projectKey`(如 `creatoros-desktop`)→ 生成激活码 → 客户端调三个公开接口:

- `POST /api/license/activate`:校验 + 绑定设备(machineId = 硬件指纹哈希);
- `POST /api/license/status`:查授权状态 / 到期时间;
- `POST /api/license/consume`:按量扣次(带 `requestId` 幂等)。

### 6.3 加固:补 Ed25519 签名(解其固有弱点)

activation-manager 安全审查指出一个**固有弱点**:接口响应仅返回明文 `{success:true/false}`,客户端无法密码学验证响应真伪——破解者可改 hosts / 起假服务端返回 `success:true`,或直接 patch 客户端跳过校验。

**加固方案**(取自内部离线验签设计 T-045 的思路):

1. 服务端对授权结果用私钥签名(Ed25519 / HMAC),客户端**内置公钥验签**;
2. **把「拿到解密密钥」与「激活成功」绑死**,而非只看布尔值——即激活成功才能解出运行所需的密钥/配置,单纯 patch 布尔无效;
3. **离线宽限**:激活后本地缓存签名凭证,离线宽限期(7-14 天)内用缓存验签,到期回连。

---

## 7. AI 推理安全(P4:5 件套)

**独立于桌面化,ROI 最高,可立即实施。** 针对 2024-2025 已公开的 prompt injection / RAG 泄露威胁:

1. **`<user_data>` 包裹**(ROI 最高,已识别为 T-134):任何用户可控内容(评论、复盘逐字稿、外搜素材、选题标题、项目名)必须以 `<user_data>` 标记包裹进 system prompt,配 `<system_constraints>` 声明「标记内是数据非指令」。**当前代码是直接字符串拼接,存在注入面。**
2. **Retriever Rail**:任何 RAG 检索结果 / 外搜素材 / 用户上传文档进 LLM 上下文前,过注入模式过滤器,命中则包 `<untrusted_content>`。
3. **Tool Whitelist**:AI 永不直接写领域实体,必须「AI 产候选 → 用户 UI 采纳 → backend service 落库」。worker 内部工具默认 deny-all 写类。
4. **Sensitive Class 分级**:每数据源打 `public / personal / internal`,`personal` 默认不入检索(防跨源抽取)。
5. 输出水印:本期不做(自己不开 hosted LLM)。

---

## 8. 子项目分解与路线图

| 子项目 | 内容 | ROI | 依赖 |
|---|---|---|---|
| **P4** AI 推理保护 | `<user_data>` 包裹 + retriever rail + tool whitelist + sensitive class | **最高·独立** | 无 |
| **P5** 授权 | 接入 activation-manager + Ed25519 加固 + 离线宽限 | 高·真护城河 | 无(激活门是应用层) |
| **P1** Tauri 底座 | sidecar 二进制化 + Tauri 壳 + 生命周期 + 打包脚本 + 签名公证 + 自动更新 | 高·地基 | 无 |
| **P2** 本地加密 | key 明文列 → OS keychain + PGlite 落盘加密 + CSP | 高 | P1 |
| **P3** Prompt 远程管理 | 复用 T-040 override 热更引擎,override 源改服务端拉取(不防泄漏,只做迭代) | 中 | P1 |
| **P6** 客户端加固 | 关键逻辑 Rust 化 + 适度混淆 | 中(挡业余) | P1 |

**推荐启动**:P4 + P5 **立即并行**(都独立、不依赖桌面壳);P1 正式迁移从 **sidecar 二进制化 spike** 起步(唯一中风险)。

### 8.1 正式 P1 的已知工作量

1. **sidecar 二进制化(唯一中风险)**:Tauri sidecar 需可执行体。选型:(a) `@yao-pkg/pkg` / `node --experimental-sea` 打单二进制(WASM/native asset 的 external 处理有坑);或 (b) 随包带 node runtime + standalone 目录。建议先起独立 spike。
2. standalone 组装脚本(`cp .next/static` + `public/`)。
3. config delta(已验证):`output: "standalone"` + `outputFileTracingIncludes` 带 drizzle。
4. Rust 侧 sidecar 生命周期(空闲端口、env 注入、就绪探测、退出清理)。
5. 跨平台:PGlite 纯 WASM 无原生编译问题;但 node runtime / sidecar 二进制需按 target triple 分打(mac arm64/x64、win x64)。

---

## 9. 技术选型依据

| 决策 | 选择 | 依据 |
|---|---|---|
| 桌面框架 | **Tauri v2** | 体积小、Rust 侧原生加密能力、CSP + capability deny-all 安全模型强于 Electron、macOS 支持好 |
| 集成方式 | **sidecar 跑 next standalone** | 全栈是自包含 Node 进程;静态前端 + Rust 重写后端需重写整个 `/api` + backend,不可行 |
| 本地数据库 | **PGlite 落盘** | 已是现成能力(`resolveDbDriver`);纯 WASM 零 docker 零原生编译,跨平台一致 |
| 授权 | **复用 activation-manager + Ed25519** | 已部署上线、一机一码、有管理后台;Ed25519 补其响应未签名弱点 |
| 中转站 | **本期不做** | 用户自配各家 LLM key,重心转为本地加密存储 |

---

## 10. 风险与开放问题

- **[中风险] sidecar 二进制化**:唯一未验项,正式 P1 首个 spike。
- **[待验] pdf-parse / pdfjs 的生产 bundling**:某内容功能用到,`next build` 下 externalize 行为未验。
- **[已接受] Prompt 暴露**:用户决策保留定制,核心 prompt 可被逆向拿走——以「持续迭代 + 激活授权」对冲。
- **[固有] 防逆向边界**:客户端加固挡不住专业逆向,已在 §5.1 明确;不投入军备竞赛。
- **[待定] node 版本对齐**:engines 要 node≥24/25,sidecar 打包 runtime 需取该版本。
- **[性能待验] PGlite 单进程独占落盘**:大数据量下的并发表现建议原型压测。

---

## 11. 请评审回答的问题

1. **架构合理性**:Tauri sidecar 跑 next standalone 的方案,是否有比「随包带 node runtime」更优的 sidecar 二进制化路径?业界是否有 Next.js 全栈 + Tauri 的成熟先例可参照?
2. **保护策略**:「客户端自含 + 高 ROI 加固 + 真护城河靠激活/迭代/数据」的取舍是否成立?有无被我们低估的、性价比更高的 IP 保护手段?
3. **激活加固**:Ed25519 签名 + 解密密钥与激活绑死,能在多大程度上抬高「patch 跳过校验」的门槛?是否值得投入,还是仍属军备竞赛?
4. **遗漏**:本方案是否遗漏了桌面软件在**自动更新安全**(更新包签名验证、降级攻击)、**数据本地加密**(keychain vs 整目录加密)方面的关键考量?
5. **优先级**:P4(AI 安全)+ P5(激活)先行、P1(打包)随后的路线是否合理?

---

*附:本 RFC 基于对现有代码库的系统勘查 + Tauri 原型 spike 的真机验证撰写。原型验证的 `next.config.ts` config delta 与端到端测试证据可供复核。*
