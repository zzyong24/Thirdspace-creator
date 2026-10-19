# T-1246 浏览器测试流程与用例

这是 AI 编写的待执行计划。主线程尚未交付冻结候选和独立执行目录，当前没有本轮浏览器 PASS。计划时共享 HEAD 为 `4df3424972831acfdd091056b3045b2472120692`，目录含在途整合，不能把这个 HEAD 当候选。

人能直接核对的目标：所有现有页面和操作都继续可用；选 Codex 后文本与图片不需要另配 API，任务记住创建时的引擎，切组不会读写别组数据；知识库和自动化窄窗修复都要实际操作、截图并读回原任务。浏览器结果不代表桌面包已验。

流程依据 T1246、T1207、T1238 和 T1245 SPEC；product-to-code-orchestrator `3.29.0` 与项目版本一致，本子任务处于 stage 4 的整合验收准备。Playwright Skill `2.4.0` 正文已读取，其安装中缺引用的 core 指南，不能声称读过这些文件。完整机器清单见 [browser-cases.json](browser-cases.json)。

```mermaid
flowchart LR
 A[主线程冻结源码 包SHA 执行目录] --> B[核预算 隔离库 原例清单]
 B --> C[完整原E2E及新增整合旅程]
 C --> D[逐例截图 trace 同ID读回 即时记问题]
 D --> E[首轮全部结束 汇总失败和未验]
 E --> F[集中修复 独评 重新冻结打包]
 F --> G[原例复验 保留首轮]
```

## 冻结前置与预算

原配置现在有 54 个 E2E 文件，当前 `page.tsx` 入口声明为 38 个（含拦截弹层）。旧 T1207 的 46 个数字不作为本轮分母。参数化真实用例数要在冻结目录 `--list` 后记录。测试原文件、原断言、原 skip 状态及其 SHA 都保留；动态标题静态抽取只作索引，不冒充执行数量。

| 前置 | 当前待主线程绑定的事实 |
|---|---|
| P-FREEZE | 主线程交付整合候选目录、干净commit、四版本、源码/Worker dist/构建清单SHA、开发包SHA与独立执行目录；当前canonical HEAD 4df…且dirty，不是候选。 |
| P-INVENTORY | 冻结树运行Playwright --list导出真实参数化case总数/testIds；与54文件和当前38page声明比对，新增文件也纳入；不把静态138等标题声明当实际数量。 |
| P-TIMING | 隔离执行目录预算适配仅允许提高时间，不改原assert/data/selection；静态审计+运行元数据证明request/expect/action120000，test/hook180000，保更长原预算，所有层retry0。CLI --timeout不足以覆盖test.setTimeout及显式expect短预算。需冻结测试/driver原SHA及预算差异。 |
| P-EVIDENCE | 隔离证据driver对全部runtime case开启trace并成功/失败PNG；既有helper自动图写t1207、部分spec写t1232/t1075等目录，须保原证据并复制/关联t1246，不覆盖历史。trace不能只retain-on-failure，capture本身120000。 |
| P-STARTUP | pnpm dev触发predev重建Worker；启动前预构建并冻结dist或主线程交付明确已核启动方式，运行不得偷偷变更候选源码/产物。原产品门不可旁路。 |
| P-ISOLATION | 全新creatoros-playwright-*根下真实PGlite/媒体/.auth，每例unique资源/幂等键；同批不可两server共用单写者库；禁止继承真实数据库/secret。 |
| P-NATIVE | 交付官方Codex真实可用会话、套餐/图片能力及宿主出站审计；独立text/image配置为空。官方调用需Worker侧许可官方域，不解除浏览器loopback网络边界；所有其他第三方出站拒绝。缺登录/额度记阻塞非PASS。 |
| P-ASR | T1062两个音频旅程强制离线ASR准入，原代码还固定backendCommit b1cd…；冻结候选可能不符，先原样执行保原FAIL，不能fake/skip或安装下载洗绿。根审查旧准入与新候选归属后再集中修复。 |
| P-SCHEDULER | 原全套配置disableScheduler，后台验收另隔离实例用真实公共立即运行及原Worker认领；若要定时扫描须冻结准入，不冒称全套已有后台执行。 |

