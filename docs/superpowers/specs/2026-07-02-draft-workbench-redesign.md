# 稿面工作台重做(draft-workbench-redesign)· T-055

> 状态:待审(spec-review gate)。改信息架构 + 交互范式 + 含宪法修正案 → **必须过审才准开工**。
> 设计稿:https://claude.ai/code/artifact/c7665b6a-4cbb-4960-ae5e-e42d510f84eb(用户已看图拍板)
> 作者会话:2026-07-02;基线 commit `bb6fe6a`(T-049~054 修复批收官后)。

## §0 用户拍板记录(2026-07-02,三项均已确认)

1. **稿面形态认可**:「左稿面右对话」单页工作台,阶段降级为成熟度标记。用户原话「第一个,我大致认可」。
2. **制作工作台保留独立页 + 升级为素材倾倒场**:用户原话「我的习惯是把所有的素材全部丢进去,比如说图片啊、录屏啊、封面啊之类的,它应该能够帮我好好地去存储并保存这些原始素材,方便我后续使用,同时能够帮我归类」。
3. **论点树/内容合同连数据直接删**:用户原话「历史数据以及论点树、内容合同,这些东西都可以删掉,不需要保留了,本来都是假数据」。不做导出备份。

驱动本 SPEC 的原始反馈(2026-07-02 反馈批,八条):AI 按钮并存要收敛为对话、对话无 @项目标识且内容重复两遍、字体小、创建项目留白、brief 不在导航、内容合同/论点树怪、知识库只读且来源不清、素材来源应以制作阶段为主源头、「更多」按钮实为删除、无下载、本地文件应可在文件夹打开、经验沉淀/发布中心需重设计。

## §1 一句话方向

**一个项目 = 一张不断成熟的稿子。** 稿面(选题卡 → 口播脚本 → 发布包,纵向演进)是项目的唯一主视图;编导对话常驻右栏,全站 AI 能力收敛进对话;阶段从「七个页面」降级为「稿子的成熟度标记」。

## §2 合宪对照 + 宪法修正案

### 2.1 强化的条款(本设计是这些条款的忠实深化)

- **§6 编导对话化**:宪法原文「AI 功能本质多轮对话,统一成一个上下文感知的 ChatBox…结果渲进对话、走采纳门」——本 SPEC 的「AI 交互收敛」正是把这句话执行到底:全站 11 个 AdoptCandidateCard 按钮退役为对话预填,产物卡片渲进对话流,采纳门保留(§5)。
- **§5 原则 3 / §9 铁律 2**:「AI 只产候选,人确认」——产物卡片的「写入稿面」就是 confirm 门,继续走既有 confirm op(backend service 物化)。
- **§5 原则 5**:「产品是编导不是表单填写机」——论点树/内容合同正是表单填写机的残留,退役是对该原则的执行。
- **§8 边界**:素材倾倒场「只管素材不管剪」,不做时间线/渲染,合规。
- **§7 数据底座**:弹药卡的来源链直接建立在 imported 历史项目之上。

### 2.2 宪法修正案(用户拍板 ①③ 即修宪授权;过审后同步改 `docs/产品定位.md`)

- **§4 原文**:「立项 Brief → 研究 → 策划(论点/合同/结构)→ 脚本 → 制作(文案+结构+素材)→ 发布(多平台适配)→ 复盘(校准+经验沉淀)」
- **修正为**:「**稿面演进主线**:选题(含 Brief/研究/策划,收敛为稿面选题区)→ 脚本 → 制作(素材倾倒场+录制)→ 发布 → 复盘(校准+经验沉淀)。策划方法论(论点/合同/结构)**内化为编导 AI 的产出标准**(脚本自带 HOOK/铺垫/干货/CTA 结构标记),不再是让人操作的实体。」
- **不变式**:§5 原则 1(每个项目必须有 Brief——收进选题卡展开态,仍必填)、原则 2(阶段交付物语义保留:选题卡/脚本/发布包/复盘,只是不再分页)、原则 4(复盘回流)全部保留。
- `currentStage` 七枚举**不改**(brief/research/planning/script/production/publishing/review)——只改 UI 呈现分组(§3.2),避免数据迁移与全链枚举改动。

## §3 信息架构:稿面模型

### 3.1 页面布局(设计稿已锁)

`/projects/[projectId]` 重做为稿面工作台,三段式:

