# T-1397 修复 main Verify 并核实已知失败

## 用户授权与目标

2026-10-22用户授权修复main的GitHub Actions Verify，基准提交`5763199619968a3c342205d97d23a9efe59dc138`、失败run`39711648579`。当前本地main比该基准多T1394–T1396的4个文档提交，工作树干净，予以保留。用户授权小粒度中文提交、通过HTTPS正常推送main，并跟踪CI；初次推送后若失败最多再推2轮。禁止force push、`--no-verify`、改`~/.codex/config.toml`、设`T1332_APPROVED`或绕过T1246。

## 实施与边界

1. 对照实现和业务契约修复SPEC §13漏登记路由；契约测试保持原断言，接口确有用途才登记。

   核实两条T1328预测锁路由后发现测试硬编码SPEC_13登记数组。用户已单独明确授权「允许仅补两条登记，断言不变」；数组数据与SPEC同步不扩展至改测试逻辑。

   完整后端验证另发现真实兼容回归：`pages.groupTrend.get`被加入共享目录，改变T1086/T1248已冻结的V1 schema。修复仅将该能力限制在当前V2目录，保持V1原golden/hash及当前V2完整字节/顺序，恢复既有合同而非改测试预期；范围含`contract/src/resources/assistant-system.ts`与针对版本隔离的回归测试。不得以known清单掩盖该回归。

   前端完整历史恢复测试进一步证明：原producer `6e4689`已冻结的旧V2有63个读取分支（含编辑器与expectedRevision），与V1的62分支、当前V2的64分支均不同。恢复该精确旧V2原型，内部以`2-before-group-trend`选择相同endpoint/schema；matcher、buildChatTools、真实host和assistant-system-root必须一致，未知或篡改目录仍拒绝。默认V2完整字节、V1原golden及旧冻结payload不变。范围扩展至backend的上述既有适配模块与回归测试，这是恢复已有任务读取合同，不扩展公开能力或放宽冻结校验。
2. 用失败run日志和本地完整后端测试查明exit143原因，按证据修workflow时限、分片、并发、内存。所有原测试仍执行，进程异常不得登记为已知失败放行。
3. 本机完整跑backend及frontend，前端隔离PGlite与用户目录，普通用例使用内存库、磁盘用例使用私有临时目录，不接触正在运行App数据；运行`propose-known-failures.mjs`产生候选，再逐条核实环境/断言漂移/时序不稳，写清稳定错误标记与责任任务。可修复的问题优先修，清单不掩盖新回归。

   隔离核实：全局非空PGLITE会强制所有普通单测共用磁盘库，与原`__resetPersistenceForTests`的新内存库语义冲突。最终runner清除继承`DATABASE_URL`/`PGLITE_DATA_DIR`，普通Vitest按正式driver走独立内存库，HOME/CODEX_HOME私有；本来要求file-PGlite的用例自行指定私有临时路径。先前全局盘库轮次的失败仅为负面证据，不作为已知失败放行理由，修后需完整重跑。
4. 本地全workspace typecheck（6144MiB堆、并发1）、quality.test.mjs、boundary和run-tests全部包通过。单包PASS必须保留原始失败数和已知豁免数；不冒充原始测试全绿。
5. 验证后分小提交推送，使用`gh run watch`等待最终结果；必要时按最多2轮追加推送继续修复。中文报告交付`/Users/zyongzhu/terminals/ci-green/REPORT.md`，包含最终CI结论/链接、每项已知失败理由与改动文件。

## 并行交接

所有worker固定`gpt-6.1-sol`、`high`。契约worker只写对应SPEC路由登记；CI/backend worker负责`.github/workflows/verify.yml`、后端测试配置及必要quality分片入口，运行完整backend；frontend worker负责完整隔离frontend测试、候选和最小相关修复。协调者维护`known-failures.json`、任务工件、提交与推送并集成验证，worker不提交/不推送、不改看板及全局配置，跨边界先告知。测试输出集中在`/Users/zyongzhu/terminals/ci-green/`，不把私密数据入库。

## 验收及规则

用户本轮已明确批准契约漏登记修复及Verify执行方式调整；不修改产品方向、数据归属或许可安全边界。maintenance按实际变更进行独立复核，测试/日志不得补拍。涉及超时路径运行timeout-policy回归。完成按pmem sync→quick只读reconcile→taskctl complete；历史范围外22ERROR/17WARN如实记载，若新增本任务问题必须修复。最后保留真实CI结果和最多三轮推送计数。
