# 本轮测试工程恢复证据

所有失败日志保留；不删除场景、跳过、增 timeout 或放宽生产 guard。

- account-isolation：原 RED 1 failed/18 passed 是旧技术英文断言；现按当前服务合同严格断言跨号 404 / OwnershipError / 工作区人话，19/19 GREEN。
- script-worker-entry：原完整 5 场景保留。T-921 已批准全节点共享两次格式修复，repairAttempts=0 的畸形分镜准确 3 次调用、两次修复含原 `{}`；保真不一致仍拒绝且已完成正文保留。等待用户的恢复走真实 execution.tasks.command resume 原任务，禁止复制已绑定任务，校验原 execution/预算/截止/已调用账本及一次 compose。5/5 GREEN，frontend-script-worker-recovery-green.log。早前并发构建的 script-startup log 被中止 exit130，不视为通过。
- startup-safety：当前浏览器公开共享池→真实 Worker profile context 两端静态合同，仍保桌面无 CLI/下载与 packaged 缺浏览器明确拒绝。11/11 GREEN，frontend-startup-contract-vitest-green.log。误用 node --test 的入口错误日志仍保，不算产品 RED。
- publication 搜索：正式手工登记真实链路原 owner 命中；其他正常创建工作区与其他操作者，经真实 pages.search.get 全部/video 窄化两次查询均空、count0。原 5 输入场景内补反例，5/5 GREEN，frontend-search-scope-green.log。

真实 Worker 工厂 14 场景的测试供应商修复按父工具声明区分父/子流式结构化响应，使用正常账号组/成员/项目来源；完整原场景仍保，fixture provider 为合成 loopback，不冒称真实外部模型。精确 RED 为 4失败/10通过；两个生产组遗漏修复后 12通过/2失败，剩余素材采纳装配仍是未通过，见 GROUP_GENERATION_REPAIR_PROPOSAL.md。不能称整个全量或正式安装版已验收。

## 最后全量两项失败的真实修复

`frontend-engineering-final-full.log` 完整运行 exit1：414文件2失败/411通过/1跳过；3612项2失败/3608通过/1跳过/1todo，474.16秒。使用仓库原20000ms及各测试原显式预算、maxWorkers2、retry0；没有超时覆盖。此失败绑定源码3a551fb58c369f310dd13fde97cc246efbb90a8e，运行开始HEAD4491de43但已有该提交全部源码，运行中未改源码。

聊天读取原5场景中完整装配失败，真实报“原任务缺少生成节点 Skill”。测试漏了现prepare-chat-reply的已批准Skill集合、worker/atomic冻结选项及composeChatProduction完整工具端口。仅test修复：复用requiredSkillIdsForTask并保所有生成Skill/完整白名单；注入真实runtime宿主端口，factory捕获实际composition的webRead服务并原样调用原factory（不空stub）；供应商按工具定义区分父/子SSE，不再把stream当父身份。保4实际HTTP请求=3父1子、账号隔离、完整工具、2消息/候选、6实际settled调用。逐步失败日志frontend-final-two-fixtures-green.log、frontend-chat-read-host-complete-green.log、frontend-chat-read-host-production-options-green.log仍准确FAIL；最终frontend-chat-read-host-real-ports-green.log 5/5 exit0。

桌面原4场景中复制入口测试失败并非缺依赖，而是构建后用共享ai-worker/dist与staged bytes做deepEqual；另一并行真实构建的cwd不同改变bundle路径注释，1134164与1134830字节不等。test-only以临时source-repo复制真实src/scripts/package.json，依赖指向现真实node_modules，执行原生产builder仅写隔离dist，再保完整bytes deepEqual；从隔离资源解析声明依赖、原返回路径、包外cwd、真实fork及model.generate/model.structured ready能力均保持，原10000/15000ms预算不动。frontend-final-two-fixtures-green.log桌面4/4通过，聊天当次仍1失败，不能把联合日志整体称GREEN。未改生产stage helper、guards或原四场景。

三生产组修复3a551fb5独立实现复核已完成，报告位于Growth completion/creator-group-generation-implementation-review.md，精确三文件未发现新增具体guard blocker。其14/82/15/1证据不替代整套或正式安装版。最终全套仍须重跑，母提案未批准未实现。

最终重跑frontend-final-repaired-full.log exit0：414files413通过/1跳过，3612tests3610通过/1跳过/1todo，581.41秒。源码6dd9db7a冻结、maxWorkers2/retry0、无timeoutoverride。skip/todo不算通过；真实安装/双机/母新增行为仍未验。

