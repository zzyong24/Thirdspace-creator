# SPEC:Skill 驱动的编导智能体 —— 品味对齐飞轮 + 服务端接管

> 日期 2026-07-10 · 状态:待过 spec-review gate(改方向/架构)· 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md);本文件是设计单一真值,执行不在此。
> 本 SPEC 承接本会话对"提示词/知识库/数据链路"的三轮深挖(证据带行号锚点,便于下次加载)。

## 0. 一句话定位

编导智能体的护城河**不是"Agent"也不是"Skill 模板"本身**(竞品可抄),而是**一个随时间越来越懂"这个创作者"的品味对齐飞轮**:用创作者自己的赢家作品 + 改稿行为 + 观众真实反应,持续进化出他**独有的 Skill/记忆**,让 Agent 写出"这个创作者最好状态的自己"。**通用提示词 = 通用内容 = 空有其表**,这是本设计要根除的失败模式。

**核心分歧已拍板**:以**飞轮为主轴**(系统从用户行为/发布/改稿里自动学),用户自定义 Skill 作**加速器**而非主体——因为多数用户不会认真配 Skill,但每个人都会改稿、都会发视频。

## 1. 架构分层(飞轮为主轴)

```
┌── L1 飞轮核心(最高优先)──────────────────────────────┐
│  赢家作品接真 → 创作 → 用户改稿(delta 捕捉)           │
│    → 复盘/learnings 进化 → 注入下一次创作(越来越像你)  │
└────────────────────────────────────────────────────────┘
┌── L2 Skill / 记忆机制 ──────────────────────────────────┐
│  官方基座 ⊕ 用户自定义(访谈式) ⊕ 自动进化 = 独有 Skill │
│  每节点"读哪些源/多少/权重/要不要先问用户"由 Skill 声明  │
└────────────────────────────────────────────────────────┘
┌── L3 策展护栏(防飞轮被噪声污染)────────────────────────┐
│  相关性检索注入(非全塞) + 渐进式 + scope 感知 + token 预算 │
└────────────────────────────────────────────────────────┘
┌── L4 服务端接管 ────────────────────────────────────────┐
│  激活 + 软件更新 + Skill 下发 + 使用感知,收敛到自有服务器 │
│  签名静态文件,无需 CDN                                   │
└────────────────────────────────────────────────────────┘
┌── L5 地基(燃油与管路,不修飞轮转不起来)────────────────┐
│  增量采集(作品+评论) + 评论退避死循环修复 + 激活重装占码修复 │
└────────────────────────────────────────────────────────┘
```

---

## 2. 现状证据(本会话三轮子代理深挖,带行号)

### 2.1 提示词系统 = 三位一体 skill(已建,可复用)
- `PromptTemplate` = system(角色+方法论)⊕ tools(工具白名单)⊕ outputSchema(Zod):`ai-worker/src/prompt/template.ts:27-51`。
- 模板外置在 `ai-worker/src/prompt/templates/*.ts`(约 22 个),`registry.ts:63-94` 内置清单。**换方法论=换模板,不动 runner**。
- `runStructuredNode`(`ai-worker/src/nodes/structured-node.ts:90-146`):装配 facets → `bindPrompt` → `generateObject`(绑 Zod schema,校验失败重试,90s 超时)→ 文本兜底仍用同一 schema。**model⊥template⊥facets 三者正交**。
- 三条 override 通道:代码内 / DB `skill_config_overrides`(JSON Schema 形式)/ 远程签名 bundle。**用户改过的 skill 官方远程不覆盖(D1 锁)**:`skill-config-overrides.ts:144-159`。

### 2.2 上下文注入 = 组合根硬接线(要改成 skill 声明式)
- 装配层 `creative-context.ts:assembleCreativeContext`(:345-586)从各模块 public service 只读拼 facets。
- **判断"某数据进没进模型"的两道闸**:(a) 组合根 `persistence-client.ts` 是否给该节点装了 reader;(b) 模板是否引用 `{{占位}}`。**装了没引用=白读;引用了没装=空串消失**。
- 定位母版注入面最广 + `downstreamRules` 渲成硬规则块:`creative-context.ts:885-897`。
- 知识库喂料是"全量 list + 战绩排序"(`formatKnowledgeBrief` :602-660),**无主题相关性过滤**;向量 hybridSearch 只服务 UI 搜索页(`/api/knowledge/search`),**无创作节点调用**。

