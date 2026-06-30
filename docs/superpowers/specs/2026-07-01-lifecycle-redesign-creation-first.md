# CreatorOS 生命周期重设计:从「通用空壳」到「编导式短视频生产线」

> 状态:设计稿,**待 spec-review gate**(改阶段语义 + 数据归属/存储架构 → 落地前必须过审,verdict≠FAIL)。
> 对照宪法 `docs/产品定位.md` 判定位。源于 2026-07-01 用户真机走查反馈 + 设计讨论。
>
> 决策已定(用户逐轮拍板):
> - **研究阶段保留,但彻底创作向**:从「竞品分析/资料调研/学术味」改为「**为这条选题找钩子 / 找素材灵感**」。
> - **本地优先存储**:docker-PostgreSQL 对"装到用户本机"太重 → 运行时换 **file-backed PGlite**(Postgres-in-WASM 落盘,零 docker,schema/SQL 零重写)。**不迁 SQLite**(整套 PG 方言 + 10 迁移重写,代价大、不划算)。对象存储用 **local-fs**(已起头)。**不上独立时序库**:`metric_snapshots`(append-only + captured_at)已是时序形状,单用户个人量级足够(YAGNI)。
> - **范围:全做,无优先级**。整条流水线 7 阶段逐个做真 + 横切 bug + 新能力依赖。

---

## 0. 核心问题(真机走查诊断)

当前生命周期是个**「通用空壳 + 学术调研味」**,与宪法「编导式短视频生产系统」矛盾:

- **每阶段摆一堆「暂无内容」空格子**:刚立项就给你看「最近文件 0 / 关联素材 0 / 产出 0」——没真东西硬摊开,用户看不懂"这步该干嘛"。
- **学术/调研味**:研究阶段是「竞品分析 / 威胁评估 / 资料调研」——这是做 PRD / 学术文档的味,不是做短视频的。用户原话:「我们是做短视频创作的,不是做调研的,也不是做学术文档的」。
- **AI 没把重活干掉**:每阶段是「等用户填」的表单/占位,不是「AI 先产出、人审/改」(违反宪法原则:AI 是编导,人只审/改/删)。
- **真 bug 叠加**:立项「进入下一步」无反应、策划 Tab 切不了、「帮我搜素材」卡死、ChatBox 一点就跳首页、双按钮(下一步/工作台)歧义。

**重设计目标**:每阶段 = **AI 先把重活干掉,产出具体创作物;没真东西就不摆空格子;全程创作向,非学术。**

## 1. 设计原则(每条对照宪法)

1. **AI 干重活,人只审/改/删**:每阶段 AI 先产候选/初稿(走采纳门),不是空表单等填。
2. **无真东西不摆空格子**:某区无内容 → 要么 AI 一键生成的入口,要么直接不渲染该区(不摆「暂无 0」噪声)。
3. **创作向,非学术**:研究=找钩子/素材灵感,不是竞品表;策划=脚本骨架,不是 PRD。
4. **单一主行动**:每阶段一个明确的"下一步"主按钮(去掉「进入下一步 / 进入工作台」歧义)。
5. **本地优先 + 轻**:部署到用户本机,零 docker 依赖(PGlite + local-fs)。
6. **复用不造轮子**:阶段机(A6)、ai_tasks 队列 + 12 节点、metric_snapshots、pglite 路径(P1-T3)、local-fs 对象存储、CollabField 采纳门、T-007 调度(SPEC PASS-ready)、用料链 BillOfMaterials —— 全复用。OSS 能拿就拿(文档编辑器)。

## 2. 流水线重定义(7 阶段,创作向)

`立项 → 研究(找钩子) → 策划 → 脚本 → 录制 → 发布 → 复盘`

