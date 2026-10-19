# T1300 功能与性能验收矩阵（锁审输入，执行尚未开始）

用户反馈是选择Codex后无法正常对话或执行功能。本矩阵把**每键配置/冻结断言、每独立协议族真实模型、每公开功能实际操作**分开记录。共享模型族样本只证明同一协议，不能代签不同用户功能；同一run可复用多个真实动作证据，但每项须给具体action/task/call/产物，不能只填run目录。现阶段全部执行结果待验，历史PASS不迁作当前PASS。

来源盘点与消费者位置见`CODEX_RUNTIME_MATRIX.md`，本文件负责本轮结果。text/structured随text槽，vision/image分别有独立选择；仅选text=codex不代表所有族都选Codex。video/ASR保原来源，embedding停用，TTS未找到现役通用消费者而非已测不支持。第三方依赖缺失须记录真实拒绝和阻断，不能冒外部采集或发布成功。

## 环境、配置与可安装候选

| 项目 | 必要绑定/检查 | 当前事实/结果 |
| --- | --- | --- |
| 当前源码 | HEAD、dirty、实际build输入与bundle/hash | 初始4eb101161；新候选未构建 |
| 已安装版 | 文件hash→可信delivery/attestation→source→是否含修复；不能确定写UNKNOWN | `INSTALLED_SOURCE_IDENTITY.json`已只读核binary/sidecar双hash对应8bbbe79d，缺b6ef3314f；不是普通聊根因证明；未操作现用App |
| 新隔离production/安装候选 | 必含T1298及本轮改动；HEAD/manifest/attestation、binary/sidecar/包hash、实际端点、公共run一一绑定；最终可安装包供Root审查 | 必须交付，尚未构建/启动，不改正式安装位置 |
| 公共设置CFG | 六槽PUT→GET、revision/CAS、刷新/跨窗/切组；真实capability/readiness与冻结route一致；不静默fallback | 待执行 |
| AVAIL/ROUTE | 登录/未认证、错误账户/不支持真实分类；主/子来源组合与旧冻结任务保持原authority；不保存凭据/不重发unknown | 待执行 |

## 每个公开功能的实际旅程

表中S/N等族码沿B消费者索引；HOST指无独立模型的宿主工具，LOCAL为确定性输出。一个条目含数个实际操作时，每操作分别给结果，不能一项成功将整行签PASS。仅存在内部子步骤/已退役的入口要附源码可达性证据，继承同一真实consumer结果；不得为测试恢复已删控件。外部依赖阻断项可记录准确拒绝，不能签生成/采集成功。

