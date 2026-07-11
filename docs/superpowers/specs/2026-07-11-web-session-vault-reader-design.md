# SPEC:带登录态的网页正文读取 —— Web Session Vault + Web Reader(取代截图默认路径,喂选题)

> 日期 2026-07-11 · 状态:✅ **PASS(cross-family MiniMax-M2.7,0 findings)→ 可开工 T-217a→b→c**(见 [.review.md](2026-07-11-web-session-vault-reader-design.review.md)) · 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)(T-217)。来源:用户真机诉求 —— 粘任意网页链接(含需登录内容)让编导读**正文**生成选题,现只有 headless 公开 URL 截图。

## 0. 一句话

把「读一个网页」从 **headless 截公开页首屏图**(OCR 失真、登录墙即废)升级为 **带持久化登录态、抽可读正文全文** 的能力:泛化抖音采集已有的 `launchPersistentContext + .auth/ 持久 profile + 被动探针` 成**任意域名**的登录态保管库,再给编导一个 `web.read` 工具读正文 → 落逐字稿素材 → 蒸馏 → 选题候选卡。

## 1. 问题(现状不够)

- **编导只会截图、只吃公开页**:`material.screenshot`(`chat-tools.ts:1697`)→ `captureScreenshot` 端口(`persistence-client.ts:6702`)→ `captureUrl`(`web-capture.ts`,`chromium.launch({headless:true})` `web-capture.ts:78` + `page.screenshot()` `web-capture.ts:181`)。工具描述自陈「**当前只支持公开页面——登录墙/需登录页会诚实报错**」(`chat-tools.ts:1698`)。长对话/文章只截到首屏,且**图里的人名/术语/数字 OCR 会看走眼**(用户已多次踩到)。
- **需登录内容读不到**:ChatGPT 分享链接、知乎收藏、小红书、公众号、X thread、飞书文档等,截出来是登录页或空白。
- **编导自我认知错位(行为 bug)**:真机对话里编导答「登录态这事我做不到、我能访问的只有公开互联网」——但它**跑在有 Playwright 的桌面 sidecar 里**,抖音采集正是靠 `chromium.launchPersistentContext(authDir,…)`(`douyin-cdp.ts:794`)+ 有头扫码登录(`douyin-cdp.ts:830`)+ headless 复用 `.auth/` 登录态读数据(`douyin-cdp.ts:895`)。能力在,没接给编导、也没在 prompt 里让它知道自己有。

## 2. 设计(3 切片,全部映射到现有模块,非重造)

> **复用核实(附 file:line 反证,gate 处置用)**:
> - **持久化登录态底座**:`douyin-cdp.ts:794 chromium.launchPersistentContext(authDir, …)` = 自起 Chromium + 持久 profile,**已是「按目录存登录态」的通用机制**,只是 authDir 写死抖音号。有头登录弹窗轮询 cookie 落 `.auth/`:`douyin-cdp.ts:830`。headless 被动探针查 `.auth/` cookie 不弹窗:`douyin-cdp.ts:813`。泛化 = authDir 从 `douyinAuthDirFor(accountId)`(`persistence-client.ts:981`)扩一个 `webAuthDirFor(domain)`。
> - **登录态目录跨版本持久**:T-205 已把抖音 authDir 注到稳定 `appDataDir/.auth/douyin`(lib.rs 两处 spawn 注 `CREATOROS_DOUYIN_AUTH_DIR`,node 侧 `persistence-client.ts:897` 读)。`.auth/web/` 走**同一** appDataDir 顶层,复用同一注入机制(加一个 `CREATOROS_WEB_AUTH_DIR` 或复用 `.auth` 父目录),跨版本/sidecar 重建不丢。
> - **导航 + 三墙错误分类**:`web-capture.ts` 的 `captureUrl` 已把「导航超时/DNS/net error → 打不开」「HTTP 4xx/5xx → HTTP 码」「登录墙」分成三类 `WebCaptureError`(`web-capture.ts:134`),Reader 直接复用这套分类,只换启动方式(persistentContext)+ 换输出(正文而非截图)。
> - **素材落库**:截图经 `assetsService.createGeneratedAsset`(`persistence-client.ts:3117/6709`)落字节 + 建 asset(带 sourceUrl 存证)。Reader 出的正文文本同样经 `createGeneratedAsset` 落**逐字稿/文本素材**(asset 类型走既有文本类,带 sourceUrl),前端复用素材卡渲染。
> - **蒸馏 → 选题**:编导现有 `material.gather`(`chat-tools.ts` 联网检索四类素材)+ candidate 生成链已在。Reader 拿到正文后,复用现有素材→蒸馏→候选卡链路,不新造生成器。