### 2.3 确认的断链 / 真假缺口(两子代理交叉印证)
- **script.draft 知识库没接**:runner 传了 `knowledgeBrief`(`script-runner.ts:112`),但组合根 `runScriptDraft` deps 漏了 `knowledge:`(`persistence-client.ts:2618-2651`)→ `{{knowledge}}` 恒空。**写脚本时知识库根本没进模型**。
- **选题 trend(热点)依据是空壳**:`basis=trend` 时 `basisBrief=""`(`topic-task-adapter.ts:67-72`),模板 `tools:[]`(`topic-generate.ts:35`)无联网。
- **复盘/对话的"本条作品观众评论"实为账号级**:`getComments` 里 `void projectId`(`persistence-client.ts:1975`),取账号最近 20 条,却标成"本次复盘作品·观众评论"→ 张冠李戴风险。逐字稿、本条指标是**精确按 projectId 读的真数据,可信**。
- 重建 `{{title}}` 恒"(无标题)";learnings reader 装了没映射进 facets(白读)。
- **`.claude/skills/` 那套 Claude Agent SDK 编排已退役**(`ai-worker/src/index.ts:5`),live 路径是各 runner 直调 `runStructuredNode`。别被误导。

### 2.4 数据脊柱(不变,复用)
- `UI → /api/v1/dispatch → compositeTransport → module transport → service(状态机/副作用)→ repository(纯 SQL,烙 userId)→ DB`。
- DB 单例钉 `globalThis`(`persistence-client.ts:843`);driver 三态 `resolveDbDriver`(`backend/src/db.ts`):postgres / file-pglite(桌面落 `~/.creatoros/db` 或 appDataDir)/ 内存。
- **web vs desktop 数据链路完全相同**,只差 driver 选择 + 桌面激活门。

### 2.5 服务端 / 更新现状(已建 80%,待接线)
- 激活已服务端(activation-manager,腾讯云 152.136.151.58)。
- 软件更新:Tauri updater 已在,endpoint 占位 `OWNER/REPO`,`CREATOROS_UPDATE_BASE_URL` 可覆盖;`desktop:release` 生成带签名 `latest.json`;当前 `createUpdaterArtifacts:false`(缺 key 会连累删 .app,修 bug 时关的)。
- Skill 更新:`prompt-bundle.mjs` Ed25519 签 `bundle.json`;客户端 `remote-prompt-bundle.ts:107-142` 拉+验签+套用;`PROMPT_BUNDLE_PUBLIC_KEY` 公钥内置。
- **一切客户端本地验签 → origin 可换(nginx 现在发 / CDN 以后加在同一 origin 前,零代码改)。不需要 CDN**。

### 2.6 两个确诊 bug(地基)
**评论采集退避死循环**(确诊):
- 评论路径自己不产生 throttled(`consecutiveTimeouts` 恒为 1、阈值 2 形同虚设,失败恒判 content-error:`douyin-cdp.ts:1016/1119` 不传 mapErr → `douyin-request-gateway.ts:191/98-101`)。
- 污染源是 `self.detail`(xlsx 导出)DOM 极脆 → download 超时判 throttled(`douyin-cdp.ts:1511-1521`),写进**共享单例** creator-center channel 的 `douyin_throttle_state`。
- `self.metrics` 每轮 fire-and-forget 自动接 `self.detail`(`persistence-client.ts:3834`)→ 反复污染。
- **致命时序倒挂**:cooldown 最高 60min > stale-sweep 30min(`scheduled-collection-scheduler.ts:330`)→ 评论 run 卡 `acquire` 睡 cooldown → 30min 被 sweep 标 failed → 永远等不到清退避的 `report("ok")` → cron 又触发 → 死循环。
- 叠加 T-065 `item_id` 过滤失效(`douyin-cdp.ts:1820-1824`):每作品拦到同一份全局评论 → N 作品重刷 N 次。

**激活重装占码**(确诊):
- machineId = `SHA256(硬件UUID | 随机UUID)`,随机 UUID 存 `<appDataDir>/machine-id` 且**无条件混入**(`lib.rs:126-135`)。
- 重装若清了 appDataDir(卸载器/手删 Application Support/换机)→ 随机 UUID 重生成 → machineId 变 → 服务端一机一码(`@@unique([projectId,usedBy])`)认作新设备 → 拒/报"已被其他设备使用"。
- 服务端 activation-manager 不在本仓,以上一机一码逻辑为 BACKLOG + 客户端契约推断。

