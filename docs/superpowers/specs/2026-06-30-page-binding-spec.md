# CreatorOS 页面约束规格(PAGE_SPEC·制作/知识库/素材 + 横切规范)

> 状态:约束规格(binding)。基于逐控件只读核实(真实代码 onClick 行为 + op 是否落地)。
> **用法**:每个控件有稳定 ID;`处置 ≠ 维持` 的就是一条工作项,实现必须照 ID 落地 + 过验收,**无自由发挥空间**。配套:`2026-06-30-product-workflow-and-triage.md`(飞轮)、`2026-06-30-data-source-pipeline-design.md`(采集)。

## §1 全局不变量(所有页面强制)

- **INV-01 严禁假按钮**:每个控件 ∈ {真做 / 删 / 明确"规划中"}。禁止"看着成功实没做"(如 PROD-21 导出文案、ASSET-13 复制 mock 链接)。
- **INV-02 AI 交互四规范**:见 §2,所有 AI 功能强制。
- **INV-03 数据要真**:展示值必有真实数据源(op/表);无则显式空态/"—",**禁止 fixture 回退**(如 KNOW-08 回退 386、ASSET 空账号回退种子)。
- **INV-04 状态三态诚实**:每页 loading / empty / error 各自真实(空账号见空、断库见错,不伪造 VM)。三块工作台已达标,可作范式。
- **INV-05 布局**:工作台类页面用固定高度独立框滚(选题/校准/定位已是范式)。**知识库、素材中心当前是整页流式滚动**,与范式不一致 → 列为统一项(非紧急)。

## §2 统一 AI 交互规范(横切·最高杠杆)

所有 AI 功能(选题/校准诊断/脚本草稿/素材匹配/copilot/复盘诊断)必须满足四条。底座已在选题落地(`ai_tasks`/`ai_task_steps`/pending 指针/步骤日志弹窗)。

- **AI-STD-01 弹窗 + 实时步骤日志**:点一下 → 居中 Dialog,显示分步日志(第1步…),不是干转圈。
- **AI-STD-02 后台真跑**:任务持久化 `ai_tasks`,fire-and-forget;无 key 报错不假成功。
- **AI-STD-03 关弹窗不杀**:关闭/卸载只停轮询,不取消服务端 task。
- **AI-STD-04 重开可看**:`ai.tasks.list`/pending 指针重连,running 续看、awaiting 进采纳,**不重复调 AI**。

**落地件**:抽 `useAiTask(taskType, input)` + `<AiTaskDialog>`(`AI-CMP-01`),封装 create→poll(getTask+listTaskSteps)→steps 日志→awaiting 采纳→close-survives→reopen。各 AI 入口接它。
**合规现状**:选题 = 全合规(范式)。素材匹配(PROD-04)= ②③④合规、**①不合规**(内联卡无弹窗无步骤日志)→ 接 `<AiTaskDialog>`。校准诊断/脚本草稿/copilot/复盘 = 待逐个核对接入。

## §3 选题卡富录入弹窗(TOPIC-FORM)

「新建选题卡」当前 2 字段(标题/切入)→ 升级为居中 Dialog(沿用审阅弹窗范式),分组录入整张候选卡:

- **TOPIC-FORM-01 基本**:标题\*(必填) · 切入角度
- **TOPIC-FORM-02 核心**:一句话选题 · 目标观众 · 受众痛点 · 核心冲突 · 推荐 Hook
- **TOPIC-FORM-03 结构**:内容结构 · 片长/格式 · 素材依据
- **TOPIC-FORM-04 立项**:风险点 · 立项建议
- **TOPIC-FORM-05 契约**:`candidates.create` body 扩展接受可选 `card`(一步建全卡),或 create 后 `candidates.patch`(已接受 card)。评分由 AI/系统补,不手填。
- 验收:弹窗能录入并落库全部字段,刷新后详情栏完整回显。

## §4 变现中心移除(MONE)

- **MONE-01** 导航去掉变现入口(grep 导航/shell-router 的 monetization 路由项)。
- **MONE-02** 路由 `/monetization` 页隐藏(留代码加 flag 或移走),七步阶段枚举摘掉 `monetization`。
- **MONE-03** Dashboard/复盘里引用变现的卡 → 隐藏或标"规划中"。
- 验收:全站无变现入口、无死链;飞轮其余环节不受影响。

---

## §5 制作工作台(PROD)

路由 `/projects/[projectId]/production`;主岛 `production-interactive-region.tsx`。**关键架构**:控件有"双路径"——`wiring`(项目已 seed)存在则真落库,缺失则退化纯本地 state(刷新丢)。下表判定按 wiring 存在给。