## 已授权的后台四文件测试工程写集

原 backend-control-lessons-real.log exit1：26文件4失败/22通过，747项7失败/740通过，91.99秒；源码6dd9db7a，maxWorkers2/retry0，无timeout覆盖。保留全部原场景和失败日志。

1. backend/src/application/collection/cover-file-repair.test.ts：原1失败/1通过；T1022 §60/63/70 的父项目、产物与工作区锁要求下，旧fixture引用不存在的output。通过正常组/账号/Projects公开创建真实父对象，原文件删除、补采、版本和好封面回读均保。
2. backend/src/application/queries/dashboard-read-performance.test.ts：原3失败/1通过；当前AnalyticsRollupDTO的finishAvg是number|null，mock漏字段产生undefined。补真实null，保共享读取、跨号隔离、慢摘要、失败恢复与计量断言。
3. backend/src/modules/ai-runtime/chat-tools.test.ts：原2失败/221通过；当前已批准Redfox严格action union不允许混入其它动作字段。保全部工具/两种改稿变体，补六合法动作及混字段、非法值拒绝；不改production parser/guard。
4. backend/src/modules/intelligence/transcript-runner.test.ts：原1失败/2通过；T632持续恢复与当前bounded RecoveryWakeCoordinator装配一致。真实coordinator按maxTasks4/concurrency2多波处理25原任务，校验单lane不重叠、原IDs全部完成、stop后零新调用；保原其它两场景与原时间预算。

父已精确授权仅上述test文件及证据，不改production maxTasks/concurrency/strict guard，不删测试、不增timeout。

首轮4files为2失败/230通过：仪表盘4/4、工具223/223通过，封面与队列原5s超时。随后单worker诊断的所有4个DB场景仍5s超时，backend-four-fixture-budget-diagnostic.log保。按仓库既有beforeEach/afterEach fixture模式，每例真实createDb全部迁移初始化与关闭独立执行，原业务测试5s预算、hook默认预算均不改；不把迁移失败排除，hook失败仍算整例未通过。修正测试driver把maxTasks4/concurrency2/control传入drain真实第二options参数，保原第一轮失败不冒GREEN。

最终 backend-four-fixture-real-ports.log exit0：4files/232tests全部通过，16.48秒，maxWorkers2/retry0，无timeoutoverride。封面补入production同源resolveOutputOwner、真实membership锁、assertTargetAccount、assertCoverOwned后正常恢复；中间缺端口两份FAIL完整保。队列25原IDs全部succeeded、queued0、每波maxTasks4/concurrency2、单lane最大1、真实ASR最大2及stop后wake/run零新增均通过。实际4文件SHA256绑定backend-four-fixture-result.json。后台全tsc当前仍FAIL：初轮17项含本轮5项已修；其它测试旧接口须独立同基线核查，未声称后台类型全部通过。

原控制门完整聚焦集合重跑 backend-control-lessons-repaired.log exit0：26files/747tests全部通过，109.14秒，maxWorkers2/retry0，无timeoutoverride。精确四项工程源码提交8b8d6d1eaa3a965da67d61a0513dfcba2f3e0c29；执行开始HEAD6dd9db7a但全四文件SHA256已绑定最终提交内容，运行期间未再编辑测试。此结果不等于LED052真实PG或全部后台tsc已通过。

## 已授权的后台类型检查五个旧测试与本轮 fixture 恢复边界

6b1322af隔离树与8b8d6d1e候选真实tsc --noEmit均exit2，原12诊断逐字相等，backend-typecheck-baseline.log、backend-typecheck-candidate.log和comparison.json绑定。主控明确要求继续闭环，不因基线相等放行。精确test-only写集：

