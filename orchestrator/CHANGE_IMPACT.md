# Change Impact — CreatorOS

> Required control artifact (rules/orchestrator-state-machine.md §"Required Control Artifacts";
> consistency-gates.md: "Every changed upstream ID has either updated downstream artifacts or an entry in
> `CHANGE_IMPACT.md`"). It was missing until 2026-06-22 (DEC-013) — the invalidating changes below had been
> narrated inside DECISION_LOG entries instead of analyzed here. This file back-fills them and is the home
> for all future impact analyses.

Each entry: the change, which upstream IDs/artifacts it touched, the downstream artifacts it INVALIDATED
(per the Invalidation Rules), and how each was handled (re-derived / re-verified / still-stale).

---

## CI-MODEL-904 — 官方受管生图提交未知从立即取消改为幂等恢复（2026-08-20）

- **变更源**：DEC-MODEL-057；真实日志证明受管封面与普通图片在瞬时断连后被整单取消，同链稍后成功。
- **失效工件**：T-891“网络断开一律不得自动重放”的口径对官方受管同步生图失效；用户自配中转站和
  异步视频的保守策略继续有效。
- **重新派生**：共享提交重试器增加显式受管幂等开关；封面和图片素材仅在已验签
  `channel-managed`、`stage=submit`、`reason=network` 且无 HTTP 状态时开启，并复用同一幂等号。
- **验证影响**：必须同时覆盖受管封面、受管图片、自配封面、自配图片和受管视频提交未知；已有
  502/503、response-received、submit-unknown 与重复计费回归继续通过。
- **数据/接口影响**：无数据库、公共 contract、页面或用户配置变化；不执行真实付费调用。

---

## CI-VIDEO-902 — 竖屏从主视觉独占切走改为真人主导、人脸常驻（2026-08-19）

- **变更源**：DEC-VIDEO-056；真实竖屏成片 8 个均匀抽样帧均没有真人，用户明确要求恢复真人主导。
- **失效工件**：DEC-VIDEO-043、DEC-VIDEO-044 的 card hidden 默认，T-859 动态卡独占规则，T-896
  “PiP 冲突改 hidden”降级，LED-033 的自动 PiP 禁令，以及对应 prompt/模板快照失效。
- **重新派生**：竖屏 talking-head 全幅；card/B-roll 期间固定左下人物常驻；素材可读区移到人物和字幕
  上方；旧 hidden 候选渲染前兼容为 PiP。横屏和 visual-only 不变。
- **验证影响**：必须覆盖全卡片时间线、旧 hidden direction、无 direction 历史候选、横/方/竖素材、
  executor 公共调用链、横屏回归与真实 1080×1920 视觉证据。
- **数据/接口影响**：不改数据库和公开 contract；`speakerMode` 枚举保持可读兼容，仅改变竖屏最终执行
  策略与新候选默认。

---

## CI-VIDEO-901 — 最低平均码率从失败门改为可诊断提醒（2026-08-19）

- **变更源**：DEC-VIDEO-055；真实渲染已产出结构合格 MP4，却因 `2890kbps < 5000kbps` 被整单取消。
- **失效工件**：T-765 SPEC §2.7 与机器验收中“最低平均码率必须失败”的发布标准失效。
- **重新派生**：codec、尺寸、fps、像素格式、色彩、时长与探针有效性仍失败关闭；平均码率不足改为
  成功任务 manifest 与步骤日志里的稳定提醒，保留 `final.mp4`。
- **不受影响**：HyperFrames 目标码率、唯一一次正式编码、final stream-copy、素材归属、项目画幅、
  用户确认与采纳、数据库和公开 contract。
- **验证影响**：执行器回归必须证明低码率保留成片并告警，同时继续证明结构不匹配和无有效探针仍失败。

---

## CI-VIDEO-836 H3 生成片段成为可采纳、可再引用的项目 B-roll（2026-08-14）

- **上游变化**：用户用真机截图指定入口：在编导输入框快捷行加“生成图片素材 / 生成视频素材”，
  两者都必须先读当前确认稿、基于稿件语义生成；视频继续走已接 Seedance 的同一路径并新增 H3。
- **失效前提**：现有 MiniMax adapter 只实现旧 v1；`asset.generate` 只接 prompt/画幅；制作页不展示
  `visualSlots` 的生成清单；生成 asset 的 description 为空，后续语义清单只看到弱文件名。
- **重新派生**：新增两个可信预调 functionKey，强制 `context.artifact.text → material.generate`；
  MiniMax H3 在既有 provider 内分流 v2；`material.generate(kind=video)` 与 runner
  复用 checkpoint/pending/采纳门；采纳素材写入有界语义 description；借鉴外部 H3 prompt 顺序提升
  tool/Skill 提示，不新增产品表面。
- **下游影响**：需要重验 ai-worker 多模态契约、backend asset runner、Assets service 语义字段、
  production workbench/候选卡、settings 鉴权探测和最终 B-roll 音频边界；公开 AI task API、数据库表、
  原有素材采纳和渲染引擎保持。
- **成本/安全影响**：沿用现有用户明确要求后才调用 `material.generate` 的生成意图和 provider
  checkpoint；提交未知仍 fail-closed。自动化不授权付费真调。
- **UI 影响**：只修改现有快捷 chip 数据和两步工具路由，不新增页面或面板；需重验点击只预填、
  image/video kind 固定、稿件读取失败不脱稿生成。
- **被移除影响**：不再新增逐镜批量费用 UI、制作页生成面板、首尾帧/参考素材选择器及其任务契约。
- **当前 Gate**：范围收窄后的 SPEC 已 `PASS[REV:fd1747eb2d8d]`，两档真实浏览器旅程通过；真 H3 smoke
  仍需用户明确预算授权。T-837 真机回归发现渠道保存完整 `/v2/video_generation` 时被再次追加路径；
  已将纯域名、v2 根、完整提交接口和带前缀中转统一到共享的确定性端点解析器，生成与设置探测共用，
  不改变 v1/Seedance 协议，也不以 404 后重试其他 POST 作为兼容手段。

## CI-COPY-792 资料驱动生成从 T-790 拆为独立工具任务 T-791（2026-08-12）

- **上游变化**：用户确认乱资料、文件、长文本和既有文案都应成为写稿 Skill 的一等输入，Skill 负责按正式结构产出；当前仅 `generate(topic/extraBrief)` 与 `verbatim` 的二分不完整。
- **失效工件**：上一轮把工具输入链并入 T-790 的合并版 SPEC、看板描述和“Skill-only PASS 失效”判断失效；用户明确两者不是同一任务。
- **重新派生**：T-790 恢复 Skill-only SPEC 与原独立评审；T-791 另建 SPEC，现有 `script.draft` 增量扩展受信多源引用与本轮 instruction，任务冻结来源长度/hash/正文，runner 把原文数据块交给 Skill；不新建页面、数据库、第二文档库或改变采纳门。
- **兼容边界**：T-727 `verbatim`、现有项目上下文读链、account overlay、模型解析、`shots[]` 和 artifact version 语义保持；普通资料驱动 `generate` 不得削弱保真导入。
- **验证影响**：新增真实对话回归，覆盖消息长文、文本附件、已有文案润色、多源杂乱资料、旧 Brief 冲突和一字不改兼容；需重跑 chat tools/runner/API/card 与语义边界门卫。
- **当前 Gate**：T-790 按既有 Skill-only PASS 继续；T-791 必须取得自己的独立评审回执后才能由 `taskctl start` 开工，两个回执不得互相复用。

## CI-COPY-791 文案 loop 从产品功能改为 `script.draft` Skill 迭代方法（2026-08-12）

- **上游变化**：用户明确指出任务是迭代现有写文案 Skill，不是新增文案实验功能。
- **失效工件**：旧 T-790 产品功能 SPEC 及其 PASS 回执不再授权实施；已起步的 UI、contract、backend module、migration、runtime profile 与模型参数传递全部撤回。
- **重新派生**：新 SPEC 只允许现版基线、Skill 单变量挑战、用户盲评与跨主题回归；自动 loop 若后续出现也只是仓内 eval 工具。
- **下游影响**：不新增产品交互、数据归属、服务契约或发布范围；T-790 的 `script.draft` schema、runner、account overlay 与合规审核保持不变。资料输入链变化只在 T-791 重新派生和验证。
- **当前 Gate**：新 Skill 迭代 SPEC 完成独立评审之前，只能建立基线与评估场景，不修改正式 `script.draft`。

## CI-COPY-790 文案优化从声音指纹改为板块权重与单主题人工 loop（2026-08-12）

- **上游变化**：用户否决 T-790 草案中的声音指纹，确认实验面只出文案、一个主题逐轮微调、前期人工评判、后期才启用自动 loop，最终目标改为优化产品各板块权重与工作流。
- **失效工件**：T-790 旧草案中声音样稿、像本人评分、48-case-first 和先拆多 Skill 的方向失效；旧文档为未确认草案，尚无生产代码、契约、数据迁移、页面或测试据此实施。
- **重新派生**：T-790 研究与 SPEC v2 改为冠军挑战制；权重落为进入与否、约束级别、上下文预算和工作流位置；新增 `human_calibration / assisted_loop / auto_experiment` 运行状态及跨主题证据门。
- **下游影响**：不作废已上线 `script.draft`、T-642/T-727/T-730、合规审核或 account overlay；T-790 在参数门确认和独立评审前仍禁止 BUILD，因此无下游代码需要回滚。
- **确认结果**：用户于 2026-08-12 确认 SPEC v2 推荐默认门槛并要求启动；当前进入独立评审，PASS 前不进入 BUILD。

---

## CI-WEB-672 官网撤下公开价盘与个人直营入口（2026-08-03）

- **上游变化**：用户确认保护代理利润优先于官网公开定价；DEC-PRICE-668 与 DEC-AGENT-671 的
  “官网公开价格/价差/个人私聊入口”部分立即失效，内部商业规则保持不变。
- **UI 影响**：Hero、价格区、代理区、页尾 CTA、浮动标签、导航和智能客服共同删除价格、利润、
  截止日期、个人微信、个人邮箱和个人二维码；获取方式统一为授权伙伴转介。
- **静态资源影响**：`shots/wechat-qr.png` 从部署集删除，历史 URL 必须 404，不能继续暴露个人联系。
- **契约影响**：无客户端、数据库、Growth、Activity 或授权契约变化。
- **验证影响**：原 T-668 正向价格测试失效，改为价格/个人信息负向扫描、授权伙伴指引、导航无死链、
  桌面/窄屏可读和线上首页/二维码 URL 读回。

## CI-PRICE-668 官网公开定价与设备口径更新（2026-08-02）

- **上游变化**：用户确认内测共创价为 599 元一次买断且 2026-08-10 截止；正式版改为 899 元/年、次年续费 199 元/年，不再提供永久买断。
- **设备影响**：一机一码为通用规则；当前只公开 Apple 芯片 Mac 与 Windows，Intel Mac 标记适配推进中。
- **UI 影响**：官网 Hero、更新承诺、定价区和购买区需要共同改写；旧 1499、永久免费更新、无订阅、笼统 Mac 支持与概念稿角标全部失效。
- **契约影响**：无服务契约、数据库或授权运行时变化；Growth 商品、Activity 激活与真实续费履约仍由各自任务负责。
- **验证影响**：新增静态 HTML 口径测试，并在部署后读取公开 HTTPS 页面确认价格与设备文案一致。

## CI-RADAR-652 雷达改写稿与来源对照解耦（2026-08-02）

- **上游变化**：用户确认项目制作页不再依赖新增大型详情 UI；雷达里已经确认的改写内容应直接填进现有项目稿面。
- **读模型影响**：`DraftWorkbenchVm` 将 `radarDraftSeed` 从 `radarComparison` 中独立出来；Project evidence 与不可变 reference 任一能提供已确认改写稿时，都可作为尚无正式稿件的编辑器初值。
- **降级语义**：来源逐字稿不再进入 Project 稿面；读取失败只影响后台证据消费，不影响口播稿可见。此前“对照对象整体为空就回到普通空稿面”的行为失效。
- **版本影响**：已有 `output_script` 继续拥有最高优先级，正式空稿也不被 seed 反向覆盖；普通 Project 不注入 seed。
- **UI 影响**：Project 稿面删除左侧对标原稿与移动端双稿页签，只保留现有单稿编辑器；来源证据仍保留在后台，不删除数据。
- **消费端影响**：制作视频提词稿、项目文案审核、Project/Copilot 产物全文读侧都必须按“正式 `output_script` → `adaptedDraftSeed`”读取，不能各自判断成空。
- **验证影响**：T-642 前端验收新增“雷达项目不渲染对标原稿”“制作视频读取 seed”“正式稿不被覆盖”回归；真实安装包旅程仍待统一构建后验证。

## CI-RADAR-651 内容雷达默认排序改为真实发布时间（2026-08-01）

- **上游变化**：用户确认列表默认顺序应表达作品的新旧，而不是数据何时被系统收录。
- **契约影响**：现有 `published_desc` 成为 UI 默认值；旧客户端 `newest` 继续保留为按收录时间排序，避免破坏兼容。
- **排序规则**：`publishedAt DESC` 为第一关键字；缺失或非法发布时间沉底；同发布时间按 `capturedAt DESC,itemId DESC` 稳定排序。
- **UI 影响**：选项改名为「最新发布」；缺失发布时间时明确显示「发布时间未知 · 收录于 …」，不再用收录时间伪装发布时间。
- **数据影响**：不改表、不回填推测值，继续诚实使用采集所得 `publishedAt`。

## CI-RADAR-650 雷达创作包读链、知识拖放与项目素材语义收敛（2026-08-01）

- **上游变化**：用户确认内容雷达改写规则为系统生成的只读制度；雷达来源 Project 必须直接恢复对标原稿与改写初稿；项目素材区对用户统一命名为「创作素材」。
- **契约影响**：`projects.intelligence.list` 增加可空 `adaptedDraft`，从已确认 transform 投影，用于修复存量 `briefDetail` 丢字段时的项目双稿读链。
- **数据影响**：无新表、无第二素材库；继续以 `ProjectIntelligenceReference` 和 `material_links` 为唯一真值。
- **UI 影响**：改写规则从伪编辑 textarea 改为只读卡片；雷达项目展示双稿，普通项目仍保持单稿；「联网找资料 / 上传管理素材」是同一项目素材库的两个入口。
- **知识录入影响**：大输入区拖放 PDF/DOCX/Markdown/TXT 直接复用既有 upload/extract/createKnowledge 链，按钮导入仍保留确认门。
- **下游失效**：T-642 SPEC 中「Project 改写策略可编辑」的旧表述已重推导；契约消费端和 contract registry 需随新增字段重验，独立评审回执因 SPEC 变更继续标记 stale，不冒充绿灯。

## CI-ONB-637 — 新手引导从技术配置改为创作成果路径（2026-07-31）

- **上游变化**：用户确认自动化不应被感知；引导改为账号、历史项目、定位、对标、选题、项目。
- **失效**：T-161/T-348 中“文本模型配置”“后台初始化自动化”为必经步骤、项目总数代表首个项目的语义失效。
- **重新派生**：引导完成态改读定位中心、内容雷达与项目来源真值；已有作品确认按账号隔离；新号动态跳过历史项目并连续编号。
- **交互影响**：设置页重新打开增加 force-open + 同页事件，完整状态也必须展示；关闭后恢复自动隐藏。
- **契约影响**：无公开服务契约、数据归属或自动化执行架构变化；仅客户端信息架构和读模型组合变化。

## CI-MODEL-610 — clientId 权威从 Activity 归位 Growth registry（2026-07-29）

- **上游变化**：应用/客户端目录唯一归 Growth；Activity ticket/introspection 只证明
  `projectKey/channelRef` 与授权事实，不再向 Creator 提供权威 `clientId`。
- **失效**：T-606/旧 T-575 中 Creator 向 Activity 请求自报 `clientId`、以及把该自报值视为
  授权 claim 的描述失效；早期 T-606 review receipt 不再代表当前契约。
- **重新派生**：Creator 只声明接受的 extension/protocol；Growth registry 解析并签入最终
  `clientId`。Creator 兼容忽略旧 ticket 响应 `clientId`，继续验 Growth-signed
  `creatoros.desktop`，并以 `projectKey + channelRef + clientId` 隔离版本/ETag 序列。
- **下游验证**：config.pull 请求/parser、locator cache、31/50/24/11/17 反例、验证报告均更新。
- **发布影响**：正式 Growth/Activity 字段契约、三端同环境联调和整改后独立复审前保持
  release `NO-GO`。

## CI-MODEL-606 — 渠道完整模型 JSON 成为 CreatorOS 条件权威（2026-07-29）

- **上游变化**：Growth T-086 最终契约允许 exact CreatorOS extension 携带长期 Key 和任意
  JSON object；verified configured 必须由 CreatorOS 自动采用。
- **失效**：T-575 的安全三键 parser、长期 Key 禁止、24 小时远端 LKG；T-604 的 Gateway、
  短 bearer、alias routing、`managed_locked` 和远端 LKG 优先全部失效。
- **重新派生**：既有 `config.pull` envelope/验签/locator 保留；extension 改为独立加密 secret
  namespace 和 `channel/local` 唯一裁决；所有模型 resolver 通过同一 authority 边界。
- **UI 影响**：设置页增加脱敏当前来源状态，本地配置始终可编辑；API/UI 不返回渠道 JSON。
- **发布影响**：CreatorOS 分支验证不能替代 Growth/Activity 跨仓联调、生产密钥和用户发布许可。

## CI-COL-001 — 内容雷达采集账号与工作区 owner 解耦（DEC-COL-001，2026-07-26）

- **范围**：只覆盖内容雷达 `creator_profile`、`favorites_folder`、`darkhorse_query`；经营数据、
  评论、分享链接、`web/rss` 和其他自动化任务都不增加账号选择器。
- **数据归属**：source/run/task/item/observation 继续以当前工作区账号为唯一 owner；collector
  仅选择服务端验证后的本机抖音登录态，不成为领域写入上下文。
- **契约影响**：新增 collector 安全列表 operation，变更三类来源的 preview/list/create/run
  语义；客户端不可提交或读取 `browserSessionRef`，现有 `web/rss` 合同不变。
- **旧工件**：T-496 的“只做收藏夹”失败方案仅留历史，由 T-537 完整替代。
- **当前 Gate**：PLAN/CONTRACT 三轮评审内部 PASS；真实双 active 账号 `RAT-537-01`
  未通过，正式 Gate 与全部 BUILD 保持 blocked。

## CI-MC-002 — 模型配置改为现有 Settings 轻量优化（DEC-MC-002，2026-07-26）

- **范围重置**：旧八槽总览、配置向导、能力平台、费用和付费 effect 不进入 BUILD；继续复用
  `settings.models.put/test`，不新增页面、公开 operation 或数据模型。
- **落地影响**：模型卡普通路径只显示预设、模型 ID、API Key；高级字段默认折叠；主模型改为
  “保存并测试”，先保存再走正式 `modelFor + streamText`，非空文本才判连通。
- **兼容性**：Kimi 开放平台与 Kimi Code 拆成两套 OpenAI Chat 预设；New API、Responses
  与中转站通过高级设置和教程说明，不把基础文本探针冒充复杂工具调用认证。
- **证据**：`f91b08cb`；T-501 定向 67 tests、前端 typecheck、目标 lint、boundary、
  orphan、reconcile 通过；未发真实 provider 或付费调用。

## CI-ODR-001 — 四个过度设计任务统一范围重置（DEC-ODR-001，2026-07-26）

- **变更**：T-516/T-517/T-518/T-519 统一退回已有能力上的最小完整闭环；框架优化明确不在
  T-527 内。本次只纠正上游真相，不修改生产代码。
- **失效/待重推导**：
  - T-517 新 `automation_job/run`、八表 grant/effect 平台和第二执行状态机 → **关闭**；
  - T-516 独立 report/issue/candidate/event/confirm/undo Saga → **关闭**；
  - T-518 Growth 上传、对象存储、客服收件箱 → **关闭**；
  - T-519 第二套上传/搜索/图谱平台 → **关闭**；
  - 四项 2026-07-24/25 旧 CONTRACT → **只保留审计历史，不再授权 BUILD**。
- **重新派生**：
  - T-517 复用 `scheduled_job/job_run` 与 `PersistentTaskService`，补 sealed kind、typed
    handler registry、单一 driver 与旧 timer cutover；
  - T-516 自动扫描只做确定性报告，AI 修改必须由用户主动触发并复用定位编辑/版本链；
  - T-518 只做本地整理/复制、打开已配置 `supportUrl` 和加密日志目录；
  - T-519 先修 Assets ownership/stable assetId/complete 幂等，再补文件夹与多视图。
- **当前 Gate**：四份 Replacement 经同一 cross-model reviewer 三轮复核，最终 PASS
  （0 blocker/0 major/0 minor）；DEC-ODR-001 已记录用户范围重置。PLAN Gate 通过，
  CONTRACT/确认②/BUILD 仍关闭。

## CI-006 — Full spec alignment (from DEC-006, 2026-06-20)

- **Change**: Implementation changed to match specs (UI stack @base-ui → shadcn/Radix; +13 entities; enum/field
  alignment; mandated dir structure).
- **Upstream touched**: ENT-* (domain model gained 13 entities), COMP-* (UI primitives), the locked UI baseline.
- **Downstream invalidated → handling**:
  - Frontend components → **re-derived** (INC-1..5) and re-verified `pnpm verify` GREEN.
  - **Frontend VISUAL baselines → INVALIDATED, NOT yet re-derived.** DEC-006 itself says "invalidates current
    frontend visual baselines (must re-baseline, R2-9)." Status: **still stale** — visual suite 25✓/27✗,
    tracked as OPEN-002. This is the one open invalidation from CI-006.
  - Mock data/fixtures → re-derived (INC-1).
- **Residual risk**: stage-12 visual re-validation outstanding.

## CI-009 — Contract module-resolution change (from DEC-009, 2026-06-21)

- **Change**: `@creatoros/contract` switched NodeNext `.js` specifiers → bundler resolution (extensionless,
  36 files); `awaiting_confirmation` added to `AITaskStatus`.
- **Upstream touched**: service contract packaging (supersedes DEC-008's "exports ./src/index.ts" note);
  AITaskStatus enum (contract primitives + frontend domain.ts).
- **Downstream invalidated → handling** (per "Service contract changes invalidate frontend integration code,
  backend contract tests, integration report"):
  - FE integration code → **re-derived & re-verified** (15b consumes the bundler-resolved contract; `pnpm verify`
    GREEN, 420 tests).
  - Contract tests → **re-run** (typecheck 0 / 61 tests).
  - AITaskStatus consumers → updated in both contract and frontend domain.ts (kept in sync).
- **Residual risk**: none known; the enum addition is additive.

## CI-012 — Monetization-weighted directional change + Seven-Step extension (from DEC-012, 2026-06-21)

- **Change**: Adopt `docs/CreatorOS-七步整合设计.md`. A **directional** data-model change ("monetization-weighted":
  `ContentOutput.content_role`; `MetricValue.metric_key` += profit/lead/conversion keys;
  `AudienceSnapshot.dimension_type` += intent/paying; `Learning.learning_type` += conversion types; Dashboard/
  Publishing surface conversion/lead) **baked into base-module plans before Wave 2/3**. Plus 6 new modules
  (positioning, monetization, candidate+audience-signal, calibration, platform-account, content-calendar).
- **Upstream touched**: ENT-* (ContentOutput, MetricValue, AudienceSnapshot, Learning), FR-* (new monetization
  FRs), contract DTOs (→ contract v0.3 for content_role + enum/key additions that cross the wire).
- **Downstream invalidated → handling** (per "Domain model changes invalidate mock data, backend spec, service
  contracts, and tests that reference changed entity IDs"):
  - Service contract → **pending v0.3 pass** (content_role on contentOutputResource + enum/key additions). Not
    yet done at reconciliation time.
  - Base-module plans (Projects/Analytics/Reviews/Learnings/Publishing/Dashboard) → to be edited AFTER Wave 1,
    BEFORE Wave 2 launch (DEC-012 execution timing). Not yet done.
  - Mock data + fixtures referencing these entities → **will need re-derivation** once the fields land.
  - Backend spec + tests referencing these entities → **will need update** when the new keys/roles are persisted.
- **Governance note**: DEC-012 chose **pragmatic ID continuation, NOT the formal C-1 freeze**. So new FR/ENT IDs
  are appended without a freeze ceremony — recorded as **accepted-risk** (see OPEN-004). This is the single
  largest in-flight invalidation: a directional change to already-built base modules whose downstream
  re-derivation is scheduled but incomplete.
- **Residual risk**: HIGH until contract v0.3 lands and the base-module plans + fixtures are re-derived. Track
  each as it completes.

## CI-013 — 模型协议枚举增加 Responses（DEC-019，2026-07-23）

- **变更**：`apiFormat` 从 `anthropic | openai_chat` 扩展为
  `anthropic | openai_chat | openai_responses`，并把 Chat/Responses 的 SDK 与 Pi 路径显式分开。
- **上游变更**：FR-069、FLOW-023、API-008、API-009；设置模型配置 contract 与协议路由。
- **下游失效与处置**：
  - contract resource/operation → **已重派生并重验**（TEST-001）。
  - settings 持久化、导入导出、解析 → **已重派生并重验**（TEST-002）。
  - Vercel AI SDK provider factory → **已重派生并重验**（TEST-003）。
  - Pi Agent 协议映射 → **已重派生并重验**（TEST-004）。
  - 设置页连接测试与协议选择 → **已重派生并重验**（TEST-005/006）。
  - desktop sidecar Pi lazy modules → **已重派生并重验**（TEST-007）。
  - 旧研究结论“Responses 用不上” → **已标记被 T-471 SPEC 取代**。
- **未关闭风险**：
  - T-471 实现前红测没有可审计输出，Gate FAIL 历史保留。
  - 真实 New API token + 实际模型 Agent 循环会产生费用，未经授权未运行（RISK-011）。

## CI-TSB-001 — 三系统 runtime 权威、双入口与 lifecycle（DEC-TSB-001，2026-07-26）

- **变更**：单一 `supportUrl` 拆成官方产品 Bug `bugFeedbackUrl` 与渠道商业售后
  `channelSupportUrl`；Creator 只消费 AM signed `channel-runtime-v2`，并按复合 identity、
  source digest 与版本防降级。
- **上游**：Growth canonical/DEC-050 新周期 PASS；AM API-AM-007/011/012 与共同 projection、
  reassignment fixtures。
- **生命周期**：
  - active：按签名字段展示；
  - sales_disabled：purchase/renewal 必须 null，保留 brand/support/download/Bug；
  - terminated：只采纳 AM 完成全量原子改绑后签名的新 target identity，不 fallback、不 tombstone。
- **下游失效**：
  - T-396 三键 `.channel-links` 明文 cache 与单 `supportUrl` → **invalidated，T-534 重派生**；
  - T-518 `supportUrl` 作为 Bug 入口 → **invalidated，保留本地整理/复制/打开页面/零上传语义**；
  - T-531/T-532 若包含自动上传、附件或回执 → **冻结，不是 T-534 BUILD 输入**；
  - `contract/src/local-platform.ts`、IssueFeedbackDialog、激活页、设置购买与服务、Rust license parser/
    cache、本地 runtime reader/API 及其测试 → **已重派生并重验**；
  - 旧 TS channel-links reader 与 `/local/support-channel` → **已删除**；Rust 生产路径不再写
    `.channel-links`，旧测试辅助函数仅在 `cfg(test)` 编译。
- **安全影响**：明文 `.channel-links` 不能证明签名来源，改由现有加密 `.license` 一次保存
  license identity + verified runtime；旧明文不自动迁移。日志/API 不输出 code、identity、
  URL query/fragment、sourceDigest 或签名。
- **当前 Gate**：Creator 独立评审三轮已收口，contract/scope/fixture 与 BUILD 定向、全量回归
  PASS；`next build` 仍被当前 HEAD 中 T-535 已提交的 `instrumentation.ts` Turbopack
  code-frame panic 阻断，不归入 T-534 代码范围，也不伪报发布构建全绿。证据见
  `GATE-T534-BUILD.md`。

## CI-TSB-002 — Activity 最小运行快照与 Growth 业务解释权（DEC-BOUNDARY-002，2026-07-29）

- **变更**：明确 Activity 的 `projectKey/channelRef` 只是授权范围快照，不是渠道、应用或模型
  业务目录；Growth 是唯一业务解释方，CreatorOS 只消费两边签名结果。
- **兼容**：不删除现有激活码、project/channel 字段或本机 license；用户无需重激活。
- **下游重派生**：
  - T-606 authority contract → 增加 §1.1 与 TC-T617-11..13；
  - Activity v1/额外 client/application 字段 → 明确 fail-closed，不再“兼容忽略”；
  - AI 日志、raw error 与异步任务 modelKey → 必须统一脱敏为 `channel-managed`。
- **发布影响**：不新增 wire 或 migration；Growth/Activity live HTTPS E2E、正式 key 和用户
  发布许可仍未完成，不能把单仓测试写成已上线。

## CI-FDB-003 — 产品 Bug 临时飞书降级（DEC-FDB-003，2026-07-26）

- **变更**：签名 `bugFeedbackUrl` 缺失时，问题反馈弹窗打开内置官方飞书表；自动发送禁用，
  日志仅由用户压缩后手动上传。
- **不变边界**：商业入口仍只读签名 runtime；CreatorOS 不接收反馈数据、不自动上传日志，
  Growth/AM 长期权威不变。
- **下游重派生**：`IssueFeedbackDialog` 文案、按钮状态、fallback URL 与组件测试已重派生；
  `open-url` 可信桌面适配器继续复用。
- **外部入口验证**：已创建独立的飞书 Form View 并开启匿名链接，应用只打开
  `https://my.feishu.cn/share/base/form/...`；用无登录态浏览器验证可填写，且不会暴露
  Base 底表或其他用户的反馈记录。表单保留日志附件字段，内部“处理状态”不对填写者展示。

## CI-TSL-001 — T-076-CREATOR 权益领取与纯文字反馈上线增量（DEC-TSL-001，2026-07-27）

- **产品边界变更**：P-04/NFR-PRIVACY 从“应用内发送固定禁用”改为“只有用户明确确认后，可向
  Growth 官方收件服务提交用户已预览的纯文字并回显真实编号”。contract 必填的非敏感应用版本、
  系统名称和语言必须在高级诊断可见并纳入本次确认；日志、附件、截图、激活码、token、手机号、
  机器标识及其他用户内容仍禁止自动上传。
- **上游不变**：Growth 继续拥有渠道、商业关系、反馈正文与优先级；AM 继续拥有
  license/entitlement/claim 与签名；Creator 只做终端交互和可信消费。
- **受影响工件**：
  - `docs/产品定位.md` → 已重派生；
  - DEC-FDB-003 → 保留为服务不可用/安全门关闭时的手动降级，不再是永久唯一流程；
  - T-538 feedback adapter/UI → 由 T-575 承接收口，不能并行修改同一路径；
  - T-534 runtime、parser、cache 与双入口语义 → 不失效，只需回归；
  - Growth T-076/AM claim exact contract → AM consume 已 Round 2 PASS，最终 descriptor/vector
    已逐字复制并完成 SHA pin；Growth API-210..212 Round 2 也已 PASS（receipt
    `3bb73429a8e3`），0028 migration、API-210..212、durable delivery/readiness 本地 BUILD
    全绿。HARD-575-001 仅保留 live HTTPS 三仓 E2E、部署、正式密钥与 release receipt。
- **发布影响**：当前 0.2.0 已发布主功能不变；两项新能力默认关闭。本任务不 commit、push、
  deploy 或重新发布，整体 GO 后再由用户决定。
- **2026-07-29 产品配置增量**：新增 Activity `config.pull` ticket → Growth signed opaque
  bundle → Creator 产品 parser/LKG。T-534 `channel-runtime-v2` 不失效，Growth bundle
  `channelConfig` 不成为第二套 runtime；只增加 server-only `modelPolicy` 安全投影。
- **配置/缓存影响**：增加默认关闭的 client-config build inputs 与
  `.client-config-lkg` AES-GCM 缓存；旧 `.license`、用户内容、BYOK secret 和已发布主功能不
  迁移、不清空。live HTTPS E2E 或公钥/keyId 缺失时保持关闭。
- **2026-07-29 Growth 单运行时路径适配**：上游提交 `a74b92e` 已将真实 API-216 transport
  从 `/api/v2/client-config/bundles/current` 收敛为
  `/api/client-config/bundles/current`。Creator 只同步固定 path 与测试；授权、签名、缓存、
  fail-closed 和 capability 默认关闭边界均不变。
- **安全输入边界**：浏览器不接收 claimToken。Creator 生成 device session，user code 只用于
  Growth 登录态 ownership+reauth 批准；device secret/verifier 只在内存或 OS 安全临时区。
  claimToken 从 API-212 approved no-store launch 到达后，唯一允许的短期持久化是首次 AM 出网前
  的独立 OS 原生凭据 pending-consume journal；普通文件、数据库、query/fragment、剪贴板、日志、
  crash report、APM 与遥测全部禁止。AM 以同 requestId+同 consume digest exact replay；只有
  `.license` 原子落盘并读后验真才删 journal，长期只保存正式授权事实与既有 code。
- **恢复影响**：HARD-575-002 的 wire 方案已由 pending journal 收敛，不新增 Growth ack/replay
  API；native 实现与确定性 fault tests 已证明 journal-before-network、prepared/attempted exact
  replay、签名验证、`.license` 原子写入/读回和清理顺序。真实 OS keychain 进程强杀、AM commit
  后丢包及 Windows replace 逐点强杀仍是 release 验证门，不能写成已完成真机矩阵。
- **反馈 readiness 裁决**：DEC-TSL-002 以 `avoid` 关闭 HARD-575-003，不新增 API、表、角色或
  健康平台。能力由当前事务内联证明：AM signed feedback context → Growth API-170 → closed
  `202 publicRef`；任一步失败保留草稿、明确未提交并进入复制文字 + 官方反馈页。历史成功、
  URL、telemetry 或 UI state 不得冒充本次成功。
- **完成红线**：DEC-TSL-002 已授权默认关闭的 Creator BUILD，禁止 Round 4。Growth
  API-210..212 PASS、最终 device-flow fixture 逐字一致、真实 provider/领取 UI、journal
  fault-injection 与跨系统联调未闭环时 capability 不得开启、T-575 不得完成。

## CI-CR-017 — 内容雷达人工上传逐字稿增量（T-603，2026-07-29）

- **变更**：在既有“手动转写”旁增加人工上传 `.txt/.md/.srt/.vtt`，上传成功后写入同一
  `ItemTranscript` 并沿用现有逐字稿拆解、选题候选和 Project 来源证据链。
- **数据归属不变**：`backend/src/modules/intelligence` 仍是唯一写者；不新增表、文件资产、
  对象存储或 worker 任务，浏览器只把规范化文本交给 typed operation。
- **不可变边界**：只允许尚未完成且无活动转写的作品写入；已有 `done` 或
  `queued/running` 不被覆盖。相同已完成正文的重试只读回既有资源。
- **受影响工件**：
  - `FR-CR-022/FLOW-CR-010/AC-CR-025` → 新增并待独立增量评审；
  - 内容雷达服务契约 → 新增 `API-CR-032`；
  - `contract/src/operations/intelligence.ts`、intelligence transport/service、内容雷达详情页
    与测试 → 待 BUILD 重派生；
  - 既有 `FR-CR-007` ASR 持久队列、`FR-CR-012/013` 选题与 Project 证据门不失效，只需回归。
- **发布影响**：不改数据库 schema，不迁移历史数据；当前版本不受影响。T-603 完成前不得显示
  无接线的上传按钮。

## CI-CR-018 — 内容雷达逐字稿纠错与选题后锁定增量（T-622，2026-07-29）

- **变更**：逐字稿由“完成后永不覆盖”调整为“首个成功选题候选前可纠错、候选产生后永久
  锁定”；录入统一支持粘贴正文与文件导入，未锁定时允许替换或重新转写。
- **上游失效**：`DEC-CR-017` 第 3 点及 `CI-CR-017` 的“已有 done 不被覆盖”边界已被
  `DEC-CR-018` 定向替代；其余文件格式、正文上限、唯一写者和不保存原文件规则继续有效。
- **旧版本语义失效**：既有 `FR-CR-012/013`、`NFR-CR-008`、`API-CR-020/022` 与
  `AC-CR-010` 中的 `transcriptVersionId`、重新转写新增版本和逐字稿版本表假设全部失效；
  统一重派生为成功候选 `outputSnapshot.transcriptHash` + transform/source snapshot 锚。
- **数据归属不变**：继续复用当前作品唯一 `ItemTranscript`，不新增版本表、历史资产或第二
  套逐字稿真相；backend intelligence service 仍是唯一写者。
- **待重派生工件**：
  - 内容雷达服务契约中的人工上传、重新转写与选题候选状态机 → 待补充替换条件、永久锁和
    `transcriptHash` 并发校验；
  - `contract/src/operations/intelligence.ts`、backend intelligence service、worker 回写路径
    与测试 → 待 BUILD；
  - 内容雷达详情页 → 待增加粘贴/导入共用编辑框、替换、重新转写、生成前确认和锁定态。
- **发布影响**：不改数据库 schema，不迁移历史数据；在契约与 backend 锁定检查完成前，不得
  只开放前端覆盖按钮。

## CI-POS-019 — 定位母版重建与复盘 Copilot 单入口（T-623，2026-07-29）

- **变更**：定位中心“新建定位母版”从只清空前端草稿升级为真实
  `positioning.master.reset`；复盘页“帮我复盘”从全局深链改为既有项目编导右栏预填。
- **数据影响**：`creator_profiles` 增加 `statement_version_floor`，存量默认 0；重置时清空
  profile 可变字段并记录当前最大版本。`positioning_statements` 不更新、不删除，历史完整保留。
- **读取重派生**：当前定位与未指定 statement 的定位 Gate 只读取版本号大于 floor 的陈述；
  历史列表继续读取全部版本。定位 AI 与其他 creative-context 消费面经同一
  `getPositioningCenter` 自动得到空母版，不需要各下游单独过滤。
- **交互重派生**：定位编辑 Dialog 禁止外部点击关闭；项目 layout 统一挂载
  `DraftChatRequestProvider`，复盘三个入口只发送 `review.analyze` 预填请求，不自动发送、
  不覆盖用户正在输入的文字、不打开第二个 Copilot。
- **兼容与限制**：旧版本号继续递增；AI 仍只产候选，用户采纳后经既有 backend service 落库；
  小屏继续遵守阶段右栏现有 `xl+` 显示约束，不回退全局弹窗。
- **验证**：contract 全量、positioning service/contract/repository、定位与复盘前端定向、
  Copilot embed 预填、三包 typecheck、boundary 与 reconcile。

## CI-POS-022 — 定位历史从“陈述版本”修正为可恢复的完整母版快照（T-632，2026-07-31）

- **根因**：重置只在 `creator_profiles` 清空可变画像/规则；`positioning_statements` 历史没有
  保存这些字段。旧“复制为草稿”只预填陈述，却把当前已清空 profile 传给其余页签，形成假恢复。
- **数据变化**：`positioning_statements` 增加 nullable `master_snapshot`。新陈述创建时写完整
  profile 快照；重置前为当前真实母版补快照或追加自动备份。历史正文仍不可变，旧 null 行不回填
  猜测值。
- **契约变化**：statement resource 暴露 nullable `masterSnapshot`；新增
  `positioning.master.restore`，输入 statementId，返回恢复后的 profile 与新追加的 statement。
- **交互变化**：完整快照显示“恢复此版本”并确认后真实回写；无快照旧记录只显示
  “复制定位陈述”与明确缺失提示。
- **失效与重派生**：T-623 中“历史只复制陈述即可”的限制被本条定向替代；当前定位 floor、
  AI 候选采纳、下游统一读取和复盘 Copilot 不失效，只需回归。
- **验证**：真实 PGlite migration/事务、完整字段写后读、跨账号 404、旧记录降级、定位中心
  normal/minimum viewport 交互与刷新回显。

## CI-RCN-020 — 历史作品重建依赖与短窗口侧栏修复（T-638，2026-07-31）

- **变更**：导入作品只先排逐字稿；已有真稿或真稿刚绑定时才排 `reconstruct.project`，同因批量
  失败通知跨轮聚合；低高度侧栏固定保留账号与用户身份。
- **数据影响**：无 schema、迁移或归属变化；沿用 `output_script` 当前版本中的 transcript/source
  判真稿，`source=image-album` 明确不参与重建。
- **执行影响**：`transcribe-runner` 新增可选后续端口，由 composition root 通过既有
  `ai.tasks.create` 排重建；幂等和任务终态继续由现有 ai service 管理。
- **前端影响**：Copilot 通知增加重建失败语义聚合与数量；侧栏采用 `dvh`、导航内部滚动、底部
  身份区不收缩，短高度隐藏次要提示卡。
- **失效工件**：旧 `reconstruct-enqueue` 中“同轮同时排两个任务、靠以后轮次碰巧成功”的注释
  与测试已重派生；其余自动化、模型配置和数据源契约不变。

## CI-ASR-021 — 历史逐字稿渐进回填与小米 MiMo ASR（T-639，2026-07-31）

- **产品变化**：公开历史作品与指标继续全量采集，但统一采集尾部每轮最多只补 5 条缺失逐字稿；
  手动单条转写不受限制。未配置 ASR 时后台不创建注定失败的任务。
- **模型配置变化**：`transcribe.audio` 从隐式本地 Whisper 兜底改为云端 ASR 必配；普通设置路径
  只见供应商预设、模型名和 Key，provider/baseUrl 收进高级设置。旧显式 `whisper-local` 与已有
  SiliconFlow/OpenAI/Groq 配置保留兼容，不迁移、不覆盖。
- **执行变化**：新增 `xiaomi-mimo` adapter，走官方 `chat/completions + input_audio`；现有 OpenAI
  multipart adapter 不改。超过 MiMo 单次 base64 上限的 MP3 按帧安全切片并顺序合并，不增加
  用户视频大小限制。
- **数据与契约影响**：无 schema、迁移或公开 operation 变化；仍由既有 backend service port
  写逐字稿，AI worker 不直接写库；仍复用唯一统一采集任务，不新建调度器。
- **失效工件**：T-160 中“未配置就自动下载并运行本地 Whisper”的默认产品语义被本决策替代；
  adapter 代码仅作旧显式配置兼容。旧研究和历史 SPEC 保留原貌，由 T-639 作为当前增量真相。

## CI-ASR-022 — ASR 建议配置与本地 Whisper 回退纠偏（T-641，2026-07-31）

- **产品变化**：ASR 仍在重点模型配置区，但由“必配”纠正为“建议配置”；未配置不阻断用户。
- **执行变化**：完全未配置云端 ASR 时恢复 `whisper-local` 自动回退，后台渐进回填与手动转写
  均继续执行；有效云端配置仍优先，显式错误配置仍报错。
- **前端变化**：删除“未配暂停/必配”语义，改为解释云端配置可避免本地转录过慢，并明确未配
  仍可使用本地 Whisper。
- **数据与契约影响**：无 schema、迁移、公开 operation 或数据归属变化。
- **失效与重派生**：DEC-ASR-021 第 3、6 条和 CI-ASR-021 的必配语义被 DEC-ASR-022 替代；
  T-639 SPEC、解析测试、渐进排队测试、设置页测试与可见文案证据需按 T-641 重派生。

## CI-COPILOT-023 — 项目引用直读与标签收敛（T-642，2026-07-31）

- **交互变化**：`@` 选择不再把完整项目标题写进消息正文；上下文标签改为“项目 · 短标题”，
  完整标题保留在 tooltip/无障碍名称。
- **工具变化**：可信项目上下文绑定后，详情、产物索引与产物正文工具可缺省使用绑定 ID；全量
  `context.projects` 不再暴露给该回合，杜绝翻页找当前对象。
- **数据与架构影响**：无 schema、迁移、公开 operation 或数据归属变化；复用既有 user-scoped
  详情/产物读端口，AI 仍不写库。
- **失效与重派生**：T-039b 的“把 `@项目标题` 写入 textarea”展示约定被替代；T-106 只靠提示词
  禁止全库摸索的保护升级为 host 侧工具集合约束，相关前端和 chat-runner 测试需重派生。

## CI-AI-025 — 创作型 AI 工具从全量强校验改为结果优先（2026-08-01）

- **上游变化**：用户确认创作内容无需 100% 准确后才显示；长链改为分段生成、阶段检查点、
  局部失败与局部重试。
- **立即失效**：T-642 SPEC 中“单次复杂对象完整成功后才写快照/展示”的语义，以及内容雷达
  preview 的整链失败、整链重试、长稿 JSON 强校验实现。
- **重新派生**：T-642 增加来源拆解、选题与策略、改写初稿三个阶段；已有结果增量写入现有
  `output_snapshot`，完整性只约束采纳；UI 逐段显示状态与局部错误。
- **待审计**：`runStructuredNode` 的所有生产调用按创作型、判断/控制型、轻量提取型分类。
  创作型优先拆阶段/纯文本；控制型维持严格校验但消除重试叠加；不得全局把 schema 改成 optional。
- **契约与数据影响**：第一阶段不新增表或公开 operation；内部 JSON 快照增加进度元数据，仍由
  backend service port 写入。若后续工具需要公开 partial contract，必须单独登记契约影响。
- **验证影响**：新增阶段失败保留、按阶段重试、非关键缺字段可展示、采纳门槛、调用次数与
  页面刷新读回测试；原“失败后 outputSnapshot 必为 null”的测试预期失效。

## CI-POS-652 — 定位前采改为全账号必经的访谈与证据工作流（T-652，2026-08-01，已确认·已实现待验）

- **产品变化**：定位前采不再只服务零作品新号；所有账号先完成同一套核心访谈，再按用户选择将
  历史作品作为沿用证据、转型参考，或在“从零开始”路径完全排除。
- **立即失效**：`chatbox-surfaces.ts` 和 `chat-tools.ts` 中“老号不走完整访谈、最多补问 1～2
  题”的语义；作品数据自动高于用户未来意图的隐含优先级。
- **候选与证据**：前采需保存可恢复的 session、带来源的用户回答/作品/联网证据和方向候选；
  正式定位真相仍是现有 profile + statement/version，只有用户采纳后由 backend service 写入。
- **作品与执行影响**：不等待全量逐字稿；从高表现、近期、中位、异常和用户指定作品抽样，缺失
  真稿时按需排单条转写。联网失败或非关键回答缺失不得阻断候选生成。
- **交互变化**：一次一问的编导访谈与实时证据板取代长表单；显示真实主题进度、来源标签、冲突
  卡和 2～3 个可比较方向，不新增第二个 Copilot 弹窗。
- **用户已确认**：重新定位期间保留当前母版继续服务下游，采纳新方向时原子切换；这替代
  T-623“点击即清空再访谈”的既有语义。
- **已重派生**：定位 discovery 契约/持久化、positioning.generate 上下文与提示词、定位中心 IA、
  代表作品锚点、research port 与原子采纳映射；历史恢复和下游约束保持原真相并完成聚焦回归。

## CI-MODEL-645 — 渠道模型 authority 从整包改为逐能力（2026-08-02）

- **变更源**：用户确认 `DEC-MODEL-027`，渠道只锁定完整且客户端支持的 capability。
- **受影响契约**：T-606 §2/§4/§5/§8；T-645 新 SPEC 成为增量权威。
- **受影响实现**：渠道 payload parser、文本/多模态/ASR resolver、异步 authority pin、settings
  本地凭据存储与设置页模型区域。
- **受影响测试**：T-606 整包 fail-closed 用例需保留安全层语义；新增 mixed managed/local、服务
  Key复用、渠道切换隔离、设置页 normal/minimum viewport 用例。
- **不受影响**：Activity ticket、Growth bundle 验签、版本单调性、缓存加密、白标链接、T-653
  托管子 Key后置范围。
- **下游状态**：增量 SPEC 已通过 `PASS[REV:5dfe24b42eb7]`；CreatorOS parser、运行时、加密
  service Key、公开 API 与设置页 mixed 状态已实现并通过聚焦 Gate。Growth 托管子 Key仍按
  T-653 后置。

## CI-SEC-656 — 桌面 verdict 基础加固（2026-08-02）

- **变更源**：用户确认 DEC-SEC-029，要求先增加 CreatorOS 的基础防护。
- **立即失效**：T-451 SPEC 中“构建冒烟可通过生产环境变量跳过 token 验签”以及“base64 verdict
  私钥连同 `[T451-BOUND]` sentinel 编进 Rust”的实现细节；T-451 的授权模式、token payload、
  Sidecar 公钥验签和 activation-only 语义不变。
- **重新派生**：冒烟改为签发真实短时 token；`build.rs` 生成随机 mask blob，Rust 只重组 raw
  seed；最终安装产物增加私钥、sentinel 与 bypass 泄漏扫描。
- **测试影响**：verdict gate、密钥材料、obfuscate smoke、release workflow 与 Rust license tests
  必须重派生；已授权/未授权/错端口/过期/坏签名行为保持兼容。
- **不受影响**：Growth/Activation Manager HTTP 契约、离线授权政策、数据库归属、渠道模型配置、
  UI 与用户激活流程。
- **诚实边界**：客户端 mask 不是服务端信任根；专业本机逆向仍可重组或 dump seed。真正移除
  客户端私钥需要 purpose-bound 服务端票据与模型中转站终判，未被本任务冒充完成。

## CI-POS-657 — 定位前采联网默认国内中文并替换未采纳候选（2026-08-02）

- **产品变化**：联网补充默认搜索中国大陆、简体中文内容；用户可以显式切换为全球或语言不限。
- **查询变化**：只在用户可见短关键词后追加公开地区/语言限定；不读取或外发访谈答案、作品内容、
  逐字稿或本地文件。
- **结果变化**：定位服务按关键词相关性、中文内容和国内来源优先级二次筛选；无合格结果时显示真实
  空态，不再用英文境外页面填充证据板。
- **覆盖语义**：二次搜索替换上一轮未采用候选，已经采用的证据继续保留；这取代 T-652 初版
  repository 对全部历史搜索结果永久 append 的实现细节。
- **契约影响**：`positioning.discovery.research` 和联网证据新增向后兼容的 `market`、`language`
  字段，旧客户端/旧记录默认解释为 `cn`、`zh-CN`；无新表和迁移。
- **验证影响**：新增搜索范围、无关英文过滤、国内来源排序、二次覆盖/已采用保留和前端请求契约
  用例；T-652 其他访谈、证据采纳和正式定位原子写入语义不变。

## CI-REL-675 — Windows 默认发布切回少文件 production closure（2026-08-03）

- **变更源**：用户确认 DEC-REL-032，要求恢复 2026-07-26 已验证的快速打包逻辑并长期作为默认。
- **立即失效**：Windows 正式 `build` job 复用跨平台 full runtime image、把完整依赖树装入 NSIS 的
  既有实现，以及“产物先上传、再检查首次启动”的上传顺序。
- **重新派生**：正式发布和候选 RAT 共同调用 production closure 入口；Windows 正式包继续经过
  当前保护、身份、授权、更新器和 attestation 链，再执行结构、安装、首启与卸载 Gate。
- **安全影响**：Windows closure 暂停依赖旧 `node_modules` 布局的 V8 bytecode 步骤，但保留其余
  保护和最终泄漏扫描；这不改变 verdict 信任边界，也不得作为降低授权门的理由。
- **工件影响**：标准工件名仍为 `desktop-windows-x86_64`；失败构建仅上传 T-675 诊断证据，不能
  上传或发布用户安装包。
- **不受影响**：macOS 打包、业务数据、数据库迁移、公开服务契约、用户功能与更新渠道语义。
- **验证影响**：新增 setup ≤600,000,000B、runtime ≤3,500 文件、零 `node_modules`、零链接、
  安装 ≤300 秒、首启 ≤45 秒的机器门禁，并保留断网非白屏、主动卸载和产品身份验证。

## CI-MODEL-679 — 渠道真实模型展示与白名单内选择（2026-08-04）

- **变更源**：用户确认 DEC-MODEL-032，CreatorOS 必须显示实际模型并支持选择。
- **受影响契约**：T-645 `models[capability]` 从“只解析唯一默认项”扩为“默认项 + 完整有效
  白名单”；T-679 接入范围同步扩充。
- **受影响实现**：渠道模型 parser、按 scope/capability 的选择持久化、设置页模型区、连接测试、
  文本/图片/视频同步调用与异步 authority pin。
- **安全约束**：选择接口只接受白名单 option ID，后端从已验签配置重新解析真实
  `connectionId/model/settings`；禁止相信前端提交的模型参数。
- **验证影响**：新增模型可见性、切换后真实调用、刷新/重启恢复、白名单删除回退和篡改拒绝
  测试；T-645 原有 service Key 隔离与 fail-closed 语义保持。
- **下游状态**：T-679 保持待办；CreatorOS 未实现前不得宣称终端已支持模型选择。

### CI-MODEL-679A — Growth `activation_managed` 单 Key 目标覆盖旧四套 `user_input` 模板（2026-08-04）

- **变更源**：用户再次确认 Growth 当前唯一生产目标：一个 `omnihi-main` service、一个 Activity
  权益子 Key、文本/图片/视频三个 connection，首期无 ASR。
- **旧语义失效**：T-645 §2/§3/§7/§9 中“当前渠道模型 Key 均由用户输入”“OmniHi 视频未接适配器”
  和“T-679 不实现受管子 Key”的范围描述，不再适用于该生产模板；历史 `user_input` 配置兼容不删。
- **重新派生**：CreatorOS 消费 Growth API-265，Key 只进本机密文凭据库；设置页无托管 Key输入；
  模型下拉完全渲染 Growth 已验签数组，保存 `id/model`，无效旧选择回唯一默认项。
- **运行参数**：文本、图片和视频都必须消费选中模型的已验签 `settings`；多模态适配器只读取
  自己认识且通过范围校验的字段，不能把未知渠道字段原样发给上游。项目中显式选择的画幅优先于
  渠道默认值，其余默认尺寸、时长、分辨率、音频开关和提示词长度由 Growth 动态下发。
- **测试影响**：补 no-store/脱敏、单 service 共用、动态 13 项顺序、id/model 分离、白名单篡改拒绝、
  桌面自动同步与 web 零请求测试；真实 Growth/Activity/OmniHi HTTPS 仍是独立 live Gate。

## CI-REL-697 — Growth 配置签名材料正式生成（2026-08-05）

- **变更源**：用户授权由 Agent 生成 CreatorOS 渠道配置验签所需的 `keyId` 与 key。
- **安全决策**：项目文档只登记公开 `keyId`、Ed25519 公钥和仓库外私钥引用；私钥内容不得进入
  Git、项目文档、CI artifact、聊天或安装包。
- **运行影响**：Growth 生产环境使用 `THIRDSPACE_CLIENT_CONFIG_SIGNING_*` 读取私钥并签名；
  CreatorOS 正式构建只注入 `CREATOROS_GROWTH_CONFIG_KEY_ID` 与公开公钥。
- **验证影响**：增加真实签名/验签、私钥权限、两仓私钥内容扫描和 CreatorOS 正式构建材料解析证据。
- **不受影响**：Activity 票据、渠道业务配置、模型清单、受管子 Key、数据库和用户界面均未改变。

## CI-CREATION-726 — 退役独立“论点骨架”（2026-08-08）

- **变更源**：用户确认 DEC-CREATION-040；T-726 取代 T-127 原 SPEC 中把“论点骨架”作为
  用户可见独立步骤、可新建能力和下游上下文的现行方向。
- **立即失效**：原设计 §A、§C、§D、§E、§F、§G 中的论点面板、“立论点” CTA、
  `planning.thesis` 新建/确认、重建物化、写稿上下文与制作素材读取；历史事实与历史数据不改写。
- **重新派生**：项目创作链改为“准备素材 → 直接写稿”；新写稿、策划、重建和制作不再生成或
  消费 `thesis_tree`，项目素材仍经 `materialLinks` 与脚本点名进入 B-roll。
- **契约与界面影响**：移除 Copilot 工具注册/标签/候选卡、稿面组件绑定、设置能力声明和现行教程；
  旧客户端直调与历史候选确认统一 fail closed，reason=`capability_retired`。
- **数据影响**：不删 `thesis_tree` 枚举、artifact/version、旧任务、旧脚本或旧成片；不做数据库
  迁移，generic artifact 只读解析继续兼容。
- **验证影响**：需覆盖稿面普通/最小视口、旧入口零写入、CreativeContext 零读取、B-roll 项目素材
  不丢、历史 hash 不变和退役 runner 不可达；T-127 其余写稿、审核、版本与历史兼容语义保持。

## CI-CREATION-730 — 恢复可选“立论点”UI与显式采用（2026-08-09）

- **变更源**：用户确认 DEC-CREATION-041；T-730 重新开放 T-726 已退役的用户入口和新建链，但不
  恢复强制前置或无提示消费。
- **局部失效**：T-726 的 FR-726-01“用户表面完全退役”、FR-726-02“停止所有新写入”以及
  `capability_retired` 新建门需要按 T-730 重新派生；T-726 的历史数据保留、制作零 thesis 读取、
  项目重建零自动写入和语义边界继续有效。
- **重新派生**：恢复 `planning.thesis` candidate、固定四栏面板和编辑保存；新 version 以
  `scriptBasis.status=adopted|inactive` 显式表达是否进入 `script.draft(generate)`，历史无标记版本
  默认不消费。
- **不受影响**：T-727 `verbatim` 保真导入、脚本版本、审核、发布、制作与 B-roll 数据源；不新增
  数据表或迁移，不删除任何历史 artifact/version。
- **后续拆分**：电商等分场景模板、字段改名和任意结构自定义移入 T-731，不属于 T-730 验收。
- **验证影响**：更新 T-726 的退役测试为可选入口与标记门测试；新增未采用/采用/停止使用三态、
  MiniMax 路由、保存刷新、逐字稿优先级、无词面素材预挂和真实稿面普通/最小视口旅程。

---

## CI-VIDEO-794 — 信息卡内部决策新增可选内容关系（2026-08-12）

- **变更源**：用户确认 DEC-AI-045，要求把粗糙的“文字冒出来”升级为内容驱动动效。
- **受影响契约**：内部 `video.cards` 候选与 `videoRenderCard` 新增可选 `visualPlan`；字段缺省时旧候选
  继续按 `kind/motion` 解释，无公开 API、数据表或迁移。
- **重新派生**：组装器透传已校验关系，HyperFrames/GSAP 按 magnitude、contrast、sequence、
  cause_effect、replacement、statement 落固定配方；不再依赖标点猜这些新关系。
- **安全边界**：关系选择归 AI；代码只校验原文溯源、必要 role、部件数、长度、画幅和字幕/人物边界。
- **验证影响**：新增 prompt、runner、contract/assembler、renderer 聚焦测试；同题 v1/v2 评分与横竖版浏览器预览。
- **不受影响**：制作确认、真实素材优先级、用户采纳、主视觉互斥、数据库、模型配置与视频执行器入口。

## CI-COVER-795 — 封面生成新增可选用户画面要求（2026-08-12）

- **变更源**：用户确认 DEC-AI-046，希望自己指定封面里必须出现或排除的内容。
- **受影响契约**：内部 `cover.generate` 与分派端口新增可选 `visualRequirements`；旧调用不传时行为不变。
- **重新派生**：`cover.brief` v3 把该字段作为视觉硬约束，cover runner 在最终生图 prompt 再次注入，
  候选诊断记录实际使用的要求。
- **安全边界**：该字段只约束视觉，不成为数字、成绩、身份或新闻事实来源；事实、版权、安全和内容
  审核仍然 fail closed。
- **验证影响**：新增 Skill 模板、工具 trim/透传、chat runner、cover runner 双层注入与空值兼容测试。
- **不受影响**：项目归属、参考图读取、模型配置、生成 provider、数据库、资产 pending 状态与用户采纳门。

### How to use this file going forward

1. Any confirmed change to an **approved** upstream artifact (FR/NFR/FLOW/ENT/IA/PAGE/COMP/contract/security/
   release criteria) gets a `CI-###` entry here BEFORE the change is marked done.
2. List the invalidated downstream artifacts explicitly and mark each: re-derived / re-verified / still-stale.
3. `node orchestrator/process/reconcile.mjs` checks that decisions tagged as invalidating have a matching
   `CI-###` entry (see process/README.md).
## CI-COPY-824 连续口播与制作分镜从单次生成拆为两个 Skill（2026-08-13）

- **上游变化**：用户确认除 T-820/T-814 外完成剩余事项并打本地验收包，接受 T-824 每次写稿新增
  一次文本模型调用及等待时间。
- **失效工件**：DEC-REL-017 中“T-824 不进入 v1.1 当前候选”的临时顺序被 DEC-AI-048 覆盖；
  T-790 “只改 prompt、不改 runner”的历史范围不再能证明当前真实长稿质量。
- **重新派生**：`script.draft` 用户入口保持不变，内部改为 `script.voiceover.compose` 先产连续口播、
  `script.storyboard.segment` 后做逐字分镜；服务端冻结正文 hash，只在两阶段全部通过后记录既有候选。
- **下游影响**：Skill registry、effective snapshot 映射、script runner、Skill 设置目录和聚焦测试需
  更新；不改数据库、公开 API、候选采纳、artifact 版本、T-820 数据血缘或 T-814 对话架构。
- **兼容边界**：存在旧 `script.draft` 账号覆盖的任务继续走旧单阶段；无覆盖账号进入新链。历史任务
  和正在运行任务使用各自冻结快照，不重写。
- **当前 Gate**：新 SPEC 必须独立评审 PASS 后才能 BUILD；本地包只作为真实用户验收入口，不能把
  自动化绿或旧冻结样题评分写成文稿质量 PASS。

## CI-REL-826 Windows runtime 迁移从“目录存在即跳过”改为版本完整性判断（2026-08-13）

- **变更源**：用户 v1.1 真机日志证明安装过旧版的机器无法启动；只读展开确认安装包实际包含
  `sidecar.tar.gz`，旧 appData runtime 与新安装 runtime 并存才是根因。
- **失效工件**：T-825 的 Windows 干净 runner 真启动证据不能代表存量用户升级；LED-006 只要求
  启动 GUI 但没有要求注入旧 runtime 的门卫口径失效。
- **重新派生**：迁移先判断 appData 是否通过当前版本入口 hash；否则验证安装目录副本后原子替换，
  提交失败恢复旧副本。正式首启与候选 RAT 都加入旧 appData runtime 状态并验证当前 runtime 接管。
- **数据边界**：仅处理可再生 `runtime-images`；项目、数据库、密钥、日志、账号和业务数据不在范围内，
  无数据库迁移、公开 API 或页面变化。
- **当前 Gate**：本地算法和工作流契约通过只算 BUILD 证据；新 Windows 包还必须在真实安装环境通过
  GUI、sidecar health、主页面与卸载验证，并由原故障机器复验后才能完成 T-826。

## CI-CLI-843 — 新增 CreatorOS 全能力 CLI 与 Codex 操作入口（2026-08-15，用户已确认）

- **变更源**：用户明确要求把定位、选题、全部作品数据和现有 Tool 的所有读写能力通过 CLI 暴露，
  并拒绝“CLI 只读、每次写操作回 CreatorOS 审批”的旧方案；还要求账号切换、抖音导入与 Codex
  并行操控 3 个账号。详见 T-843 与 DEC-CLI-001。
- **现有功能影响**：现有桌面 UI、业务 operation、数据与用户旅程不删除、不替换；CLI 不使用时应
  零行为变化。新增入口 1:1 投影全部正式 contract operation，复用同一 backend service、任务、
  候选和领域真值；用户可在设置中开启/撤销当前启动的完整读写访问，不增加逐动作确认卡。
- **需重新派生**：contract Endpoint 增加穷尽 CLI effect/confirmation/async/idempotency metadata；
  新增共享 Gateway client、最小 invocation 幂等审计、安装版随机端口连接描述协议、设置中的启动级
  CLI 完整访问开关、CLI 随包产物；`mcp-server` 改为消费同一 registry/Gateway，不再维护独立逻辑。
- **多账号影响**：CLI 用户级启动授权覆盖其已验证账号，但每次账号级请求必须显式选择一个 accountId，
  复用既有 `verifyAccountSelection`；不得用共享 current-account 状态协调并发。幂等、task、候选、导入
  publication/metric 和审计全部带同一账号上下文，至少完成三账号并行隔离验收。
- **抖音导入影响**：复用 `ingestion.douyin.login/status/refresh` 与
  `intelligence.items.importDouyinShare`；若 UI 的既有导入子能力仍是内部 route，先提升为正式
  contract 再自动暴露，禁止 CLI 复制抓取器或绕过账号专属登录态。
- **安全影响**：正式 CLI 入口不得继承 T-046 浏览器免登录裸调；必须同时验证 loopback、启动级授权、
  激活、当前 user/account ownership、真实 operation policy、schema 与影响目标。全部 contract 可调用
  不等于暴露数据库、内部 route、密钥、Cookie、handshake、私有文件或客户端可伪造的 RequestContext。
- **数据影响**：新增 user/account 归属的 CLI Invocation 幂等审计 metadata，以及与审计分离、用应用
  主密钥加密、24 小时自动删除的 schema-valid response 幂等缓存；不再引入 Agent Action 或待确认
  payload，不复制领域实体，不改变既有项目、稿件、素材、任务或候选属主。缓存过期/丢失只返回稳定
  duplicate receipt，绝不借重试重放写入。
- **发布影响**：macOS/Windows 桌面包新增 CLI 产物与安装/卸载/PATH 契约；两个安装版必须完成同一
  `status → 全域 read/write → candidate task → wait → CLI confirm/adopt → 双向 read-back → isolated
  destructive` 真路径，dev server 证据不可替代。
- **当前 Gate**：用户方向已确认；因授权模型和范围改变，旧 PASS[REV:805cc308700e] 已失效，重写后的
  SPEC 必须独立复审 PASS，才能启动 T-843 BUILD。

## CI-T915-CHAT-MOTHER-20261009 — 聊天新请求恢复与逐调用安全用量规范 draft

- 主控已核独立提案857a0f...，仅批准母R03a/R05a和AC04/05/08规范draft应用；当前仍待真实T915同cycle1round3，不是实现或新收费wire许可。精确patch与schema/wire表见docs/verification/t1072/integration/CHAT_MOTHER_SPEC_DRAFT.md。
- 此上游变化使对应聊天request mapping/model identity/API公开投影/安全/测试计划、新消息恢复UX、admission/ledger/completion与迁移回退范围失效，必须后续派生再验；不扩大成其他已通过切片全局失效。母原R03/R05、未知调用同键恢复、预算/fence、旧regenerate绑定与S5价格配置/成本角标保。
- 当前backend/schema/contract/UI代码未改，全frontend测试仍freeze6dd9db7a。母旧receipt过期保，T915与T1072最后轮独立不借用、不newcycle。正式SPEC审核后仍无自动实施/发布PASS。


## 2026-10-09 T1072与已生效Growth GD身份规则同期

主控独立核正式GD §5第82行/§10第207、211、213行后，仅授权T1072第47行原一句同步：native原client/projectKey/productRef与appIdentifier不变；register_device先唯一商品及product/project scope、本人选择原授权后固定profile；link_owner准确ticket/grant/batch/source解析唯一profile。不是按latest/first猜配置，不增native/profileRef wire或新代码。GD正式源62c0754...的cycle2round2记录与Creator自身cycle1round2分开，不能借GD审核替Creator末轮。

局部失效仅T1072产品/profile定位规范的当前独立复审/验收映射，manifest精确T-1072-GD-identity-review待审；旧原生HTTP真实事实及源码/签名/期限/保存/ACK证据不抹去，不宣称新规范正式PASS。T1072本来已有engineering增量导致旧SPEC回执过期；此次继续同cycle待最后round3，范围稳定前不运行record、不新cycle。不改T915母draft、reviewevents/progress或任何公共schema/业务实现。准确前后hash与字段证据见T1072_GD_SCOPE_SYNC.md。