每次正执行/request/expect/action/navigation/截图至少 `120000ms`，test/hook 至少 `180000ms`，保留原更长预算。每例外层必须覆盖完整串行阶段、排队、启动和清理余量；多个两分钟执行不能套在一个三分钟外层。suite 总期限覆盖所有用例上界、启动与清理，不使用任意短总超时。所有层 retry 为 0；轮询间隔不当执行上限。持久任务继承原绝对截止，耗尽保原 ID/状态，不续期、不自动重发。

当前 shared config 没有覆盖所有短 request/expect/test/hook；旧 spec 有显式短预算，CLI `--timeout=180000` 不会覆盖局部 `test.setTimeout`、expect 和 request 参数。执行目录需受控预算适配并冻结差异，只提高时间、不更改数据/断言/选择。此准备不修改共享 config。默认成功截图/trace不足，也须独立证据 driver 全例开启。

```bash
# 仅在主线程交付且前置核实后的冻结执行目录运行
cd <frozenExecutionDirectory>/frontend
pnpm exec playwright test --project=e2e --list
pnpm exec playwright test --project=e2e --workers=1 --retries=0 --timeout=180000 --trace=on --reporter=json,html
```

命令本身不足以证明预算合规，须一起保存实际 effective test/hook/request/expect 记录和预算适配 SHA。原 `pnpm dev` 的 predev 会构建 Worker，需先冻结启动方式与 dist 防止测试载入旧/变化 bundle。原后台默认禁调度，后台执行另需隔离准入；不能用预检或创建回执代签执行。

## 需求到验收范围

| 验收 | 浏览器检查与证据 | 边界 |
|---|---|---|
| AC-1246-1/2 | 只核验主线程交付的源码/包/版本/启动事实并绑定结果 | 打包、签名与 hdiutil 由主线程负责 |
| AC-1246-3 | 全部原 spec、真实页面入口、正常/空态/失败/刷新/宽窄状态、INT-*新增旅程 | 当前计划无 PASS |
| AC-1246-4 | Playwright 实操；成功/失败截图、trace、原公共读回、原模型账本/媒体字节 | 真实后端、协议夹具、官方 Codex分开签 |
| AC-1246-5 | 无浏览器代签 | 桌面 Appium 另验 |
| AC-1246-6 | 首轮失败即时追加；首轮结束后集中修复，重新冻结打包原例复验 | 原红日志、断言与原任务永久保留 |

## 新增整合用例矩阵

每行的 generationKey 和状态必须分别展开实际用例、ID与证据；同一共享 Worker 的一个成功不能签其它业务入口。表内“官方”表示要求实际官方调用，不表示已经执行。缺前置记 BLOCKED/NOT-RUN，不换成夹具 PASS。