| 阶段 | 一句话本质 | AI 先干什么 | 产出物 |
|---|---|---|---|
| 立项 | 一句话选题 → 编导补全 brief | topic.enrich 补全选题卡 | brief(已有) |
| 研究 | 为这条选题找钩子/素材灵感 | 找开头法/真实案例/数据点/可复用金句 | 钩子+灵感候选 → 喂脚本 |
| 策划 | 脚本骨架(论点/结构) | planning.thesis/outline 出结构 | content_outline(已有) |
| 脚本 | AI 初稿 + 二次编辑 | script.draft 吃定位/选题/论点出初稿 | 脚本正文(文档编辑器) |
| 录制 | 凑齐素材(AI 找/生成 + 上传) | 列素材清单 + AI 截图/文生图/文生视频 | 绑定项目的素材 |
| 发布 | 一稿多平台发布稿 | cheat-on-content publish skill 出标题/简介/标签 | 发布稿 |
| 复盘 | 真实数据回流对照盲预测 | 调度抓抖音 + 维度评分 | 偏差+经验沉淀 |

## 3. 各阶段详设计

### 3.1 立项(简化 + 修 bug)
- **现状问题**:右上「进入下一步」「进入工作台」双按钮歧义且「进入下一步」无反应;中间「最近文件/关联素材/产出」刚立项全 0 摊开。
- **重设计**:① 去掉刚立项必为 0 的空区(关联素材/产出/最近文件在有内容前不渲染或折叠);② **单一主行动**「进入工作台 →」(继续创作);「进入下一步」若保留则真接 stage transition(`projects.transitionStage` 既有 op),不能空 onClick;③ 项目信息卡保留(brief 真值)。
- **复用**:阶段机 A6 的 transition;读侧 §1.4 已让 imported 显已发布(Group A done)。

### 3.2 研究 = 找钩子 / 找素材灵感(创作向重写)
- **现状问题**:竞品分析表(竞品名/平台/定位/优势/劣势/威胁等级)+ 威胁评估——学术/调研味,与短视频创作无关。
- **重设计**:整块改为「**为这条选题找:① 能用的开头钩子法 ② 真实案例/对标爆款的开头 ③ 可引的数据点 ④ 可复用金句**」。删除竞品表/威胁评估。
- **AI 节点**:复用 `research.gather_material`(已迁 Vercel,T-006),但**换提示词模板 + 输出 schema**:产出「钩子/案例/数据点/金句」四类候选(非「文章/视频/报告/播客」资料堆),走采纳门 → 进知识库/喂脚本。
- **数据**:候选落 candidates / knowledge(已有);不新建实体。

### 3.3 策划(修 Tab + 瘦身)
- **现状问题**:多个 Tab(内容合同/论点树/证据地图/受众洞察/差异化亮点)**点了切不了**(bug);「未找到项目」。
- **重设计**:① 修 Tab 切换(诊断:多半 Tab state/受控组件没接 onClick 或 projectId 没传导致渲染兜底「未找到项目」);② **瘦身**——保留对脚本真有用的「内容合同(受众/价值/节奏/CTA)+ 论点树(核心论点/支撑/证据/反驳)」,这两个是脚本骨架;证据地图/受众洞察/差异化亮点若无真数据来源则降级或并入。
- **复用**:planning.thesis/contract/outline 节点(已有);SEAM-01/02 已把策划产物注入脚本上下文(T-009 done)。

### 3.4 脚本 = 内置文档编辑器 + AI 初稿(新能力)
- **现状问题**:脚本页是个简陋 textarea(「暂无脚本正文」);工具栏装饰。要真能写、能 AI 初稿、能二次编辑。
- **重设计**:
  - **内置 OSS 文档编辑器**(富文本)。选型(§5.1):**TipTap**(ProseMirror,React,headless,生态最大)为默认;Lexical(Meta)备选。承载脚本正文 + 分镜结构 + 金句标注。
  - **AI 初稿**:`script.draft` 节点(已有,吃定位/选题/论点/研究钩子;SEAM-01 已注入策划产物)生成初稿 → 灌进编辑器 → **用户二次编辑**(编辑器原生)→ 保存落 artifact(`createArtifactVersion` 已有,支持版本/回滚)。
  - **写稿 Skill**:script.draft 的提示词模板即"写稿 Skill"(脊柱-1 模板化已就绪,T-005 三位一体可配)。
