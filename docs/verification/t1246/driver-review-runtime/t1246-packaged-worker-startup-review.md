# T1246 实际包内 Worker 无任务启动探针复核

结论：允许根线程执行限定的 startup-only IPC 探针。只证明实际包内Node能够加载实际执行Worker并发ready或记录真实早退出原因；不得代签任何生成能力或应用真机验收。

实际App资源：`/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app/Contents/Resources/sidecar.tar.gz`。本次重新读取完整资源计算SHA `07b9351c8e2f2e49c6ac7c9f50560addf3b6cfb9562bae45a279d01398aa055c`；流式读取tar全部成员，对选定680成员逐个核对已展开文件实际SHA或symlink target，0不匹配，完整细表 `/tmp/t1246-packaged-worker-selected-binding.json`。

运行根为 frozen integration 的 `frontend/src-tauri/sidecar`。合法执行路径集合为：

- 随包Node：`server.app/Contents/MacOS/creatoros-server`，68416bytes，SHA `5ed0e129e708e36048981aed983f7302b0c18139f5a174e4b8d5fabbacb6d59d`，Mach-O arm64。这是Node运行时，不是CreatorOS主程序。
- 同包 `lib/` 的24个dylib，实际otool依赖及RPATH指向这些相对路径；保留树结构，不能以构建机Node或系统dylib代替。
- `frontend/runtime/` 的实际10个Worker成品，`execution-worker.cjs` SHA `9455603a4df623a302983c80226c74316cf136abe24b48b88e35d77c8ae0ff0b`。
- `frontend/node_modules/@openclaw/fs-safe` 相对symlink及其目标 `node_modules/.pnpm/@openclaw+fs-safe@0.21.3/node_modules/@openclaw/fs-safe/` 全体tar文件。实际bundle将fs-safe/errors/path/root保留为external；包里真实ESM native.js使用createRequire(import.meta.url)，不会按WF005私有错误bundle改写import.meta。

诚实边界：实际Worker staging源码列10入口，包内frontend/runtime同为10；源dist另一个browser-runtime.cjs是独立加载测试构建项，不能声称包内11文件。静态搜索产品消费者未发现browser-runtime.cjs运行入口，此差异不阻断执行Worker无任务探针。

安全闭包：冻结worker-entry导入运行函数但构造阶段仅注册IPC、shutdown及发送ready；createExecutionWorker真正execute/heartbeat/Host调用只由已校验run消息进入。不得发送run/task或reply/cancel消息。没有消息时modelFor、CLI启动、SQL/模型调用和用户数据操作无可达执行路径。SIGTERM/disconnect关闭空资源集合并退出。可用fork(entry,[],{execPath:上述随包Node,cwd:同包frontend,stdio:[ignore,pipe,pipe,ipc],env:显式净环境})；禁止加载server.js/CreatorOS主程序/CLI启动脚本，禁fetch预加载只放/tmp并绑定SHA，不替换随包Worker或依赖。

执行前清除真实CREATOROS/GROWTH/TAURI/PG/DATABASE/model/secret/probe/native/NODE_OPTIONS变量，仅显式设置owned TMP/数据/媒体/认证临时根及运行所需基本PATH/SystemRoot等。不复制凭据、不修改HOME；不调用App授权/激活/安装。IPC只接收消息不发送。观察预算至少120000ms，独立外层含启动与清理余量；ready则记录并正常disconnect/SIGTERM，早退出保真实stderr/exit/signal；ownedchild close后才能清理自有临时目录。若解析/加载指向包外祖先依赖须记录失败，不能借源码node_modules补齐然后签包PASS。

审查机制：独立子Agent只读源码、otool与tar字节对比，无执行Node/Worker/App，无网络或收费调用。模型标识unknown/inherited。