| ID / 入口 | 用例、数据和预期 | 真调用/夹具边界 |
|---|---|---|
| INT-ROUTES / 见routeInventory | 完整当前页面/弹层入口及原静态路由合同。数据：两组两账号，文章/图文/视频作品各一，画布/朋友圈各一；每个ID由公共创建返回。预期：页面单壳、真实主内容、空数据为0；真实按钮有操作或合法disabled状态；历史重定向与原静态ROUTES断言若不一致保留原FAIL | real-app |
| INT-ENGINE / /settings → AI执行引擎/模型配置 | Codex免独立文本/生图配置与服务偏好。数据：临时用户；配置回执仅provider/model/hasSecret，不保存secret/token。预期：Codex不要求文本/图片API key、不触发其探测或API resolver；默认引擎来自服务读回；未读完偏好不先挂旧卡/发探测；切Pi不覆盖原配置/旧任务，ASR和视频仍遵原能力 | real-app |
| INT-ENGINE-FAIL / /settings | 引擎偏好加载/保存失败与Codex未登录、图片不可用。数据：隔离用户＋可审计故障注入。预期：错误可见、失败保存不伪造成功值、不自动切Pi；能力不足不调用独立API、不吞错误；故障移除后真实公共读回；登录账户能力另独立真验 | real-app + explicit UI fault injection / external capability fixture |
| INT-PI / /settings、文章/编导 | 原Pi公共模型兼容与旧任务保持Pi。数据：隔离假密钥＋loopback模型协议server，原Pi任务。预期：原合法Pi继续原供应商，配置不被Codex清空；不改历史Pi身份；模型候选需用户采纳后落库；fixture成功只签协议兼容，非官方Pi真实认证 | real-app + external Pi HTTP fixture |
| INT-TEXT-WRITE / /projects/[projectId]/article、/projects/[projectId]/script | 文章与视频脚本正文；逐个：`wechat.article-draft`、`script.draft`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-PLAN / /projects/[projectId]/planning | 主张、创作约定、大纲；逐个：`planning.thesis`、`planning.contract`、`planning.outline`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-REVIEW / /projects/[projectId]/script、/projects/[projectId]/publishing、/projects/[projectId]/review | 脚本审查、平台改写、复盘；逐个：`script.review`、`publish.platform_adapt`、`review.analyze`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-POST / /projects/[projectId]/image、/projects/[projectId]/article、/projects/[projectId]/publishing | 图文、分段改文与发布物料；逐个：`graphic.post-text`、`wechat.article-text`、`publication.text`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-MOMENTS / /projects/[projectId]/moments/[momentsId]、/accounts/works | 朋友圈与作品审核；逐个：`moments text`、`work review`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-DISCOVERY / /topics、/positioning | 选题补充偏好、定位与标定；逐个：`topic.generate`、`topic.enrich`、`topic.preference`、`positioning.generate`、`calibration.diagnose`、`calibration.score`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-RESEARCH / /projects/[projectId]/research、编导 | 调研、来源相似性与编导建议；逐个：`research.gather_material`、`script.source_similarity`、`copilot.assist`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-MEDIA / /assets、/projects/[projectId]/research、/projects/[projectId]/production | 素材分类、文本提取与匹配；逐个：`asset.classify`、`material.extract`、`material.match`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-VIDEO / /projects/[projectId]/production、/projects/[projectId]/work | 视频决策与项目重建；逐个：`video.decisions`、`reconstruct.project`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-KNOWLEDGE-AI / /knowledge、/accounts/works、/projects/[projectId]/research | 知识分类、全文蒸馏、关联与评论提炼；逐个：`knowledge.classify`、`knowledge.distill`、`knowledge.relate`、`comment.qa-sift`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-INTELLIGENCE / /intelligence | 雷达/灵感生成、改写初稿与转项目；逐个：`intelligence generation`、`intelligence.rewrite-text`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-BACKGROUND / /automations、/topics、/intelligence | 每日选题与定时归因/收藏/对标；逐个：`scheduled.topic.daily`、`scheduled flywheel`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-TEXT-TRANSCRIBE / /projects/[projectId]/production、/accounts/works | ASR转录后的文本整理；逐个：`transcribe postprocess`。数据：每例唯一项目/组、有效稿件和来源；知识group-only和历史account各一；后台唯一job与原排期。预期：每个独立入口确实可交付合法候选，原领域服务保ID/组/版本/CAS；文本/图片API请求与resolver为0，原Codex模型账本有真实绑定；normal成功不代签空稿；空稿合法拒绝保原partial/finish，禁止副作用；无入口或真实外部前置不可用则记覆盖缺口/阻塞，不按共享helper PASS | official-Codex-real-app (每个key独立真调用；缺前置为blocked) + explicitly external source fixture where needed |
| INT-IMAGE-ASSET / /assets | 独立生图；逐个：`asset.generate image`。数据：两组；中性白底几何图或无隐私测试插图，真实本组PNG参考图；每key一独立任务。预期：原Codex生图候选回收可用，API文本/生图调用0；无自动落领域库；采纳正确原资源/版本/组；参考图/跨组/失效引用明确拒绝，原在途/unknown不重发 | official-Codex-real-app |
| INT-IMAGE-REF / /assets、编导图片附件 | 参考图编辑；逐个：`asset.generate image_to_image`。数据：两组；中性白底几何图或无隐私测试插图，真实本组PNG参考图；每key一独立任务。预期：原Codex生图候选回收可用，API文本/生图调用0；无自动落领域库；采纳正确原资源/版本/组；参考图/跨组/失效引用明确拒绝，原在途/unknown不重发 | official-Codex-real-app |
| INT-IMAGE-COVER / /projects/[projectId]/work、/projects/[projectId]/publishing | 视频封面；逐个：`cover.generate`。数据：两组；中性白底几何图或无隐私测试插图，真实本组PNG参考图；每key一独立任务。预期：原Codex生图候选回收可用，API文本/生图调用0；无自动落领域库；采纳正确原资源/版本/组；参考图/跨组/失效引用明确拒绝，原在途/unknown不重发 | official-Codex-real-app |
| INT-IMAGE-CARDS / /projects/[projectId]/image、/projects/[projectId]/article、编导 | 图卡、文章配图、系列图；逐个：`graphic.card.generate`、`文章配图`、`系列图`。数据：两组；中性白底几何图或无隐私测试插图，真实本组PNG参考图；每key一独立任务。预期：原Codex生图候选回收可用，API文本/生图调用0；无自动落领域库；采纳正确原资源/版本/组；参考图/跨组/失效引用明确拒绝，原在途/unknown不重发 | official-Codex-real-app |
| INT-VISION / /assets、/projects/[projectId]/production | 图片理解和成片可选视觉审查；逐个：`asset.classify vision`、`video.visual-review`。数据：同组绿圆PNG、小视频/可安全输出工程；视频能力按原配置。预期：图片完整进入原调用摘要并真实得到结果；父原引擎/剩余期限被子任务继承，不能按每帧续期；可选审核不可用保安全成片导出；错误归属仍拒绝 | official-Codex-real-app + external unavailable fixture (分别记结果) |
| INT-CHAT / 任意页编导弹层、项目Workbench | Codex聊天、图片附件、工具目录、子模型与候选采纳；逐个：`chat.run Codex`、`worker.structured-node/proposal`、`worker.script-hooks/proposal`、`worker.script-draft/committed`、`chat image generation`。数据：独立本组项目/稿件/PNG；长标题；一安全read前缀＋各类子任务。预期：完整合法目录/输入没有模型API配置门；不假按钮、不自动采纳；权限拒绝不执行effect；每族真实工具调用与原thread/turn/task映射，不用仅native文本代签工具族 | official-Codex-real-app |
| INT-FREEZE / /settings、编导、/automations、项目生成入口 | 父子及后台冻结、切引擎不迁移在途任务。数据：每族独立原parent/child/job/task；两个窗口；Pi本地协议fixture和真实Codex分列。预期：父子/后台读原已冻结engine；API resolver为0（Codex族）；原Pi不换身份；不会给旧父重新newturn、retryOf或续deadline；调度窗口/owner/group一致；真实启动不能仅预检读回代签 | real-app + official Codex / Pi external fixture |
| INT-RECOVERY / 编导恢复入口、后台任务详情 | unknown/ACK只读恢复与原预算、拒绝族。数据：隔离外部protocol fixture，真实应用Worker/服务/数据库；禁止直接DB伪造PASS。预期：有严格proof才读原turn并结算同call；没有turn仍unknown；turn/start与API spy0；不supersede、不重发、deadline/attempts不扩权；混合工具投影保持原顺序，script-draft提交沿原CAS/receipt不重复建资源 | real-app + controlled external Codex protocol fixture; 非官方账户unknown生命周期 |
| INT-GROUP / /accounts、/projects、/assets、/knowledge、/automations、/canvases | 账号组/账号归属、切组晚回与共享资源。数据：两真实测试组、各平台账号、group-only资源、A/B唯一标识。预期：同组合法group-only无需绑账号；跨组404/明确拒绝；晚响应不回写；历史来源保留不篡归属；真实数量为0/空，原任务历史保留 | real-app + response delay passthrough (不替换业务内容) |
| INT-KNOWLEDGE / /knowledge、项目引用选择器、/accounts/works | 知识库完整读写、整理、版本与同步。数据：知识A/B、本组项目、历史账号作品，长标题/正文、受控外部作品来源。预期：知识数据由原服务落库，候选未采纳不写；正文、标题、标签、目录、来源和revision公开读回相符；同步原task与知识Id可追溯，错组或无效ID拒绝 | real-app + external platform source fixture; official Codex AI节点另标 |
| INT-T1245 / /automations → 平台/账号筛选 → 立即运行 → 原运行详情 | 自动化筛选与详情关闭在稳定宽窄窗可达。数据：同组多平台唯一job、长文本原运行；真实采集未授权动作不执行。预期：页与筛选无横向溢出、label/下拉可见可选，文字不逐字挤压；close在dialog可视区内且不被标题/error覆盖；真实操作成功；job/run/aiTask/execution原ID保持；待扫码明确但不扫码不真实登录 | real-app |
| INT-NAV / 侧栏全部入口、新建/编导/日历/素材弹层 | 导航、弹层局部打开、性能与生命周期。数据：长正文/100历史项的私有测试数据，真实小媒体，disabled/空态。预期：局部开弹层不等整页/不丢草稿；实际导航显示正确入口；折叠大对象按需，过期结果不写；no假按钮；资源释放不能删任务或禁合法操作 | real-app |