- **复用**:artifact 版本机制、script.draft 节点、SEAM 注入。**新增**:TipTap 集成 + 编辑器↔artifact 的存取桥。

### 3.5 录制(原「拍摄」改名)= 素材清单 + 上传 + AI 生成(新能力)
- **现状问题**:命名「拍摄」不准;制作页素材/剪辑/导出多为桩。
- **重设计**:核心 = **凑齐这条内容要的素材**。
  - **素材清单**:AI 据脚本/分镜列「这条需要哪些镜头/图/素材」(复用 material.match 节点 D2 + 用料链 BillOfMaterials A4 —— 料库⇄创作连接实体已建)。
  - **AI 自己找/生成**:集成用户的 **`open-design-remotion-video` skill**(`/Users/zyongzhu/.skills-manager/skills/open-design-remotion-video`)做截图/文生图/文生视频。作为一个 AI 节点/工具,产出素材 → 落对象存储(local-fs)+ 建 asset + 绑定项目(用料链)。
  - **用户上传**:**拖拽文件到项目 → 自动进素材区 + 绑定当前项目**。复用已建的对象存储(P3:presigned PUT)+ assets 模块 + 用料链。新增前端拖拽上传 UI + "上传即绑定"接线。
- **复用**:assets/D1 素材库、对象存储 P3、用料链 A4、material.match D2。**新增**:open-design-remotion-video skill 集成、拖拽上传 UI。

### 3.6 发布 = cheat-on-content publish skill(集成)
- **重设计**:复用现有 `publish.platform_adapt` 节点(C1 done),但**提示词/逻辑对齐 cheat-on-content 的 publish 子 skill** —— 出**标题 / 简介 / 标签**(各平台适配)。真发布仍 MockPublisher(诚实标"模拟发布",真发适配器后续)。
- **复用**:publish.platform_adapt、平台退回发布层(T-008 done,publications.platform + 手动加平台)。**对齐**:cheat-on-content publish 子 skill 的提示词/字段。

### 3.7 复盘 = 调度抓数据 + 时序 snapshot + 只已发布可复盘
- **现状问题**:复盘对没发布的作品也开放(无意义);数据不是持续回流的。
- **重设计**:
  - **数据来源 = T-007 调度系统**(SPEC PASS-ready):定时(时/天)抓抖音创作者数据 → `ensureImportedProject`/`ingestMetrics` → `metric_snapshots`。
  - **时序**:`metric_snapshots`(append-only + captured_at)即时序;图表查时间窗口(播放/互动随时间)。**不上独立 TSDB**。
  - **门**:**只有已发布、能从抖音回收数据的作品才能复盘**。未发布作品的「复盘」入口禁用 + 标"发布后可复盘"。复用 §1.4 `hasImportedProjects`/imported 判据。
  - **盲预测对照**:已有(校准 B2/FLY-02)。
- **复用**:T-007 调度、metric_snapshots、calibration/FLY-02。

## 4. 存储架构(本地优先 —— 数据归属变更,gate 重点)

### 4.1 运行时 DB:docker-PG → file-backed PGlite
- **决策**:本地部署用 **`@electric-sql/pglite` 落盘**(Postgres-in-WASM,嵌进 Node 进程,持久化到本地目录),零 docker。**schema / SQL / 10 个迁移 / Drizzle pg dialect 一行不改**(PGlite 就是 Postgres)。
- **复用**:`backend/src/db.ts` 已是双 driver(运行时 node-postgres / 测试 pglite,P1-T3);本任务把"运行时"分支加一个 **file-backed PGlite** 选项(env 选 docker-PG / file-PGlite),默认本地优先用 file-PGlite。docker-PG 保留作可选(开发/多用户)。
- **不迁 SQLite**:整套 PG 方言(jsonb、迁移、raw DDL、Drizzle pg)迁 SQLite = 大改 + 风险,为省一点推倒已建资产,不划算。
- **数据归属**:DB 落盘位置 = 用户本机目录(如 `~/.creatoros/db` 或项目内,env 可配),与 `.auth/`(抖音 cookie)同属本机私有,不入 Git。

