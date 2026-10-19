# T-1021 CreatorOS 封面与小红书图文双模板库

状态：此前发布合同已独立复核；用户认可并补充宿主为无限画布。画布入口尚未定位，追加接入规则待宿主核对与复核；旧PASS不覆盖本补充。私人收藏保存范围待确认，生产实现尚未开始。

## 用户目标与现状

用户于2026-10-04要求：把已使用多次的封面Skill方法接入画布；参考模板生成封面；收藏提示词和喜欢的风格；提供多种参考图片或生成样图，让用户挑选。同轮追问已明确宿主为CreatorOS的封面编辑区。用户随后指定唯一源码目录`/Users/zyongzhu/Workbase/moonlit-skills/`，补充真人出镜封面不是纯AI封面；明确要求封面制作、小红书图文两个模板库，按行业分类，并通过浏览器研究优秀作品。

用户随后提供画布截图，明确「画布／案例库／资产库」能力关系、生成前可选比例；不要求照搬布局，所有UI统一使用所附oil-ui-pro 0.10.0。项目内Skill与压缩包17个文件逐项摘要一致，复用已有安装与AGENTS统一规则，不另装副本。截图中的DreamOrigin、价格、90天存储与1K/2K/4K只属于参考画面，没有因此成为CreatorOS的新产品承诺。

用户随后明确纠偏：必须结合现有系统的发布功能改，不能另建一个系统。此指令优先于先前独立HTML预览与生成的工作区设计图；这些产物只保留为素材研究，不作为产品UI或新导航依据。

用户看到喜欢的样图，选它，换成本期内容，生成封面；好用的提示词和风格留到下一次。一次实现模板展示、私人收藏、参考生成、候选挑选、下载和项目采纳的完整闭环，不拆分已确认范围。当前先完成可评审方案与样图，不把预览原型称为系统已接入。

```mermaid
flowchart LR
  A[现有项目稿面：发布物料] --> B[做封面 / 小红书图文]
  B --> C[封面库 / 图文库：挑案例与收藏]
  C --> D[编辑本期内容、参考素材和比例]
  D --> E[现有编导与AI执行任务：生成候选]
  E --> F[用户采纳]
  F --> G[现有发布草稿及版本：封面、正文、图片页序]
  G --> H[现有查看物料、下载与排期]
  H --> I[原登记已发布入口与复盘]
```

现状证据：

- 项目发布阶段路由`frontend/src/app/(creator)/projects/[projectId]/publishing/page.tsx`已经退役并跳转`/projects/:projectId#publish`，本任务不得恢复第二套发布页。
- `publish-package-cta.tsx`现有生成入口先flush当前稿、取得真实ContentOutput，再打开常驻编导；已保存物料在同页Dialog查看。全局`publishing-center`负责排期、发布记录及表现投影。
- `publication_drafts`候选采纳已经经Publishing端口保存Publication与首版Revision；正文、标签、封面与platformSettings有正式归属，图文应扩展该版本而非另建Assets图文交付物。
- 当前代码未发现独立封面画布编辑器。`frontend/src/features/draft-workbench/draft-workbench-page.tsx`的发布物料区展示项目封面，生成入口主要在Copilot。
- `frontend/src/features/copilot/chat-generate-card.tsx`已有候选预览、任务回读和采纳；`backend/src/modules/ai/ai.service.ts`对`cover.generate`采纳后按`cover`角色绑定项目。
- `backend/src/modules/ai-runtime/chat-cover-task-host.ts`与`cover-business-adapter.ts`已冻结视觉要求、参考素材及当前稿快照。
- 正式Worker的`backend/src/modules/execution/execution-cover.service.ts`校验原模型回执、准备图片输入并保存参考图摘要。接入不能只改旧`cover-runner.ts`。
- `ai-worker/src/runtime/cover-plan.ts`主要按视频横竖决定封面比例；应新增显式封面比例，与视频画幅分开，保留旧请求默认行为。
- Assets已有上传、签名预览、下载和图片收藏。`favorites`模块负责抖音收藏夹采集，不适合储存封面提示词。