### 2.7 采集增量现状(确诊):三个采集器全是每轮从头全量,零 cursor
| 采集器 | 现状 | 去重锚 | 浪费 |
|---|---|---|---|
| self.metrics | 全量重翻(最多 40 页) | recordKey | 每轮重拉全部作品 |
| comments | 全量重翻,无 early-break | commentExternalId(仅落库去重) | **最重**:全部作品 × 全部评论页,item_id 失效致全局重刷 N 次 |
| self.detail | 强制"全部"时间范围导全量 xlsx | 快照 append-only | 每轮全量导出 |
- 去重锚只在落库层挡重复(计 skipped),**不能反馈翻页循环 early-break**,抓取成本全额重复。

---

## 3. 逐层设计(现状 → 目标 → 怎么调 → 风险)

### L1 飞轮核心

**目标**:每条发布的真实表现 + 用户改稿,回流成"已验证经验",约束下一次创作,让第 5 稿肉眼可见比第 1 稿更像这个创作者。

**怎么调**:
1. **补断链,让赢家真进创作**:
   - script.draft 补 `knowledge:` reader 接线(`persistence-client.ts:2618-2651` 加一行,对齐 topic 的 :2310)。→ 见 T-182。
   - 复盘/对话"本条评论"修 per-project 归属(去掉 `void projectId`,按 publication→comment 关联;若数据模型无 per-project 外键则诚实降级标"账号级参考"而非谎称"本条")。→ T-182。
2. **改稿 delta 捕捉(新增,最强品味信号)**:用户编辑 AI 产出的脚本/文案时,记录 before→after 的差异,沉淀成"该创作者偏好"进 learnings/记忆;累积后主动提议写入其写稿规则(skill)。→ T-183。
3. **复盘发动机化**:learnings 不只是文字 blob,要能被下一次 topic/script 按相关性调用(接 L3 检索)。

**风险**:指标只有累计快照、无冷启时序(`getMetricsSummary` 取最新 snapshot),用它反推"当初决策"有时间错位——诚实标注,不夸大。

### L2 Skill / 记忆机制

**目标**:官方基座 ⊕ 用户自定义 ⊕ 自动进化 = 该创作者独有 Skill;**每个节点"读哪些源/多少/权重/要不要先问用户"由 Skill 声明,而非组合根硬接线**。

**怎么调**:
1. **Skill 扩展"上下文需求声明"**:`PromptTemplate` 增加声明字段(需要哪些 facet + 优先级/权重 + 是否渐进多轮 + 是否先问用户)。装配层按声明动态注入,取代 `persistence-client.ts` 逐节点手接 reader。**这直接根治 2.3 那类"漏接一行"的断链**(不再靠手接)。→ T-184。
2. **访谈式自定义**(非空白文本框):定位等阶段,Agent 先问创作者问题(你的风格/禁语/对标),再结合其数据,替他起草 custom skill。需要**多轮 elicitation** 能力(现 chat 是单轮工具调用)。→ T-185。
3. **记忆→Skill 自动进化**:观察到稳定偏好(如"最近 3 次都改成提问式开头")→ 主动提议落进写稿规则(用户确认)。→ T-183/T-185。
4. **复用已建**:官方基座走 prompt-bundle 远程下发;用户自定义走 `skill_config_overrides` + D1 锁(不被官方覆盖)——已在,只接 UI + 进化逻辑。

**风险**:声明式注入是较大重构;分节点灰度落地(先 script,再铺开),但**不做减法式多阶段**——一次把 script 这个面的声明式闭环做穿。

### L3 策展护栏

**目标**:防飞轮被噪声污染——**相关性 + 你的赢家 > 上下文数量**。

**怎么调**:
1. **知识库按相关性检索注入**:把已建向量 `hybridSearch`(`persistence-client.ts:5116-5175`)接进创作 context,按当前选题/项目 query 检索 top-k + 相关性阈值,替代"全量+战绩排序"硬塞。→ T-186。
2. **渐进式注入 + token 预算**:不一次塞满,按预算分层;超预算按相关性截断,`log` 丢了什么(不静默截断)。
3. **scope 感知**:项目态→该项目最高优先;全局态→账户整体/所有项目最高。注入选择随 scope 变。

**风险**:相关性阈值调不好会漏掉有用沉淀;需可配 + 观测。

### L4 服务端接管(无 CDN)

**目标**:{激活、软件更新、Skill 下发、使用感知}收敛到自有服务器同一端点命名空间;签名静态文件,nginx 托管。