### 2.1 S1 · Web Session Vault(登录态保管库,泛化抖音底座)

- **登录方式**:**sidecar 自起独立 Chromium**(用户已拍板 A;不走 connectOverCDP 连用户现用 Chrome —— 记忆「douyin-collection-approach」:对用户 Chrome149 卡死)。与抖音登录态、与用户日常浏览器**完全隔离**。
- **能力 A 登录(有头)**:用户指定域名 / 粘 URL → 弹**有头** Chromium(持久 profile `.auth/web/<domain>/`)→ 用户在真浏览器里手动完成登录(账密 / 扫码 / SSO 都行,由用户自己做,系统不碰凭据)→ 用户点「我登好了」确认(或检测到该域出现会话 cookie)→ 关窗,profile 持久化。**泛化** `douyin-cdp.ts:830` 的弹窗+轮询:登录成功判定从「抖音 sessionid cookie」改为「用户显式确认 / 该域任意会话 cookie 出现」(不同站 cookie 名不同,不硬编码单一 cookie)。
- **能力 B 状态探针(headless 不弹窗)**:快查 `.auth/web/<domain>/` 是否存在有效会话(复用 `douyin-cdp.ts:813` 被动探针思路;profile 存在≠有效登录,过期同样返回「需重登」)。
- **能力 C 管理面板**:前端列出已保存站点会话(域名 + 上次登录时间 + 状态)/ 重新登录 / 移除。CRUD 契约参考 benchmark.sources 那套 transport op 写法。
- **归属**:**per-user 全局**(ChatGPT/知乎登录与抖音号无关),存 `appDataDir/.auth/web/<domain>/`,与 `.auth/douyin/<accountId>` 并列。
- **隐私红线(硬约束,与抖音登录态同规格)**:`.auth/web/` **绝不进 git**(`.gitignore` 覆盖)、cookie/session **绝不外传**任何后端/云端/第三方。纯本地持久 profile。

### 2.2 S2 · Web Reader(正文读取,取代截图默认路径)

- **读取实现**:新 `readUrl(url, { authDir })`(落 `web-capture.ts` 或新 `web-reader.ts`):`launchPersistentContext(webAuthDirFor(domain))`(而非 `chromium.launch(headless)`)→ `page.goto`(复用 `web-capture.ts` 导航超时/三墙分类)→ 等正文渲染(SPA 需 `waitForSelector` + 滚动触发懒加载/长对话全量)→ **抽可读正文文本**。
- **抽取策略(用户已拍板:通用 + ChatGPT 定制先落)**:
  - **通用兜底**:Mozilla Readability(抽任意文章正文,去导航/广告/侧栏)→ 纯文本。
  - **ChatGPT share 定制 extractor**:`chatgpt.com/share/*` 是 React SPA,按逐轮对话 DOM 结构抽 user/assistant 每一轮全文(等 `waitForSelector` 会话容器渲染完 + 滚到底加载全部轮次)。
  - 其余站点(小红书/知乎/公众号/X/飞书)**按用户实际粘的链接增量加 extractor**,不一次铺(用户已拍板;站点 DOM 常变,铺多了维护成本高)。
