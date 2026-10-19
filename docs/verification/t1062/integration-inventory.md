# T-1062 只读整合盘点

盘点时间：2026-10-05T10:09:28。仅写/tmp；未修改仓库、commit/merge、启动服务或读取真实库/密钥。技能3.27.2与项目版本一致。

## HEAD、祖先与dirty

|来源|HEAD|主树/来源独有提交|dirty|状态|
|---|---|---|---|---|
|main|ebd63d9891d162b1bd8bf518bc1b9f573fa9146f|—|838|{" M": 476, "??": 362}|
|diagnostics|bb00d580e2543dc886f145c13f686cf7dc50a4b8|4 / 36|1901|{" M": 217, " D": 1, "??": 1683}|
|templates|55a526d609633e2b014e2a70f319125dec8c0fea|27 / 43|0|{}|

diagnostics 与主树 merge-base：cfb5da32ca6e4cfb4079989fed14a421fcb69f3c。

templates 与主树 merge-base：5b0f4998a5c4de1b477ec72523b00f5d29c9669f。

诊断/模板共同祖先：5b0f4998a5c4de1b477ec72523b00f5d29c9669f。主树相对诊断有4个观众任务提交。

## 来源覆盖

- 主树：账号组、资源隔离/授予、组迁移、观众任务选题与界面；无creative-canvas模块，production目前15后端文件/17前端文件。
- 诊断当前树：文章、组图、creative-results、work-compositions、朋友圈、platform-collection、制作剪辑、reference-editors与Codex/WorkBuddy；production有53后端文件/42前端文件。大量新源码未提交，HEAD不能代表当前开发实测候选。
- 模板：creator-canvas/T-994完整依赖、双库、收藏/采用、首页案例资产画布并列、T-1025扩充；干净HEAD含creator-canvas HEAD de031bc3。
- external-agent-bridge 7d2087a8、external-agent-mcp 71d2cc77、template-backend cfc2d868均非三个HEAD祖先；不代表未复用，必须根据已记录source commit/hash核验移植。

## 三方冲突路径

以下是当前主树文件、来源当前文件、各自merge-base的git merge-file -p文本探针；不等于完整merge或运行测试。

### diagnostics

footprint 3021；交叠主树dirty 102；字节相同 0；不同 102；runtime文本冲突 47。

frontend：

- frontend/src/app/(creator)/layout.tsx
- frontend/src/app/(creator)/shell-router.tsx
- frontend/src/components/shell/account-switcher.test.tsx
- frontend/src/components/shell/account-switcher.tsx
- frontend/src/components/shell/zero-account-guidance.tsx
- frontend/src/features/copilot/ai-copilot-content.tsx
- frontend/src/features/platform-account/account-manager-interactions.test.tsx
- frontend/src/features/platform-account/account-manager-interactive-region.tsx
- frontend/src/features/platform-account/account-manager-page.tsx
- frontend/src/features/platform-account/account-manager-view.tsx
- frontend/src/features/projects/projects-page.tsx
- frontend/src/lib/http-transport.ts
- frontend/src/server/persistence-client.ts
- frontend/src/types/domain.ts

backend：

- backend/src/application/scheduling/controls.ts
- backend/src/application/transport.ts
- backend/src/db.ts
- backend/src/index.ts
- backend/src/modules/ai/ai.service.ts
- backend/src/modules/ai/chat-turn-submission.service.ts
- backend/src/modules/ai/execution-candidate.service.ts
- backend/src/modules/analytics/analytics.repository.ts
- backend/src/modules/artifacts/artifacts.service.ts
- backend/src/modules/assets/assets.service.ts
- backend/src/modules/assets/index.ts
- backend/src/modules/assets/transcribe-audio-storage.ts
- backend/src/modules/execution/asset-execution-binding.ts
- backend/src/modules/execution/cover-execution-binding.ts
- backend/src/modules/execution/execution-authority.service.ts
- backend/src/modules/execution/execution-cover.service.ts
- backend/src/modules/execution/persistent-task.service.ts
- backend/src/modules/platform-account/index.ts
- backend/src/modules/platform-account/platform-account.service.ts
- backend/src/modules/production/production.service.ts
- backend/src/modules/projects/projects.repository.ts
- backend/src/modules/projects/projects.service.ts
- backend/src/modules/publishing/publishing.repository.integration.test.ts
- backend/src/modules/publishing/publishing.repository.ts
- backend/src/modules/publishing/publishing.service.ts
- backend/src/modules/settings/settings.transport.ts