方法研究以`moonlit-skills/skills/moonlit-video-cover`与`moonlit-xiaohongshu`源码为准；已安装`oil-cover`仅作补充参考。封面源Skill默认使用本人真实身份参考；图文源Skill默认单封面加配文，仅有独立步骤、证据或数据才用多图。集成需配置化身份与品牌，通用模板不能固化月明本人、署名、私人路径、密钥或默认模型。

## 双库与行业分类

封面库服务单张主视觉，包含真人出镜、实拍/产品、文字知识、对比结果和AI概念等类型。小红书图文库服务完整笔记，包括首图、正文页、配文和图片顺序，不能把同一封面卡复制改名就算第二个库。图文模板保存可替换字段、首图与正文页角色、统一风格、配文结构；支持单图加配文和有独立信息价值的多页内容。

两个库共用行业筛选，但各自有独立目录、收藏与生成结果。初始行业为：教育学习、科技数码、美妆护肤、时尚穿搭、餐饮美食、旅行户外、家居装修、运动健康、母婴亲子、职场成长、商业服务、宠物生活；保留通用和用户自定义标签。行业标签可多选，是可编辑内容数据；代码只落实用户筛选，不按关键词猜创作类型。真人、实拍、AI概念是另一维度，不是行业。

| 行业 | 封面方向 | 小红书图文方向 |
| --- | --- | --- |
| 教育学习 | 老师真人+知识板、手写笔记 | 步骤教学、清单、错题解释 |
| 科技数码 | 创作者真人+真实界面、产品对比 | 实测步骤、输入输出、功能对比 |
| 美妆护肤 | 本人实拍、真实产品细节 | 使用记录、质地对比、护理笔记 |
| 时尚穿搭 | 真人全身、单品拼贴 | 搭配步骤、场景穿搭、细节解释 |
| 餐饮美食 | 菜品特写、主理人出镜 | 探店记录、制作步骤、点单笔记 |
| 旅行户外 | 人物与真实景色、目的地摄影 | 路线手帐、准备清单、行程记录 |
| 家居装修 | 实景空间、真实整理对比 | 空间案例、收纳步骤、选材记录 |
| 运动健康 | 本人动作、真实训练器材 | 动作分解、训练记录、习惯清单 |
| 母婴亲子 | 真实生活场景、温暖物件 | 亲子活动、成长记录、用品经验 |
| 职场成长 | 专家真人、明确主题大字 | 工作方法、案例拆解、复盘清单 |
| 商业服务 | 服务者真人、实际案例 | 交付过程、问题分析、方案解释 |
| 宠物生活 | 真实宠物、用品细节 | 饲养记录、护理步骤、生活故事 |

此表是模板内容覆盖方向，不代表每格已有经验证的原创图片；没有样图的条目只在方案中出现，不得在产品目录伪装为已可用。首批生成真人横竖示例与教育、美食、旅行、美妆、家居、职场六套多页风格预览，再结合浏览器研究补足行业内容。预览板是一张展示多个页面方向的图，不冒充已生成的独立上传图片。

真人模式先让用户绑定自己的身份照片；本期截图、产品图、菜品、室内与风景可另作内容参考。已有认可风格优先，按手机阅读适配比例。用户的脸和身份优先保持，不能把他人作品的人物当成模板人物直接继承。

小红书默认single_cover（首图+配文），用户可明确选择carousel并编辑页序。模型按当前内容提出有价值的页数与每页任务，用户确认后生成，不固定九图，不因凑数审美规则阻断合法两页作品。正文长度、标签和页数限制是可配置偏好与实际平台当期限制，不能把私人Skill的≤500字、5–8标签及2–18图写成永久公共规格。缺少多页必要内容时建议单图，但不清空已有可用图文。

图文生成复用原任务权与执行账本，在ai/execution体系新增visual.carousel，不新增第二个任务数据库。冻结用户确认的pageDrafts、稿版本与页序；每页模型/图片调用在同一原任务ledger中有独立稳定operationKey与checkpoint，恢复仅执行未完成页。成功页立即可预览，单页失败保留成功页并单独重试，不重复计费生成已成功页。配文作为同一候选快照记录，可编辑，不自动发布；导出按顺序给出实际PNG/JPEG文件与配文，不将三页预览板当成三张成品。生成计划确认与最终采纳均为明确用户操作；从已有候选保存风格只保存实际服务端结果，不能信任模型或客户端伪造来源版本。