- **顶条(58px)**:← 项目 | 项目标题 | 成熟度点×5 | 右侧:盲预测 chip(有预测时)+「在 Finder 打开」+ 主行动按钮(随成熟度变:「定稿,进制作 →」/「去发布 →」/「看复盘 →」)。
- **左稿面(flex-1)**:纵向三区 + 弹药抽屉,左缘一条成熟度轨(绿=已定/紫=进行/灰=待解锁):
  1. **选题卡**(折叠一行:✓ 选题已定 + 标题 + 观众/冲突摘要;展开=完整 briefDetail 可编辑——治「brief 不在导航」)。
  2. **口播脚本**(活跃区):现有 TipTap 编辑器迁入,段落带结构标记(§4.2),内联金句引用 chip,头部 v 版本徽标+自动保存态。
  3. **发布包**(待解锁,降透明):标题草稿/封面占位/标签 chips;脚本定稿后解锁,读写 publication_revisions。
  4. **弹药抽屉**(横排卡):本项目关联的知识卡+素材缩略,每张带来源链(§8.1)。
- **右对话(442px 固定)**:ChatBox 常驻。头部上下文 chips(@项目名、脚本 vN,可摘可换);消息流(用户/AI/产物卡片/系统行);底部快捷预填条 + 输入框(**14px 正文**——治字体小)。

### 3.2 成熟度点 ↔ currentStage 映射(UI 分组,不改枚举)

| 成熟度点 | currentStage 值 | 点击行为 |
|---|---|---|
| ① 选题 | brief / research / planning | 滚动到选题卡并展开 |
| ② 脚本 | script | 滚动到脚本区 |
| ③ 制作 | production | **跳转独立制作工作台**(用户拍板保留) |
| ④ 发布 | publishing | 滚动到发布包(解锁后) |
| ⑤ 复盘 | review | 跳转复盘页(保留独立页,全局流程) |

阶段推进沿用既有 `projects.transition` 单一状态机(A6 已统一,stepper 可点语义迁移到成熟度点)。

### 3.3 路由迁移

- `/projects/[id]`(现总览)→ 稿面工作台(重做)。
- `/projects/[id]/{research,planning,script,publishing}` 四路由 → **301 到稿面对应锚点**(`/projects/[id]#topic|#script|#publish`)。页面文件删除。
- `/projects/[id]/production` 保留(独立制作工作台);`/projects/[id]/review` 保留。

## §4 数据模型:零新实体(最强不造轮子声明)

稿面是**纯视图层重组**。三区各自读写既有实体:

### 4.1 选题区

- 读写 `projects.briefDetail`(jsonb,已有 targetAudience/contentGoal/orientation 等字段,契约 `projectBriefDetail` zod)+ `projects.title/brief`。
- 立项来源候选(candidate)已有关联,展开态显示选题卡全字段(topics 页的 CandidateCard 详情组件复用)。

### 4.2 脚本区

- 实体:既有 `artifacts`(artifactType `output_script`/`master_script`)+ `artifact_versions`。编辑器:既有 TipTap `ScriptRichEditor`(frontend/src/features/script/script-rich-editor.tsx,T-019/T-024 保存往返与竞态防护全保留)。
- **唯一 schema 级新增**:`contentData.sections[].role` 可选字段,枚举 `"hook" | "setup" | "value" | "cta" | "note"` ——段落结构标记。jsonb 内新增可选键,**无迁移**;旧版本无 role 渲染为无标记段落(向后兼容)。ai-worker 的 `script.draft` 模板输出 schema 增补 role(提示词模板已服务端可配,T-040 通道)。

### 4.3 发布包区

- 实体:既有 `publications` + `publication_revisions`(标题/description/platformTags/coverAssetId 字段全有)。解锁条件:脚本 artifact 存在至少一个 version 且用户点过「定稿」(定稿=`projects.transition` 到 production/publishing,复用状态机,不新增字段)。

### 4.4 弹药区

- 实体:既有 `material_links`(entityType knowledge/asset,项目关联已有)。读侧复用 research/production 数据装配的 materialLinks fan-out 模式(frontend/src/features/research/research-workspace-data.ts 的 listMaterialLinks→getKnowledge 链)。

### 4.5 删除的实体(用户拍板 ③,直接删不导出)

- `thesis_nodes`、`evidence_links` 表(backend/src/schema/artifacts.ts 内)+ 对应 artifactType 数据行(`thesis_tree`/`content_contract`/`structure_plan` 类型的 artifacts + versions)。
- drizzle 迁移:新迁移文件 DROP TABLE thesis_nodes/evidence_links + DELETE artifacts WHERE artifact_type IN (三类型)级联 versions。迁移号以写码时最新号+1 为准(写码时核对 drizzle journal,避免撞号——历史教训 gate-F1)。
- `timeline_segments` 表:保留(production 章节在用,T-051 刚接通 segments.list)。

