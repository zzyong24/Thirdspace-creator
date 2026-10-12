# T1250 真实 browser IPC 依赖编译候选

当前只准备，未启动 Cargo/浏览器 IPC 测试。精确工具及328来源需 root 独立复核后准入。

生产 Cargo.toml/Cargo.lock 原字节不动。把真实 workbench12、Git tracked vendor/nomifun314、主 Cargo.toml/lock2复制至新 nonce 自有目录；vendor无符号链接，来源及副本前后SHA核对。私有新测试 Cargo 只修改 lib 指向该实际复制的 mod.rs，并从主 Cargo 原声明投影 url、nomi3、tokio；没有替代 browser 实现或虚构 host。绑定 Python3.14 binary 与标准 tomllib 四文件，以 -I -S -B 读取实际TOML结构。生产main锁每个package完整保留，仅新私有root的direct deps取原main root完整引用（例如rand 0.8.6，不猜另两个版本），序列化后TOML再次读回结构完全相等。真实 offline cargo update --workspace 解析私有root并保原锁版本；随后每个非私有root的name/version/source/checksum必须严格属于生产main锁包集，差异实际记录且非零拒build。该新锁独立SHA不冒用生产锁；再build --locked --offline --features workbench-browser --lib --no-run。

执行 actual browser_ipc::tests 全12（原7完整保留＋partial/backpressure/cancel3＋31秒真实profile_location原ID/取消不完整帧无profile2），真实 --list 必须和binding十二名称完全一致。所有profile根在本次短 owned TMPDIR；missing/cft不启动Chrome；不启动主App、不访问Keychain/用户库、不调用模型/PG、不代签Windows或公开backend完整链。

预算：seed120秒＋offline resolver300秒＋锁结构比对120秒＋build3600秒＋实际list120秒＋test1800秒＋cleanup1800秒＋prepare240秒＋report120秒＋margin300秒＝outer8520秒。从入口单调计时，准备超限不进入下一phase；每phase启动前检查完整后续串行及清理余量。正执行≥120秒；10/100ms是轮询/间隔；注入的120ms是已耗尽期限的纯协议反例。清理沿已独评亲缘/birth/UID实际守门、close/logclose，未知保非零。HOME/CODEX_HOME沿父值，只有TMPDIR/target为owned；offline registry只读缓存来源，不复制auth。

执行需要三个精确环境变量：CREATOROS_T1250_NATIVE_TOOL_REVIEWED=1、CREATOROS_T1250_NATIVE_TOOL_SHA256=<本工具独评SHA>、CREATOROS_T1250_NATIVE_INPUT_BINDING_SHA256=<本binding独评SHA>，再 node 绝对launch.cjs green。准入前不得提供合法整组变量执行；结果各自新native-runs/nonce，不覆盖原RED或IPC GREEN。