每个新增 case 的具体 steps、variants、public readback、前置和截图要求在 JSON，执行时绑定实际 testId。覆盖正常合法完成、合法空态/拒绝和明确失败，不能把模型候选未采纳当保存成功。ASR、视频、Embedding 本体继续原供应商能力；Codex免文本/图片配置不代表这些能力零配置。

## 全部现有公共 E2E 清单

下表 54 个文件必须完整跑，包括循环生成的全部用例。没有用 grep 排除旧合同/故障用例。源码已有 page.route 应逐段分类：透传延迟仍可签真实后端；替换应用回执只签界面容错；localhost模型server只签外部协议。原例若假按钮或过期导航断言与现产品冲突，先保真实 FAIL，结束首轮才归因。

| ID | 原文件 | 功能与原预期范围 |
|---|---|---|
| ORIG-001 | `frontend/tests/e2e/ai-copilot.spec.ts` | 全局编导弹层、关闭、Esc/返回与发送合同；完整保原断言 |
| ORIG-002 | `frontend/tests/e2e/ai-nonblocking-recovery.spec.ts` | 无模型引导、同轮断线恢复与停止重连；完整保原断言 |
| ORIG-003 | `frontend/tests/e2e/ai-recovery-guidance.spec.ts` | 未配置/定位缺失/额度与未知失败引导；完整保原断言 |
| ORIG-004 | `frontend/tests/e2e/ai-reliability-recovery.spec.ts` | 视频决策终态与显式重跑来源；完整保原断言 |
| ORIG-005 | `frontend/tests/e2e/all-routes.spec.ts` | 原ROUTES全部页的单壳与激活状态；完整保原断言 |
| ORIG-006 | `frontend/tests/e2e/app-shell.spec.ts` | 侧栏、头部、焦点、滚动与间距；完整保原断言 |
| ORIG-007 | `frontend/tests/e2e/asr-configuration.spec.ts` | ASR预设和高级字段；完整保原断言 |
| ORIG-008 | `frontend/tests/e2e/assets.spec.ts` | 素材库详情与真实空组上传入口；完整保原断言 |
| ORIG-009 | `frontend/tests/e2e/audience-task-topics.spec.ts` | 普通选题保留、退役入口与历史配置；完整保原断言 |
| ORIG-010 | `frontend/tests/e2e/automations-group-media-jobs.spec.ts` | 自动化组/平台/账号筛选与历史作业；完整保原断言 |
| ORIG-011 | `frontend/tests/e2e/automations-run-now-public.spec.ts` | 立即运行、同job/run任务、T1245窄窗筛选与详情关闭；完整保原断言 |
| ORIG-012 | `frontend/tests/e2e/built-in-ip-course.spec.ts` | 内置课程目录和真实学习进度；完整保原断言 |
| ORIG-013 | `frontend/tests/e2e/channel-public-links.spec.ts` | 包级公开链接与反馈入口；完整保原断言 |
| ORIG-014 | `frontend/tests/e2e/content-radar-one-click-project.spec.ts` | 雷达改写初稿一键转真实项目；完整保原断言 |
| ORIG-015 | `frontend/tests/e2e/copilot-project-reference.spec.ts` | 项目引用长标题与窄窗；完整保原断言 |
| ORIG-016 | `frontend/tests/e2e/creative-canvas.spec.ts` | 画布保存、重开、版本、来源与跨组；完整保原断言 |
| ORIG-017 | `frontend/tests/e2e/draft-ammo-media-preview.spec.ts` | 稿面视频预览及键盘操作；完整保原断言 |
| ORIG-018 | `frontend/tests/e2e/experience.spec.ts` | 原经验工作台入口合同；完整保原断言 |
| ORIG-019 | `frontend/tests/e2e/group-skill-customization.spec.ts` | 组级Skill首写、CAS、版本、失败及隔离；完整保原断言 |
| ORIG-020 | `frontend/tests/e2e/knowledge-library.spec.ts` | 知识真实读写、整理、项目引用、归属和恢复；完整保原断言 |
| ORIG-021 | `frontend/tests/e2e/media-root-isolation.spec.ts` | 媒体私有根、上传下载与错组拒绝；完整保原断言 |
| ORIG-022 | `frontend/tests/e2e/new-project.spec.ts` | 新建项目弹层、格式选择与真实创建；完整保原断言 |
| ORIG-023 | `frontend/tests/e2e/onboarding-and-small-sidebar.spec.ts` | 新号/已有作品与低高度身份入口；完整保原断言 |
| ORIG-024 | `frontend/tests/e2e/overlay-routing.spec.ts` | 直达与拦截弹层、URL及返回；完整保原断言 |
| ORIG-025 | `frontend/tests/e2e/platform-work-catalog.spec.ts` | 平台目录、真实空态、目标与归属；完整保原断言 |
| ORIG-026 | `frontend/tests/e2e/production-broll-remove.spec.ts` | B-roll移除版本与刷新；完整保原断言 |
| ORIG-027 | `frontend/tests/e2e/production-empty-workbench.spec.ts` | 空视频工程导入人物视频；完整保原断言 |
| ORIG-028 | `frontend/tests/e2e/projects.spec.ts` | 项目排期新增、修改与取消；完整保原断言 |
| ORIG-029 | `frontend/tests/e2e/publish-package-readback.spec.ts` | 发布物料完整读回与窄窗；完整保原断言 |
| ORIG-030 | `frontend/tests/e2e/publishing-center.spec.ts` | 发布日历与真实排期；完整保原断言 |
| ORIG-031 | `frontend/tests/e2e/publishing-workspace.spec.ts` | 旧发布链接进入稿面；完整保原断言 |
| ORIG-032 | `frontend/tests/e2e/qwen-asr-configuration.spec.ts` | Qwen ASR真实字段保存；完整保原断言 |
| ORIG-033 | `frontend/tests/e2e/recent-data-safety.spec.ts` | 定位正式母版保留与信源级联删除；完整保原断言 |
| ORIG-034 | `frontend/tests/e2e/review-empty-diagnosis-entry.spec.ts` | 同组稿件空复盘诊断入口；完整保原断言 |
| ORIG-035 | `frontend/tests/e2e/review-history.spec.ts` | 手工洞察历史与窄窗；完整保原断言 |
| ORIG-036 | `frontend/tests/e2e/search.spec.ts` | 全局搜索和URL查询；完整保原断言 |
| ORIG-037 | `frontend/tests/e2e/semantic-material-generation.spec.ts` | 图片/视频候选预填且不自动发送；完整保原断言 |
| ORIG-038 | `frontend/tests/e2e/settings-responsive-layout.spec.ts` | 设置宽窄布局、分类、草稿；完整保原断言 |
| ORIG-039 | `frontend/tests/e2e/settings.spec.ts` | 设置真实保存、密钥脱敏、本地模型协议与刷新；完整保原断言 |
| ORIG-040 | `frontend/tests/e2e/shared-resource-lifecycle.spec.ts` | 共享资源空态、失败及重读；完整保原断言 |
| ORIG-041 | `frontend/tests/e2e/smoke.spec.ts` | 应用根容器；完整保原断言 |
| ORIG-042 | `frontend/tests/e2e/t1062-group-native-rough.spec.ts` | 纯组创建、原生剪辑、ASR、组切换与首载时序；完整保原断言 |
| ORIG-043 | `frontend/tests/e2e/t1069-asset-picker.spec.ts` | 全库分页、照片精确选用与取消；完整保原断言 |
| ORIG-044 | `frontend/tests/e2e/t1069-media-tab-session.spec.ts` | 本地视频导入、切Tab与工程保存；完整保原断言 |
| ORIG-045 | `frontend/tests/e2e/t1070-director-editor.spec.ts` | 文章/图文版本、编导、HTML及ZIP交付；完整保原断言 |
| ORIG-046 | `frontend/tests/e2e/t1136-calendar-dialog-layout.spec.ts` | 四尺寸排期弹层、真实回读与失败草稿；完整保原断言 |
| ORIG-047 | `frontend/tests/e2e/t1140-picker-low-height.spec.ts` | 六尺寸素材预览、搜索、精确选用；完整保原断言 |
| ORIG-048 | `frontend/tests/e2e/t1149-cover-aspect-group.spec.ts` | 画幅能力、组引用与保存重试；完整保原断言 |
| ORIG-049 | `frontend/tests/e2e/t1159-wechat-native-report.spec.ts` | 两微信账号真实0报告及拒绝；完整保原断言 |
| ORIG-050 | `frontend/tests/e2e/t1207-supplemental-route-matrix.spec.ts` | 当前侧栏、业务详情、产物、画布及历史跳转；完整保原断言 |
| ORIG-051 | `frontend/tests/e2e/t954-director-review.spec.ts` | 无发布数据复盘、空补采与诊断；完整保原断言 |
| ORIG-052 | `frontend/tests/e2e/web-material-read-save.spec.ts` | 全文阅读成功后稳定素材保存；完整保原断言 |
| ORIG-053 | `frontend/tests/e2e/wechat-article-workbench.spec.ts` | 文章手写/Worker候选/用户采纳和跨账号；完整保原断言 |
| ORIG-054 | `frontend/tests/e2e/zz-account-isolation.spec.ts` | 账号切换项目无残影；完整保原断言 |