| ID | 控件 | 数据源(op/表) | 判定 | 处置 |
|---|---|---|---|---|
| PROD-01/02 | 模式卡 真人口播/知识演示 | `outputs.production.put`→productions | 真 | 维持 |
| PROD-03 | 模式卡 AI 数字人 | 无 | 假(装饰) | 维持(已 disabled+"即将上线");补 `aria-disabled` |
| PROD-04 | AI 素材匹配「帮我配素材」 | `ai.tasks.create(material.match)`+真 Claude+`materialLinks.create` | 真,**但违反 AI-STD-01** | 接 `<AiTaskDialog>`(补弹窗+步骤日志) |
| PROD-05/06 | 录制脚本面板 / 脚本编辑链接 | `viewModel.scriptLines` / 真路由 | 真 | 维持 |
| PROD-07/08 | 素材分类 tab / 缩略图网格 | 本地过滤 / `materialLinks.list`→`assets.get` | 半/真 | 维持(缩略图占位待真封面) |
| PROD-09/10 | 素材统计 全部/已使用 | `assets.list` 真计数 / 已配数 | 真 | 维持(编造公式已删) |
| PROD-11 | 预览舞台 | 无渲染管线 | 规划中 | 维持(角标+caption 已标) |
| **PROD-12/13** | 预览 播放/暂停/重置键 | 纯前端 setState | 假 | **【修】**`aria-disabled` 不挡 onClick,仍切"播放中"→改真 `disabled` 或去 onClick |
| PROD-14/19 | 录制/导出设置 死值行 | 静态 fixture | 假 | **【修】**标"示例配置"或接真读写,别被当真配置 |
| PROD-15 | 设备检测 | 无 | 规划中 | 维持(已标) |
| PROD-16/17 | 字幕叠加/AI字幕 开关 | `outputs.production.put`→recordingConfig/subtitleConfig | 真 | 维持 |
| **PROD-18** | 字幕「预览字幕效果」 | 无 | 假(死链) | **【修】**去 `href="#"`,标"(规划中)" |
| **PROD-20/21** | 导出视频按钮 / 结果文案 | `productions.exports.create`+`complete`+fan-out | 真(wiring)/假(无 wiring) | **【修】**文案吹"导出到本地草稿包"(实为 mock 渲染)→改实;无 wiring 不显纯成功 |
| PROD-22/23 | 时间线面板/章节卡 | `viewModel.timeline` | 半 | 维持(角标"剪辑渲染规划中"已标) |
| **PROD-24** | 「添加章节」 | `productions.segments.create`→production_segments | 真(wiring) | **【修读侧】**读侧 `production-workspace-data.ts` 未读 `listSegments`,落库后刷新不回显 → 补读 |

## §6 知识库中心(KNOW)

路由 `/knowledge`;主岛 `knowledge-interactive-region.tsx`。写侧三件套全真,读侧 4/5 指标真。

| ID | 控件 | 数据源(op/表) | 判定 | 处置 |
|---|---|---|---|---|
| KNOW-01/02/03 | 搜索`?q=` / 类型chip / 行选中 | 纯前端 filter | 真 | 维持 |
| KNOW-04/05 | 新建知识 + 表单保存 | `knowledge.create`→knowledge_items | 真 | 维持(5 枚举与契约一致) |
| KNOW-06/07/09 | 指标 条目数/本周/复用片段 | `knowledge.list` 真派生 | 真 | 维持 |
| **KNOW-08** | 指标 知识关联 | `knowledge.relations.list` | 半 | **【修】**空账号回退 fixture `386`→改真 `0` |
| KNOW-10 | 指标 记忆命中率 | 无 | 真(诚实置空) | 维持("—"+"规划中",禁渲 78%) |
| KNOW-11/14/15/16/17 | 分类面板/记忆洞察/未整理/复用片段/知识图谱 | `knowledge.list`/relations 派生 | 真/半(inert 展示) | 维持;"归类/插入脚本/采纳洞察"属未做增量 |
| KNOW-12 | 添加修订 + 保存 | `knowledge.revisions.create`→knowledge_revisions | 真 | 维持 |
| **KNOW-13** | 热门标签 chip 链接 | `taxonomy.tags.list` 真 | 半 | **【修】**chip 跳 `?tag=` 但无人消费(死参)→route 接 `?tag=` 过滤,或降级 inert chip |
| KNOW-18 | 整页状态机门控 | `knowledge.list` | 真 | 维持(三态诚实·范式) |
| **KNOW-X(对接)** | basis=knowledge 喂选题 | creative-context 拼 `knowledgeBrief` 真,但 `topic-task-adapter.ts:70` 只透传 positioningBrief | **半通** | **【修=Sfix】**V2 适配器把 knowledgeBrief/signalsBrief/learningsBrief 透传进 `runTopicTask` + ai-worker 节点 prompt 拼接 |