### 4.2 对象存储:MinIO → local-fs
- 本地部署用 **local-fs 后端**(已起头),不要 MinIO。env 选 local-fs / S3-compatible。

### 4.3 时序:复用 metric_snapshots,不上 TSDB
- `metric_snapshots`(append-only,UNIQUE(publication_id, source, captured_at))已是时序;调度每跑 append 一条;图表按 captured_at 窗口聚合。单用户个人量级足够。

## 5. 新能力依赖(选型 + 集成)

### 5.1 文档编辑器(OSS)
- **TipTap**(ProseMirror-based,React,headless,生态最大,扩展丰富)为默认选型;Lexical(Meta,React)备选。承载脚本正文 + 分镜 + 金句标注;存取桥到 artifact 版本。

### 5.2 文件上传(拖拽绑定)
- 复用对象存储 presigned PUT(P3)+ assets + 用料链;新增前端拖拽区 + "上传即建 asset 即绑定项目"接线。

### 5.3 AI 素材生成
- 集成用户 `open-design-remotion-video` skill(截图/文生图/文生视频)为 AI 节点/工具;产出落 local-fs + asset + 绑定。

### 5.4 发布稿生成
- 对齐 cheat-on-content 的 publish 子 skill(标题/简介/标签);复用 publish.platform_adapt。

### 5.5 调度 + 持续数据
- T-007 调度系统(SPEC PASS-ready,本地优先后 node-cron + file-PGlite)。

## 6. 横切 bug(部分已在并行修)

| bug | 处置 |
|---|---|
| ChatBox 一键岛打开跳首页 | 修:打开 overlay 不改路由(并行修中) |
| 对话框太小 / 布局 | 修:对话区为主、任务区可滚(并行修中) |
| 最近/继续任务显英文 taskType | 修:taskType→中文 label(并行修中) |
| 任务卡按钮 UI 不符 | 修:复用 UI 组件(并行修中) |
| 智能推荐「AI 浏览器/竞品」误导 | 修:删/改真(并行修中) |
| 立项「进入下一步」无反应 | 修:接 stage transition(并行修中) |
| 策划 Tab 切不了 | 本 SPEC §3.3 修 |
| 帮我搜素材卡死 | 本 SPEC §3.2 研究重写时一并修 |

## 7. 实现切片拆解(全做,无优先级;每片三步验证 + 真链路)

- **L0 存储本地优先**:db.ts 加 file-PGlite 运行时分支 + env 选择;对象存储默认 local-fs;真链路:零 docker 起 app、数据落盘、重启不丢。
- **L1 立项简化 + 进入下一步修** + 横切 bug(并行子代理已在修)。
- **L2 研究创作向重写**:research.gather 换模板/schema(钩子/案例/数据点/金句)+ 删竞品表 + 修搜素材卡死。
- **L3 策划修 Tab + 瘦身**。
- **L4 脚本文档编辑器**:TipTap 集成 + AI 初稿灌入 + 二次编辑存 artifact。
- **L5 录制**:素材清单 + 拖拽上传绑定 + open-design-remotion-video 集成。
- **L6 发布**:对齐 cheat-on-content publish skill。
- **L7 复盘**:接 T-007 调度 + snapshot 时序图表 + 只已发布可复盘门。

## 8. 开放问题(实现时遇到再定,默认假设先走)

- file-PGlite 的并发/性能在本地单用户够用(假设够);多用户/云部署回退 docker-PG(env 切)。
- TipTap vs Lexical 最终选型由 L4 实现时按集成成本定;默认 TipTap。
- open-design-remotion-video skill 的输入/输出契约需读该 skill 后定 L5 集成面。
- cheat-on-content publish 子 skill 的字段/提示词需读该项目后对齐 L6。
- 录制阶段 AI 找素材 vs 用户上传的 UI 主次,L5 设计时定。