## 当前全部页面入口

动态 ID 一律来自本轮真实公共创建，不编造假项目 ID。项目各 research/planning/script/work/production/publishing/review、文章/图文/视频产物、朋友圈和画布详情分别访问并截图；新建拦截弹层与直达页分别检验。legacy redirect 另记录，不修改原静态 ROUTES 断言。

| 当前入口 | 实际源码与优先关联原例 |
|---|---|
| `/projects/new`（拦截弹层） | `frontend/src/app/(creator)/@modal/(.)projects/new/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/accounts` | `frontend/src/app/(creator)/accounts/page.tsx`；automations-group-media-jobs.spec.ts, platform-work-catalog.spec.ts, t1159-wechat-native-report.spec.ts |
| `/accounts/works` | `frontend/src/app/(creator)/accounts/works/page.tsx`；automations-group-media-jobs.spec.ts, platform-work-catalog.spec.ts, t1159-wechat-native-report.spec.ts |
| `/assets` | `frontend/src/app/(creator)/assets/page.tsx`；assets.spec.ts |
| `/automations` | `frontend/src/app/(creator)/automations/page.tsx`；automations-run-now-public.spec.ts, automations-group-media-jobs.spec.ts |
| `/calendar` | `frontend/src/app/(creator)/calendar/page.tsx`；t1136-calendar-dialog-layout.spec.ts |
| `/canvases/[canvasId]` | `frontend/src/app/(creator)/canvases/[canvasId]/page.tsx`；creative-canvas.spec.ts |
| `/canvases` | `frontend/src/app/(creator)/canvases/page.tsx`；creative-canvas.spec.ts |
| `/daily-report` | `frontend/src/app/(creator)/daily-report/page.tsx`；t1207-supplemental-route-matrix.spec.ts |
| `/experience` | `frontend/src/app/(creator)/experience/page.tsx`；experience.spec.ts |
| `/intelligence` | `frontend/src/app/(creator)/intelligence/page.tsx`；content-radar-one-click-project.spec.ts |
| `/knowledge` | `frontend/src/app/(creator)/knowledge/page.tsx`；knowledge-library.spec.ts |
| `/overview` | `frontend/src/app/(creator)/overview/page.tsx`；t1207-supplemental-route-matrix.spec.ts |
| `/` | `frontend/src/app/(creator)/page.tsx`；smoke.spec.ts, app-shell.spec.ts |
| `/positioning` | `frontend/src/app/(creator)/positioning/page.tsx`；recent-data-safety.spec.ts |
| `/projects/[projectId]/article` | `frontend/src/app/(creator)/projects/[projectId]/article/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/image` | `frontend/src/app/(creator)/projects/[projectId]/image/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/moments/[momentsId]` | `frontend/src/app/(creator)/projects/[projectId]/moments/[momentsId]/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/outputs/[outputId]/image` | `frontend/src/app/(creator)/projects/[projectId]/outputs/[outputId]/image/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/outputs/[outputId]/video` | `frontend/src/app/(creator)/projects/[projectId]/outputs/[outputId]/video/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]` | `frontend/src/app/(creator)/projects/[projectId]/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/planning` | `frontend/src/app/(creator)/projects/[projectId]/planning/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/production` | `frontend/src/app/(creator)/projects/[projectId]/production/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/publishing` | `frontend/src/app/(creator)/projects/[projectId]/publishing/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/research` | `frontend/src/app/(creator)/projects/[projectId]/research/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/review` | `frontend/src/app/(creator)/projects/[projectId]/review/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/script` | `frontend/src/app/(creator)/projects/[projectId]/script/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/[projectId]/work` | `frontend/src/app/(creator)/projects/[projectId]/work/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/create` | `frontend/src/app/(creator)/projects/create/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects/new` | `frontend/src/app/(creator)/projects/new/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/projects` | `frontend/src/app/(creator)/projects/page.tsx`；projects.spec.ts, new-project.spec.ts, t1207-supplemental-route-matrix.spec.ts |
| `/publishing` | `frontend/src/app/(creator)/publishing/page.tsx`；publishing-center.spec.ts |
| `/search` | `frontend/src/app/(creator)/search/page.tsx`；search.spec.ts |
| `/settings` | `frontend/src/app/(creator)/settings/page.tsx`；settings.spec.ts, settings-responsive-layout.spec.ts |
| `/topics` | `frontend/src/app/(creator)/topics/page.tsx`；audience-task-topics.spec.ts |
| `/activate` | `frontend/src/app/activate/page.tsx`；t1207-supplemental-route-matrix.spec.ts |
| `/login` | `frontend/src/app/login/page.tsx`；t1207-supplemental-route-matrix.spec.ts |
| `/register` | `frontend/src/app/register/page.tsx`；t1207-supplemental-route-matrix.spec.ts |