| ID | 独立用户功能/实际入口 | 协议族与能力 | 必须发生的结果 | 配置/冻结断言 | 族真实模型 | 各公开操作结果 |
| --- | --- | --- | --- | --- | --- | --- |
| U01 | 普通文字对话 | CHAT；text:copilot.assist | 公共输入→真实回复→多轮/刷新历史；普通聊天故障独立核，不据旧包差异先定根因 | 待验 | 待验/适用性核 | 待验 |
| U02 | 图片附件对话 | CHAT；vision:copilot.assist | 真实owned图片附件→实际vision来源→可读回复；不将只选text误作vision已配 | 待验 | 待验/适用性核 | 待验 |
| U03 | 选题聊天/画布 | C；text/vision:topic.generate | 实际选题页面上下文、带图适用路径、消息和候选读回 | 待验 | 待验/适用性核 | 待验 |
| U04 | 选题生成 | S/N；structured:topic.generate | 公开生成操作→业务候选/选择；ordinary子节点另核parent route | 待验 | 待验/适用性核 | 待验 |
| U05 | 每日选题 | S；structured:topic.generate | 新owned调度/合法执行上下文→实际daily准备及候选；不重发旧任务 | 待验 | 待验/适用性核 | 待验 |
| U06 | 选题补全 | S/N；structured:topic.enrich | 实际选题补全输入/候选；子节点需其真实回执 | 待验 | 待验/适用性核 | 待验 |
| U07 | 选题偏好 | S；structured:topic.preference | 原偏好操作与归属，不用文字聊代签学习结果 | 待验 | 待验/适用性核 | 待验 |
| U08 | 校准聊天/诊断/评分 | C/S/N；text/vision:calibration.diagnose；structured:calibration.diagnose/score | 聊天、诊断任务、评分操作各给实际证据与输出；三者不互签 | 待验 | 待验/适用性核 | 待验 |
| U09 | 定位聊天与生成 | C/S/N；text/vision/structured:positioning.generate | 实际定位入口→确认/保存；聊天及结构化结果分别记录 | 待验 | 待验/适用性核 | 待验 |
| U10 | 脚本生成及开场工具 | S/N；structured:script.draft；text:script.hooks/script.draft | 真实脚本pipeline与聊天hooks/draft子工具分别操作；原稿保存/精确读回 | 待验 | 待验/适用性核 | 待验 |
| U11 | 脚本一键公众号 | HOST；text:copilot.assist；work.creation.read/propose | 从脚本实际入口生成文章候选→采纳刷新；脚本/图文不变 | 待验 | 待验/适用性核 | 待验 |
| U12 | 脚本一键图文 | HOST；text:copilot.assist；work.creation.read/propose | 从脚本实际入口生成图文候选→采纳刷新；脚本/文章不变 | 待验 | 待验/适用性核 | 待验 |
| U13 | 公众号重组和局部校正 | HOST；text:copilot.assist；work.editor.read/propose | 重组首次autoSend与手动校正分别真实生成→来源读取/预览/采纳/刷新；原稿与另平台不变 | 待验 | 待验/适用性核 | 待验 |
| U14 | 图文重组和局部校正 | HOST；text:copilot.assist；work.editor.read/propose | 完整图卡/图片/正文；重组与明确校正均实际操作，原稿/文章不变 | 待验 | 待验/适用性核 | 待验 |
| U15 | 制作视频助手/粗剪/精剪 | HOST/S；text:copilot.assist；structured:script.draft | 原片/逐字稿→必要试听门→模型候选→预览/采纳/保存/刷新；native state与版本不变 | 待验 | 待验/适用性核 | 待验 |
| U16 | 原多阶段视频决策 | V/S；structured:video.scenes/cards/broll/subtitles/director；material.match | 实际合法原视频流程调用所需阶段，逐阶段身份/输入输出；不为目录强制多跑不需要的阶段 | 待验 | 待验/适用性核 | 待验 |
| U17 | 确定性视频导出 | LOCAL；不新增模型路由 | 真实MP4解码/画面/音轨/时长；模型任务成功不等于媒体成功 | 待验 | 待验/适用性核 | 待验 |
| U18 | 脚本审核 | S/工具提交；structured:default；review.script | 实际审核操作/原事务提交；审核建议、真实保存及公开结果 | 待验 | 待验/适用性核 | 待验 |
| U19 | 发布平台文案适配/物料 | S/工具提交；structured:script.rewrite/copy.generate | 平台适配与publish.package到物料/预览；不触发外部发布 | 待验 | 待验/适用性核 | 待验 |
| U20 | 复盘聊天/分析 | C/S/N；text/vision:review.insights；structured:review.insights/review.analyze | 聊天、独立复盘和ordinary分析分别操作；保路由别名与真实消费者继承 | 待验 | 待验/适用性核 | 待验 |
| U21 | 知识分类 | S；structured:knowledge.classify | 真实owned知识→分类候选/业务校验/读回，跨组拒绝 | 待验 | 待验/适用性核 | 待验 |
| U22 | 知识蒸馏 | C/S/N；text/vision/structured:knowledge.distill | 公开蒸馏输入/实际分块任务及父预算，聊天与独立执行分别记录 | 待验 | 待验/适用性核 | 待验 |
| U23 | 知识关联 | S；structured:knowledge.relate | 真实atom/资源权限，关联候选及读回 | 待验 | 待验/适用性核 | 待验 |
| U24 | 评论问答筛选 | S；structured:comment.qa-sift | 中性owned评论来源与实际筛选结果；不使用现用平台数据 | 待验 | 待验/适用性核 | 待验 |
| U25 | 素材研究/来源相似性 | S/N；structured:research.gather/default | research.gather_material与script.source_similarity分别实际操作；有外部依赖单列 | 待验 | 待验/适用性核 | 待验 |
| U26 | 素材匹配/导入项目重构 | S；structured:material.match/reconstruct.project | 两操作分别输入真实素材/imported逐字稿；缺前置则真实拒绝/阻断，不改模型判断规则 | 待验 | 待验/适用性核 | 待验 |
| U27 | 图像分类/素材提取 | S；vision:asset.classify；structured:script.draft | 真实图片分类与extract各自公共操作，ASR若参与保其独立来源 | 待验 | 待验/适用性核 | 待验 |
| U28 | 素材图片生成 | G；image:image.generate | image族选Codex实际生成图片文件，尺寸/解码/归属/采纳 | 待验 | 待验/适用性核 | 待验 |
| U29 | 参考图编辑 | G；image:image.edit | owned reference实际读入与编辑输出，非mock PNG或文字描述 | 待验 | 待验/适用性核 | 待验 |
| U30 | 封面/图卡/画布图片 | S/G/HOST；structured:copy.generate；image:image.generate/edit | 每个仍可达公开功能分别实际操作及采纳；不能一张素材图代签三个入口 | 待验 | 待验/适用性核 | 待验 |
| U31 | 独立copilot任务 | S；structured:copilot.assist | 公开持久任务入口及最终输出；不以chat.run代签 | 待验 | 待验/适用性核 | 待验 |
| U32 | 策划论点/契约/大纲 | S/工具提交；structured:planning.thesis/contract/outline | 仍可达原服务/宿主操作各核输入与结果；若仅内部/已退役，给可达性源码证据并不恢复旧按钮 | 待验 | 待验/适用性核 | 待验 |
| U33 | 工具发现与系统候选 | HOST；system.features/read/action.propose、context/history/skill | 实际能力发现/受权读取与至少一个系统候选，proposal终态，不自动采纳或越权 | 待验 | 待验/适用性核 | 待验 |
| U34 | web/material/RedFox工具 | N/资源端口；web.read/material.gather/redfox.query | 三个实际公开工具逐一；缺凭据/账号真实拒绝，不能冒采集成功 | 待验 | 待验/适用性核 | 待验 |
| U35 | 雷达预览/脚本候选桥 | I；text/structured:topic.generate；structured:script.draft | 新owned合法claim/lease的实际桥输出；无账号的上游采集准确阻断，不重发旧任务 | 待验 | 待验/适用性核 | 待验 |
| U36 | 对标/归因/收藏后台桥 | F；structured:benchmark.teardown/topic.attribution/favorites.triage/knowledge.distill | 各仍可达用户功能的操作和状态分别记录；桥协议真实样本，缺平台来源单列；不创建重复采集 | 待验 | 待验/适用性核 | 待验 |
| U37 | 自主采集/素材/研究 | A；text:agentic.collect/material/research | 各公开功能入口与依赖记录，至少独立agentic协议真实模型；受控浏览器/网络权限不扩大 | 待验 | 待验/适用性核 | 待验 |
| U38 | 原片ASR | O；asr:transcribe.audio | 实际audio来源的短owned媒体转录/失败；非Codex文字能力，云/本地依赖实际记录 | 待验 | 待验/适用性核 | 待验 |
| U39 | 视频生成服务 | O；video:video.generate | 保原official/self；缺配置测试准确拒绝/不挂死，未发生真实视频生成不得签成功 | 待验 | 待验/适用性核 | 待验 |
| U40 | 停用向量与目录外TTS核验 | X；embedding:knowledge.search.embed；TTS无当前catalog键 | 向量不恢复为聊天前置，不调用付费embed；TTS未找到现役消费者不能虚构能力，若可见入口被找到须补准确来源 | 待验 | 待验/适用性核 | 待验 |

