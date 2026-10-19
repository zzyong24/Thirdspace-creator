# T-1246 四包完整单元与集成测试

2026-10-11。依据已确认 SPEC 与当前功能清单编写。用户暂不授权原生 App；App 验收记录为 blocked，四包测试独立进行，不代签 App、浏览器或官方模型整链。当前仅完成用例和只读环境准备，**尚未运行首轮**。执行必须等待主线程冻结 commit 与四项基础打包测试回执。

大白话：把当前已有测试全部原样跑一轮，逐包串行，保留每个失败和跳过。完整首轮结束后才集中修复；不能边跑边改断言或反复重跑消除失败。

```mermaid
flowchart LR
 A[冻结提交与4项基础检查] --> B[隔离测试环境核查]
 B --> C[contract完整]
 C --> D[ai-worker完整]
 D --> E[backend完整]
 E --> F[frontend完整]
 F --> G[首轮所有结果与缺口]
 G --> H[集中修复与重新冻结]
```

## 首轮执行边界

- 四包实际 Vitest4.1.8；使用各包原 `vitest.config.ts` 的发现范围、alias、setup与环境。不新增排除/selector，不更新snapshot，不改产品源码、fixture、断言或已有skip。原 discovered 文件及运行后的tests数量分开计数。
- 逐包 `contract → ai-worker → backend → frontend`；同一包 `--no-file-parallelism --maxWorkers=2 --maxConcurrency=1` 减少 PGlite 内存压力。文件默认隔离保持，不设置 `--no-isolate`。
- CLI `--testTimeout=180000 --hookTimeout=180000 --teardownTimeout=180000 --retry=0 --bail=0 --allowOnly=false`；不使用 `--passWithNoTests` 或忽略未处理错误。ai-worker/frontend配置的retry2由CLI显式覆盖为0。原个别test的300秒、1200000毫秒等更长预算保留。
- **预算已知限制**：原 `vi.setConfig({testTimeout:30000})` 等文件内覆盖和显式per-test预算具有更具体优先级，CLI不能提升它们。首轮保留原文件；记录实际配置和短预算失败，不偷偷改断言或以新增setup拦截 Vitest 造绿。正运行默认180秒，原120秒满足执行两分钟下限；原短预算作为已知未迁移消费者单独报告。
- 完整命令使用可持续exec session观察，不加会截断串行套件的短shell/watchdog；每次观察最多60秒，完成后保留真实exit。若必须设置有限外层，则在实际收集数明确后按所有test/hook与原显式更长预算、进程启动/清理余量计算，不能用单例180秒当整个包上限。
- 子进程 `NODE_ENV=test`、`CI=1`；每包独立临时目录与临时媒体/auth/workbench路径。不得继承生产 `DATABASE_URL`、真实PGlite路径或S3凭据，也不在测试日志打印凭据。不得调用db:reset、正式App、激活重置、真实发布/付费平台。
- 原 opt-in PG/S3/外部probe仍守原消费者门。需要真实PG的测试只接受已核实名为本轮测试库、回环地址且不关联用户库的环境；缺少该前置保留原skip并列出未验，不能以PGlite代签PG。外部原生/官方模型probe不因本次unit任务隐式开启。
- 不构建Worker/Next或覆盖并发浏览器bundle。测试依赖实际产物若缺失，首轮记ENV/FAIL；由主线程统一安排补齐，未获新安排不私自build。
- 所有stdout/stderr、JSON reporter、exit、起止、冻结SHA及问题记录置于 `unit-first/`。失败包仍继续其余包，单包不重试；首轮完成后再由主线程统一确认修复写集、独評、重冻与复验。原四项基础打包测试随后在frontend完整套件内可能再次出现，不相加重复数。

## 命令合同

在整合工作树内，每包执行如下命令（`<包>`依上面的串行顺序，输出路径使用实际绝对路径）。运行前记录冻结SHA、原测试/config哈希与隔离目录。启动通过不等于测试通过。

