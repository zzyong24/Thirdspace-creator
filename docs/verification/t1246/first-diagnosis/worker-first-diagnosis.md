# T-1246 Worker 首轮独立归因（只读）

候选：533224f334c43cdb81a344424e420cad93784dd1。读取 integration 的 unit-first/ai-worker-failures.json、ai-worker.json、ai-worker.log 与相应冻结源码/SPEC；未编辑实现、断言或重新执行测试。独立 Agent 模型：unknown/inherited，工具未提供可确认型号。

真实首轮：159 文件，151 PASS / 8 FAIL；1462 用例，1437 PASS / 25 FAIL / 0 skip。下表是原因诊断，不是通过验收。完整原用例标题、堆栈及稳定 case ID 见 /tmp/t1246-worker-first-cases.json。

| 问题 | 首轮族/数量 | 归因与证据 | 集中修复最小写集/约束 |
|---|---|---|---|
| WF001 | ACP notification 1 | 已确认 fixture 缺合法宿主 ACK。acpx-notification-drain.test.ts:39–44 的 call 白名单没有 bindCodexCall；codex-acp-worker-run.ts:82 后在 prompt 前真实调用 bindCodexCall，落入 Unexpected isolated port，最终被 :107 安全错误映射为 CODEX_ACP_HOST_FAILED。4096 通知断言尚未执行，不能据此说通知丢失。 | acpx-notification-drain.test.ts：补原 call/thread 的真实形状 ACK，并断言对应 bind；保留真实 upstream stdio、4096 尾队列及一次结算断言。不得删生产账本绑定。 |
| WF002 | chat research 1 | 已确认 fixture 引擎漂移。真实 Chromium 启动且解析，失败是 settle observation 收到 results:[]。chat-research-browser.integration.test.ts:25 仅 Bing 页面给结果，其余全部空 HTML；browser-search-fallback.ts:51 明确百度→DuckDuckGo，两次成功空页便诚实返回 []。当前 fixture 根本未给合法备用引擎结果。 | chat-research-browser.integration.test.ts：与实际两引擎 URL/HTML 解析器一致的固定传输；保留真实 Chromium、原查询、空首路切换、宿主结算与关闭断言。不改生产 fallback 为满足旧 Bing fixture。 |
| WF003a | Pi HTTP 429/503 6 | 已确认旧账本预期。test:61 期望 rejected，实际 superseded；此前 outcome=retry_wait、retryAfterMs=2000、单 HTTP 请求断言已过。T1022 非阻断恢复 SPEC:39 明确纯模型候选中断 superseded，原预留预算仍占用、重试需原 ID；T1080 SPEC:51 已精确确认这两个旧断言冲突的测试兼容。401 的 rejected 语义保留。 | durable-pi-http.integration.test.ts：仅匹配实际 superseded 合同；保留可信响应事实、401、费用、请求数、取消、原调用 ID/预算和 retry 来源。 |
| WF003b | Pi truncated/disconnect/普通异常 9 | 已确认旧 unknown 预期与当前纯 Pi 模型恢复合同冲突；不是 T1238 新 Codex unknown 许可。test:71/80 实际 retry_wait + MODEL_STREAM_INTERRUPTED。durable-pi-stream.ts:129/136 在 provider error 或缺最终完整 message 时不发布 done，进入 superseded；普通异常仍不能伪造可信 HTTP 429。真实来源 git cb2422cf134eb705960ed432f7527a8f8202fe7d 已逐行引入 retry_wait/superseded，与 T1022:11、33、39 普通候选临时错误/格式恢复一致。T1080 当轮只批准 2 个拒绝断言、未覆盖此 9 个，本轮必须单独保留差异和再验证，不能援引其旧 PASS。 | 同 durable-pi-http.integration.test.ts：显式断言纯 Pi 候选 retry_wait、superseded、无 done、单请求、原预算与重试来源；伪 status 异常须仍无可信 response、无伪 retry-after。确认性结算 ACK 丢失/用量未知/用户取消仍 unknown，不改 Codex unknown read-only 或工具/素材副作用。当前失败位于 outcome 第一断言，其后断言没有完成，尚非闭包 PASS。 |
| WF004 | generation replay 1 | 已确认 fixture 未耗尽合法格式修复。test 最后案例给单个 settled {wrong:true}，期望 failed；实际 next-request consumed:1。structured-node.ts:347 默认 formatRepairLimit=2，:421 起合法已确认坏输出推导修复 prompt；generation-replay.ts:69 只有无 next 且所有 receipt 已消费才 capture failed。本次 next-request 不实际发网络请求；T1022:11/22 要求格式不完整原循环修复。 | generation-replay.test.ts：证明原已结算坏输出按原策略耗尽修复后可失败；中间 next-request/严格摘要、未知、篡改、冗余 receipt 拒绝都保留。不得把恢复节点改成立即 hard-fail。 |
| WF005 | CJS execution bundle 3 | **未确认根因；明确诊断缺口。** intelligence-worker-bundle.test.ts:29 把提前 exit 转成通用错误，stderr 虽 pipe 却不消费/归档。3 execution 子进程都约 411ms 退出，intelligence 3 项与 probe 项过；没有 exitCode/signal/stderr 不能称环境失败或产品 PASS。已确认该测试 esbuild external 白名单漏官方 build.mjs:9 的 @openclaw/fs-safe，execution→Codex ACP→vendor acpx/acp/client.ts:37、filesystem.ts:8/9 确实导入该依赖，是可反驳的打包漂移疑点；不能以疑点代替真实异常。 | intelligence-worker-bundle.test.ts 首先保留子进程 stderr + exitCode/signal 与准确 bundle 路径，使用正式构建 external 合同且保持真实 CJS、禁止收费调用、完整预留 ACK 断言。若官方包也失败，再依据真实 stderr 扩到唯一生产来源；目前不批准改官方产品代码、屏蔽提前退出或删除 execution 用例。 |
| WF006 | raw research tools 2 | 已确认 fixture 对默认引擎声明矛盾。research-worker-tools.test.ts:154/165 传 baseUrl:null，却 fake page.url=Bing 且期望 goto=Bing。browser adapter 真实默认 DuckDuckGo HTML，assertSearchQueryIdentity 按实际 requested/final 引擎拒绝，堆栈该校验可重现。校验保证查询/引擎归属，不应绕过。 | research-worker-tools.test.ts：明确指定 Bing baseUrl 时使用原 Bing fixture，或默认 DuckDuckGo 对应 finalURL/HTML；保留单次 raw 访问、空返回不切引擎、导航错误与不触发宿主结算。 |
| WF007 | director method 1 | 已确认旧 prompt facet 漂移而非真实目标丢失。director-methods.test.ts 仅传 topicCandidate；v3 intelligence-topic-adapted-draft.ts:22 消费 confirmedContext。真实 intelligence-generation-worker.ts:96 把已确认完整 topic（含 contentRole 和 contentRoleReason）连同拆解/策略写入 confirmedContext；rewrite_only 分支 :69 则按 T1229 合同不强制该选题卡。原 director 方法系统规则断言仍过。 | director-methods.test.ts：给对应 strategy_backed 真实 facet，验证 role/reason 保留；可绑定真实 producer 防再次漂移。保留 rewrite_only 合法正文路径及 T944 已确认选题优先语义。不恢复强制分析门。 |
| WF008 | Whisper worker reuse 1（180s） | 已确认测试替身循环等待，不是实际 Whisper 耗时/外网。FakeWorker.terminate 返回永不自动 resolve 的 stopped.promise（test:9）；:141 emit(error) 后 :142 立即 await second，只有 await 后 :146 才 emit(exit)，从不 resolve stopped。生产 :695 正确先等待 stopWorker 的 terminate/退出屏障，再拒绝 pending，防止旧 owner 未退出即重建；相邻 terminate throw/reject 两项实际通过。 | multimodal-whisper-local-cancel.test.ts：在验证不会提前重建后明确给 owned FakeWorker terminate ACK（stopped.resolve）再 await second，保留迟到旧 exit 不污染新 owner、推理错误复用、崩溃重建断言。不得取消退出屏障或增大 180s 掩盖 fixture 死锁。 |