contract：

- contract/src/cli-policy.ts
- contract/src/endpoints.ts
- contract/src/index.ts
- contract/src/internal/chat-worker.ts
- contract/src/operations/settings.ts
- contract/src/primitives.ts

mcp-server：

- mcp-server/src/cli.ts

治理交叠（需人工保留来源）:

- BACKLOG-details.md
- BACKLOG.md
- PROJECT.md
- backend/drizzle/meta/_journal.json
- orchestrator/.lessons-stats.json
- orchestrator/DECISION_LOG.md
- orchestrator/LESSON_LEDGER.md
- orchestrator/context/T-1021.md
- orchestrator/context/T-1022.md
- orchestrator/events.ndjson
- orchestrator/process/modules.config.json
- orchestrator/process/reconcile.config.json
- orchestrator/progress.json
- orchestrator/review-events.ndjson
- orchestrator/reviews/T-1017-round-1.json
- orchestrator/reviews/T-1021-round-1.json
- orchestrator/reviews/T-1021-round-2.json
- orchestrator/reviews/T-1021-round-3.json
- orchestrator/reviews/T-1022-round-1.json
- orchestrator/reviews/T-1022-round-2.json

### templates

footprint 341；交叠主树dirty 80；字节相同 40；不同 40；runtime文本冲突 8。

frontend：

- frontend/src/components/shell/account-switcher.tsx
- frontend/src/server/persistence-client.ts

backend：

- backend/src/db.ts
- backend/src/modules/assets/index.ts
- backend/src/modules/publishing/publication-draft-adoption.service.ts
- backend/src/modules/publishing/publishing.service.ts

contract：

- contract/src/cli-policy.ts
- contract/src/index.ts

治理交叠（需人工保留来源）:

- BACKLOG.md
- PROJECT.md
- backend/drizzle/meta/_journal.json
- orchestrator/.lessons-stats.json
- orchestrator/ARTIFACT_MANIFEST.yaml
- orchestrator/DECISION_LOG.md
- orchestrator/LESSON_LEDGER.md
- orchestrator/context/T-1021.md
- orchestrator/events.ndjson
- orchestrator/process/modules.config.json
- orchestrator/process/reconcile.config.json
- orchestrator/progress.json
- orchestrator/review-events.ndjson

两来源互相footprint交叠80路径，64个运行时路径，包含creative-canvas、publishing、draft-workbench、chat装配与worker生成；后来源不能整文件覆盖前来源。

## 迁移与归属冲突

- journal idx101三义：主树0101_topic_rewrite_only(when1790761007000)，诊断0101_reporting_local_consent(1790668800000)，模板0101_creative_canvas(1790553600000)。idx102：主树观众任务/账号组两份0102文件，诊断publication unique，模板visual-template。主树journal101—122与诊断101—127重叠。
- 不能覆盖journal或只重编号SQL就宣称兼容。诊断与画布旧when可能低于主树最大when1790942400020；必须验证空库、旧主树、旧诊断、旧画布四种migration lineage，使用隔离库/夹具。
- db.ts主树accountGroups注册、模板ensureCreativeCanvasSchema缺表修复、诊断inspectCanvasMigrationLineage/assertCanvasMigrationConverged和0125 lineage merge必须一并审查保留。
- 模板/诊断creative-canvas均为account_id归属，主树group_id共享领域；必须核对新能力的跨组读写/归属合同，不自动合并真实账号。

