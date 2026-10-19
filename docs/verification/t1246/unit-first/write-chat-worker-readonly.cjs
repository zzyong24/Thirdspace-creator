const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root='/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator';
const out='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const files=['backend/src/integration/chat-generation-worker.test.ts','backend/src/integration/chat-hooks-worker.test.ts','backend/src/integration/chat-work-editor-worker.test.ts','ai-worker/src/runtime/pi-provider.ts','ai-worker/src/runtime/provider-factory.ts','docs/features/t1085-chat-integration-fixture-calibration.md','ai-worker/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js'];
const binding=files.map(p=>({file:path.join(root,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),kind:p.includes('node_modules')?'locked_dependency_primary_consumer':'frozen_source'}));
fs.writeFileSync(path.join(out,'chat-worker-fixture-source-binding.json'),JSON.stringify({candidate:'533224f334c43cdb81a344424e420cad93784dd1',observedAt:new Date().toISOString(),bindings:binding},null,2)+'\n');
fs.writeFileSync(path.join(out,'CHAT_WORKER_FIXTURE_REVIEW_IN_PROGRESS.md'),`# 聊天 Worker 首轮红族的只读分诊（未修、未复验）

冻结533224f，backend整包仍运行；原log已记录chat-generation-worker 21/21 FAIL、chat-hooks-worker 13/14 FAIL、chat-work-editor-worker 2/2 FAIL。完整首次JSON/各例stack仍待EOF，以下不把源码疑点冒充实际修复或所有用例同因。绝对执行路径与SHA见chat-worker-fixture-source-binding.json。

## 已确认的消费者事实

- chat-generation-worker.test.ts:22、chat-hooks-worker.test.ts:20、chat-work-editor-worker.test.ts:26均调用真实ai-worker/scripts/build.mjs；不能套用worker其他三fixture漏external的启动原因。前两beforeAll旧30秒显式预算仍原样保留，首轮未改。
- generation:41、hooks:35的HTTP fixture仅以 !input.stream 判子节点；否则一律派到根聊天SSE（根第二轮返回“候选已准备好”）。generation:132的子请求断言也依 !stream。该布尔不是合法请求角色合同。
- 当前provider-factory.ts:406创建createPiProviderModel；pi-provider.ts:22在共同events使用models.stream，:80 doGenerate也消费这个events，:81 doStream同源。锁定Pi依赖openai-completions.js:450实际设置stream:true。因此SDK generateText/doGenerate不会使HTTP请求自动成为非流式。根/子都可stream=true。
- 已批准T1085 SPEC:38/40/42明确要求按真实工具声明/消息角色区分根/子，stream只决定JSON/SSE响应编码，原请求数/候选/账本/不重发等断言必须保留；原frontend同族曾真实子stream收到根文本。当前上述两个backend fixture尚保旧识别。
- 原本轮log:4431–4455 success真实出现topic.enrich text_compat三次format recovery/modelCalls=3，input/output=0；其余generation模式也出现同型格式红。它与错分疑点一致，但日志本身没有完整HTTP请求录制，不能仅此确认全部错误原因为错分。

## 最小待评审写集

若完整stack与真实原例复验确认，最小候选是两个原测试文件：按完整请求工具声明/消息角色识别父聊天和各授权子节点，同一分类用于response与观察；原合法子JSON内容按请求编码为合法SSE或JSON。对未知/歧义请求显式fixture诊断，不关键词猜创作意图。保全部success/cancel/401/429/失去结算ACK/崩溃恢复/未知不重发/坏输出/诊断空值、任务冻结/账本/usage/候选与请求数断言，按当前已批准恢复合同逐例核，不能机械删除总请求数或改模型最终status。无需放宽生产输出schema或增加供应商重试。

chat-work-editor-worker两例尚无因果：其Pi分支按真实轮序发读取/提议，无 !stream 子节点分支；Codex分支通过原external公共service。不得将它加入同一stream修法。完整stack后另核真实owner数据/工具调用/预算，未知最小写集留空。

~~~mermaid
flowchart LR
 A[SDK结构化子生成] --> P[Pi共用models.stream]
 P --> S[HTTP stream true]
 S --> F[旧fixture猜根聊天]
 F --> T[根正文代替子JSON]
 T --> R[格式修复红日志]
~~~

本轮未改产品、fixture或assert，未抢跑复测，未证明官方模型/平台/App链。
`);
console.log(JSON.stringify({sourceBound:binding.length,productOrTestsChanged:false,originalSuiteStillRunning:true}));