## 页面与真实操作

接入点固定为现有项目稿面的`PublishPackSection`与`PublishPackageCta`，即`/projects/:projectId#publish`。保留当前稿编辑器、右侧常驻编导、查看发布物料、登记已发布、排期与复盘路径。新增「做封面」「小红书图文」局部操作，已有物料仍能查看。无发布草稿时先沿现有ContentOutput与发布物料链准备草稿，不因缺模板、收藏或预览阻断原生成。生成前flush当前稿，服务端再次读取归属及版本。

模板选择器在发布物料同页按需打开，使用现有Dialog/Sheet、Button、Tabs和素材选择器；常用参数先显示，复杂图片编辑需要展开时仍处于当前项目与当前发布草稿上下文。按oil-ui-pro的存量项目局部改动路径保留现有品牌、导航、稿面与编导布局；不要求用户重新选一套整页设计。

参考截图的「画布／案例库／资产库」转译为发布物料编辑器里的三种局部内容：当前图片及候选预览、模板与收藏选择、现有素材选择。案例里封面和小红书图文两个库独立，行业只筛案例；资产读取现有Assets当前账号图片并可上传，身份/风格/内容角色明确，不另建资产仓库或全局案例中心。切换局部内容与关闭/重新打开选择器保留当前稿标题、比例、提示词、身份图、页计划及候选；切项目不串用编辑状态。

案例卡片显示真实样图、风格、比例；点选填入当前发布物料的风格要求，不把示例文案覆盖用户本期事实。提示词与整套风格可收藏、筛选、删除。本次生成回读当前项目真实任务；图文以完整笔记候选及页序展示。资产读取错误与真实空态分开，切案例或资产时保留画布当前候选；引用身份、风格、内容角色明确可见。

UI统一使用项目内`.agents/skills/oil-ui-pro/SKILL.md`与`docs/features/t1022-account-group-workspace/UI_RULES.md`，复用`frontend/src/styles/tokens.css`、Noto Sans SC、品牌紫#6d4aff、既有Button/Input/Dialog等组件。不改成参考截图的粉色主题，不新增全局设计系统。方向比较、视觉及任务走查分开记录；原型本地操作不证明后端服务接入。

| 操作 | 实际效果 / 服务绑定 |
| --- | --- |
| 选模板 | 选择真实ID，填入可编辑风格提示词与比例；不调用模型 |
| 选择画幅比例 | 修改生成输入与构图计划；不裁切或拉伸已生成图片 |
| 选用资产作参考 | 原`assets.list/get/getContent`与上传链读取当前归属图片，再明确identity/style/content角色 |
| 收藏提示词 | `assets.visualTemplates.save`保存名称、提示词与比例；不要求图片 |
| 收藏整套风格 | 同一保存操作增加可读取参考图或内置样图引用；不自动改变账号品牌 |
| 上传参考 | 原上传操作→实际字节上传→完成上传 |
| 生成封面 | `assets.visualTemplates.generate`绑定当前项目/ContentOutput/发布草稿，提交原`cover.generate`；候选仍由现有编导展示 |
| 生成图文 | 同一操作以`libraryKind=xhs`提交`visual.carousel`，按明确确认的页计划生成独立图片 |
| 编辑配文与页序 | 新`ai.tasks.visualNotes.patch`保存候选快照并回读；不覆盖项目确认稿 |
| 重试失败页 | 新`ai.tasks.visualNotes.retry`绑定原任务与稳定页ID，只恢复未成功的指定页 |
| 看候选 / 重开面板 | 原`ai.tasks.list/get/results.list`，按项目隔离 |
| 选用这张 | 原`ai.tasks.confirm`采纳图片，Publishing端口追加目标草稿Revision封面，回读当前发布物料；项目cover沿旧绑定，旧版本保留 |
| 选用整套笔记 | 扩展同一confirm操作支持`visual_note`候选，经Publishing端口追加/采纳当前小红书发布草稿Revision |
| 下载整套笔记 | `publications.visualNotes.export`读取归属内已保存PublicationRevision，由Assets原下载端口提供实际图片与配文，不发布 |
| 下载 | 原`assets.downloadUrl`；下载不采纳、不发布 |
| 删除收藏 | `assets.visualTemplates.remove`仅删除私人收藏，不删除图片、项目封面或生成历史 |