## task ID治理冲突

必须主会话建立来源ID到主树唯一ID映射，保留原SPEC、source HEAD、评审hash。不能覆盖BACKLOG、manifest、DEC、events、progress或重造taskctl历史。

### diagnostics

|ID|主树|来源|
|---|---|---|
|T-1018|清理本轮测试暴露的全局类型与边界欠债|设计创作提示词资产、跨平台接入与数据上报的统一架构|
|T-1019|按观众具体任务与双九宫格持续生成可实测选题|让创作者保存、复用并版本化提示词|
|T-1020|统一可视化推荐、作品承接与科学运营观测|建立平台能力合同和账号级指标快照|
|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|将本地小红书工程迁入 CreatorOS 账号采集|
|T-1022|按账号组统一多平台工作区、绑定管理、首页与复盘|接入快手真实授权、作品和创作数据|
|T-1023|修正既有任务绑定glob导致的progress生成阻断|集成本地公众号写作 Skill 与品牌覆盖|
|T-1024|紧急排查充值50元后Growth受管Omni模型仍报余额不足|落地故障、作品和粉丝轻量上报及 Growth 运营后台|
|T-1017|简化内容雷达：按账号定位一键生成可编辑改写稿|设计用户故障与创作数据的授权上报闭环|
|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪【制作输入简化·用户 2026-08-16】|支持原始口播粗剪并整合可操作的剪辑工作台|
|T-633|恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】|根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】|

### templates

|ID|主树|来源|
|---|---|---|
|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|给编导智能体接入持久化创作画布与图像/视频生成闭环|
|T-957|排查 AI 失败、全场景验收并优化 Agent 提示词【用户截图】|排查编导 AI 失败并补齐真实功能验收【用户截图】|
|T-633|恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】|根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】|

来源间T-1025另冲突：模板扩充双库样图 vs诊断创作资产平台上报验收。T-850/T-633/T-957同ID异名可能是已授权scope扩展，需对照SPEC判定。

## 大文件与许可

- 诊断LICENSE修改、THIRD_PARTY_NOTICES.md新增、reference-editors源码与frontend/public/reference-editors运行资产需保留许可与锁定来源。
- docs/research/evidence/t1044/home-thread-startup-verification/tmp/arg0/codex-arg0J3MDdQ下apply_patch、applypatch、codex-execve-wrapper各stat约240351424 bytes，应排除整个临时工具目录。
- frontend/public/reference-editors/opencut-classic/native/native.js约6605600 bytes是运行vendor候选；核对构建来源/许可后保留。
- 不提交真实DB、密钥、激活码、cookie、私照、工具HOME或模型备份；WIP快照不得冒充验收。

## 安全串行顺序

1. 固定三个来源HEAD和逐文件hash；主树已授权改动先做可恢复快照/提交，来源dirty在独立候选树纳入并标WIP，不清空源树。
2. 先确定唯一task ID映射和兼容迁移lineage；历史SPEC/评审hash/事件保留来源，不能篡改成新历史。
3. 主树账号组基线先纳入干净模板/creator-canvas依赖，解决8个runtime冲突及注册、权限、发布采用、导航。
4. 再纳入诊断当前树文章图文、制作剪辑、平台能力、Codex/WorkBuddy，解决47个runtime冲突及与模板64个runtime交叠；保持group权限和资源归属。
5. 隔离迁移四基线验证，加功能contract/backend/frontend、LED-047、boundary/orphan与真实验收链；合同缺口按T-1062补合同独立评审。
6. 统一候选提交冻结干净树后固定入口本地打包；安装版逐功能验证，保留待验和既有全局失败。

