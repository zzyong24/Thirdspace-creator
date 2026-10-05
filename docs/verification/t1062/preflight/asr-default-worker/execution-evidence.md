# 默认装配有限真实回归：Unknown

唯一授权命令实际 exit 1，stdout 空，模型 0、解码 0、worker 创建 0、网络请求 0。one-attempt.lock 已存在，未重跑。

默认 resolveWhisperWorkerRuntime 已真实发现临时 bootstrap，返回 `/private/tmp/.../runtime/frontend/creatoros-module-resolver.cjs`；manifest 路径是 `/tmp/...`。harness 的字符串相等断言没有处理 macOS 同一路径标准化，在 factory 调用前失败。这是本次 harness 失败，不能推断产品或模型失败，也不能标注默认 worker timing PASS。

输入固定原 WAV SHA、源 MOV、7模型 source/独立cache SHA、4 runtime/test 与第五cancel等 source SHA，调用前后全部相等。无源码/依赖/用户缓存写入，无新 decode 或 model。实际 Node25.9.0 / `/opt/homebrew/Cellar/node/25.9.0_2/bin/node`，编译 target node24 单独保留。

原始日志、exit、锁、review/source/input/model SHA及命令：见同目录 execution-evidence.json；原失败详情保持 run-one/unknown.json。公共reserve/settle、安装及实际词时码均未验证。

若 ROOT 决定允许仅修 harness canonical-path 对比，必须另存原版本/初次证据，重新确认冻结 SHA并明确授权；当前代理未修脚本或清锁，也未再次执行。