用户可以只输入提示词进行普通模式生成；模板、参考图、收藏都不是原有普通生成路径的新门槛。封面一次生成一张，再次明确点击才增加候选；图文按用户确认的页计划执行，并事先显示页数。默认标题从当前确认稿与项目主题提炼，用户可编辑；手写标题不能作为成绩、数字或客户事实来源。模板示例标题只作预览，不进入本期生成输入。

## 首批通用封面样图

全部为本轮原创AI样图，统一示例标题「把灵感变成作品」，方便比较；示意关系卡不冒充真实软件截图或实际成绩。

| ID | 名称 | 视觉方法 |
| --- | --- | --- |
| evidence-cards | 证据卡片 | 暖白、深蓝、铜橙；大标题与清楚关系卡 |
| editorial-type | 杂志大字 | 红底、超大奶白标题、少量主题物件 |
| comparison | 对比结果 | 左右对比、一条路径；真实结果需用户素材 |
| handdrawn-notes | 手绘笔记 | 纸感、手写标题、少量图示与标记 |
| cinematic-desk | 纪实叙事 | 光影、真实物件、简洁大标题 |
| three-dimensional | 立体产品 | 克制立体主物件、醒目色块、少量文字 |

样图和提示词保存到本SPEC同名目录。预览原型可以查看、收藏到本浏览器、下载样图和导出提示词；标明「方案预览」，不呈现未连接的生图按钮。上线后原创位图进入正式静态资产目录，并由真实服务提供模板资源。

参考图继承整体视觉语言，当前稿提供本期事实；不照搬模板中的人、标题、产品、数字或水印。六张通用样图不含人物；另有使用本人真实原图生成的私人真人样例，不能进入共享内置目录。真人模式为必要能力：必须使用用户明确选择的身份照片，绝不能生成陌生人替代。风格参考与身份参考分开。多图适配器不支持时保留身份图作为图生图输入、以模板提示词表达风格，并明确显示未使用风格图；不得丢掉身份图回退成陌生人文生图。

## 契约与数据归属方案

建议私人收藏**按当前创作账号隔离、跨项目复用**，与现有素材归属一致；内置模板只读、各账号可见。该保存范围待用户确认，不推定私人收藏跨账号共享。

在现有`assets`模块内增加封面模板service/repository，backend唯一写库；不新增调度器或模型运行时。私人模板字段：`id / userId / accountId / libraryKind / industries[] / visualType / kind / name / prompt / aspectRatio / references[] / sourceTemplateId? / pageRecipes? / revision / createdAt / updatedAt`。`kind=prompt|style`，整套风格需可读取风格参考或合法内置引用；references逐项标明style/identity/content角色，身份图默认不随公共模板分发。收藏保存自己的提示词快照，不随内置目录更新漂移。

内置目录是版本化内容数据：`id / libraryKind / industries[] / visualType / name / prompt / aspectRatios / previewPath / requiredInputs / pageRecipes? / version / source`。提示词与样图随桌面包交付，不依赖用户电脑的Skill路径与私人API配置。

新增共享contract，在实现前冻结：

- `assets.visualTemplates.list`：GET，`libraryKind=cover|xhs / scope=builtin|saved|all / industry? / visualType?`及分页；返回可见目录、收藏类型、比例和真实预览引用。未选号只显示内置目录；私人读写遵守原账号要求。
- `assets.visualTemplates.save`：POST，`id? / expectedRevision? / libraryKind / industries[] / visualType / name / kind / prompt / aspectRatio / references[] / sourceTemplateId? / pageRecipes? / attemptId`。名称和提示词非空，比例合法，参考图类型/归属有效；同一尝试幂等，更新比较版本，不整表覆盖。
- `assets.visualTemplates.remove`：POST，私人ID、版本与尝试键；不能删除内置目录；重复删除沿原请求恢复，不删除底层素材。
- `assets.visualTemplates.generate`：POST，`projectId / outputId / publicationId? / expectedPublicationRevisionId? / libraryKind / templateId? / templateRevision? / prompt / headline? / aspectRatio / modelConfigurationId? / expectedCapabilityRevision? / references[] / imageMode? / pageDrafts? / captionDraft? / attemptId`。执行前校验项目→ContentOutput→Publication的真实归属及当前Revision；指定publicationId时必须同时有expectedPublicationRevisionId，不能选择别的项目或平台；无发布草稿沿现有草稿采纳链准备而不重复造一条。读取当前确认稿，冻结真实模板版本、编辑提示词、标题要求、比例、参考角色/身份与稿版本；cover复用原封面任务，xhs沿同一ai/execution体系新增图文任务类型，返回同体系任务ID。结果未知时沿同一键恢复，不自动重发新任务。