- backend/src/modules/ai-runtime/asset-business-execution.service.test.ts：TS2345 recoverQueued旧两callback装配。当前公开recoverQueued(onFailure,shouldStop:()=>boolean)与stop AbortController；保迟到配置不建新任务/不进入失败补偿。另需原legacy场景映射当前已批准旧素材只读恢复账本：身份核验配置读取可发生，禁止新的付费提交；不补旧legacy返回生产API。
- backend/src/modules/ai-runtime/chat-assembly.test.ts：2个TS2353旧captureScreenshotPort/readWebUrlPort。当前prepareChatAssembly只准备冻结定义，动作经持久工具Host/Worker；测试保截图和网页实际signal与取消反例，沿当前公开装配执行，不把浏览器重塞准备器。
- backend/src/modules/ai-runtime/signal-quality.test.ts：TS2307已退役topic-task-adapter。保原来源去重+搜索有命中一路/空0的两个业务计数断言，直接测试当前topic Worker流水线真实计数，不在test复制算法当生产。
- backend/src/modules/ai-runtime/transcribe-runner.test.ts：TS2305两个已退役runTranscribe/TranscribeRunnerDeps导入与5个TS7006/7019。R-05与母现既有2026-09-07消融/接线记录明确整批转写循环迁Worker；保原成功、单作品失败、幂等、图集、重试、冷却、后处理与未知/取消全部业务输入族和原预算，按公开Worker与真实宿主回执装配；发现实际行为不符先报告，不造旧生产shim或复制旧循环。
- backend/src/modules/execution/asset-worker-runtime.integration.test.ts：TS2339 Preparation.legacy。当前准备返回真实aiTaskId/executionTaskId，保新任务经真实Worker重试、公开采纳、同任务只1素材与秘密不入库；用真实映射/冻结payload/原ID/无legacyRecovery事实验证，而非无意义删除断言。
- backend/src/modules/ai/chat-route-durable.test-fixture.ts：初轮本轮TS18048 execution可能不存在已修为真实缺执行拒绝（此新helper不在基线12中）；原route实际60/60通过，frontend-chat-fixture-existence-green.log 20.41秒。此文件仍按既有精确fixture写集，不改route产品行为。

计数纠正：原基线12错误实际分布5个旧test文件；本轮自有durable fixture另行准确记，合计6条路径，不把它说成第6个基线旧文件。所有修改不使用any/as unknown、skip或timeout放宽，不补已删除生产API、不实现尚待正式母审R03a/R05a。


## 后台旧公开契约装配恢复（类型 RED 保留）

原 `backend-five-current-contract-red.log` 保 58 失败/79 通过和 signal 导入失败，170 个输入库存未删。signal 的 31 纯函数与 2 原趋势计数现执行真实 topic Worker、严格冻结快照、真实 renderer，公开 sourceId 解析必须来自原冻结输入；asset-business 7 保旧提交事实、归属、停机与 0 新模型调用，asset-worker 10 保真实独立 Worker。三个文件实际联合 50/50、33.44 秒、exit0，日志 `backend-three-public-ports-green.log`。中间 strict snapshot/退役端口配置失败都保留，不用日志文件名判断 PASS。

聊天原 90 场景保：同账号合法 RequestContext 替代错误 account-a；截图迁真实 submit/claim/宿主reader/ingestion，web.read 迁真实 Worker 已开始读取后同 signal 取消与公开原任务 cancel/ACK/get，前置取消零端口调用。依据旧母 R-02 已批准取消/admission/原任务回读，不引用新 draft。截图原成功卡片/error=null 和信号透传保；web原SDK信封位置已退役，用户停止事实现在以原公开任务 cancelled 回读，Worker AbortError不裸当业务成功。完整聊天与 signal 联合实际 123 场景，101 通过/22 失败（5.47 秒、exit1），未跳过其它原场景；`-t T-239c` 的 2pass/88未选仅辅助定位。

精确转写 30 场景与聊天原 25 FAIL 映射见 `BACKEND_CURRENT_CONTRACT_MAPPING.md` 和 `backend-chat-original-failure-mapping.json`。业务终态/错误分类缺批准依据仍为 RED，不能把 draft R05a 当许可。后台 tsc 正在重查，当前剩余退役整批转写测试类型错误；不新增旧 production API 或 testshim旧循环，不 cast any/as unknown，暂不能称后台类型通过。


五文件完整再运行 `backend-five-current-contract-unresolved.log`：3 文件通过/2 文件失败；170 场景 120 通过/50 失败（聊天22、退役整批转写28），37.58 秒，exit1。signal 33 计数现按正式 sourceId 找原冻结来源，未用错误 target.url 字段。当前本轮公开端口装配无新增类型错误；旧转写5个隐式any参数仅补准确 unknown/number/RequestContext+string+AbortSignal tuple，不改变任何执行/断言/等待预算。2 个退役导入错误继续真实待恢复，不能补 testshim 或 production 兼容壳。最小业务方案只落 `TRANSCRIBE_CURRENT_SPEC_RECOVERY_PROPOSAL.md`，未授权实现。


## 原30转写输入的真实Worker装配RED（2026-10-09）

转写退役runTranscribe/TranscribeRunnerDeps导入已完全移除。原30输入库存按现真实runTranscribeInWorker一次执行，PGlite原ai_task/execution绑定/租约、实际音频保存读回、OpenAI/Whisper adapter、reserve/start/settle账本、后处理HTTP与完整工件读回由当前生产service装配；隔离仅来源网络、媒体抽音、供应商叶与等待时钟，不复制旧循环、伪造调用账本或新production兼容壳。原取消/未知/冷却/混合终态expected未因待审R05a改变。

