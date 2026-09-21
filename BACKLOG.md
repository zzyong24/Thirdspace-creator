# CreatorOS 任务看板(BACKLOG)

> 单一执行真相；读取顺序：本看板 → 任务引用的 SPEC → 代码。状态：📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ 审核失败。

> `D` 表示详情按任务 ID 在 `BACKLOG-details.md` 中查找。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
|T-1022|禁止模型超时或不完整输出阻断生成，统一由 Agent loop 恢复|✅|—|PASS:06eb90bb86b5|[SPEC](docs/features/t1022-nonblocking-agent-recovery.md)|覆盖内容雷达与 AI 助手；仅无可用模型时引导配置，其他可恢复失败沿原任务自动续跑、修复或降级。|
|T-1005|实现多步计划、连续执行与原任务续跑|🔨|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；模型规划与重规划，保留回执和成本，停止恢复可核验。|
|T-1007|补齐任务文件空间与受控命令执行|🔨|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；文件读写编辑、版本冲突、跨平台运行和进程树取消。|
|T-1008|迁移 NomiFun 浏览器能力并协调既有采集|🔨|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004/1006；唯一profile所有者、多任务并发、跨账号隔离和原采集回归。|
|T-1010|装配研究创作报告 Skill 与兼容扩展|🔨|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1007/1008/1009；按需方法包、锁定版本，自主选工具完成目标。|
|T-1011|实现对话内计划进度与文件交付交互|🔨|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1009；同对话查看修改导出，停止/恢复与性能防复发。|
|T-1012|验收完整多步 Agent 与旧功能兼容|📋|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1008/1010/1011；真实模型工具文件全链路、故障恢复、采集及性能。|
|T-1013|验证双端安装包多步 Agent 与升级兼容|📋|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1012；Mac/Windows安装实测，无NomiFun前置，数据升级保留。|
|T-998|收敛业务代码硬编码模型名|📋|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|区分 provider 适配器(合理)与业务逻辑硬编码(抽配置)；cover-runner、channel-model-config、prompt 模板里散落的模型名收敛为可配。|
|T-997|修复 ai→ai-runtime 反向依赖边界违反|📋|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|ai/script-partial-adoption.service.ts 反向 import ai-runtime，打破 ai 与 ai-|
|T-996|消除 review/reviews 双模块命名混淆|📋|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|review/(review-gate 审核门)与 reviews/(复盘评论领域)职责不同但命名极易混；重命名对齐并更新跨模块引用。|
|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|📋|—|—|—|本地 main=f330473f 落后 origin/main(77eabca3)573 提交；核清原因后同步，保留 codex/t793-local-package 进行中未提交改动。|
|T-992|修复 Windows 升级启动运行环境切换拒绝访问|🔨|—|—|[SPEC](docs/features/t992-windows-runtime-upgrade.md)|用户启动日志os error5；检查旧运行目录、安装指针与升级迁移，保留数据，补既有安装升级验证。|
|T-989|校正知识图谱错误提示的既有回归断言|📋|—|—|[SPEC](docs/features/t989-knowledge-error-test.md)|T988扩展验证发现原af62ddda及当前均1/9失败；核对错误提示契约后修正，未改该行为。|
|T-984|本地打包并实测拆分采集修复|⏸️|—|—|[SPEC](docs/verification/t984-local-collection.md)|用户明确冻结改动范围；以66264111本地打包、安装、真实采集验证，不扩展恢复架构、不公开发布。|
|T-986|修复新绑定账号默认采集任务系统标记透传|📋|—|—|[SPEC](docs/features/t986-bind-collection-flag.md)|只读审查发现绑定装配丢失 systemManaged，可能导致流量和内容任务待重启才补齐；本轮不扩大改动，待隔离复现与修复。|
|T-980|纳入助手修复重新运行 V1.2 双端流水线|🔨|—|—|[SPEC](docs/features/t980-release-rerun.md)|冻结已提交 T-976至T-978 修复，合并发布分支，预检后运行 Mac/Windows 正式构建并核验产物。|
|T-979|自动化页面慢轮询与切换对象回写防护|📋|—|—|[SPEC](docs/features/t979-automation-polling.md)|T-978 排查发现运行历史、步骤和列表轮询未限制在途请求；补慢网与切换对象回归，修复请求堆积及旧响应覆盖风险。|
|T-976|修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互|🔨|—|—|[SPEC](docs/features/t976-chat-inline-redfox.md)|定位本次原始错误；当前对话持续执行返回结果，不让用户刷新核对；真实链路验收。|
|T-957|排查编导 AI 失败并补齐真实功能验收|🔨|—|—|[SPEC](docs/features/t957-ai-real-acceptance.md)|先核对原未知结果任务，定位模型/工具/页面故障；验证主要 AI 入口，不重复未知调用、不覆盖用户稿。|
|T-956|修复安装版点击采集一直抓取中|🔨|—|—|[SPEC](docs/features/t956-installed-collection-stuck.md)|对照真实任务、日志与调度恢复定位阻断，修复后沿实际入口验证终态和结果，保护旧数据。|
|T-954|接入抖音流量来源并以专家方法改进编导交互|🔨|—|—|[SPEC](docs/features/t954-director-content-loop.md)|已落实来源方法、稿面诊断和独立流量队列；1005 条隔离恢复与真实页面 smoke 通过。真实模型效果对照、保留样本迁移和安装版验收待完成；明细失败不阻断基础采集。|
|T-951|修复自动化采集缺 jobRunId 与千条作品采集失败|⏸️|—|—|[SPEC](docs/features/t951-collection-reliability.md)|查明原调度绑定、分页和超时恢复，验证公共链路与千条规模，不以吞错冒充成功。|
|T-950|排查并恢复当前产品缺失历史数据|⏸️|—|—|[记录](docs/verification/t950-data-recovery.md)|先核对账号、数据路径和备份；保留现状后恢复可验证的数据，不覆盖新内容。|
|T-945|排查并修复当前视频渲染再次失败|⏸️|—|—|[诊断](docs/verification/t945-render-failure.md)|对齐最新原任务与安装版日志，定位真实失败点并验证修复，不凭历史错误猜测。|
|T-943|拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入|⏸️|—|—|[SPEC](docs/features/t943-jy-ipagent-research.md)|独立部署参考项目，确认数字人实际供应商与本地模型依赖；优先 API 路径，以真实启动和生成证据区分已验证与待凭据。|
|T-940|补齐应用内签名远程更新闭环|📋|—|—|[缺口与范围](docs/features/t939-positioning-release.md)|接通包级签名制品托管、下载验签、安装重启与双端升级验收；不把全量更新称为差分，不擅自公开发布。|
|T-935|修复整稿子任务长时间排队无执行|🔨|—|—|[排查记录](docs/verification/t935-script-queue.md)|查真实任务排队与唤醒，恢复原任务，不用新任务掩盖卡住；并完成 T-934 聊天复验。|
|T-934|统一 CLI 与页面的持久聊天工具入口|🔨|—|—|[实现与验收](docs/verification/t934-cli-chat-unification.md)|CLI 仍走通用回复任务，实际没有搜索和正文回执；复用页面持久聊天装配与 Pi 工具循环，保留归属、幂等和历史，真实搜集复验后方可验收。|
|T-933|安装并验收本轮Agent Runtime桌面版|🔨|—|—|[T-932交付](docs/verification/t932-runtime-alignment.md)|核对已安装候选与签名、启动及实际页面/Skill/聊天链路；通过公开CLI操作，未获本次启动授权前不绕过访问；保留真实验收结果。|
|T-919|定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞|🔨|—|—|复用 T-912/T-909 导航契约与 [T-915 SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|读取最新本机日志与运行进程，定位导航阻塞和资源争用；补充切换项目 Tab 丢失在途回复：保留账号/项目隔离的窗口级消息与订阅，避免恢复历史覆|
|T-915|根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力|🔨|PASS[REV:ad76cf555129]|—|[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|保留原执行/恢复改造任务；剩余登录资源迁移、备用模型和运行验收，详见 [历史说明](BACKLOG-details.md#t-915-triage-history)。|
|T-917|记录 T-915 媒体测试事故并防止测试再次访问真实媒体根|📋|—|—|[事故记录](docs/research/evidence/t915/2026-09-06-media-test-incident.md)|用户明确要求继续重构，数据恢复不再作为 T-915 阻塞；数据未恢复的事实保留|
|T-908|真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复|📋|—|—|D|隔离检查用户提供的 Skill 压缩包与当前已安装版本，以公开抖音链接实际验证短链解析、作品元数据、视频直链、下载和转写前置链路；同时审计|
|T-906|放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆|⏸️|—|待验|—|AI 助手默认窗口应明显大于当前尺寸，用户可从右下角手柄拖拽调整大小；每次调整后的宽高保存在本机，下次启动自动恢复，并受最小尺寸与当前屏幕可见范围约束，避免内容不可用或换屏后窗口超出视口。|
|T-905|调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心|📋|—|—|D|这是独立于 CreatorOS 的新产品探索，不是 CreatorOS 手机版，也不把核心能力定义为传统数字人：用户首次录入行业、人设与对标|
|T-884|只读诊断用户加密日志中的 ASR 转写失败|⏸️|—|—|复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约|解析用户提供的 `sidecar-2026-08-18.log.enc`，对齐同一次转写任务、输入媒体、ASR provider/模型、配置|
|T-883|提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线|⏸️|—|—|复用 [T-881 验收](orchestrator/T881-FRONTEND-VALIDATION.md)、[T-882 本地包验收](orchestrator/T882-BUILD-VALIDATION.md)|只提交并发布已通过验收的 B-roll 删除修复候选；冻结检查后将候选安全同步到 `main`，触发 `desktop-release.ym|
|T-878|让生图模型连接测试正确识别并提示 401/403 鉴权失败|📋|—|—|[T-877 脱敏诊断](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)|当前真实生图适配器已把 401 分类为 authentication，但 `settings.models.test` 的 `image.g|
|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配|🔨|—|待验|D||
|T-860|修复竖屏素材底边与左下人物框边界重合|🔨|—|待验|D||
|T-859|竖屏素材段人物收进左下角，并消除切换白闪|🔨|PASS[REV:5818394813ca]|待验|[SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)||
|T-858|把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT|🔨|PASS[REV:c76009a5586c]|待验|[SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)||
|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包|⏸️|—|待验|D||
|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调|⏸️|—|待验|D||
|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包|⏸️|—|—|D||
|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播|📋|待审|待验|D||
|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪|📋|待审|待验|D||
|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线|⏸️|—|—|D||
|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建|⏸️|—|—|D||
|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器|🔨|—|待验|D||
|T-843|为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力|🔨|PASS[REV:ea17774db868]|—|[SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)||
|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复|🔨|—|待验|D||
|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳|🔨|—|待验|D||
|T-831|重排官方渠道模型配置并复核上游图生图能力|🔨|—|待验|D||
|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站|🔨|—|待验|D||
|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错|🔨|—|待验|D||
|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击|🔨|—|待验|D||
|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动|🔨|—|待验|D||
|T-824|根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果|🔨|PASS[REV:f0e215103ddf]|待验|[SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)||
|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后|🔨|—|待验|D||
|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库|🔨|—|待验|D||
|T-819|让编导在普通对话中按自然语言定位并改写当前稿单段|🔨|PASS[REV:a8879edf798f]|待验|[SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)||
|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘|📋|—|—|D||
|T-816|让当前确认稿成为配图与封面生成的第一内容真相|🔨|PASS[REV:7896d566ccf8]|待验|[SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)||
|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力|📋|—|—|D||
|T-779|根治参考历史作品生成封面时误探本机工具并中断生图|🔨|—|待验|D||
|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程|🔨|—|待验|D||
|T-768|任何云端 ASR 故障都必须自动回退本地 Whisper|🔨|PASS[REV:64f8010b2045]|待验|[SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)||
|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环|🔨|—|—|D||
|T-759|根治已绑定 B-roll 因 inventory 失配显示空白|🔨|—|待验|D||
|T-754|根治 CreatorOS v1.0 官方包启动无限转圈|🔨|—|—|D||
|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包|🔨|—|—|D||
|T-741|下移知识库“记一条经验”入口到录入操作行|🔨|—|待验|D||
|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡|🔨|—|待验|D||
|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环|🔨|—|待验|D||
|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环|🔨|—|待验|D||
|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI|🔨|—|待验|D||
|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态|🔨|—|待验|D||
|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话|🔨|—|待验|D||
|T-730|恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛|🔨|PASS[REV:aeda30778cf2]|待验|[SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)||
|T-731|支持按电商等创作场景生成并自定义创作框架|📋|—|待验|D||
|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API|📋|—|待验|D||
|T-726|退役项目“论点骨架”并让写稿直接消费 Brief 与素材|🔨|PASS[REV:39e3f41ca866]|待验|[SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)||
|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性|🔨|—|待验|D||
|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败|📋|—|待验|D||
|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用|🔨|—|待验|D||
|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包|🔨|—|待验|D||
|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序|🔨|—|待验|D||
|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨|—|待验|D||
|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用|📋|—|待验|D||
|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包|🔨|—|待验|D||
|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示|🔨|—|待验|D||
|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线|🔨|—|待验|D||
|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁|🔨|—|待验|D||
|T-707|将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心|🔨|PASS[REV:87de34262527]|待验|[SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)||
|T-705|根治 macOS 本地包启动后落入 Page Not Found|🔨|—|待验|D||
|T-703|根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包|🔨|PASS[REV:0662dafac8fa]|待验|[SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)||
|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码|📋|—|待验|D||
|T-695|清理应用内硬编码品牌并让白标用户表面保持中性|🔨|—|待验|D||
|T-691|补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环|🔨|PASS[REV:2f2a131519e7]|待验|[SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)||
|T-694|建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环|🔨|PASS[REV:171b7c9ad2f2]|待验|[SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)||
|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索|🔨|—|待验|D||
|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染|🔨|—|待验|D||
|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡|🔨|—|待验|D||
|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型|🔨|—|待验|D||
|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效|🔨|—|待验|D||
|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择|🔨|—|待验|D||
|T-678|根治内容雷达生成选题继续读取旧定位|📋|—|待验|D||
|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒|📋|—|待验|D||
|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退|📋|—|待验|D||
|T-671|确定 CreatorOS 代理商业模式与官网价格边界|🔨|—|待验|D||
|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息|🔨|—|待验|D||
|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换|🔨|—|待验|D||
|T-665|支持彻底删除内容雷达信源及其全部归属数据|🔨|—|待验|D||
|T-662|根治成片把内部结构标签当正文并优化卡片文字重合|🔨|—|待验|D||
|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名|🔨|—|待验|D||
|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失|🔨|—|待验|D||
|T-656|收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点|🔨|PASS[REV:bd8a6ac135f0]|待验|[SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)||
|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider|🔨|—|—|D||
|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设|🔨|—|待验|D||
|T-653|支持本地自配与渠道子 Key 托管双模式模型供给|📋|待审|待验|D||
|T-652|重构定位前采为必经的编导式访谈与证据辅助工作流|🔨|PASS[REV:eb61c0840578]|待验|[SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)||
|T-650|知识倾倒输入框支持拖拽文件直接导入|🔨|—|待验|D||
|T-651|内容雷达默认按作品真实发布时间倒序|🔨|—|待验|D||
|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界|📋|—|待验|D||
|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复|🔨|—|待验|D||
|T-645|收敛模型配置项并同步精简 Growth 渠道模板|🔨|PASS[REV:7ff0c3cb1906]|待验|[SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)||
|T-644|根治 CreatorOS macOS 客户端持续闪屏|🔨|—|待验|D||
|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口|📋|—|待验|D||
|T-642|打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链|🔨|PASS[REV:9002b8dbeb4d]|待验|[SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)||
|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”|🔨|—|待验|D||
|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包|🔨|—|待验|D||
|T-635|把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签|🔨 本地实现待验|PASS[REV:84661017fde5]|待验|[SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)||
|T-633|根治内容雷达生成选题卡失败并恢复创作者中心自动扫码|🔨|—|待验|D||
|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果|🔨|—|待验|D||
|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失|🔨|—|待验|D||
|T-621|补齐渠道模型 authority snapshot 生产链路回归|📋|—|—|D||
|T-576|统一跟进尚未关闭的飞书线上用户反馈|🔨 免审|—|—|D||
|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈|🔨 本地PASS·待生产E2E|—|待验|D||
|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏|🔨 免审|—|待验|D||
|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失|🔨 待安装版真机|—|待验|D||
|T-538|接通渠道签名上下文的产品问题反馈|🔨 本地PASS·待生产E2E|—|待验|D||
|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复|🔨 待真实账号只读验收|—|待验|D||
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-626|⏸️|—|—||
|T-577|⏸️|—|—||
|T-565|⏸️|—|—||
|T-524|⏸️|—|—||
|T-519|⏸️|—|—||
|T-525|⏸️|—|—||
|T-517|⏸️|—|—||
|T-516|⏸️|—|—||
|T-510|⏸️|—|—||
|T-506|⏸️|—|—||
|T-502|⏸️|—|—||
|T-497|⏸️|—|—||
|T-451|⏸️|—|—||
|T-449|⏸️|—|—||
|T-448|⏸️|—|—||
|T-433 S2|⏸️|—|—||
|T-433 S4|⏸️|—|—||
|T-433 S5|⏸️|—|—||
|T-426|⏸️|—|—||
|T-425W|⏸️|—|—||
|T-413|⏸️|—|—||
|T-417|⏸️|—|—||
|T-418|⏸️|—|—||
|T-420|⏸️|—|—||
|T-399|⏸️|—|—||
|T-399c|⏸️|—|—||
|T-409|⏸️|—|—||
|T-372 W-spike|⏸️|—|—||
|T-372 W-ci|⏸️|—|—||
|T-391 H-econ|⏸️|—|—||
|T-393|⏸️|—|—||
|T-401|⏸️|—|—||
|T-406|⏸️|—|—||
|T-407|⏸️|—|—||
|T-396|⏸️|—|—||
|T-398|⏸️|—|—||
|T-366c|⏸️|—|—||
|T-361|⏸️|—|—||
|T-352|⏸️|—|—||
|T-320c|⏸️|—|—||
|T-350c|⏸️|—|—||
|T-351|⏸️|—|—||
|T-349d|⏸️|—|—||
|T-339|⏸️|—|—||
|T-328|⏸️|—|—||
|T-332R|⏸️|—|—||
|T-336|⏸️|—|—||
|T-335|⏸️|—|—||
|T-337|⏸️|—|—||
|T-337a|⏸️|—|—||
|T-337b|⏸️|—|—||
|T-337c|⏸️|—|—||
|T-337d|⏸️|—|—||
|T-337e|⏸️|—|—||
|T-337f|⏸️|—|—||
|T-337g|⏸️|—|—||
|T-334|⏸️|—|—||
|T-324|⏸️|—|—||
|T-340|⏸️|—|—||
|T-315|⏸️|—|—||
|T-316|⏸️|—|—||
|T-317|⏸️|—|—||
|T-318|⏸️|—|—||
|T-319|⏸️|—|—||
|T-312|⏸️|—|—||
|T-307|⏸️|—|—||
|T-306|⏸️|—|—||
|T-301|⏸️|—|—||
|T-302|⏸️|—|—||
|T-261|⏸️|—|—||
|T-249|⏸️|—|—||
|T-250|⏸️|—|—||
|T-255b|⏸️|—|—||
|T-185R|⏸️|—|—||
|T-136R|⏸️|—|—||
|T-100|⏸️|—|—||
|T-087|⏸️|—|—||
|T-045|⏸️|—|—||

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
