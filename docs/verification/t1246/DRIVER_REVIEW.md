# T-1246 浏览器 driver 独立复核

2026-10-11，独立子 Agent 只读审查。模型设置 `unknown/inherited`。被审 `manifest.json` SHA256 为 `3fd2f86b9f56dc6a6266494db21162fd10d6d800b958a849a7678589e5a95c4e`，234 处机械变更；后续变更需增量复核。本次未启动 Next、Worker、App 或长 E2E，没有运行 PASS。

## 已核事实

原 54 个 E2E 文件集合保留，完整原测试树 100 个文件有来源 SHA。生成 57 个 TS 文件的 234 处变更已按 JS UTF-16 偏移独立逆重构，全部恢复为原文件字节；所核变更限显式 Playwright 时间消费者、外层预算、证据位置、公开 `expect.configure` 与截图 fixture 的独立预算，没有发现业务断言、数据、响应、归属、sleep/interval 或原持久任务 deadline 被改。未变换的其他 43 个副本先前逐字节比较一致。

独立解析 `list-audit-v3/results.json` 得到 170 个真实列举 test，`results` 全空，`errors: []`；这证明用例能够列举，不证明 170 个用例通过。配置保留原 e2e 项目并显式 worker1/retry0/trace on/screenshot on；没有新增 skip、filter 或 snapshot 更新。新增整合用例必须另计，不改原 170 的分母。

request/expect/action/navigation/capture 最短 120000ms，test/hook/fixture 最短 180000ms。原更长外层保留，现有效 test 声明范围 4020000 至 672660000ms，低于 Node signed32 timer 上限；globalTimeout 为 0，没有另加更短全套 deadline。声明预算不能证明动态调用/运行时完整消耗已覆盖，最终执行器仍应保留串行、冷启动、排队、清理余量，不以工具调用短总期限截断首轮，不续原任务期限、不自动重发。

原 settings 的分拆 `docs/verification` 输出已迁到本轮；creative-canvas 的 `t1101/user-baseline.png` 是真实输入，已确认实际存在且保持原读取，SHA256 `0fd5be87a6ea6d7b01644ef5e71ebda69f842acae59893e480ba72f053aab809`。

Next 的机制有实际消费者支持：所装 Next `dist/server/config.js:1165` 接收 `__NEXT_PRIVATE_STANDALONE_CONFIG` 并返回已完成默认化的 config；launcher 先真实 `loadConfig(PHASE_DEVELOPMENT_SERVER)`，仅替换 `distDir`，通过独有 runDir+candidate 派生 `.next/t1246-*`。其 `PACKAGE_READY=1` 前置、拒绝桌面构建环境、直接启动 Next 避免 predev 重建 Worker 的设计可核查；不能据源码检查声称这个 launcher 已实际成功启动。仍按包先完成、再浏览器执行，原构建配置与脚本保持。

## 执行前阻断项

### DR-001：部分历史证据输出仍未迁移

状态：open。影响 AC-1246-4/6 的独立轮次和历史 FAIL 保留。生成副本中仍有 `resolve(repoRoot, "orchestrator", "evidence")`：`publish-package-readback.spec.ts:198`、`copilot-project-reference.spec.ts:124`、`recent-data-safety.spec.ts:57`、`asr-configuration.spec.ts:87`、`onboarding-and-small-sidebar.spec.ts:30`、`built-in-ip-course.spec.ts:27`、`semantic-material-generation.spec.ts:160`。`content-radar-one-click-project.spec.ts:398` 还接受旧 `CREATOROS_T1224_EVIDENCE_DIR` 或回退同一历史目录。它们会把本轮文件写入旧任务证据位置，与 README 的全量迁移声明不符。

最小约束：这些实际输出消费者全部绑定本轮受控 runDir，保留文件内容和原断言；旧 env 不得把本轮证据导向历史目录。原真实输入不能顺便改。可反驳证据为生成文件的精确 diff 与输出路径静态清单，冻结前重新列举。

### DR-002：Worker 产物后缀不匹配，合法构建会被拒绝

状态：open。影响 AC-1246-4 的实际公共链路启动。`start-isolated-next.cjs` 仅列出 `ai-worker/dist` 中 `.js`；原 `ai-worker/scripts/build.mjs` 实际生成 `execution-worker.cjs`、`agentic-worker.cjs`、`codex-status-worker.cjs` 等 `.cjs`。因此原入口完成合法构建后仍可能以 `files.length===0` 报“Frozen Worker dist is missing”，也无法记录真正消费者的 SHA。复核时该目录尚未构建，未把缺目录称已发生的运行失败。

最小约束：launcher 核查并记录原构建实际生成且实际执行的完整 Worker 产物集合与 SHA，产物缺失时继续明确失败；不改产品构建脚本或以无关 `.js` 文件绕门。可反驳证据为原 build 的 outfiles 与本轮实际产物清单。

### DR-003：全树与产品冻结守卫尚未闭合

状态：open，允许由主线程冻结校验落实。影响 AC-1246-1/4 的候选身份。当前 config 核原有 100 个文件 SHA 和生成 57 个变换文件 SHA；没有核生成树另外 43 个未变换输入的 SHA，也没有拒绝原树/生成树新增文件。候选仅核 `HEAD`，同一 HEAD 下产品脏改无法据此识别。当前独立检查没有发现这些文件已漂移，本项不把未来可能性冒称既有事故。

最小约束：最终冻结清单及执行前后守卫覆盖实际产品、原测试完整树、生成完整树、driver/config 身份，核精确文件集合并拒绝未声明漂移。可由外层冻结工具完成；不强制新增产品机制。准备时 `4df342...` 不是尚未提交的本轮源码冻结身份，manifest 的 sourceCommit 必须绑定最终实际来源 commit。

## 运行后必须真实核查

launcher 的 Next 类型元数据清理只移除本轮 distDir 引用并保留其他变化；本次只读检查不能代签其实际 cleanup。启动日志、实际 Worker 产物 SHA、fresh DB/media/auth 根、Next distDir、退出/清理与源码前后 SHA 须在本轮读回。`PACKAGE_READY=1` 是主线程准入声明，还须引用本轮包真实路径/SHA/来源；不能仅凭环境变量认为已打包。

原测试保留既有同 ID 回读和 fault fixture，但 170 用例并非全部含后台 ID，也不全部官方模型实调用。执行报告分别标记 UI、真实后端、受控外部 fixture、官方 Codex，保留首轮每个实际失败/缺前置；新增 29 个整合草稿尚未交付，本报告未审或代签这些用例。用户明确暂不授权 App；本轮仍不建立原生 session、不触发系统认证、不启动用户 App。