```mermaid
flowchart LR
 A[主树账号组] --> B[唯一任务ID与迁移血缘]
 B --> C[干净模板与画布]
 C --> D[诊断源码和dirty依赖]
 D --> E[迁移及功能回归]
 E --> F[统一提交冻结]
 F --> G[本地包逐项验收]
```

## 来源独有提交

### diagnostics

- bb00d580 docs: 恢复工作台预览并记录保存比较缺陷
- 334b6c19 docs(ai): 记录用户取消 WorkBuddy 实际调用验证
- 58326747 docs(ai): 记录 WorkBuddy 客户端调用入口与待验原因
- 6fba4d08 test(ai): 记录真实内容、取消和连接器验证
- b96451fd docs(ai): record verified Codex source commit and remaining checks
- e2b1cd08 fix(ai): repair restricted Codex tools and verify real AI flows
- 1b5271e5 docs(agents): 登记接入提交与真实待验边界
- c9c59617 feat(agents): 复用固定 ACP 源码与 WorkBuddy MCP 连接器
- 04ad6212 docs: 锁定已有 Codex 和 WorkBuddy 接入复用来源
- 5cb369ba docs: 调研可组合模型来源与 ACP/MCP 集成
- 7cbad74b docs: 移交网页版工作台集成与用户验收
- 39c1be32 docs: 核实开源图文与公众号工作台运行及适配边界
- 35d546fd docs(T-1049): 登记开源小红书与公众号工作台集成和体验打磨要求
- 6b553e9e docs(T-1048): 保存最终对账结果并注明未完成验收
- 1932e30d feat(T-1048): 集成逐页组图工作台与画布采用，保存开发验收证据
- 419964f8 docs: 冻结连续组图与画布回原页的评审合同
- f152b801 test: 保存 T1046 当场回归与未通过全仓对账日志
- 66e65d27 wip: 接通 OpenCut 同工程 AI 粗剪并冻结真实验收证据
- 9792f89a docs: 调研小红书组图生成与画布工作流 T-1047
- 5d97b750 feat(production): integrate output editor versions and recoverable rendering
- 31ef5c43 feat(production): 建立稳定片段结构编辑与兼容回归基础
- 18884d1a docs: 保留时间轴探针的实际构建与失败日志
- 34e3b6a9 docs: 完成视频时间轴选型与 ChatCut 实测，冻结制作工程合同
- 6f54c75e docs(verification): 保存工作台快照构建与文章可读性实测
- 13fc62c3 docs(tasks): 保存事实核查与输入修复的状态及评审审计
- 4d74b8b6 docs(verification): 记录分镜最小窗口读回与验收边界
- acd097c7 docs(verification): 保存干净提交的改稿与 Worker 复验
- 191cec7a docs(research): 核实脚本事实约束传递并保留模型反例
- ae78054c fix(artifacts): 保留编辑分镜结构并同步局部改稿口播
- 79ba573f docs(verification): 保存 Worker 输入失败的当场红绿证据
- 2d2b58bc fix(worker): 明确调用前输入失败并验证约束消息传递
- e4deb0fd fix(settings): restore model configuration backup round trip
- 295198e9 fix: preserve managed flags for account collection jobs
- 1eb94970 feat(reporting): prepare consented CreatorOS local diagnostics and creator data
- c4042309 docs: 规划创作提示词与跨平台数据架构
- 034f279a docs: design opt-in diagnostics and creator reporting

### templates

