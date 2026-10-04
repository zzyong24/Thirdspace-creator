# T-1021 封面与小红书图文双模板库

## 需求、授权与实际宿主

用户要求在 CreatorOS 现有无限画布结合原发布功能接入两套模板库，按行业分类，可收藏提示词和风格，支持真人照片及多种生成比例。用户认可复用原发布链，2026-10-04明确“开始执行”。本任务沿 `codex/creator-canvas@de031bc3` 的真实 `/canvases/:id` 实现，不新增画布引擎、全局导航或发布系统。原主目录保留其他任务修改，新实现工作区为 `cover-template-library`。

原评审 `f0f3fa0ff91b` 不覆盖发现后的宿主合同。本文替代旧的独立发布编辑器与 `visual.carousel` 新任务设计，采用已存在的 `canvas.node.generate → asset.generate`，完整需求在同一任务内完成。原评审与素材研究保持历史来源，当前原生宿主补充独立复核。

## 用户可见流程

1. 从原稿面“创作画布”入口进入关联项目的原画布，或打开既有账号画布。
2. 缩放层外的“案例库”抽屉包含“封面制作 / 小红书图文”；行业与视觉方式是目录标签，由用户选择，不替用户猜行业。
3. 选模板、查看大图与可编辑提示词。真人风格要求明确选择自己的图片，普通图文可使用纯提示词。用户可保存提示词或整套风格到“我的收藏”，沿原素材体系按当前用户/创作账号隔离、跨项目复用；页面明确当前收藏账号，遵守宿主既有归属，不跨账号共享。
4. 填本期标题与内容、配文，选比例，选单张或模板多页计划，按“放入画布”生成普通节点与页组；仅创建可编辑计划，不调用模型。页组标题、配文、页序均可编辑。画布缩放与坐标不改变页序。
5. 用户点击页组生成，先保存完整页组与稳定尝试键，再逐页调用原画布生成接口；展示每页原任务的真实状态。成功页保留，失败页明确重试，刷新后按同键恢复未知提交，不重新计费成功页。删除节点不删除任务历史，生成不抢视口。
6. 预览候选、下载或保留到素材库沿原行为。用户明确选择结果、目标稿与发布平台，点击“用于发布物料”，经原 Publishing 服务建立/更新草稿版本；不会自动发布、替换项目视频封面或修改其他平台。
7. 原发布物料查看器显示当前版本的封面、图文页序、正文及下载；可导出独立图片和配文，继续使用原排期与登记发布入口。

```mermaid
flowchart LR
  A[原稿面 / 既有画布] --> B[案例库与私人收藏]
  B --> C[当前无限画布：封面节点 / 图文页组]
  C --> D[原生成任务：逐页候选]
  D --> E[用户挑选并用于发布物料]
  E --> F[原发布草稿的新版本]
  F --> G[预览 / 下载 / 原排期与登记]
```

## 数据归属与兼容

- 内置目录为版本化内容数据，随产品交付。公共原创样图、提示词、行业、视觉模式、比例、每页配方可读取；三页预览板只作为风格预览，实际生成是三张独立图片。私人真人样图不分发。真人模板使用普通示意预览和身份输入要求，绝不夹带用户肖像。
- `assets` 只拥有图片文件及私人模板收藏；收藏保存当时的完整提示词、比例、引用角色与页配方快照，不随公共目录更新漂移。不新增发布正文存储。
- `creative-canvas` 拥有画布文档、用户编辑计划及原生成来源账本。文档 `schemaVersion=1` 增加可选 `visualGroups`，旧文档缺省兼容。保留节点、连线、尺寸、viewport、撤销与编导候选操作的完整往返。更新节点/编导操作不得静默删除页组。页组已引用节点被删除时对应页从组中清除，空组删除；页组变更通过原 save CAS 和撤销，执行状态只由原 links/tasks 投影，异步任务不得写文档版本。
- 每组包含 `id / name / libraryKind / aspectRatio / caption / pageOrder(nodeIds) / templateSnapshot / generationAttempts`。每页ID就是稳定节点ID，必须为已有图片/图片生成节点，同组不重复且不能跨组复用；页序首项为封面。`generationAttempts` 保存已授权的节点→attemptId，只用于重放同次提交，修改提示词/身份/比例后必须显式新生成。文档保存校验范围、真实引用及必要身份。无组的原节点生成完全兼容。
- `Publishing` 是正式配文、封面、图文顺序和采纳回执的唯一领域。图文投影落既有不可变 `PublicationRevision.platformSettings.visualNote`，caption 落 description，首图落 coverAssetId；不改原 ContentOutput 内容类型。发布中心读取当前版 typed visualNote 决定图文显示，不按文本猜测。
- 项目关联不是授权快照：发布当下重新核对当前画布→目标项目→output→publication/平台，用户明确目标后才能采纳。未关联项目的原生成保持 `task.projectId=null`。账号切换后迟到读写结果不能回写新对象。

