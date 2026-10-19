# T1246 WF005 独立启动诊断

实际发生：仅启动 frozen533 worker-entry 的独立探针，沿原 intelligence-worker-bundle.test.ts esbuild 参数和 Pi 初始化 plugin；没有改源/test/build/assert或ai-worker/dist，没有发送run/task、无供应商调用。原三用例首轮FAIL仍保留，本次不是其重跑/PASS。

安全准入核：worker-entry.ts 静态导入后只 createExecutionWorker、装 process message/disconnect/SIGTERM handler、worker.ready；实际业务生成/资源启动要 receive(run)才可达。无run时不调用宿主端口、凭据、预算、CLI或模型。编译output仅新 /tmp owned目录，原entry/plugin/test字节核等 git show533；fork有IPC，stdio与原测试一致且新增捕获stdout/stderr，预加载阻止fetch。清CREATOROS/GROWTH/TAURI/PG/供应商/secret env，使用独立app/db/media/workbench/auth/TMP；不改HOME、不开App、无SQL。观察预算120000ms，独立cleanup总边界240000ms，真实earlyexit可立即结束，无需假等待满两分钟。

证据：/tmp/t1246-wf005-owned-8PI5Tb/result.json、stderr.txt、stdout.txt、provenance.json 和execution.cjs；脚本 /tmp/t1246-wf005-startup-probe.mjs。真实child 4586 在 447ms exitCode1/signal null，messages=[]、taskMessagesSent=0；fetch-denied事件也没有出现。raw reason字段pending因原诊断脚本仅在超时/ready写分类，本次正确事实是ready前顶层退出。child close后才清理7个空runtime目录，bundle与原始证据保留。

真实stderr：TypeError [ERR_INVALID_ARG_VALUE] filename必须URL或绝对路径，Received undefined，createRequire位于 execution.cjs:113208。其上下文明确是 pnpm/@openclaw+fs-safe@0.21.3/.../dist/native.js：esbuild把ESM import.meta替换为 var import_meta3={}，随后顶层 createRequire(import_meta3.url)。这在发送ready之前执行，与任何Pi apiFormat、模型配置/网络/任务请求无关。

对照生产：原测试external清单只有mammoth/pdf-parse/@playwright/test/jsdom/readability/xenova；正式 ai-worker/scripts/build.mjs:9 还明确 external @openclaw/fs-safe。vendor/acpx/acp/client.ts:37与filesystem.ts:8/9真实导入fs-safe，把它内联导致该native.js CJS顶层错误。原首轮ai-worker-exit.json runtime=/opt/homebrew/Cellar/node/25.9.0_2/bin/node，探针 stderr Node.js v25.9.0，一致。因此原3 execution用例共用该启动bundle，之前“漏external”疑点现有真实startup复现+精准源码因果，归因为测试私有打包参数漂移；不能据此代签正式bundle成功，正式包消费者另需原完整回归。

bundle SHA256 17bafc60bc4eac196d9a107c0abfd86bd6b90acccc285948ca04cf4b4ccb9428。原entry SHA 690d682345d335ad281c0aa67190ef80c9c0513d6fc08f135a54fc0ea3499552，原plugin SHA 380de992e3e9a483fabdda8f6a17413ea7ad84e35c85a513f8a8afce21fdea3c。本探针root为integration而原首轮unit独立树，原文件候选533一致，依赖fs-safe0.21.3/Node版本一致；未假称字节完全相同路径的原bundle（生成注释路径不同）。

集中修最小写集仍 intelligence-worker-bundle.test.ts：同步已有正式external边界，不重写fs-safe/import.meta或生产源码；保stderr/exitCode/signal诊断；同时修真实私有10s观察timer与probe8sdeadline最低120s、独立外层完整串行/cleanup覆盖。保原3 execution+3 intelligence+probe病例、端口白名单、真实预留ACK、禁止startCall费用、原unknown结算断言。当前7项未重跑，后续原完整文件实际执行才闭包。