```bash
pnpm --dir <包> exec vitest run \
  --testTimeout=180000 --hookTimeout=180000 --teardownTimeout=180000 \
  --retry=0 --bail=0 --allowOnly=false --no-file-parallelism \
  --maxWorkers=2 --maxConcurrency=1 \
  --reporter=default --reporter=json \
  --outputFile.json=<unit-first绝对目录>/<包>.json \
  > <unit-first绝对目录>/<包>.log 2>&1
```

exit须由实际子进程返回值保存；不使用会把失败变成功的管道，不把环境命令exit0填为套件PASS。配置发现范围当前为contract `tests/**/*.test.ts`及endpoint-bootstrap.test.mjs；Worker/backend `src/**/*.test.ts`；frontend `src/**/*.{test,spec}.{ts,tsx}`及`scripts/**/*.{test,spec}.mjs`，保留原e2e/visual/accessibility等排除。

## 全功能族与公共边界映射

以下映射来自完整功能清单；这些是首轮应检索的实际测试域与需要核对的合同，不提前承诺已有测试覆盖全部输入族。每项最终证据必须回指本轮 JSON 的文件/用例状态；fixture通过不称官方账户真机。

| UNIT / 功能族 | 现有测试域及需核对行为 |
|---|---|
| U01 文章/视频脚本正文 | backend application/generation与modules/ai-runtime；Worker runtime候选：内容候选、来源/权限、原模型规格与采纳/CAS |
| U02 主张/约定/大纲 | backend generation/writing、execution与Worker agentic：分步工具输入、原任务归属、完整目录 |
| U03 脚本审核/平台改写/复盘 | backend script/review/publish，frontend chat-task-submission；正常非空与空稿工具拒绝分开，partial不得伪成功 |
| U04 图文文本 | creative-post/graphic-post-text与frontend graphic-post：immutable base、引用、候选采纳和CAS |
| U05 文章分段修改 | wechat-article-text、creative-results：原版本/片段ID、来源、媒体归属与并发保存 |
| U06 发布物料文本 | publication-text、publication服务与API：冻结输入、物料候选和用户保存，禁止真实发布 |
| U07 朋友圈 | moments、moment根装配：原引擎、原execution、候选与用户采纳 |
| U08 作品审核 | work-review-root、review服务/前端：合法来源、原父ID及审核结果 |
| U09 选题/偏好/定位/标定 | discovery、topics、positioning/calibration：可配置Skill语义、组/用户隔离、真实0/空态 |
| U10 调研/相似性/编导 | research、copilot、agentic：证据端口、计划/Workbench目录、工具安全与原调用预算 |
| U11 素材分类/提取 | asset-processing、material/media、assets与前端素材路由：纯组合法、文件/版本/跨组拒绝及真实候选 |
| U12 视频决策/匹配/重建 | video/production/execution及Worker：原父期限、素材归属、安全降级、结果恢复 |
| U13 知识归类 | knowledge-generation、knowledge-worker-routes与knowledge-classify：group header、鉴权、原task ID、宿主不解析文本API |
| U14 全文蒸馏/关联/评论提炼 | 四知识runner/真实PGlite+Worker integration：整请求分块共用原deadline、不交假完整结果、采纳端口 |
| U15 雷达/灵感 | intelligence、radar API/前端：原group scope、真实候选、零结果/不可用诚实 |
| U16 定时飞轮 | scheduled-flywheel、scheduling/attribution：原lease/job/父scope及切引擎后冻结 |
| U17 每日自动选题 | daily-topic/scheduled topic：原aiTask、owner、无key Codex预检及原Pi缺配置合同 |
| U18 ASR文本后处理 | transcribe/postprocess与Worker ASR：文本沿原execution，ASR独立能力保留，取消/期限不续期 |
| U19 独立生图/参考编辑 | codex-image/asset-generation、generation ports：媒体原bytes/checksum、SDK7图片预算、原group采纳、unknown不重发 |
| U20 封面/图卡/文章配图/系列图 | cover/graphic/card/article媒体：brief与图片规格分离、候选回收/lease与采纳边界 |
| U21 聊天本身 | external/chat-worker、native/ACP、聊天输入：官方协议消费者fixture、附件、原Pi身份及事件流 |
| U22 聊天工具子任务/采纳 | contract工具目录、execution chat工具/子树/stream/history：ACK丢失、unknown严格只读恢复、原父子ID、partial/拒绝 |
| U23 成片视觉审核 | video-visual-review service/executor/driver及Worker：父期限、真实预约、Pi缺能力可选降级、fixture与打包entry消费 |
| U24 设置与引擎公共控制面 | contract codex route、backend preferences、frontend engine/settings/model region：持久偏好、ready门、Pi卡、公开serviceId媒体保留及保存失败 |
| U25 账号组/数据归属与迁移 | account-groups、workspace migration、真实PG opt-in及frontend scope：活跃组/账号/历史source/CAS/事务归属，不能仅PGlite签PG锁序 |
| U26 知识库资料与版本/文件夹 | knowledge/source/document services与frontend reader/editor/import：原文、revision、移动/搜索/分类/空态及采纳数据归属 |
| U27 自动化宽窄/详情关闭 | frontend automations-island/group-scope与backend scheduling：筛选/共享job/详情关闭/原owner，jsdom操作不是实际窄窗截图 |
| U28 身份/激活/服务隔离/资源生命周期 | auth、settings、persistence lifecycle、execution、Worker/浏览器driver：真实owner/权限、关闭回收、原调用权，不触及用户激活 |
| U29 打包脚本与依赖消费者 | frontend scripts/desktop、backend integration、Worker runtime：包身份/路径/完整entry及安全检查；测试PASS不代签实际app/dmg |
| U30 全部其余原测试 | 四包全发现范围无过滤完整运行：统计未映射文件、异常/skip与覆盖缺口，不只挑本次新增绿例 |