案例映射：WF001=T1246-WF-01；WF002=02；WF003=03–17（三 provider × 5）；其余 18–25 的确切顺序以 case JSON 为准。

结论：22 个失败有源码/合同支持的 fixture 或断言漂移原因，3 个 bundle 失败原因未确定，当前没有足够证据签“已确认产品回归”或“纯环境失败”。这不等于产品无回归或测试可略过：八文件全部仍是真实首轮 FAIL，集中修复后需原范围重新实际跑，bundle 必须补真实异常。未执行的下游断言不得写 PASS。

本次未连接 PG、未启动 App/原生授权、未访问供应商；报告及 case JSON 仅写 /tmp，冻结产品、integration 文档与 BACKLOG 未修改。

集中写集汇总（首轮全部结束后方可执行）：

1. ai-worker/src/execution/acpx-notification-drain.test.ts（1 项，新增 bindCodexCall 原 call/thread ACK 与绑定断言）。
2. ai-worker/src/execution/chat-research-browser.integration.test.ts（1 项，真实备用 DuckDuckGo 固定 HTML/URL，原观察和真实 Chromium 保留）。
3. ai-worker/src/execution/durable-pi-http.integration.test.ts（15 项，纯 Pi superseded/retry_wait 合同，可信/伪HTTP区分、不发布 done、次数/费用/原 ID/取消/ACK 约束保留）。
4. ai-worker/src/execution/generation-replay.test.ts（1 项，已确认坏输出沿原修复预算回放至真正耗尽，不禁用格式恢复）。
5. ai-worker/src/execution/research-worker-tools.test.ts（2 项，raw 指定引擎与 fixture final URL/HTML 一致，不弱化生产身份校验）。
6. ai-worker/src/prompt/director-methods.test.ts（1 项，真实 confirmedContext facet，选题 role/reason 保留）。
7. ai-worker/src/runtime/multimodal-whisper-local-cancel.test.ts（1 项，owned terminate ACK/退出屏障可达且旧 exit 归属断言仍在）。

