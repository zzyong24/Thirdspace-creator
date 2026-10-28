# T-1412 / T-1416 最终执行证据只读复核

审核时间：2026-10-25。审核者 `/root/t1426_spec_review`。已读两个原任务包 §1–5、7–9和写入前§6、当前两份SPEC及其验收要求，核原始日志/收据、full-results、保护摘要、停止原件及T1416候选。此会话曾参与T1412/T1413实现，本轮没有实施T1416、执行本轮原门/full或生成这些运行收据；本报告独立核对本轮执行事实，不冒充另一位实现代码审查员，代码独审另见既有报告。未执行测试、网络、用户CLI或控制面操作；唯一写入为本报告。

范围结论：现有真实证据支持T1412的预算/归档入口/HyperFrames隔离修复，以及T1416两处过时页面断言，按各自范围进入正常收尾。T1412的最终full确实完整运行，遇到的新LED054失败已保原件并由T1416复验原整链解决。可称“原full失败后单项修复复验”，不得称4128候选重新执行一次full并全绿。pmem、quick、taskctl及其它控制面收尾仍由主线程按真实收据办理，本报告不替这些步骤写状态。

| 实际入口与候选 | 原始结果 | elapsedMs / 退出 |
|---|---|---|
| 75b74649e，node tools/timeout-policy/verify.mjs | 原八组174 PASS、0 skip | 51405 / 0 |
| 75b74649e，node docs/verification/t1022/run-archive-guard.mjs | 原三文件59 PASS、0 skip | 81592 / 0 |
| 75b74649e，node orchestrator/process/reconcile.mjs --profile full | 55项54 hold、LED054唯一fire；整体1 ERROR/13 WARN | 2187525 / 1 |
| 75b74649e，原frontend两文件加verbose明确RED | 31 PASS / 2 FAIL / 0 skip，五个realTest实际执行 | 101379 / 1 |
| 4128c68c8，配置中的原LED054完整三段&&链 | frontend两文件33 + worker一文件31 + backend四文件79 = 143 PASS、0 skip、retry=0 | 228450 / 0 |
| 4128c68c8，pnpm --dir frontend typecheck | 已产生完整终态收据，无类型错误 | 79980 / 0 |

八组计数已从日志重新相加：两个Node组11+5，五个Vitest组5+20+37+68+28，加静态检查组，共174项。归档日志确为原三文件59项。full日志逐条解析出的54项id/耗时与full-results.holds完全一致，唯一ERROR/fire为LED054；55个ID与冻结配置集合完整相同，没有少跑项目。full日志与实际stats副本SHA都与full-results登记一致。旧full末尾仍是DRIFT，未被本报告或后续green改写。

T1412范围内，实际八组日志包含真实HyperFrames隔离证明：readDenied/writeDenied/networkDenied/forkDenied/detachedSetsidDenied/parentSecretsAbsent均true，自有listener连接数0；真实CLI最终status1、signal=null，stderr仍为原一秒参数低于120秒的拒绝，remainingOwnedProcesses=0，本轮临时根已移除。不能把预期的CLI非零拒绝误写为隔离失败或伪造成功渲染。原归档入口在owned PG下实际完成，full中的LED052同样hold，未绕过原owner/nonce守卫。FR141201自身预算守恒及纯计划红绿属于T1412先前冻结证据；最终配置合法包含随后T1413独评的六条check迁移，不反称这些check由T1412逐字保持到最终候选。

T1416绑定：原full候选75b74649e43e001bf6682867c331e14308074a61；单项复验候选4128c68c82a71e485110a026c1fbd288c549f363；已安装包仍是f9e5e5ece06d7d86dbb5bd38db76d18cc2437d84。实际读取外盘HEAD及文件，browser-host.test在主树、外盘、4128 Git对象三者字节一致，SHA为57e7b204be81a28646bd384f59e65b383afb541a84deb60fe76c9061c2c663c5。75→4128的唯一产品工作区变化是该测试；其余13路径为规格、审核、驱动证据及规范控制面，没有生产运行源码变化。源码diff仅新增可见正文区块helper并替换两处旧标题断言，没有移除原账号/profile/租约/取消/清理约束，未改等待预算、skip或URL策略。

reconcile.config.json在75、4128、主树和外盘实物逐字相同，SHA c8c13b6788b08f48aa4f154bcbdd0d1f74cf72a0e3e4863788e9b4aaa9cb8ffc。led054-green.receipt的/bin/sh -c参数逐字等于该配置原check，2700000ms预算不变；所有分段均执行，不是只跑frontend或替换目标。五个realTest名称在green完整日志均有对应，33项全pass且无skip。implementation-review.md当时尚未看到终态的限制，现在由green、typecheck、candidate-after和stop原件补齐，不能把那份先行代码读审冒充当时已有运行结果。