## §5 AI 交互范式收敛

### 5.1 退役 AdoptCandidateCard 按钮任务流

现状:11 处「按钮→createAITask→轮询→采纳卡」(定位建议/搜素材/分镜脚本/选题 enrich/校准诊断等,frontend/src/components/ai/adopt-candidate-card.tsx 的消费方)。

收敛后:
- **按钮 = 对话快捷预填**:点击打开稿面右栏对话(或全局 ChatBox),把一条带上下文的消息**预填进输入框,不自动发送**(治「点击后内容重复两遍」——现 `copilotDeepLink` 预调机制自动触发是重复根因,T-056 已单列排查;本 SPEC 从机制上消灭:预填只写 input value,用户回车才发)。
- **产物 = 对话内 generative UI 卡片**:复用 ChatBox 既有 generative UI 通道(T-004 slice2 已有卡片渲染),新增卡片类型:hook 候选组/素材列表/定位建议/结构诊断。每张卡逐条「写入稿面」按钮 → 调用**既有 confirm 类 op**(ai.tasks.confirm 的 artifact_version/positioning_profile/knowledge 分支,backend 物化,§9 铁律 2 不破)→ 写入后对话插入系统行「已写入 · 撤销」(撤销=artifact 回滚到上一 version,复用 artifacts.restore)。
- **上下文 chip**:对话头部常驻 `@项目名` + 对象 chip(脚本 vN/选题卡),数据源=T-039 已做的 ChatContext 注入(surface+selection),本 SPEC 只补常驻 UI 与摘除交互。

### 5.2 迁移顺序(渐进,不 big-bang)

第一波退役:定位建议(GeneratePositioningIsland)、搜素材(GatherMaterialIsland)、分镜脚本(ScriptDraftIsland)——用户点名的三处。第二波:其余 8 处(选题 enrich/校准诊断等)。AdoptCandidateCard 组件在第二波结束后删除。

### 5.3 对话字体与密度

ChatBox 正文 12px → **14px**,行高 1.7;产物卡片 13px。全局 ChatBox 与稿面右栏共用同一套消息组件(现有 ai-copilot-content 的消息渲染抽公共件)。

## §6 制作工作台:素材倾倒场(用户拍板 ② 新增需求)

保留独立页 `/projects/[id]/production`,录制/AI 生成区不动(T-020/L5 已建),**新增倾倒场为页面第一区**:

### 6.1 交互

- **拖放一切**:整页级 dropzone(拖入高亮),支持多文件批量:图片/视频/音频/字幕/文档(psd/sketch 等设计源文件按 document 收)。也支持点击选择与粘贴(截图 ⌘V)。
- **上传即三件事**:①保真落盘(§7 目录规则,**原始文件名保留**,冲突加 `-2` 序号,永不改写原件)②自动归类(§6.2)③挂当前项目(material_links)+ 进全局素材库。
- 每张已倒入卡片:缩略图 + 原文件名 + 归类标签(可改)+ 「在 Finder 显示」。

### 6.2 自动归类(两层)

- **第一层·确定性(默认开,零成本)**:
  - MIME/扩展名 → `assetType`(image/video/audio/document/subtitle,既有枚举);
  - 文件名+元数据启发式 → 用途标签(既有 `tags`/`entity_tags` 表):`封面`(图片且名含 cover/封面/首图,或宽高比≈横竖屏封面)、`录屏`(视频且名含 screen/录屏/Screen Recording,或 macOS 屏录默认名模式)、`实拍`(视频非录屏)、`截图`(图片且名含 Screenshot/截屏)、`B-roll`(视频 <30s 且非录屏)。规则表写在 service 常量,可维护。
- **第二层·AI 增强(可选,用户可配模型)**:视觉模型看图/首帧打标签+一句话描述(喂素材匹配与稿面弹药检索)。走 model-config 新 capability `asset.classify`(与 image.generate 同一张 model_configurations 表、同一套用户可配抽象——多模态可配铁律);未配置 = 只跑第一层,诚实不假装。批量倒入时排队慢跑,不阻塞上传。
- 归类结果 = **DB 标签,不移动文件**(文件位置以落盘时刻为准,稳定可预期——用户手动整理文件夹不会被应用打乱)。

### 6.3 与既有素材链路的关系(全复用)