上述共 22 项，最小集中写集为这 7 个测试文件，不需要预先放宽产品代码。

3 个未知 bundle 案例最小诊断：仅 intelligence-worker-bundle.test.ts 先将现有 stderr pipe 接入限长失败日志，保存 exitCode/signal、source kind、bundle 路径及正式/fixture external 清单；沿同原真实 CJS child 和禁止 startCall 继续验证。优先解释真实异常再决定与 official build 的 external 同步；不因静态可疑遗漏直接宣布根因，不能按 fixture 修完则忽略官方包执行消费者。若下一实际 stderr 指向生产构建导入错误，新增精确源码写集与 T1246 缺陷记录再集中修，不签未知 runtime。

WF005 追加执行预算缺口（独立静态复核，仍未重跑）：intelligence-worker-bundle.test.ts 有两处私有 setTimeout(...,10000)，probe 消息 deadlineAt=Date.now()+8000。CLI test/hook/teardown=180000 不能覆盖这些内部正执行期限；即使 bundle stderr 修复，也不能签该文件预算合规。集中修时仅该测试真实消费者把正执行/连接观察预算提升到至少120000，独立 test 外层覆盖 Worker startup/串行IPC/等待/kill cleanup，保更长预算及原 runtime cases、端口白名单、fixture fetch阻止真实网络、禁止startCall收费与原unknown结算断言。不能只增Vitest CLI上限、删除timer/断言或重写首红；不改持久任务预算，也不能据当前约411ms exit认定其根因为10s timer。

WF005 后续授权诊断更新：独立 startup-only probe 真实447ms exit1、ready前 createRequire(undefined)，精准 bundle 来源 @openclaw/fs-safe0.21.3/dist/native.js 的 import.meta 内联为空对象；原test漏正式external包的疑点已有真实证据，当前归为测试私有打包参数漂移。详 /tmp/t1246-wf005-startup-diagnosis.md；历史25原FAIL/最初3未知说明保留。此探针发送run/task0，不是原3用例重跑/PASS，也不签正式bundle消费者或后续预留/结算断言。当前25原因均有fixture/旧合同依据，但必须集中修后完整实际重验，不能改写首红。
