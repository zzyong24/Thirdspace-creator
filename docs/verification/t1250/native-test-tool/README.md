# T1250 Mac 纯 Rust 首次 RED 工具候选

当前未运行，仅 `node --check` exit0；必须由 root 独立审精确 launcher/input-binding SHA 后才能执行。

- 原三个 Rust 文件已在 `../native-red/original/` 逐字归档及 `original-binding.json` 记录。
- 当前仅 ipc.rs 增加两个原 cfg 测试，未改任何生产代码：真实 authorized socket 等31秒再发送；真实 owned桥接等待不完整帧时取消/Drop，120秒有限观察并检查2秒取消响应（2秒不是正执行上限）。预期原10秒分别切断合法帧和推迟取消，真实RED尚待执行，不补历史。
- 精确输入12份原 workbench `.rs/.toml/.lock`，编译精简无Tauri Cargo包、默认browser feature关闭；只 `--lib`、执行 `ipc::tests::t1250_` exact2，不执行原ignored/model/browser/PG/App。
- 把原输入逐字复制到本轮自有源码/target；`--locked --offline`，全target独立，不读写共享build；保原HOME/CODEX_HOME，不复制auth，只TMPDIR指向本轮短私有`/tmp/c1250-*`以守Mac socket路径上限。
- build1800秒、实际--list120秒、串行tests1800秒、cleanup1800秒、来源核验240秒/report120秒/余量300秒，outer6180秒单调60秒分段。正观察120秒以上，31秒只是测试实际延迟，100ms只是让accept先发生的间隔。
- 实际cargo生成唯一自有test executable，真实--list精确2，Node/cargo/input SHA前后核；stdout/stderr close及logclose后读/封存。每次登记后代先核其现场父进程 birth/UID 与原记录一致，直接spawn先核本wrapper原birth/UID；所有signals只该已证实后代＋每次PID birth/UID核，未知PID/清理未证实保失败。中断/outer超限禁止启动下一phase，本轮自有Node在无法确认清理时保UNKNOWN回执并nonzero结束，不冒称物理清理成功。

独立准入后命令需要同时提供真实 reviewed launcher SHA 和真实 input-binding SHA，以及 `CREATOROS_T1250_NATIVE_TOOL_REVIEWED=1`，再执行 `node <绝对launch.cjs> red`。结果保存新 `../native-runs/<nonce>/`，不覆盖任何历史回执。

这是纯协议 RED 工具，不是完整公开 backend→Node→Rust→receipt AC 验收。Windows未编译未执行，浏览器实际链另需独立工具/依赖closure和root准入；后续green输入与scope必须重新绑定评审，不能用本red binding运行改后的生产字节。

本次修订保留未执行旧版 `reviews/f406-unexecuted-launch.cjs`。outer从run入口计时，来源核验/复制前后记录耗时并检查240秒准备槽；同步文件IO本身不声称可被JS计时器抢占，返回后超限拒绝进入下一阶段。每阶段启动前必须剩余足够覆盖全部后续串行阶段与完整清理/报告槽。实际纯Node归属反例另保留，不代签Rust RED。