首轮真实装配12通过/18失败；修正测试读取GenerationFailure.errorCode后的第二轮13通过/17失败，两份日志保留。正常已settled ASR的合法后处理回执被JSONB键顺序误拒（深相等true、stringifyfalse），准确候选另见JSONB_RECEIPT_GUARD_PROPOSAL.md，未实施production修复。

完整5文件170库存重跑backend-five-real-worker-unmodified-guard-red.log：3文件通过/2文件失败，131通过/39失败（聊天22、转写17），45.09秒，exit1；源码HEAD109b2d95加该精确test未提交装配。backend-current-real-host-final-typecheck.log真实exit0，12旧类型诊断已闭环，类型通过不等于39条业务通过。所有原58FAIL、50FAIL与新真实RED保留。


完整JSONBguard已独立4b0b69b5修复（仅Node完整深相等，两源码文件+11新guard tests），RED1/11→GREEN11/11，现postprocess/preparation/audio全51通过、tsc再次0；不借母draft/改terminal。guard后原完整170复跑136通过/34失败（chat22、转写12），48.55秒exit1；当前不是整体验收PASS。原30的12剩余逐项分析追加于TRANSCRIBE_CURRENT_SPEC_RECOVERY_PROPOSAL.md，保原全部expected。


T768后续批准来源经主控独立重算核实后，仅原F7-a坏配置test-only迁为安全local一次/0在线/0lease/真实原账本与稿读回。最新完整170为137通过/33失败（chat22+转写11）、58.60秒exit1，backend-five-approved-t768-final-red.log；后台最终backend-approved-t768-final-typecheck.log exit0。旧34FAIL保作前态，未实现其余终态/冷却/generic错误候选，不声明产品全部通过。


真实最终reconcile25错误/1告警进一步诊断发现本轮test-only直接AI repository import新增1结构违规，不能归为既有。chat-assembly.test.ts只改为AI模块已有唯一公开../ai入口（public index明确export factory供组合根），不新增export或guard例外。真实两长动作2/2（88原场景本聚焦未选）与后台typecheck0；boundary8→7，剩余baseline5与未动live-chat-session SDK2准确保，scanner仍exit1，不改baseline。

主控在独立当前契约来源报告后授权原chat22精确test-only迁移，唯一代码chat-assembly.test.ts：8集合仅明确两工具、13真实冻结方法分页与native能力、guide原后续可选回执及主Skill/跨scope拒绝。原90库存实际90P，用户私有覆写>12000多页/源改动后冻结/非法offset反例保；无生产/schema/terminal/timeout变化。初87P3F及类型RED保。完整170实际159P11F（36.90秒），剩余转写11原expect不改；相关6files46为43P3F，旧自主研究JSON-only驱动与已批准明确text片段投影冲突保真实待处理。准确结果与未应用driver候选分别CHAT_CURRENT_CONTRACT_RECOVERY_RESULT.md、RESEARCH_CONTEXT_DRIVER_PROPOSAL.md。


研究观察驱动最小已授权实现：现原integration测试完整JSON严格schema与明确16000/8000首尾只读完整可见字段，18正负控制PASS；原3业务不掩盖，现后续3FAIL为原虚构账号缺legacy父组与continuous默认无限次数两项。详RESEARCH_CURRENT_FIXTURE_RECOVERY_PROPOSAL.md，待裁决先不改input/expect。T794/T902时长原实现遗漏独立最小c4e提交已完成真实原LED024整链与安全renderer、template88和tsc0；此记录不替代全局reconcile或安装双机。


主控已完整读两份当前独立只读observer/fixture报告与f1823b...准确未应用patch，授权现research integration唯一test的两处装配：公开createAccount在同tx产生真实本人平台账号/legacy组、返回id构造原account-only ctx；把原20/10/8与100000通过既有spec.params.maxSteps/maxTokens显式冻结，追加continuous预算完整相等断言。原input JSON/op digest会变化，原三个业务库存/6、5、4请求/succeeded、partial、partial/60000期限/原正文和全部反例不变；不是production或新母draft行为授权。旧未迁输入完整64在源码ebdb6e...实际61P3F/32.82秒，资源3timeout本次不复现，仅research原3组/预算差异继续FAIL；原所有失败日志保。应用前源码/patch/独立报告hash与旧完整结果绑定research-fixture-pre-application-evidence.json。