## 56个route键穷尽结果索引

本表从当前`modelRouteCatalog`及B逐键消费者盘点机械核对，56键/56唯一：12text、32structured、7vision、2image、video/asr/embedding各1。每键均须配置投影/冻结/解析断言；真实模型无需56次重复付费，但各协议族与各公开功能不能缺证。X项按明确不适用/停用理由验证拒绝或不产生依赖，不虚构成功。消费者/实际入口及继承限制逐键保留；表内结果待执行，不能把静态接线当功能已过。

| routeKey | 当前消费者/入口或内部复用 | 来源族/适用边界 | 每键静态/冻结断言 | 协议族真实模型结果 | 公开功能实际操作/继承证据 |
| --- | --- | --- | --- | --- | --- |
| text:topic.generate | C选题/画布；I雷达rewrite_only | text=codex；保official/self组合 | 待验 | 待验；C与I分别样本，不能互代 | 待验；U03、U35（C/I不互代） |
| text:calibration.diagnose | C校准聊天 | text=codex；保official/self组合 | 待验 | 待验；每键冻结＋C族页面上下文 | 待验；U08聊天 |
| text:positioning.generate | C定位聊天 | text=codex；保official/self组合 | 待验 | 待验；每键冻结＋C族页面上下文 | 待验；U09聊天 |
| text:review.insights | C复盘聊天 | text=codex；保official/self组合 | 待验 | 待验；每键冻结＋C族页面上下文 | 待验；U20聊天 |
| text:knowledge.distill | C蒸馏聊天 | text=codex；保official/self组合 | 待验 | 待验；每键冻结＋C族页面上下文 | 待验；U22聊天 |
| text:copilot.assist | C普通/项目工作面 | text=codex；保official/self组合 | 待验 | 待验；普通及明确owner分别验 | 待验；U01、U11–U15各owner、U33/34宿主实际动作 |
| text:script.hooks | N开场工具 | text=codex；保official/self组合 | 待验 | 待验；独立子模型/parent route样本 | 待验；U10 hooks子工具 |
| text:script.draft | N整稿工具 | text=codex；保official/self组合 | 待验 | 待验；与S脚本管线区分 | 待验；U10整稿子工具 |
| text:agentic.collect | A采集自主任务 | text=codex；保official/self组合 | 待验 | 待验；A执行族＋原工具授权断言 | 待验；U37采集 |
| text:agentic.material | A素材自主任务 | text=codex；保official/self组合 | 待验 | 待验；每键冻结，不以C代A | 待验；U37素材 |
| text:agentic.research | A研究自主任务 | text=codex；保official/self组合 | 待验 | 待验；A执行族＋受控浏览器授权 | 待验；U37研究 |
| text:chat.fallback | X原可选stream备用 | Codex备用stream不支持，原明确null；主聊天独立 | 待验 | 待验；Codex明确unsupported/null，不是主聊天漏接 | 待验；X：明确unsupported/null负例，不签主聊失败 |
| structured:script.draft | S脚本/粗剪/material.extract；I脚本候选 | text=codex；保official/self组合 | 待验 | 待验；S与I分别；粗剪保试听/采纳 | 待验；U10脚本、U15粗剪、U27提取、U35桥各动作 |
| structured:script.hooks | X目录保留；当前聊天hooks实用text键 | 保留目录；现役hooks用text，核不适用 | 待验 | 待验；冻结/解析断言，不虚构独立UI入口 | 待验；X：现役hooks走text；保目录解析兼容 |
| structured:planning.thesis | S论点策划 | text=codex；保official/self组合 | 待验 | 待验；原brief/owner＋S族 | 待验；U32论点；现役可达性核 |
| structured:planning.contract | S契约策划 | text=codex；保official/self组合 | 待验 | 待验；原contract输入＋S族 | 待验；U32契约；现役可达性核 |
| structured:planning.outline | S大纲策划 | text=codex；保official/self组合 | 待验 | 待验；原brief/artifact＋S族 | 待验；U32大纲；现役可达性核 |
| structured:script.rewrite | S发布平台适配 | text=codex；保official/self组合 | 待验 | 待验；原platform_adapt消费者 | 待验；U19平台适配 |
| structured:copy.generate | S文章/图文/卡片/封面/发布文案 | text=codex；保official/self组合 | 待验 | 待验；仍可达各宿主输入断言；图子阶段另G | 待验；U11/12原创作、U19文案、U30封面/图卡各消费者；退役入口不恢复 |
| structured:review.insights | S复盘；N review.analyze模型身份 | text=codex；保official/self组合 | 待验 | 待验；保任务/模板名与路由别名差异 | 待验；U20独立分析/节点身份 |
| structured:review.analyze | N节点公开capability；身份resolver映射review.insights | text=codex；保official/self组合 | 待验 | 待验；两键冻结及别名一致性；不称独立第2模型 | 待验；U20普通节点别名断言及真实动作 |
| structured:topic.generate | S选题/每日选题；N；I策略雷达 | text=codex；保official/self组合 | 待验 | 待验；共享S仍须daily准备与I桥断言 | 待验；U04、U05、U35各消费者 |
| structured:topic.enrich | S选题补全；N | text=codex；保official/self组合 | 待验 | 待验；N代表子节点＋S原任务绑定 | 待验；U06独立及ordinary节点 |
| structured:topic.preference | S偏好学习 | text=codex；保official/self组合 | 待验 | 待验；S输入/候选归属 | 待验；U07 |
| structured:research.gather | S研究素材收集 | text=codex；保official/self组合 | 待验 | 待验；S材料上下文；外部依赖独立 | 待验；U25研究 |
| structured:copilot.assist | S独立copilot任务 | text=codex；保official/self组合 | 待验 | 待验；不能用C聊天代验 | 待验；U31独立任务 |
| structured:calibration.diagnose | S校准诊断；N | text=codex；保official/self组合 | 待验 | 待验；两种入口输入及冻结断言 | 待验；U08诊断任务/节点 |
| structured:calibration.score | S校准评分 | text=codex；保official/self组合 | 待验 | 待验；S业务schema | 待验；U08评分 |
| structured:positioning.generate | S定位；N | text=codex；保official/self组合 | 待验 | 待验；两种入口输入及冻结断言 | 待验；U09生成/节点 |
| structured:material.match | S素材匹配；V选料子阶段 | text=codex；保official/self组合 | 待验 | 待验；不用硬编码规则替模型选择 | 待验；U26匹配、U16选料 |
| structured:reconstruct.project | S导入项目重构 | text=codex；保official/self组合 | 待验 | 待验；缺真实imported输入记依赖，不改规则 | 待验；U26导入重构 |
| structured:default | S script.review/source_similarity等真实默认档 | text=codex；保official/self组合 | 待验 | 待验；明确操作名与路由键，不补猜模型 | 待验；U18审核、U25来源相似性 |
| structured:knowledge.classify | S知识分类 | text=codex；保official/self组合 | 待验 | 待验；T1238旧实证；本轮S族代表及schema | 待验；U21 |
| structured:knowledge.distill | S/N分块蒸馏；F收藏蒸馏 | text=codex；保official/self组合 | 待验 | 待验；父预算、分块及F桥分别断言 | 待验；U22分块、U36收藏桥 |
| structured:knowledge.relate | S知识关联 | text=codex；保official/self组合 | 待验 | 待验；原atom权限＋S族 | 待验；U23 |
| structured:comment.qa-sift | S评论问答筛选 | text=codex；保official/self组合 | 待验 | 待验；真实评论归属＋S族 | 待验；U24 |
| structured:video.scenes | V主场景步骤 | text=codex；保official/self组合 | 待验 | 待验；真实视频阶段所需身份冻结 | 待验；U16场景主步骤 |
| structured:video.cards | V卡片阶段 | text=codex；保official/self组合 | 待验 | 待验；仅原任务需要时调用，不能全目录强制生成 | 待验；U16原需要卡片步骤 |
| structured:video.broll | V画面需求阶段 | text=codex；保official/self组合 | 待验 | 待验；实际选料仍material.match | 待验；U16原需要画面步骤 |
| structured:video.subtitles | V字幕校正阶段 | text=codex；保official/self组合 | 待验 | 待验；不是ASR供应商，保原逐字稿 | 待验；U16原需要字幕步骤 |
| structured:video.director | V总编导阶段 | text=codex；保official/self组合 | 待验 | 待验；与native工作面C工具候选区分 | 待验；U16原需要总编导步骤 |
| structured:benchmark.teardown | F对标拆解 | text=codex；保official/self组合 | 待验 | 待验；原调度claim/F代表，不创建重复采集 | 待验；U36对标 |
| structured:topic.attribution | F自作品归因 | text=codex；保official/self组合 | 待验 | 待验；sourceKind和原resource冻结 | 待验；U36自作品归因 |
| structured:favorites.triage | F收藏分流 | text=codex；保official/self组合 | 待验 | 待验；平台授权与ASR输入独立 | 待验；U36收藏分流 |
| vision:topic.generate | C带图选题/画布 | vision=codex单独配置 | 待验 | 待验；vision族来源必须单独核 | 待验；U03带图 |
| vision:calibration.diagnose | C带图校准 | vision=codex单独配置 | 待验 | 待验；每键冻结＋图像输入消费者 | 待验；U08带图 |
| vision:positioning.generate | C带图定位 | vision=codex单独配置 | 待验 | 待验；每键冻结＋图像输入消费者 | 待验；U09带图 |
| vision:review.insights | C带图复盘 | vision=codex单独配置 | 待验 | 待验；每键冻结＋图像输入消费者 | 待验；U20带图 |
| vision:knowledge.distill | C带图蒸馏 | vision=codex单独配置 | 待验 | 待验；每键冻结＋图像输入消费者 | 待验；U22带图 |
| vision:copilot.assist | C带图普通/项目对话 | vision=codex单独配置 | 待验 | 待验；代表真实图输入并核输出可读 | 待验；U02 |
| vision:asset.classify | S图片分类专门分支 | vision=codex单独配置 | 待验 | 待验；真实图片，不以文本根对话代验 | 待验；U27图像分类 |
| image:image.generate | G素材/封面/卡片生成 | image=codex单独配置 | 待验 | 待验；真实图片文件+候选/采纳 | 待验；U28、U30各真实图消费者 |
| image:image.edit | G参考图编辑 | image=codex单独配置 | 待验 | 待验；原owned reference及真实输出；unverified不伪签 | 待验；U29、U30有实际参考图的消费者 |
| video:video.generate | O官方/自配视频 | official/self，非Codex | 待验 | 待验；Codex不支持；保原配置，缺依赖单列 | 待验；U39，配置缺失则准确阻断 |
| asr:transcribe.audio | O官方/自配/本地Whisper | official/self/local，非Codex | 待验 | 待验；原local回退与deadline，非Codex | 待验；U38及U15/27/36实际ASR阶段 |
| embedding:knowledge.search.embed | X当前embedTexts禁用 | 目录兼容；embedTexts当前停用 | 待验 | 待验；历史目录兼容；不恢复为前置或发付费向量 | 待验；U40：停用兼容/无新依赖，非生成PASS |