**怎么调**:
```
https://creatoros.aitongban.cloud/
  ├── updates/latest.json + *.app.tar.gz + .sig   (软件更新)
  └── prompts/bundle.json + .sig                   (Skill 更新,不灰度=全量推)
```
1. nginx 加 `/updates/` `/prompts/` 静态 location(同官网 rsync+nginx 部署);私钥本地签、只 rsync 签名产物。
2. 客户端配 `CREATOROS_UPDATE_BASE_URL` + `PROMPT_BUNDLE_PUBLIC_KEY` 指向自有服务器;配好 updater key 后重开 `createUpdaterArtifacts:true`(否则又踩缺 key 删 .app)。→ T-181。
3. **检查更新做实**:真"检查更新"入口(设置页)+ 后台启动拉一次 latest.json 比对版本,有新版提示下载。→ T-180。
4. **Skill 更新**:启动拉 bundle.json + 手动"检查更新";**不灰度**(官方基座全量推,用户自定义 D1 锁叠加不被覆盖)。→ T-181。
5. **使用感知**:更新检查/激活 status 心跳带(隐私前提)version/machineId/活跃 skill,服务器侧得到实时视图。→ T-181(可选增益)。

**带宽账**:Skill 更新几 KB 永远 nginx 够;二进制 ~120MB 但低频,nginx 现在够,用户上量再把 Cloudflare 免费版套同一 origin 前(零代码改)。

**风险**:updater key 管理;私钥绝不上服务器。

### L5 地基

1. **评论退避死循环修复**(T-176):`acquire` cooldown 等待加上限(max wait < staleMs,打破 60min>30min 倒挂)或未到期快速跳过;解耦 metrics→detail 自动接;导出 download-timeout 默认判 content-error(DOM 脆非风控);删/修 `consecutiveTimeouts` 假逻辑;修 `item_id` 过滤失效。
2. **采集全面增量化**(T-177):comments 按每作品 watermark(最大 createTime/已见 cid),某页全 ≤ watermark 就 break;metrics 加"翻到已知最老作品且无新增就停";self.detail 增量收益低,优先级最低。
3. **激活重装占码修复**(T-178):machineId 硬件 UUID 拿得到时**只用硬件、不混随机因子**(`lib.rs:126-135`),仅硬件缺失才回退随机;老用户一次性换绑阵痛需配服务端解绑(推断,待核实 activation-manager)。
4. **激活弹窗接官网链接**(T-179):`frontend/src/app/activate/page.tsx:47` "遇问题请联系授权方"加指向产品官网的链接。

**风险**:machineId 改派生会让已激活老用户 machineId 变一次(需服务端支持同码重绑,或一次性阵痛);评论增量需先修 item_id 否则增量也救不了 N× 冗余。

---

## 4. Task 拆分(落 BACKLOG,每条引用本 SPEC 对应节)

**地基层(bug 修复/接线,不改方向,gate 门槛低,可先开工):**
- **T-176** 评论采集退避死循环修复(§3-L5.1 / §2.6)
- **T-177** 采集全面增量化:作品+评论 cursor/early-break(§3-L5.2 / §2.7)
- **T-178** 激活 machineId 改硬件稳定派生,重装不占码(§3-L5.3 / §2.6)
- **T-179** 激活弹窗加官网链接(§3-L5.4)
- **T-180** 检查更新做实:updater endpoint 指自有服务器 + 真"检查更新"入口(§3-L4.3)

**架构层(改方向/架构,须过 spec-review gate 才开工):**
- **T-181** 服务端接管:更新/Skill 下发/使用感知收敛自有 nginx,不灰度、无 CDN(§3-L4)
- **T-182** 飞轮补断链:script.draft 接 knowledge + 复盘/对话评论 per-project 归属 + trend 接真(§3-L1.1 / §2.3)
- **T-183** 改稿 delta 捕捉 → 记忆/learnings 进化(§3-L1.2 / L2.3)
- **T-184** Skill 驱动的声明式 context 注入,取代组合根硬接线(§3-L2.1)
- **T-185** 访谈式自定义 Skill(多轮 elicitation,定位阶段先问后答)(§3-L2.2)
- **T-186** 知识库策展 + 渐进式/scope 感知注入 + token 预算(§3-L3)

**建议落地顺序**:地基(T-176~T-180,飞轮的燃油/管路,不修转不起来)→ 服务端接管(T-181,更新通道)→ 飞轮补断链(T-182,最快见质量)→ 改稿捕捉(T-183)→ 声明式注入(T-184)→ 访谈式自定义(T-185)→ 策展(T-186)。

