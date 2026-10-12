# 最终验收工具私有续版候选

本目录仅为 T-1246 原验收工具的源码续版。原170、new111（103/7/1）、first100、配置、SQL、原9工具均保持原字节；a738 的61项与 Doocs29b3 的53项当前逐SHA/size复核零漂移。尚未执行预算测试源码、metadata collector、reseal、prepare、list、服务或浏览器。App 继续保留用户暂不授权、未验收。

拿到同一最终提交的真实11Worker和开发版DMG后，先封存完整源码与实际运行依赖，再由批准的准备工具创建私有副本、核对该副本真正的动态加载路径，最后运行原用例并保存截图、trace、原始结果和进程清理回执。旧失败和缺失证据保持原样。

```mermaid
flowchart LR
 A[真实最终HEAD/11Worker/DMG] --> B[源完整库存/联合actual otool原始证据]
 B --> C[批准prepare创建私有副本/3个工具续版]
 C --> D[actual owned加载图/完整前核]
 D --> E[原170及103/7/1实际页面操作]
 E --> F[真实截图与结果/清理/完整后核]
```

整单读取顺序：`SOURCE_TOOL_BINDING.json` → `CANDIDATE_DELTA.json` / `FROZEN_SOURCE_INPUT_RECHECK.json` → 六个私有 prepare/verify/launch → `EXACT_FORWARD.diff` / `EXACT_INVERSE.diff` / `EXACT_DIFF_RECONSTRUCTION_PROOF.json` → 同代 `tool/` 六个CJS与两个Python → `A738_TO_TOOL_V2_FORWARD.diff` / inverse → `budget-test.cjs` / `STATIC_PARSE_RESULT.json`。`tool/LEGACY_INPUT_SNAPSHOT.json` 与原a738当前输入一致。批准配置仍使用实际默认headless-shell1223，fullChrome为另一个独立真实实现与源码根；registryDirectory为真实缓存根。ffmpeg9.0.1_1实际4秒fixture消费者和其全部动态库纳入future联合闭包，不借Doocs131对新图签字。

74ab58bc预审的五项静态问题合并在这一代关闭候选中：

1. 内部 verify 的真实2个Git命令各120k保持，source完整I/O900k、owned另900k，S=1.14M，R=2.04M。Next ready admission 420k+R=2.46M，完整Next保原1.2M/1.5M+R；只读账本保原1.2M/1.8M+R。entry R/S/R=5.22M，final S/R=3.18M，三次完整清理7.2M，原profile outer另加14.88M。所有长等待继承同一entryClock出生截止、每段≤60s，末尾同步核验和清理之后仍做monotonic后验；无skip/缩库存/绕过标志。
2. 两个prepare完整S/R/S/R为6.36M，保留原3.6M非verify预算，总9.96M。原clone/checkout各360k，dirty/untracked/ownHEAD各120k，新111实际ffmpeg240k不减；剩余copy/relink/输入I/O为原2.52M/new2.28M。每个真实positive消费者按明确顺序预留余下完整槽，普通I/O按同一出生时钟扣实际已耗，不重生。外层prepare也使用同一纯推导9.96M。prepare直接从批准候选源码执行，通过显式封存sourceRoot定位原manifest/source/test，仅在新private copy覆写3个批准工具后生成完整runtime库存；原9本体不应用续版。
3. metadataInput明确供给两个Python实际必读的browserRoots与原builder producer8bac/closure3bc9真实路径和SHA；写输入前后消费者均逐SHA核，原builder文件保持原样。头文件发现只提供pair inventory，actual otool producer才可生成resolved-static图，future预算取新图实际全部file+arch，不复用131常数。
4. source actual otool stdout/stderr/receipt均有精确SHA与closed/code事实；其完整pair库存必须等于loadCommandMetadata唯一pairs，producer/metadataTool/input/rootInventory也逐SHA核。所有raw和输入行进入joint完整sourceFiles与dynamicSourceEvidence，每次source/runtime verify重核，owned raw原守卫保持。
5. supervisor子进程close callback记录真实monotonicClosedAt、原positiveBirth与deadline。code0的非null结果若关闭时已到期，仍budgetExhausted=true；positive截止不以更长整单或cleanup生命周期替代。cleanup2.16M保持，父整单在所有清理、raw结果与后验之后检查其原deadline。

protocol仍只允许原已批准的单个私有Codex Mach-O替换为真实fixture CJS：官方原SHA、私有fixtureSHA、新inode0700、marker0600/原stateRoot/controlToken完整守卫。仅该原入口/主上下文从actual Mach-O角色集合排除，其他相对loader/rpath实际私有重解析、绝对load保持原绝对路径，不对CJS强行otool。official/pi/original不替换。

两旧manifest只能在future reseal写入0700私有输出，后续双审精确应用；new driver自包含manifest SHA只该组移到外置完整库存和实际manifest SHA校验，其余原库存不减。legacy253是首轮生产源库存，实际新SHA只允许真实批准写集/final audit；T1251 chat-generation-worker当前de1a，11907是frontend/src/server/workbench-file-recovery.test.ts的110s测试minimum。原first100保持冻结。

当前只有15项语法解析实际通过（13 CJS `--check`，2 Python AST），未执行模块body或budget-test。首次original revisedRunnerBudgets多一个括号的实际语法失败完整31文件保存在`history-first-legacy-syntax-failure/EVIDENCE.json`；原a738的Python缩进失败和74ab58bc静态finding保留，不伪造TDD红测或runtime FAIL。

所有最终输入仍pending：final cleanHEAD、Doocs native实际完整交付/源码包、同HEAD实际11Worker和DMG receipts、metadata bootstrap完整实际闭包、fresh联合actual otool/raw、最终合法scope audit、候选源码双审、实际private copy完整加载图与独立runtime双审。源码批准不代替任何页面body或App验收。
