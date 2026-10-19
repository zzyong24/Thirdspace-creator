# 最终浏览器验收外层候选

本目录只准备源码，尚未执行 metadata collector、reseal、旧 9 工具、服务或浏览器。Doocs 工具另在 `docs/verification/t1254/browser-tool`，29b3 的 53 项字节继续冻结；本候选不扩展其两个用例。

用户看到的流程：拿到同一提交的实际 Worker 与开发版安装包后，先核对源代码和运行依赖，再核对真正复制出来的私有副本，最后让原用例自己操作页面并留下截图、trace、原始结果和清理记录。任何缺失或失败保留原记录，App 仍为用户暂不授权、未验收。

```mermaid
flowchart LR
  A[真实最终提交与11个Worker/DMG] --> B[完整源码和源依赖封存]
  B --> C[原工具创建私有副本]
  C --> D[私有副本实际加载路径与字节核对]
  D --> E[原170及103/7/1用例]
  E --> F[实际截图结果/原始日志/两次复核及进程证明]
```

读取顺序：`LEGACY_INPUT_SNAPSHOT.json` → `SOURCE_DELTA_AND_BUDGET.json` → `prepare-metadata-input.cjs`、两个 Python → `common.cjs`、`owned-dyld.cjs` → `reseal.cjs` → `supervise.cjs`、`run.cjs` → `STATIC_PARSE_RESULT.json`。全部均须 peer 与 ROOT 的源码复审；源码通过不代替运行准入。

完整源码根包括 backend/contract、frontend/src/public/scripts/src-tauri、frontend 配置与 package、root package/pnpm、完整 Doocs 原生源码/交付。首轮 legacy253 是生产源库存：保原路径、首轮 SHA 和上一份封存 SHA，实际新 SHA 必须对应最终批准写集和真实提交。T1251 当前 chat-generation-worker.ts 为 de1a，110s minimum 的11907只属于 frontend/src/server/workbench-file-recovery.test.ts；两者归因由 f5d0 partial 实物复核。原 first100、原170的生成副本/媒体输入和原用例断言不刷新。

旧 9 文件不改：原5（prepare-browser-driver/prepare-runtime/launch/verify-binding/config）和 new4（prepare-runtime/launch/verify-binding/config）。最终两份旧格式 manifest 只写0700私有输出目录，需再次精确复审并由 ROOT 应用。new manifest 的 driver 自包含 manifest SHA 存在循环；仅这一 `exactSourceInventories` 组转交外置完整库存与真实 manifest SHA 校验，其余组保持。

浏览器消费者按实际已安装 Playwright1.60源码：原170/new111默认 headless=true 且无 channel/executablePath，实际使用 chromium-headless-shell1223；Doocs显式使用 fullChrome。联合根和完整实现库存包含两者、所有各自 helpers/dylibs，并分别使用各自真实主程序上下文。`PLAYWRIGHT_BROWSERS_PATH`绑定实际 registryDirectory，不能用 fullChrome 子目录的父目录代缓存根。没有改旧配置去换浏览器。

metadata 前置工具须先核批准的 Node/Git/otool bootstrap 图。头文件发现阶段只读取 Mach-O 二进制，产出的 `DISCOVERED_PAIR_INVENTORY.json` 明确不是已批准 otool 图；实际 otool阶段按发现出的全部唯一(file,arch)派生串行容量，每条保120s并另保120s启动/关闭/读后余量，最终全部语义命令/路径/首次命中须与发现库存相等。新根包含真实 fixture ffmpeg及递归库，不能借已知 Doocs131 pairs签新图。

实际 owned collector在原prepare真正closed后、旧list/launch前运行。相对 loader/rpath按私有副本实际解析，绝对load保绝对路径。protocol只允许唯一已批准的私有Codex→CJS替换：源官方SHA不变、fixture SHA、0700新inode、0600 marker/原stateRoot/controlToken严格核，去除的仅该原Mach-O入口及其主上下文；其他根与 canonical图严格一致。其余profile不替换。runtime绑定不能覆盖封存的源字段，真实driver每个字节须等于批准旧9源及 manifest。

外层长预算单出生 monotonic、每段≤60s，保原profile预算，不把 >2147483647ms直接传setTimeout。helper归属信号沿393f原语义，close/stdio/log/group与两次完整字节后验须有真实回执；没有归属证明不发送信号。原170 outer为49,181,520,000ms，新official103也超过int32。raw results逐个统计实际状态，skip/缺失/失败不计PASS。

当前剩余静态边界必须先由 ROOT 处理，不能签完整future闭合：旧9在 `nextOnly`、`ledgerOnly`、launch entry/final重新执行旧verify；其120s Git命令与完整 source/owned I/O仍进入旧420s ready admission及旧1.2M/1.8M ledger计时。外层新增预算不能修改这些内层截止。保持旧9字节不变时，候选只能把这一剩余消费边界明确登记，不能声称外层封装已修复它。最终运行需先收敛这些内层消费者，或按真实合同明确范围；本工具不设置绕过标志、不预签运行PASS。

所有真正输入仍pending：最终clean HEAD、完整 native交付/源码压缩包、实际11Worker receipt、同HEAD实际DMG及package receipt、fresh joint图/完整raw、最终合法scope审计与manifest应用。当前只执行CJS语法和Python AST；第一次Python缩进错误已保存于 `history-first-python-syntax-failure`，不伪造为runtime FAIL或删除历史。