## 数据、截图与问题记录

全新临时根保存 PGlite、媒体、auth；每例真实新组/账号/项目/任务与独立幂等键，保存返回 ID。禁止写用户真实库、删任务历史、继承凭据明文或扫码登录/向第三方真实发布。两组和历史账号/grouponly归属一起验证，晚到回执用真实透传延迟。浏览器仅 loopback；官方 Codex Worker 出站须主线程单独给本轮准入，模型宿主出站审计证明 API0，不能拿浏览器没请求就声称 Worker0。

每个成功或失败 runtime case 都保存真实 PNG 和 trace，动态详情/弹层关键阶段也截图。证据进入 `docs/verification/t1246/<round>/<candidateSha>/browser/`，保留原 helper 写出的 t1207/t1232 等原图并建立拷贝/引用索引，禁止覆盖历史。索引包含候选commit/包SHA、spec与driver SHA、testId/title/file、URL/viewport/status、模型边界、原task/parent/execution/call/resource IDs、公共脱敏回执、日志与截图/trace路径。媒体验真实mime、字节和sha，目视说明与实际图相符。截图失败也保存其真实错误，不用旧图补拍。

问题在出现时追加 failureId、时间、步骤、预期/实际、原任务状态、PNG/trace、原错误和归属；未定位时写 unknown，不一概称旧债。全套收束后分别统计 PASS/FAIL/BLOCKED/NOT-RUN/原有SKIP，无前置的音频/模型任务不删除或新增 skip。首轮不自修、不重跑改首轮数。集中修复后独立新轮，关联原失败与修复提交/新包 SHA，不抹第一次红测。

本计划只写上述两个文档。候选与执行目录冻结前不启动长 E2E，不写产品、测试源码或共享配置。