## 5. 已拍板决策
- 飞轮为主轴,自定义 Skill 作加速器(非主体)。
- Skill 更新**不做灰度**(官方基座全量推 + 用户自定义 D1 锁叠加)。
- **不需要 CDN**,自有 nginx 托管签名静态文件;用户上量再套 Cloudflare 免费版同 origin 前。
- 激活弹窗接产品官网链接;检查更新功能做实。
- **(OQ1 定)** 目前无客户 → T-178 machineId 改派生**不管老用户迁移**,直接改;换绑阵痛忽略。
- **(OQ2 定)** 改稿 delta 只埋**两个态:AI 初稿 + 用户终稿**(delta = 终稿 vs 初稿),中间态不考虑。
- **(OQ3 定)** 声明式注入(T-184)**先把 script 一个面做穿**再铺开(证明闭环)。
- **(OQ4 定)** 多轮 elicitation:由我在实现时定复用/新建(倾向复用 chat-runner agentic loop,待核实其多轮往返)。

## 6. 引导 ⊗ 实际行为 双向绑定(用户 2026-07-10 追加,新增设计原则)

> 用户原则:**"引导和用户的实际行为功能是双向绑定的"** —— 引导态从真实 state 派生 + 引导动作触发真实功能。用户报障(待 §2.8 核实修法):
> - 绑定抖音后引导仍问"新用户/是否绑定抖音"(引导态没从真实绑定派生 / 绑定态没刷)。
> - 没默认建三个历史采集任务(self.metrics/self.detail/comments)。
> - 绑定后未自动初始化跑这三个任务把数据拉进来(尤其选"已有账户"时)。
- **目标**:绑定抖音 = ①引导对应步立即变已完成(状态双向);②默认建好三个采集 job;③自动初始化跑一次把存量作品+明细+评论+封面+逐字稿拉进来。"已有账户"路径必须一键把历史数据灌满。→ 见 T-189。

## 7. 老 bug 现状体检(2026-07-10 子代理核实,verify-exists-before-building)
- **封面渲染**:**基本已修**。根因是旧 `asset-preview-url.ts` 永久缓存签名 URL(超 15min token TTL 后验签 reject→"过段时间连能看的也看不到")+ 失败 null 永久缓存 + `cover-thumb` onError 永久 broken;codex 已改带 TTL(10min<15min)缓存 + onError invalidate 自愈重拉。**唯一残留 gap**:`cover-thumb.tsx:66-74` 注释承诺"仅重试一次"但无计数器,持续 404/5xx 的 asset 无限重拉打爆 dispatch。→ **T-187**(小,补重试上限)。写入侧(backfill→createGeneratedAsset→setCover coverAssetId)通,非根因。**注:桌面版封面走 sidecar `http://127.0.0.1:PORT` 同一 blob route,无 Tauri custom protocol 那条路**。
- **逐字稿回填**:**已修**。老根因=`transcribe.douyin` 任务**从没被创建**(触发缺口),叠加旧代码"ASR 未配→整任务停"。现:self.metrics 尾经 ai transport 排 transcribe.douyin(`reconstruct-enqueue.ts`)+ whisper-local 本地兜底(无 key 也转,`multimodal/resolve.ts:239`)+ 写 output_script&master_script 双 artifact(`transcript-artifact.ts`)+ 详情页优先读 output_script 回退 master_script(`script-editor-data.ts:300-302`)。链路闭合。→ **T-188**(仅真机扫码触发验证,非修)。
- **定时任务**:**引擎实打实,默认零自动**。node-cron 每分钟轮询 + `cronMatchesMinute` 支持"每天 HH:MM"(`scheduled-collection-scheduler.ts:210-310`);但唯一建 job 入口是手动 `/automations`(`automations-island.tsx:1535`),绑定不建 job。→ 并入 **T-189**(绑定即建三个每天定时 job)。
- **引导 ⊗ 行为双向绑定**:**断三处**(判据本身读对了)。(A)`onboarding-card.tsx:119-130` 只 mount 拉一次、不监听 `account-events` → 绑了不刷新;(B)`onboarding-data.ts:29-36` origin 仅 localStorage、不由 douyinLoggedIn/hasImportedWorks 回灌 → 一直追问新/老;(C)`loginDouyin`(`ingestion.service.ts:744-772`)只 fire-and-forget 一次 refreshDouyin,**不建三 job、不跑 self.detail/comments**(self.metrics→self.detail 自接仅在调度器路径 `persistence-client.ts:3828-3848`,绑定路径不经过),"已有账户"路径同断。→ **T-189**。
