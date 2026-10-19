# T-1254：两个真实浏览器用例的完整工具候选

当前是**源码候选**。没有执行私有复制、运行副本 types/list、PG、Next、Playwright 或 App。两个用例源码保持 `b16d722f…`，原 170 与新 111 的用例分母、first100 冻结 types、全部历史失败均保留。

这套工具最终从一个入口准备独立副本，然后按用户可操作的流程载入 Doocs、改一段正文、通过宿主上传图片、保存、刷新读回。两种视口各留三张真实截图、完整 trace 和公开回执；截图仍需人看结果。创建账号组和项目使用真实公开 dispatch，文章创建、编辑、插图和保存使用页面控件，不给业务返回值打桩。图片下载 SHA 与上传的真实 PNG 对比，原生加载资源和对应源码与新交付完整 SHA 对比。

```mermaid
flowchart LR
  A[新源码、11 Worker、DMG、动态库封存] --> B[独立评审与 ROOT 精确准入]
  B --> C[单入口：私有复制、types、list 两项]
  C --> D[独立 PG 与 Next]
  D --> E[两个浏览器流程与截图]
  E --> F[只读对账、两次归属清理、完整输入复核]
  F --> G[人看截图把关；App 仍未验收]
```

## 最终实际输入

`PENDING_INPUTS.json` 逐项记录缺失的实际输入。`driver/manifest.json` 目前不存在，不能填一个假 commit、假成功打包回执或旧 DMG 使工具开跑。`seal.cjs` 仅在最终实际输入完整后执行只读封存，不启动服务。随后必须对**新的完整 manifest 和工具 bytes**做 peer 与 ROOT 精确复核，再以新 24 位十六进制 nonce 执行 `complete-run.cjs` 一次。

封存包含冻结产品 Git 清单、原 253 源文件、完整 installed 文件与符号链接、完整 Chrome 实现、PG 工具、11 Worker、DMG 与实际打包回执、原 170/新 111 manifest、两个用例和全工具。installed 清单只忽略位于 `node_modules` 直接子目录的 `.vite`、`.vite-temp`、`.cache`，不会跳过包内部同名目录。前后复核既查 bytes，也查实际文件清单新增或删除。

动态库清单复用 builder 的真实 `LC_LOAD_DYLIB`/`LC_RPATH` 递归产物。消费者查 regular bytes/size/mode/uid/realpath、link/target、每条 `@rpath` 第一存在路径，明确保留系统 dyldcache host 边界。新版 schema 暂读 SHA `3bc9de0d…`；它已列出的 58 个根才有覆盖。最终浏览器所用 Node、Chrome、PG 和当前 installed Mach-O 根必须全列入新的实际清单，缺一则静态封存拒绝。不能把旧 Node entry SHA 或旧执行结果回签成完整动态闭包。

## 单入口和执行预算

`complete-run.cjs` 在入口第一行建立一次 monotonic 截止，覆盖准备、launch、两段父进程组关闭余量和最终输入复核。环境使用白名单，保留原 HOME/CODEX_HOME 值，去掉代理、密钥、NODE_OPTIONS 和 DYLD 覆盖；Git 子进程禁用全局/系统配置和 LFS smudge。Doocs 无生成需求，不读取或复制摘要中来源/使用未确认的 Codex auth seed，使用 fresh ownedDB 的现有 ensureLocalUser。

准备预算 3,600,000 ms。launch 每个 body 保留原 72,000,000 ms，每个独立 fixture/hook、worker/project cleanup、PG/Next 启动、readonly、两次 cleanup 和前后输入核验分别留足原完整槽，总预算 **374,580,000 ms**。单入口还覆盖两次 helper 生命周期各 2,160,000 ms、前后输入核验 1,800,000 ms 和 600,000 ms 余量，合计 **384,900,000 ms**。预算很长是保留原上限，不是预计时长；每阶段进入前必须有当前阶段和后续全部槽的剩余预算。timer 每段最多 60,000 ms，无任务期限续期、无失败重派、无 retries。

每次运行生成真正 `/private/tmp/t1254-browser-supervisor-<nonce>` 与 `/private/tmp/t1254-browser-evidence-<nonce>` 两个 0700 根；日志不放 `.codex` 工作树。Postgres 的短 Unix socket 在 `/private/tmp/t1254d-<nonce>`。独立 Git 副本在系统临时目录，私有 node_modules 完整复制并重接本副本的 workspace links，不运行 install/build。副本 types 只检查实际复制的 driver，不签全局 frontend types。

PG 在 Client 构造前核 nonce、UID、PID/birth/parent、pidfile、role、loopback URL、data root 和 executable；readonly 查询只有独立 PG 的真实 execution_calls，不写业务数据，也不冒充服务端网络 spy。所有关闭收据等 child close 和日志关闭；信号只给已证明归属与出生的进程。最后两次独立扫描和输入复核完成才可签整次 complete，首次失败或中断留 raw。私有根保留，之后再按完整清单归档。

## 当前只读/纯 guard 检查

`checks` 中记录 Node 语法、两个源码文件的正确 TypeScript 语义检查、31 个 PG 前置拒绝、预算门和动态搜索优先级文件协议 fixture。它们均没有启动 PG/Next/浏览器、运行 SQL 或生成内容。它们不是运行副本 types、真实 list 两项或 body 两项 PASS；这些均 pending。

用户已明确暂不授权原生 App 自动化，因此本工具和浏览器结果都不会签 App、Windows、官方生成模型或平台发布。