### 图文候选、编辑、恢复与采纳合同

`visual.carousel`同时支持`imageMode=single_cover|carousel`；前者仅一张首图加配文，后者是确认后的多页计划。新增候选类型`visual_note`：`resultId / taskId / projectId / outputId / publicationId? / basePublicationRevisionId? / accountId / revision / captionRevision / caption / pageOrder[] / pages[] / templateSnapshot / scriptSnapshot`。每页保存`pageId / role=cover|body / planRevision / status=pending|running|succeeded|failed / generatedAssetId? / actualAspectRatio? / lastError? / referenceReceipt`。服务分配稳定页ID与计划版本；页序只引用本候选已有页，不重复ID；首图唯一。成功图片由原模型回执与Assets端口物化，不接受客户端或模型指定任意资产来源。

- `ai.tasks.visualNotes.patch`：POST，`taskId / resultId / expectedRevision / caption / pageOrder / attemptId`。校验原任务、项目、候选归属及现有页ID；仅修改配文和顺序，原确认稿不变；返回完整候选与递增版本。配文版本递增，刷新从服务端候选回读，不依赖前端状态；并发修改409，禁止整表覆盖。
- `ai.tasks.visualNotes.retry`：POST，`taskId / resultId / expectedRevision / pageIds / attemptId`。只允许原候选的failed页，冻结页计划与身份输入不变；只为所选页增加显式重试序号与operationKey，复用该任务执行账本，返回同一taskId/resultId。已成功页不可重生成，运行页不可重复入队；同一尝试未知结果以原键恢复。修改创作内容须发起用户明确的新候选，不伪装为恢复。
- 扩展`ai.tasks.confirm`的结果判别联合：封面维持原`generated_asset`语义；`visual_note`请求增加`expectedRevision / selectedPageIds / attemptId`，要求所选页都成功、首图包含在内、顺序来自当前候选。未全成功时用户可明确选用成功的子集，失败页保留在原候选供恢复，不自动删掉。服务端按实际页资产、配文及页序，经Publishing端口保存不可变PublicationRevision采纳快照；指定原草稿时比较冻结的basePublicationRevisionId，草稿已被编辑则409且保留候选，不覆盖正文。确认同一尝试幂等，绑定项目与当前账号。
- 采纳后沿现有`PublishingService.adoptDraft/createRevision`服务端口保存原Publication与不可变Revision，不新增`assets.visualNotes`表或第二份正式配文。Revision保持`title / description / platformTags / coverAssetId`原字段；扩展共享typed `visualNote`投影为`sourceTaskId / sourceResultId / sourceRevision / imageMode / orderedAssetIds[] / pageReceipts[] / aspectRatio`，持久内容落到既有`platformSettings.visualNote`版本化命名空间。正文只归原description，顺序只归同一Revision，不在Assets重复储存。每个asset经Assets端口校验当前账号与图片类型；AI服务不跨模块写库，Worker不写领域。已有Publication要原位追加Revision，无草稿由原幂等adoptDraft创建；保留旧版历史和非图文设置字段。
- 扩展原Publishing采纳端口`adoptDraft/createRevision`，图文与封面修改携带`expectedCurrentRevisionId / adoptionKey /完整Revision内容`；原旧请求仍走旧兼容分支。完整内容digest覆盖`title / description / platformTags / coverAssetId / platformSettings.visualNote`及需保留的其余设置，不再只覆盖文本。图文采纳在Publishing同一领域事务中锁定归属内Publication、比较当前指针、写不可变Revision并推进currentRevisionId；禁止前置read后调用无expected的旧setCurrentRevision。稳定键从原taskId/resultId/候选Revision及用户确认尝试导出，领域持久唯一键及保存的完整digest保证回执丢失后同键返回原Publication/Revision；同键改内容409，不追加第二版；两候选同一base只能一项CAS成功。原无草稿adoptDraft也扩展到完整图文/封面内容摘要与Revision，用户重试不复制Publication。来源键/回执归原Publishing，不建第二任务或图文数据库。
- 查看/刷新复用`outputs.publications.list`→真实`currentRevisionId`→`publications.revisions.list`，不能取历史第一条当当前版；`PublishPackageViewer`扩展真实封面、独立图片页序、正文、标签与下载。`publications.visualNotes.export`接收`publicationId / revisionId / attemptId`，读取可访问的不可变Revision与真实素材，返回下载资源与顺序清单。ZIP含`01-cover.png`、后续正文图片及`caption.txt`，扩展名匹配真实格式；缺页说明错误且保留原单图下载，不伪造完整ZIP。导出不切发布状态。
- 当前发布中心继续从原Publication/ContentOutput投影草稿、排期与已发布记录；同稿多平台图文的内容类型按已保存Revision的typed `visualNote.imageMode`投影为图文，没有该投影的旧物料继续取原ContentOutput类型；这是读取用户明确采纳的类型而非模型/关键词猜测，不能改写共享视频output或让图文在发布中心仍伪装成视频。排期、登记已发布与平台adapter沿原边界；生成、采纳、下载均不自动调用平台发布。本任务不凭参考截图新增平台直发能力，生产装配无真实adapter时原Unavailable行为保留。