## 共享合同

### 收藏

新增 `assets.visualTemplates.list/save/remove`，共享 Zod 和原 contract client。list 支持 libraryKind/scope/industry/visualMode 分页；builtin 可无创作账号，saved 必须有当前账号，读取失败显示错误不能假装空收藏。save 支持 id/expectedRevision、完整快照与 attemptId；新建/更新有持久幂等摘要，更新CAS，重复键改内容409。remove 按ID/expectedRevision/attemptId，软删快照并保留幂等回执，不删除素材。内置项不可写；各引用经 Assets 端口校验当前用户、账号、图片、文件版本。identity 默认仅保留私人ID不分发。错误沿原认证/归属404/冲突409/输入422。

### 生成、比例与真人

扩展原 `canvas.capabilities` 的每模式可选 `aspectRatios`，仅从真实适配器声明生成。常用四项1:1/3:4/16:9/9:16，更多2:3/3:2/4:3/4:5/5:4/21:9；不支持项禁用并显示原因，能力未知保留原默认请求。切模板/库/资产不重置用户已选比例。用户所选比例进入节点、原任务冻结输入与收藏，画布zoom和节点UI尺寸不参与生成比例。

图片节点新增可选 `visualMode=real_person|photo_product|graphic|ai_concept / templateId / templateVersion`。真实模板要求identity或明确real_person时必须使用image_to_image与当前用户选择referenceAssetId；缺图、读失败、摘要变化或不支持编辑均不能调用文生图。只有身份图进入当前单参考适配器，风格由提示词表达，界面明确此行为；不冒称参考图数量支持。原普通纯提示词仍可生成，旧未知能力默认入口不被新规则封死。

页组生成复用原 stable-attempt 预留和 task inputJson 机制，不造第二个调度器。每页授权先落文档；一页提交失败保留已提交页，恢复读原link，未知结果同键恢复，不自动重发。失败任务使用已有execution重试命令（适用时）或用户明确新attempt的原节点接口，恢复时冻结原输入；节点内容已编辑则只允许明确“再创作”，已成功/在途页拒绝“失败恢复”重新生成；修改内容的“再创作”仍允许作为明确新候选。过期结果显示其原节点输入版，不覆盖当前选定页。可选成功子集采纳必须用户明确，首图包含且序来自当前组。

候选展示实际图片尺寸与目标比例，供应商回错比例仍可下载与明确采纳，不拉伸/自动裁切。几何检查只比较用户所选比例与图片真实像素，不做风格选择，标注 `SEMANTIC_BOUNDARY_ALLOW` 并验证取整容差。

### 发布采纳与导出

新增 `canvas.material.adopt`，输入 `canvasId / expectedRevision / groupId / outputId / publicationId? / expectedCurrentRevisionId? / platform / title / selections[] / attemptId`。selections 每项 nodeId/taskId/resultId（生成节点）或 nodeId（用户原图）；assetId不得由客户端自报。

服务端按当前归属文档核对组、页序及所选节点；生成结果必须联合校验原 canvasGenerationLink、task.canvasOwner、原 aiTaskResults 的真实asset、inputRevision与结算回执，不能只信缓存resultAssetId。同账号任意图片不能冒充生成结果。用户原图则使用节点冻结fileId/checksum经Assets核对。复用原generated_asset确认端口激活候选，不绕过原费用与归属校验。