- **落库**:正文经 `createGeneratedAsset` 落**逐字稿文本素材**(带 sourceUrl),**不是截图**。截图工具 `material.screenshot` **保留**作「要视觉证据/存网页样子」的补充,但读内容默认走 Reader。
- **登录墙降级**:无会话 / 会话过期 → 返回**结构化提示**「该站需先在保管库登录一次(去设置→网站登录),登好我再读」——而不是截张登录页糊弄。复用 `web-capture.ts:134` 登录墙分类。

### 2.3 S3 · 编导接线 + 自我认知修正

- **加工具**:编导挂 `web.read`(读正文)+ 会话状态感知(能查/提示某域是否已登录)。工具描述诚实:读的是「你登录后能看到、你主动指定的单页正文」。
- **修 system prompt(治行为 bug)**:编导跑在桌面 sidecar、有带登录态的真实浏览器能力 —— **禁止再说「登录态我做不到、只能读公开网页」**(那是云 chatbot 话术,不是 CreatorOS 编导)。遇需登录内容 → 引导用户去保管库登录一次,而非说自己办不到。
- **闭环**:用户粘 URL → 编导优先 `web.read` → 报登录墙则引导登录 → 重读 → 正文落素材 → 蒸馏 → 生成选题候选卡(复用现有 candidate 生成链,source 走既有枚举)。

## 3. 边界(不越界)

- **只读单页、用户主动指定**:定位 = 「读你自己登录后能看到的、你**当前主动粘**的那一页」。**不做批量爬虫、不做全站抓取、不碰你无权访问的数据**(合规红线,与抖音采集同 —— 见 SPEC 2026-07-11-benchmark §3「只抓公开数据」的同源约束)。
- **不碰用户凭据**:登录全程由用户在有头浏览器里自己完成,系统只持久化登录**结果**(cookie/profile),**绝不代填账密、绝不读取/上传凭据**。
- **不连用户日常 Chrome**:自起隔离 Chromium(connectOverCDP 对用户 Chrome149 卡死,已验)。
- **抽取不硬编码全站矩阵**:通用 Readability 兜底 + 按需加定制 extractor,不预铺一堆易变的站点解析器。
- **截图工具不删**:视觉证据场景仍有价值,Reader 与 screenshot 并存(读正文默认 Reader,存样子用 screenshot)。

## 4. 切片(拆 Task,写完 SPEC 过审后落 BACKLOG)

- **T-217a Web Session Vault**:`webAuthDirFor(domain)` + 有头登录(泛化 `douyin-cdp.ts:830`)+ headless 探针(泛化 `:813`)+ `.auth/web/` 跨版本持久(复用 T-205 注入)+ CRUD 契约 + 管理面板;`.gitignore` 覆盖、cookie 不外传。
- **T-217b Web Reader**:`readUrl(url,{authDir})`(persistentContext + 复用 `web-capture.ts` 三墙分类)+ 通用 Readability 抽取 + ChatGPT share 定制 extractor + 正文落逐字稿素材(`createGeneratedAsset`)+ 登录墙结构化降级。
- **T-217c 编导接线 + prompt 修正**:挂 `web.read` + 会话状态感知工具;改 system prompt 去掉「登录态做不到」话术、加「遇登录墙引导保管库登录」;粘 URL→读正文→蒸馏→选题候选卡闭环。

## 5. 验收

- 登记某站(如 chatgpt.com)→ 有头窗口登录一次 → `.auth/web/chatgpt.com/` 持久;app 更新/重 build 后登录态不丢(跨版本,复用 T-205 验法)。
- 粘 ChatGPT share 链接 → 编导 `web.read` 抽出**逐轮对话全文**(非截图、非首屏截断)→ 落逐字稿素材(带 sourceUrl)→ 蒸馏出选题候选卡。
- 粘一个需登录且未登录的站 → 编导**不截登录页糊弄**,而是引导「去保管库登录一次」;登录后重读成功。
- 编导对话中**不再**出现「登录态我做不到、只能读公开网页」话术。
- `.auth/web/` 不进 git;cookie 无任何外传路径。三端 typecheck + 单测绿;登录/读取归 sidecar,真机验(自起隔离 Chromium,不碰用户日常 Chrome)。