上传:`assets.uploads.create/complete` 既有 op(T-051 修真的 PUT 链);项目关联:`material_links` 既有表;素材匹配消费:`material.match` 节点既有;全局素材中心:保留为管理台(批量整理/回收站),「来源」筛选新增 `制作产物` 值。

## §7 本地文件存储规则

### 7.1 目录树(单一真值:用户可见文件夹)

```
~/CreatorOS/                       ← 根目录,设置页可改(storage_configs 既有表存路径)
  projects/
    <safe-title>-<id 后 6 位>/      ← 如 "用RAG把内部文档变成问答助手-8b4e2f/"
      素材/                         ← 倾倒场落盘处(原始文件,原名保真)
      录制/                         ← 录制工作台产物
      导出/                         ← 成片/发布包导出
  inbox/                            ← 不挂项目的散件(全局素材中心直传)
```

- DB(assets/asset_files)只存**元数据 + 相对路径**(相对 ~/CreatorOS 根,根可迁移)。
- `<safe-title>` 规则:项目标题去文件系统非法字符+截 24 字;标题改名**不追改目录**(目录名以创建时为准,DB 存映射——避免改名级联移动文件的风险)。
- 复用:storage local-fs 模式雏形已有(frontend/src/features/settings/storage-local-fs-plan.md + storage_configs 表 + ObjectStoragePort 抽象 T-013);本节把 Port 的 local-fs 实现按目录规则补全。MinIO/S3 降级为可选后端(Port 抽象保留,默认 local-fs)。

### 7.2 三个标配动作

- **在 Finder 打开**:项目顶条(开项目目录)+ 每张素材卡(`open -R` 定位文件)。实现:本地 server route 调 `child_process`(单机产品,server 与用户同机)。
- **下载 = 复制**:素材卡「保存到…」= 系统保存对话框复制文件(替代 T-051 遗留的「规划中」文案)。
- **素材中心「更多」菜单修正**(吸收 T-056 ⑥):显式菜单项「移入回收站」(危险色+确认),不再叫「更多」。

## §8 知识库 / 经验 / 发布(改造原则,详设计在各切片)

### 8.1 知识库:只读 → 弹药库

- **可写**:全局知识库页 + 稿面弹药区都有「记一条」入口(标题+正文+类型,knowledge.items.create 既有 op)。
- **来源链必填**:`knowledgeItems` 增加来源投影(现有字段够用:source 列已有 manual/mcp/web 语义,补 `sourceRef` jsonb——指向 publicationId/采集批次/URL;渲染「来自你的作品《…》· 46.1 万播放」)。旧数据 sourceRef 空 → 显示「来源未记录」(诚实)。
- **可引用**:对话里 `@知识卡` 检索插入;脚本内引用渲染 chip(§3.1 设计稿样式)。

### 8.2 经验沉淀:管理台不动,消费进创作流

- 编导 AI 的 system 注入本用户 top learnings(creative-context 已有账号画像注入通道,扩 learnings);AI 引用经验时产物卡片标注「基于你的经验《…》」并 `learnings.applications.create` 计数(既有 op)——reuseCount 从此真实增长。

### 8.3 发布中心:表格 → 操作流

- 主视图 = 日历(T-052 已并入)+ 排期条目操作:「登记已发布」(粘贴抖音链接 → 触发既有采集任务挂 aweme_id)→ 数据自动回流。详细交互设计在切片 T-055h 内出小稿。

## §9 退役清单汇总

| 对象 | 处置 | 依据 |
|---|---|---|
| thesis_nodes / evidence_links 表 + 三类 artifact 数据 | DROP + DELETE(不导出) | 用户拍板 ③ |
| planning 三 island(论点树/内容合同/结构方案)+ planning 页 | 删除;路由 301 稿面 | §3.3 |
| research / script / publishing 三阶段页 | 内容并入稿面;路由 301 | §3.3 |
| AdoptCandidateCard + 11 个按钮岛 | 两波退役 → 对话预填+产物卡片 | §5 |
| copilotDeepLink 自动预调 | 改预填不发送 | §5.1 |
| 素材中心「更多」按钮 | 改显式「移入回收站」 | §7.2 |
| MinIO 默认后端 | 降级可选;默认 local-fs | §7.1 |

## §10 现成方案 / OSS 调研(不造轮子对账)