Publishing 新增领域内端口，含 `expectedCurrentRevisionId / adoptionKey / 完整版本内容`：事务锁定Publication归属、对当前指针CAS、插入不可变Revision并更新指针。持久唯一键与完整规范化digest覆盖标题、正文、标签、封面、页序、来源回执及保留的其他设置；回执丢失同键返回原版，同键改内容409，两候选同base只一项成功。指定publicationId时expectedCurrentRevisionId必填，已有草稿原位追加；无publicationId时只允许用户明确“新建草稿”，复用adoptDraft并扩展完整摘要与首版字段，原子唯一键返回同一Publication；界面先列出当前output/platform已有草稿并默认让用户选定，不能自动无CAS覆盖。不得调用旧无CAS setCurrentRevision模拟原子更新。原title/description/tags createRevision 请求保持兼容。

激活素材后Publishing CAS失败，素材保留为真实可用候选，草稿不变，操作显示冲突；重试沿原采纳键，不宣称整组成功也不重复创建版本。任务终态、图片文件冻结与其他平台设置均保留。

返回真实 publicationId/revisionId。原查看器按currentRevisionId读当前版，不能用历史首项。导出读取指定不可变版、真实图片文件，生成真实格式扩展名及配文文件；缺失项明确错误，保留单图下载，不伪造完整包。排期与平台发布沿旧边界，当前Unavailable publisher不改。

## UI与性能

使用用户指定 oil-ui-pro 0.10.0，保留原品牌色、字体、组件、导航、InfiniteCanvas引擎与工具层。案例/收藏在固定屏幕抽屉内；原素材库保留；页组编辑器与参数抽屉共用空间，小窗一次只开一个主面板，比例控件不随画布缩小。模板缩略图lazy加载、打开库不调用模型；保存后回读，空/加载/失败/冲突有真实状态。原可见性轮询限制在途并防卸载回写。链接与同页按钮共用本地弹层，运行LED-047。

行业目录至少涵盖通用、教育、科技、美妆、穿搭、餐饮、旅行、家居、运动、母婴、职场、商业、宠物，允许多行业标签；目录标签由内容配方与用户选择，代码不推断语义。真人模板与产品实拍模板必须在公共目录中可选。

## 验收合同

- 收藏真实PGlite持久CRUD、分页与账号隔离、参考归属、CAS、未知回执同键恢复、删后重试、内置不可变；先红后绿记录当场证据。
- 旧schemaVersion1无页组完整回读；新增页组移动/缩放不改页序、撤销和编导更新保真；删除页与组无悬挂引用。
- 三页计划→一页失败→配文/页序编辑保存刷新→只恢复失败页→选定结果采纳→回读currentRevision并导出独立图片与配文。成功页调用不增加，未知请求同键恢复。
- Publishing完整公共调用链并发CAS、跨账号/跨项目/任意task/result伪造、稳定键复放和改内容冲突、旧Revision请求兼容。素材激活后版本冲突保持安全状态。
- 真人缺图、不可读身份、编辑不支持、单参考、普通纯提示词输入族；前两项不提交文生图。全部比例入口与实际provider参数、收藏保存、切模板保留；未知能力及供应商错比例保留安全结果。
- 原生UI在1366×900、1024窄窗及200%缩放走真实入口、收藏、模板放入当前视野、页组生成/编辑/恢复、预览采纳与原发布查看下载；独立视觉与任务评审。生成图片或静态HTML不替代原生UI证据。
- contract/backend/frontend相关测试及typecheck、boundary、semantic-boundary、orphan、LED-047、pmem sync与reconcile。既有全局欠债单列不得冒称全绿。真实供应商/安装版无连接时记待验证，不能编造成功。

## 证据与现状

公共样图与Skill研究见本任务目录；真人私人样图排除。实际宿主入口和服务见T-993/T-994，不再要求用户重新指出已定位的入口。实现与当场验证持续记录在 `docs/verification/t1021-template-library.md`；未通过全部范围不得完成任务。