- 55a526d6 docs(templates): 保存样图包和本轮验收待办证据
- 92ebc96b feat(templates): 扩充真人产品与GitHub双库模板样图
- 5ffb8493 docs: 留存首页验收与全局待验记录
- e7b5c670 fix: 返回画布库保留作品上下文并补齐最终回归证据
- fb566c02 feat: 在原创作首页并列案例资产和画布并接入选用流程
- c2b13ae5 docs: 复核并恢复首页案例资产画布入口实施
- 05964e87 docs: 明确案例资产画布在功能首页并列的设计
- 55d34d72 docs: 记录双模板库原生验证与未完成验收
- 3f792122 feat: 在原无限画布接入双模板库与发布物料
- b9fd9288 feat: integrate visual template favorites and canvas material adoption
- b22e6522 chore: 绑定模板库独立后端执行范围
- 401e7a6b docs: 冻结原画布双模板库与发布采纳合同
- de031bc3 docs: record installed canvas chat verification limits
- 720d9207 fix: wire canvas chat skill and force current canvas read
- dc172a27 docs(canvas): record verified T-994 journey
- 43a62a93 feat(canvas): polish project creation and result adoption
- 8baea109 docs(canvas): record installed render candidate
- 84b2bada docs(canvas): record render and installed package acceptance
- 064b7bf8 fix(render): resolve binaries in ESM and refresh publish route regression
- 53b49fdd docs(canvas): keep rollback package out of downloads
- 91733ab5 fix(canvas): repair legacy schema and retain project links
- b4c0a62e docs: record canvas local package acceptance
- 65781a81 feat(canvas): integrate MIT infinite canvas interaction layer
- 144c4b47 fix: make canvas first entry and node placement reliable
- 454c3c45 docs: record local model probes for canvas acceptance
- 01175b28 fix: expose canvas generation provenance and validate frame ratios
- 8e6c60b5 docs: record creator canvas regression evidence and remaining gates
- c9ed15fb feat: add account-scoped creator canvas and reference media generation
- 58d1bfe8 docs: define reviewed creator canvas integration
- f775588c chore(readme): 更新提交活动图 [skip ci]
- 24e66a62 chore(readme): 更新提交活动图 [skip ci]
- 4bf75dac chore(readme): 更新提交活动图 [skip ci]
- c8aa4bdc chore(readme): 更新提交活动图 [skip ci]
- 0f3eea05 chore(readme): 更新提交活动图 [skip ci]
- 1ca07bc9 chore(readme): 更新提交活动图 [skip ci]
- 0290858f chore(readme): 更新提交活动图 [skip ci]
- 8a670c65 chore(readme): 更新提交活动图 [skip ci]
- b6c370f5 chore(readme): 更新提交活动图 [skip ci]
- 77eabca3 merge: 撤掉插在 sidecar 产出前的 Windows runtime 占用校验(T-992)
- 92a8d326 docs: 修正 T-992 SPEC 里已失效的流水线声明
- c4d785be docs: 归档 CI 步骤插在产物生成之前的踩坑
- b93084d3 fix(ci): 撤掉插在 sidecar 产出前的 Windows runtime 占用校验
- 5c1c7060 fix(windows): 容忍已校验运行环境切换占用


## 主会话后续快照与路径审查

主会话通知主树已提交125bc864到codex/t1062-account-group-snapshot、源树干净，并创建独立整合树；上文主树838 dirty为提交前只读采样，不应再作为当前dirty。运行时冲突基于提交前同一代码内容，可用独立树再次确认。

诊断dirty快照显式文件清单：/tmp/t1062-diagnostics-includable-paths.json。1901候选→1830可纳入→71排除（工具tmp/arg0、同目录真实DB、符号链接工具）。含删除frontend/src/features/reference-editors/reference-editor-frame.tsx，快照必须保留删除。完整路径/hash/字节数与排除类型：/tmp/t1062-diagnostics-path-review.json。

对文本做BEGIN PRIVATE KEY、sk真实长度、ghp/github_pat、xox、长Authorization和JWT模式检查未发现候选；对docs日志/JSON再做敏感键值结构检查亦未发现凭据候选。只输出路径/类型，不输出匹配内容。63个媒体候选中44个证据截图、19个vendor静态资源；无明确私照目录或命名。内容模式不能证明图像绝对无个人隐私，真实账号截图与私人媒体画面需主会话人工核对后决定；未经核对不得把检查结论写为绝对无隐私。