图文首图「另设为项目封面」是独立明确操作，复用原cover绑定；整套笔记仅更新当前小红书发布草稿，不悄悄替换其他平台封面、视频封面或已发布状态。这些扩展需独立复核并冻结共享contract；发布物料业务归属按用户本轮明确指令复用Publishing，不另外建立图文交付物领域。私人收藏范围仍是独立待确认项。

### 明确模式与必要身份输入

生成请求增加`visualMode=real_person|photo_product|graphic|ai_concept`。用户明确选择模式；真人模板的可信`requiredInputs`要求identity时必须选择real_person或明确换用普通模板，不以提示词词语判断真人要求。真人请求必须且只能有一张当前用户选择的identity图，style/content可另有素材，供应商的输入数量与角色能力由真实适配器声明。服务端冻结模式、必要输入和引用角色；无templateId的请求也遵守这一判别。

real_person的identity图缺失、不可读、摘要变化或供应商不支持图片编辑时，不提交任何文生图调用；用户可补图、换可用供应商或明确改为普通模式，保留已有候选。正式execution-cover中catch→null→image.generate回退仅适用于不要求身份的旧普通请求；必要身份的读取错误必须传递为可操作错误。仅style图不可用时可保留identity图、用提示词传递风格并显示未使用风格图；多图不支持时同样保留identity输入。输入照片被使用不代表像素或面貌必然忠实，最终由用户挑选和采纳。

### 生成比例与供应商能力合同

比例是独立明确参数，与视频横竖、样图原始比例、预览缩放和输出分辨率分别存储。常用入口提供`1:1 / 3:4 / 16:9 / 9:16`；更多比例包含`2:3 / 3:2 / 4:3 / 4:5 / 5:4 / 21:9`，候选集合配置化而非平台永久限制。选择比例进入生成请求、构图计划、Worker图片调用、候选回执及收藏快照；切模板、库或资产时不悄悄重置用户明确选择。

扩展原`settings.models.list`的每个图片模型条目，追加可选`imageCapabilities`投影：`status=verified|unknown / aspectRatios[] / maxReferenceImages / supportsImageEdit / capabilityRevision`，数据来自当前真实适配器及配置，不由前端猜模型名，不从参考截图复制能力。不另建模型目录或凭据链。旧客户端可忽略附加字段；能力未知时保留旧请求的供应商默认比例入口，不能假称支持所有比例；提供刷新能力或切模型路径，不封锁原合法默认生成。