## §7 素材中心(ASSET)

路由 `/assets`;主岛 `assets-interactive-region.tsx`。**活绑定锚点**`persistence-client.ts:919-958`:运行态(非 vitest)默认 local-fs,字节真落盘。

| ID | 控件 | 数据源(op/表) | 判定 | 处置 |
|---|---|---|---|---|
| ASSET-02/03/04 | 类型窄栏`?type=` / 计数 / 卡选中 | `assets.list` 真 | 真 | 维持(假分类行已删) |
| **ASSET-01** | 工具栏搜索 | `assets.list`(无 server q;前端在已读页过滤) | 半真 | **【修】**给 `assets.list` 加 server 端 `q`,下沉过滤;暂留则文案标"仅当前已加载内搜" |
| **ASSET-05** | 卡缩略图 MediaPreview | `thumbnailToken` 派生 SVG,**从不加载真字节** | 假 | **【修】**image/video 用 signed GET URL 作 `<img>/<video poster>`;SVG 留作 audio/doc/fallback |
| **ASSET-06** | 分页 | `assets.list` 真分页 | 半真 | **【修】**读侧写死 `page:1,pageSize:200` 再前端切片→透传 URL `?page/?pageSize` 重读,去 200 上限 |
| ASSET-07/08/09/10 | 详情面板/元数据/标签/使用记录 | `selected`+`assets.usage.list`+`projects.list` | 真 | 维持(面板禁改弹窗) |
| ASSET-11 | 详情 收藏 | `assets.favorite.toggle`→isFavorite | 真 | 维持(可补收藏筛选入口) |
| **ASSET-12** | 详情 下载 | `assets.get`(无 URL 字段);handler 无副作用 | 假 | **【修】**扩 `assets.get` 加 `downloadUrl` 或新增 `assets.files.signedUrl`;service 已有 `getSignedUrl`(S3 presigned / local-fs token URL);前端 `<a download>` 触发 |
| **ASSET-13** | 详情 复制链接 | handler 硬编码 `mock://…` | 假 | **【修】**同 ASSET-12 取真 signed URL 写剪贴板,删 `mock://` + "规划中"文案 |
| ASSET-14 | 详情 移入回收站 | `assets.trash`→deleted | 真 | 维持(可补回收站视图/restore 入口) |
| ASSET-15 | 详情 附到项目 | `materialLinks.create` | 真 | 维持 |
| **ASSET-16** | ＋上传素材 | `assets.uploads.create`→PUT `/api/v1/blob/?token`→`uploads.complete` | **运行态真**(local-fs/s3 真落盘;vitest mock 才"规划中") | 判定更新为真 + 配合 ASSET-05 缩略图消费真字节 |
| **ASSET-17** | 存储空间卡 | 已用=Σ真字节(弱真);总额度=fixture;"自动同步已开启"无依据 | 半真 | **【修】**总额度接 quota/statfs 或删;删"自动同步已开启"假文案 |

---

## §8 跨页"待修"工作项汇总(可执行·按波次)

**第 0 波(去误导·低成本·守诚实)**
- PROD-12/13(播放键真禁用)、PROD-18(去死链)、PROD-21(导出文案纠偏)、PROD-14/19(设置标示例)
- KNOW-08(关联空账号显 0)、KNOW-13(`?tag=` 接或降级)
- ASSET-17("自动同步"假文案删 + 总额度纠正)、ASSET-16(判定校正为真)
- MONE-01/02/03(变现移除)、TOPIC-FORM(富录入弹窗)

**第 1 波(横切·高杠杆)**:AI-CMP-01 `useAiTask`/`<AiTaskDialog>` + 各 AI 入口接入(先 PROD-04 素材匹配补①)。

**第 2 波(读侧/真做·中成本)**
- KNOW-X(=Sfix:V2 透传 briefs,让 basis 真生效)— 飞轮关键
- ASSET-12/13(下载/复制真 signed URL)、ASSET-05(缩略图真字节)、ASSET-06(真分页)、ASSET-01(server 搜索)
- PROD-24(时间线读 listSegments 回显)

**暂缓(高成本·诚实标规划中)**:PROD-11 实时预览、PROD-22 真实剪辑 NLE、KNOW 右栏 inert 动作(归类/插入脚本/采纳洞察)。

## §9 验收原则

- 每个 ID 的"处置"落地后过其"验收"一句;`【修】`项全清。
- INV-01..04 全站零违反(无假成功、无 fixture 回退、三态诚实)。
- 所有 AI 功能过 AI-STD-01..04。