## 首轮准备状态与问题记录

当前整合 HEAD 为 `4df3424972831acfdd091056b3045b2472120692`，源码仍在整合，**不是冻结候选**。静态源文件匹配候选contract76、Worker159、backend643、frontend559；完整路径清单见 `unit-first/source-inventory.json`。这不是Vitest实际收集/执行数，冻结后重新核对，不据此计PASS。

已核实际Vitest4.1.8与CLI支持。当前已知前置/限制：①等待主线程冻结与四基础测试；②真实PG/S3 opt-in环境需独立证据；③文件内部旧短预算不能靠CLI升高；④未建Appium会话/未启动App，用户决定保持。所有首轮问题分别记环境、产品/测试合同失败、实际skip/未验，根因没核实不归旧债。

收尾交付是每包实际exit、发现/测试/失败/跳过及未处理异常数、完整失败列表/原文件位置、隔离资源回执和覆盖边界。只有四包实际完成后才能总结完整首轮；单包或筛选通过不能代签整套。

本轮独立PG已真实准备：port50028、PID74714，独立临时根与unique库/owner、6条实际命令exit0见 `unit-first/pg-environment.json/.log`；仅监听127.0.0.1，未使用真实凭据。主线程只读确认既有55422/PID52177属于2026-10-09的T1117独立任务，禁止连接/改/停止。原26+消费者强制55422，`migration-convergence.test.ts:95`还硬编码该地址；新端口不能满足原guard。首轮保原guard实际失败/skip，不提前改assert/guard；对硬编码消费者必须先落实不接触既有55422的进程隔离护栏，否则不得开始该包。该环境缺口不能归为模型/产品通过，也不能从临时PG创建成功代签测试成功。integration写集现已释放，等待主线程冻结与四基础检查后再运行首轮。