生命周期与保护：原eight/archive/full、原RED、后修green/typecheck均自然终结，code与日志一致；processClosed=true、signal=null、无budgetExhausted/outerAbort、remainingOwnedGroupMembers=[]。T1412与T1416两次owned PG的原stop-cleanup均exit0、postmasterPidAbsent=true、cleanupOwnedRoot=true，摘要stopped/rootRemoved=true；无需靠删除未知库或只看摘要推定清理。6份受保护文件前后SHA完全相同：pnpm锁、两份Cargo锁、配置及两份既有IPC内存基线。前4项另核与75 Git对象和当前实物一致；后2项明确是恢复的ignored历史原件，不在75 Git对象中、也不是本轮新内存测量。准备期environment-review.md的nomifun锁摘要仍写旧a2aea…，最终full-candidate、前后保护原件、75对象及当前实物一致为171c17…；本报告以最终冻结原件为准，未发现执行窗口锁漂移，不复用旧摘要代签。

尚未满足或不在本次结论内：T1413的官方同步图片当前幂等资格和正向网络恢复仍未证，LED045的合成安全回归hold不能代签线上资格；T1427官方Pi402和新安装版UI旅程仍未通过，额度页仅为用户明确跳过。这里的真实浏览器测试不等于新安装版完整UI旅程，macOS局部测试不等于Windows产品验收。原full的13 WARN和其它任务已知限制继续保留。未重新构建安装包，不将f9二进制重标4128；未批准完整产品完成、发布或推送。T1412/T1416本范围已取得的证据不能覆盖这些外部条件。

证据SHA-256（项目相对路径）：

| 工件 | SHA-256 |
|---|---|
| `docs/verification/t1412/resumed-validation/full-candidate.json` | `9132b6c42a40cd812cba4a099a06e0ff1a0233f994a6fce9b60e18305e8ab3e2` |
| `docs/verification/t1412/resumed-validation/original-eight.receipt.json` | `83212e09d4900a9934aa69cce9de0db5591315a5e7cd3b921ce10781a57515c4` |
| `docs/verification/t1412/resumed-validation/original-eight.log` | `8ef62d4f76e11c9684a01b08bc2bb6f387db47b6d0fd5367e5c643a36ffd1dc3` |
| `docs/verification/t1412/resumed-validation/original-archive.receipt.json` | `a64a0303066cc7d004ad08ffbd4377e577c1aa7093105c12b2b15953a1f48da7` |
| `docs/verification/t1412/resumed-validation/original-archive.log` | `0c6b6c5c6499ea1451b07acdeb285e1a663d37845fab80451ec63f94520de1f1` |
| `docs/verification/t1412/resumed-validation/reconcile-full.receipt.json` | `804287808972ac6e98fdce2d7a907c261712684053f16267e392fc47bd5faecf` |
| `docs/verification/t1412/resumed-validation/reconcile-full.log` | `dc387caed1671762688b80bd518c8325df336bac3b2d1547d7f3edbec0480a0d` |
| `docs/verification/t1412/resumed-validation/full-results.json` | `594f502948b7610e5f74be0d6b5571f8632f313244e904688ac498a534323fd2` |
| `docs/verification/t1412/resumed-validation/original-gates-summary.json` | `8f76a8de02ac7da86f16da99b6d725e1721a42e9bb6cb95c62943973573c9318` |
| `docs/verification/t1412/resumed-validation/owned-pg-stop-summary.json` | `18ce3bdfeb87003f36b3c1c62603751a0082202fa08cf133d9dd71e74e6838a8` |
| `docs/verification/t1416/candidate.json` | `7becc891451428919a3f3cb1b5ccc12002ec2c00d23a4c9f1422608b53173aab` |
| `docs/verification/t1416/candidate-after.json` | `d1124c9ec0dfae3a715b23d5e5faa7f87ec31ff120d4aab04cef815319d308df` |
| `docs/verification/t1416/led054-green.receipt.json` | `8efd3fbbbc21b9923a6b445b550d264d10f62757fb09186d9d8056bd17ba3b32` |
| `docs/verification/t1416/led054-green.log` | `6d27ba3981246d1f3cfd1db4253d744aec63fa0b7557fad660cf856800cd9680` |
| `docs/verification/t1416/frontend-typecheck.receipt.json` | `4be7d78ec3d4f201970c1bde0612e66cf69ccd6cdc32112b3c10501698e6e308` |
| `docs/verification/t1416/frontend-typecheck.log` | `d826348d168cab8d14df784a67a699e28372dec0ba81f2e06c79920afed8bdff` |
| `docs/verification/t1416/owned-pg-stop.json` | `929cd556d2fb14e0f03f86730c63e38c369109ca4f31d92fc616a09577761fc4` |
| `docs/verification/t1416/implementation-review.md` | `f1a23f8045d8a8600dc7b78a8ad69a0eb0018e950409822f00462c980cb9cf27` |