| 需求 | 复用(file:line 级) | 新造 |
|---|---|---|
| 稿面脚本编辑 | TipTap ScriptRichEditor 整体迁入(script-rich-editor.tsx,含 T-024 保存竞态防护) | 无 |
| 段落结构标记 | contentData.sections jsonb 加可选 role 键 | 无迁移 |
| 对话/上下文注入 | ChatBox useChat+ChatContext+surface skill(T-004/T-039);generative UI 通道(T-004 slice2) | 新卡片类型(纯前端组件) |
| 采纳门 | ai.tasks.confirm 各分支 + artifacts.restore 撤销 | 无 |
| 上传链 | assets.uploads.create/complete + 真 PUT(T-051) | dropzone 批量 UI |
| 项目关联 | material_links 表/op | 无 |
| 归类标签 | tags/entity_tags 既有表 | 启发式规则常量 + asset.classify capability(走既有 model_configurations) |
| 本地存储 | ObjectStoragePort 抽象(T-013)+ storage_configs + local-fs plan 雏形 | Port 的 local-fs 目录规则实现 |
| 阶段状态机 | projects.transition(A6) | 无 |
| 发布包 | publications/publication_revisions 全字段已有 | 无 |
| 拖放库 | 原生 HTML5 DnD + input[multiple](现有 asset-upload-button 模式扩展);不引 react-dropzone(单机 Electron-less Web,原生够用,少一依赖) | — |

## §11 实施切片(拆 BACKLOG Task 的依据;每片独立可交付+真机验收)

- **T-055a 稿面骨架**:`/projects/[id]` 重做(选题卡+脚本区迁入+发布包+成熟度条+弹药抽屉读侧);四阶段路由 301;brief 可达。验收:真项目稿面完整渲染,脚本编辑保存往返不回归。
- **T-055b 对话进稿面**:ChatBox 挂右栏;上下文 chip 常驻可摘;预填不自动发(三处按钮第一波退役);字体 14px。验收:点「聊定位」预填不发送、无重复、chip 显示项目名。
- **T-055c 产物卡片**:hook 候选/素材列表/定位建议三类卡;「写入稿面」+撤销系统行。验收:对话里改 hook → 写入 → 脚本区更新 → 撤销恢复。
- **T-055d 本地存储**:目录树落地+「在 Finder 打开」+下载=复制+素材「更多」修正。验收:上传文件出现在 ~/CreatorOS 对应目录,Finder 定位成功。
- **T-055e 素材倾倒场**:制作页 dropzone 批量+确定性归类+项目关联+素材中心「制作产物」来源。验收:一次拖 5 个混合类型文件,全部落盘原名保真、标签正确、素材中心可见。
- **T-055f 退役清算**:thesis/contract 实体+数据删除迁移;planning 页删;第二波按钮退役;AdoptCandidateCard 删除。验收:全测绿+真机四路由 301+DB 无三类 artifact。
- **T-055g 知识库弹药化**:可写入口+sourceRef 来源链+@引用。验收:手记一条→稿面弹药区可见带来源;旧数据显示「来源未记录」。
- **T-055h 第二波增强**:asset.classify AI 归类、经验注入编导 AI+application 计数、发布中心操作流小稿+实现。

依赖:a→b→c 顺序;d/e 可与 b/c 并行;f 在 a 之后;g/h 最后。

## §12 验收标准(整体)

1. 用户反馈八条逐条可指认修复点(§0 映射)。
2. 三仓测试全绿;删除实体后无孤儿引用(codegraph impact 核查 thesis/contract 符号零消费)。
3. 真机走查:新建项目 → 稿面聊出 hook 写入 → 定稿进制作 → 倒 5 个素材自动归类 → Finder 打开可见 → 发布包解锁 → (发布/复盘沿用既有链路)。每步截图。
4. 宪法 §4 修正案同步落 `docs/产品定位.md`(过审后)。

## §13 风险与开放问题

- **R1 稿面单页信息密度**:77 个真项目多为 imported 历史项目(review 态)——稿面对 imported 项目的呈现=复盘导向(脚本区显示重建脚本只读+跳复盘),设计稿画的是创作中项目;切片 a 需处理两形态。
- **R2 删除不可逆**:§4.5 直接删(用户拍板不导出),迁移前照惯例 pg_dump 全库备份一份(backups/,不进 git)——备份是工程动作不是产品功能,不违背拍板。
- **R3 `open -R` 安全面**:server route 执行 shell——单机产品同机信任模型,但 route 必须校验路径在 ~/CreatorOS 根内(防任意路径注入)。
- **OQ1 全局 ChatBox 与稿面右栏的关系**:同一会话历史还是分会话?倾向:同一 ChatContext 体系、按项目分会话线程(thread per project),全局入口 = 无项目 chip 的默认线程。切片 b 定案。