当前发布物料沿已有图片模型配置；不为截图额外造模型设置区。若编辑器提供本次模型选择，以原`settings.models.list`返回的真实`modelConfigurationResource.id`提交`modelConfigurationId`，该选择不改全局默认。缺省ID保持旧默认解析路径。Settings的能力投影和任务准入共用backend注入的图片能力端口，原凭据解析保留唯一所有者；不得一个服务显示A能力、另一个服务默认调用B。

backend准入校验真实配置归属及image.generate/image.edit能力，冻结`modelSelectionSnapshot={configurationId?,provider,model,configurationDigest,capabilityRevision,imageCapabilities}`到原任务输入/执行准备；客户端不能自报provider、model或凭据。正式`resolveImageSpec`扩展可选选择快照，Worker、兼容runner及图文页只解析该冻结身份，恢复不被后续全局默认变化改写。缺省旧请求保持当前合法默认及横竖推导，未知能力不能新增拒绝旧请求。

按当前真实能力显示可选比例，不支持项说明原因和可用替代；已有明确比例不兼容时保留选择，让用户明确换比例或当前任务模型，不自动替代。backend回读能力与用户所见expectedCapabilityRevision比较，变化返回409并保留编辑，未调用计费图片；超出verified能力返回422并附允许比例，unknown保留旧默认入口。必要身份编辑遵守上文规则。合同验收增加默认B时明确选A实际调用A、提交后全局默认/前端比例变化不改已冻结任务、恢复仍沿原身份、能力变化不计费四条。

候选记录`requestedAspectRatio? / actualWidth / actualHeight / actualAspectRatio / capabilityRevision / ratioStatus=matched|different|provider_default`。实际宽高由可读图片字节解析，不能信任模型文字。像素取整按有文档与测试的供应商输出容差比较，只检查几何，不选择创作风格；实现处须标明`SEMANTIC_BOUNDARY_ALLOW: 比较用户所选比例与实际像素几何，不进行内容归类或创作选择`。比例不同的候选仍可下载和明确采纳，但显示真实比例与重新生成入口，不称为目标比例成功，不拉伸、自动裁切或丢弃安全结果。图文页统一按确认计划比例生成，预览板的宽比例不能被当作正文页比例。

错误合同：未认证遵守现有401；未选号遵守现有引导；私有资源不存在或越权统一404；版本/引用失效/冻结后变化为409；空提示词、无效比例、非图片引用为422。任务失败仍沿既有状态与人话提示，客户端不得把读取失败当作空收藏。

内置样图经可信目录读取，由Assets端口物化为当前账号参考素材，不接受客户端任意路径或远程URL。私人图通过Assets读字节并冻结摘要；冻结后变化不得偷偷替换。不要求身份的普通请求缺风格图时，用户可明确选择仅提示词并标注「未使用参考图」，保留旧文生图入口；必要身份图禁止此降级，权限/跨账号错误不能当成普通缺图忽略。

## Skill与正式生成链

沿原可配置`cover.brief`与模型设置扩展通用封面方法，不把本机Skill脚本和固定模型塞进前端。用户所选风格是明确视觉要求；语义与构图由Skill/模型处理，代码只校验真实ID、归属、类型、版本、比例、大小、幂等并落实用户选择。不得关键词或字符串相似度替用户选风格。

正式Worker和兼容旧runner均需显式封面比例。最终候选记录模板版本、实际提示词、比例、稿版本和参考图是否进入调用；送入参考图不代表视觉效果一定忠实。AI结果保持pending与候选，点击「选用这张」后backend采纳绑定。收藏不等于采纳，下载不等于发布；生成失败保留先前候选和正式封面。

## 验收与性能

双库验收另外覆盖行业标签筛选、两库收藏不串库、真人身份与风格参考分离、多参考不支持时保留身份图的诚实降级、单图和多图的独立输出合同、成功页保留与失败页恢复、页序及实际导出文件、配文编辑回读。私人真人样例必须从公共目录与分发包排除。

