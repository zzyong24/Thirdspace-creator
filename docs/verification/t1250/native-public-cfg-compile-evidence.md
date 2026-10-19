# 新cfg私有Rust编译实测

新源由ef4/c752工具实际编译，main原锁708包→私有417包（仅测试root例外），name/version/source/checksum差异0。新binary实列12，完整browser过滤实际11PASS、0FAIL、1原ignored，31.97秒；退出与stdio/log关闭均真实0。328输入和工具/Node/parser/manifest/锁前后无漂移，自有进程清理确认。

新二进制：`/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1250/native-runs/f447c542219d6eba13e19ca3/target/debug/deps/creatoros_workbench_test-4492fe5165c214f3`，SHA `b88eec4446f78c6bc3b2e94b936b1a91651b28dae4352eece12aaa135b06295d`。新ready→done env预算已编译进该二进制；原external fixture仍ignored，未签公共Node、Windows、主App或官方模型。原e71d与IPC standalone历史回执保留。逐回执SHA见同名JSON。