## 改动边界、性能与可靠性

| ID | 项目 | 必要验证 | 当前结果 |
| --- | --- | --- | --- |
| FEEDBACK | external已验证只读阶段 | 仅definition.effect=none且outcome.sideEffect=none早期投影；settled/append/浏览器/finish四时刻与卡片唯一性；proposal完整output终态保持原预览/采纳门，标deferred_proposal；none缺早期流安全补齐记recovered_at_finish且不算实时PASS | 待验 |
| SCHEMA | owner专属新版本 | article/graphic/production完整参数和跨owner拒绝；三处Host/adapter/source冻结协议重建，旧v1/v2/markdown hash不变；三owner真实来源/预览/采纳与刷新；同模型同稿对照 | 待验 |
| PREP | 同turn准备去重 | registry entry token、scope/group/account/project/output/owner、generation/version/digest、writingContext/selection机械指纹；一次消费、不同turn/变更/注销重注册/失败/卸载清理；保存/unknown/CAS/服务端重验不减 | 待验 |
| HISTORY | 历史卡按需准备/有界合并 | 原来源/不可变版本身份与scope准确；开预览才准备、同时读取单在途、失败可重试/卸载清理；当前稿/采纳仍服务核验 | 待验 |
| TABS | 代表性隔离工程production顶部Tab/本地助手 | 首访/暖访分开，服务/可见状态/一次实际操作分段，同视频host及dirty/Undo/Redo/保存保持；不是轮询值当精确TTI，不盲目prefetch | 待验 |
| LIFE | 取消/断线/长输出/跨组/fence | 同任务/费用/期限不变，unknown不重发；有界单在途及真实清理；诊断sink失败不改变业务 | 待验 |
| WORKFLOW | 两终态module数据归档 | 原config完整字节与两定义/事件锚/SHA；无依赖/活动/lease，其他module不变，归档不能claim/compile，原路径负例不放宽，原generate/packet真实成功 | 待独审后执行 |

每项正式结果须附source/candidate/run与task/call/owner、读回配置、实际输入输出摘要、采纳前后/刷新/脚本及其他平台不变、test/shutdown退出及清理。未发生记未验，阻断写准确外部依赖，失败保原ID。性能反馈、输入体积与总耗时分开报告；缺preflight/TTFT时标缺测，体验数字不是反杀合法任务的新硬门。最终在同一隔离production/可安装候选复核公共全链后交Root，不以dev样本替代。