必须覆盖两条完整合同旅程：①三页确认计划→一页失败→编辑配文/页序→刷新同版本回读→只重试失败页→整套采纳→回读当前PublicationRevision并导出独立图片与配文；成功页供应商调用数不增加；同基版双候选并发只一项采纳成功、采纳回执丢失重试返回同一Publication/Revision、同键改封面或图片页序409、旧标题/标签Revision请求仍兼容。②身份缺失、身份读取失败、仅支持单参考编辑的供应商、普通纯提示词四类输入；前两类没有文生图调用，单参考保留身份图，普通请求仍正常生成。

模板面板按需加载缩略图，不调用模型、不阻塞稿面；空收藏显示真实空态并提供收藏/上传入口；读取失败可重试，内置目录及原生成路径仍可用。保存后回读同一ID，刷新名称/提示词/比例/参考图一致。切账号、项目或模板时迟到响应不能回写新对象，列表、选中项、大预览相互一致。链接和按钮共用本地弹层；折叠大对象按需渲染，轮询限制在途请求并阻止卸载回写，运行LED-047。

完整验收包括：收藏CRUD红→绿与真实PGlite持久化，账号隔离/越权/类型/并发版本/幂等；共享contract和旧请求兼容；正式Worker与原公共封面调用链的稿/模板/比例/参考冻结；采纳与下载边界；前端空态/错误/写后读/返回/刷新/重复点击/切项目；正常及最小桌面视口从原发布物料入口真实生成→预览→采纳→刷新→查看物料→下载→原排期/登记入口；boundary、semantic-boundary、orphan、LED-047、pmem sync与reconcile。

新增比例验收覆盖全部10个配置入口的实际请求转译、收藏回读、模板/库/资产切换后保留；模型不支持/能力未知/生成前revision变化/供应商回错比例/像素取整/图文独立页六族输入。旧合法默认请求和不匹配但可下载的安全候选不能被新增比例检查整单阻断。UI按oil-ui-pro存量项目规范留真实项目稿面基线，保留既有方向，从实际组件做局部改动；不用独立HTML或生成的UI图片代替集成。在原稿面走查1366×900、1024窄窗与200%缩放，新增选择器和发布物料Dialog不阻断既有查看、登记与编导。

样图生成与方案评审只证明素材和设计存在，不替代CreatorOS真实供应商、桌面旅程或系统集成验收。具体实现尚须把模板操作绑定正式contract与页面；本轮原型不产生生产数据。

## 本轮纠偏的实现位置

`frontend/src/features/draft-workbench/draft-workbench-page.tsx`：只在现有PublishPackSection接入口。`publish-package-cta.tsx`：保留原生成/查看行为，扩展原位封面与图文编辑。`draft-chat-request.tsx`与`DraftChatRail`：原对话打开与保存协调。`chat-generate-card.tsx`与`chat-publish-package-card.tsx`：复用候选及采纳，不另建AI聊天。`draft-workbench-data.ts`：读取当前发布版本的封面和图文。`backend/src/modules/publishing/`与`contract/src/operations/publishing.ts`：扩展原发布版本及导出；`assets`仅拥有素材与收藏，不拥有第二份发布正文。全局导航、已退役publishing阶段路由与发布中心布局不重建。

## 用户追加：沿现有无限画布承载创作

用户明确认可复用现有发布链，并补充系统是无限画布。创作须在既有画布上承载：封面为画板、图文为带明确pageOrder的页组，模板/收藏/素材为缩放层外按需打开的面板；比例属于生成与导出的明确输入，不属于画布缩放。正式物料仍归已有Publishing版本，画布只引用真实任务、素材与发布版本。平移、移动、缩放不自动修改图文页序、采纳或发布状态；生成完成不抢视口；保留宿主原保存与撤销机制，不新增画布引擎。完整操作与验收补充见[integration.md的无限画布补充](t1021-cover-template-library/integration.md#无限画布补充2026-10-04)。

当前源码分支未定位该无限画布宿主，已询问用户入口/代码位置；此前核对的PublishPackSection是发布入口，不作为画布宿主的替代证据。实施前先绑定实际节点类型、坐标变换、布局保存与发布关联端口；不猜API或将独立HTML当成既有画布。此前`PASS[REV:f0f3fa0ff91b]`仅覆盖追加前的发布合同，本补充尚未复核，不声明生产Gate通过。
