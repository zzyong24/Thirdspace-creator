# 项目两阶段化:脚本(稿面)→ 复盘

> **文档状态：已被取代（2026-07-15）**。本文件只保留 T-076 的历史决策背景，不再代表现行产品形态。当前代码已恢复受控制作/渲染工作面；现行口径以 [`docs/产品定位.md`](../../产品定位.md) 和 [`docs/CreatorOS-module-and-workflow-map.md`](../../CreatorOS-module-and-workflow-map.md) 为准。
>
> **不要据此开发**：其中“两阶段”“删除 production 前端”“未来才恢复生成能力”等结论均已失效。

> SPEC 日期:2026-07-03 · 任务:T-076 · 状态:✅ PASS(2026-07-03 MiniMax cross-family 审,2 minor 已内联 [gate-F1/F2])——可开工
> 用户裁决原话:「就分两个阶段,一个是脚本阶段,另外一个就是复盘阶段。拍摄相关的代码全部删掉。发布的话暂时先不改……因为我们这个 agent 大概率不负责剪辑。但是后面可能要加上拍摄和发布(录制/生成)这两个阶段,先按两个阶段来。」并确认:T-075 统一阶段条方向对、稿面 UI 认可,痛点是 6 阶段与实际工作流「割裂」。

## §0 第一性依据

单人口播创作者的真实工作流就两个认知状态:**「我在做这条内容」**(选题+写稿+备素材+发出去,全部发生在稿面)和**「这条内容表现如何、学到什么」**(复盘)。研究/策划/拍摄是团队工种切分,不是他的状态切分——研究素材进弹药区、策划进选题卡、发布是稿面上的一个动作(登记+盲预测,T-063c/e 已落)。六阶段条与稿面并存的「割裂感」(用户三次反馈的双导航)根源即在此。

## §1 目标形态

- **项目 = 两阶段**:`script`(稿面,含选题卡/脚本/弹药/发布包)→ `review`(复盘)。
- 阶段条 6 项 → **2 项(脚本 | 复盘)**,稿面与复盘页共用同一套(T-075 的统一机制保留,只收敛项数)。
- 打开项目:currentStage=review(含 imported)→ 复盘页;其余一律 → 稿面。
- **拍摄(production)前端全删**:路由 `/projects/[id]/production`、production-workspace feature、入口/深链/文案。后端 production/segments 模块与 ops **保留不删**(gate-F3 契约零删除;数据无害;将来「拍摄/生成」阶段回归时复用)——SPEC 留痕:自本片起无 UI 调用。
- **research/planning 路由降级**:不在阶段条,路由暂保留(301 → 稿面),feature 组件保留(弹药区/选题卡已承载其职能);material.match 等制作类 AI 入口随 production UI 一并撤。
- **发布不动**:发布中心页、稿面发布包区、排期,全部现状保留。发布不是阶段,是稿面上的动作。
- **阶段枚举与状态机**:`ProjectStageName` 枚举值保留(DB 里存量 currentStage 有各阶段值,不迁移数据);展示层映射:brief/research/planning/script/production/publishing → 「脚本」段,review → 「复盘」段。`transitionProjectStage` 保留(稿面「定稿」按钮语义改为「进复盘」?否——定稿按钮改为「登记发布后自动可复盘」的自然流,主行动简化见 §2)。

## §2 稿面主行动简化

原「定稿,进制作 →」指向已删除的制作台。改为按状态 [gate-F1]:**未发布 → 顶条不渲阶段跳转主行动**(此态的可执行入口就在稿面内:脚本编辑、发布包区「先盲预测」「登记已发布」,顶条只留「在 Finder 打开」);**已登记发布 → 顶条主行动「看复盘 →」**(href=/projects/[id]/review)。阶段条本身可点(review 段登记发布前禁点或点击落稿面,按现有 stepper gating 惯例)。

## §3 未来扩展(用户预告,本片不做)

「拍摄(录制)/发布(生成)」两阶段待 agent 具备录制/剪辑/生成能力时加回:阶段条数据驱动(常量表),加阶段 = 加一行配置 + 对应工作台;production 后端模块届时复用。**本片不预留空壳 UI(YAGNI)。**

## §4 宪法修正案 §4(过审后写入)

> **§4 生产流水线(2026-07-03 修正案)**:项目主干 = **脚本(稿面:选题/脚本/素材/发布动作一体)→ 复盘(数据对照/经验沉淀)** 两阶段。研究/策划/制作不再是独立阶段(其职能由稿面的选题卡、弹药区承载);发布是稿面上的动作而非阶段。未来 agent 具备录制/生成能力时可扩展「拍摄/生成」阶段。(原七步表述存档于 git 历史。)

## §5 改动清单

1. shell-router:PROJECT_STAGES 6→2(script 脚本 / review 复盘);buildProjectStages 映射旧 stage 值;resolveWorkspacePrimaryAction 收敛。
2. 删 frontend production:app 路由目录、features/production/**、所有入口(project-href/成熟度残留/dashboard todo 深链的 production 分支→稿面)、chatbox material.match 工具白名单撤(ai-worker 模板保留)。
3. research/planning 路由 → redirect 稿面;project-href:全部非 review 阶段 → 稿面,review → 复盘页。
4. 稿面主行动按 §2;「定稿,进制作」按钮退役。
5. 测试全链同步(shell/stepper/href/production 测试删/dashboard 深链断言);gate-F3:contract 测试确认 ops 零删除。
6. 真机验收:阶段条 2 项且稿面/复盘一致;/projects/[id]/production 301 落稿面;登记发布后主行动变「看复盘」。

## §6 验收标准

1. 项目内只有一套 2 项阶段条(脚本|复盘),稿面与复盘页一致。
2. production 前端零残留(grep production-workspace 0 命中于 frontend 非测试);后端 ops 完整(contract 98 绿)。
3. [gate-F2] 行为链逐步断言:稿面保存一版脚本(versionCount+1)→ 点「先盲预测」创建 calibration.diagnose 任务(DB ai_tasks 可查)→ 粘链接「登记已发布」(publications 落 status=published+external_id)→ 顶条主行动变「看复盘 →」→ 点入复盘页 PredictionComparisonSection 渲染该发布对照(或诚实空态)。
4. 三包测试全绿;真机截图归档。
