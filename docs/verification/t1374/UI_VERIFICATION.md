# T1374 双视口公共 UI 验证

本轮同一次执行在 1366×900 与 1024×680 两个视口均通过：2 PASS、0 FAIL、0 SKIP、0 flaky，Playwright 自然 exit 0，完整驱动约 71.87 秒。候选 HEAD 为 `10238309c46f557b0c92d9d008cb466f7974c594`，仅中央冻结的三个既有 test/seed 文件有改动；八个观察源、完整 dirty 清单和旧 T1371 证据前后相同。

| 已走公共链 | 正常视口 | 最小视口 |
| --- | --- | --- |
| 小红书 unknown：账号/日期筛选、返回刷新、真实零与未知 | PASS | PASS |
| 快手 unknown：窗外播放为未知、切到作品日期后播放 321、点赞 0、粉丝 9 | PASS | PASS |
| 快手账号筛选、已采集作品入口、返回、刷新和日期切换 | PASS | PASS |
| 抖音原组与转组发布事实 5 / 200 保护 | PASS | PASS |
| 原目录读回全等、任务计数不变、业务 mutation 0、pageerror 0 | PASS | PASS |

每个视口 witness 均 completed=true，保存 10 个阶段点。两张快手原图已查看，账号/09-01 日期筛选、播放 321、粉丝 9 实际可见；**0 点赞位于图片视口下方，由真实 DOM 断言证明，不声称图片已显示该行**。图片、witness 与完整日志留在本轮 private 目录，精确绝对路径和 SHA256 见 `UI_VERIFICATION.json`。

执行前真实核验三源与原 config 哈希、三个端口为空、新 fixture 目录空且 0700；Playwright 原 config 不改，JSON reporter 环境变量与 --output 均使用独立 T1374 绝对路径。原 host=300s、seed+authready=600s、两 test 各 7200s、两 server grace 各 120s 保持；child=16200s、独立清理=720s、交接=120s 的包络不缩短，无自动重试，max-failures=1。

首次 ui-attempt01 在自有驱动静态 preflight 解析 porcelain 时失败，未启动浏览器、host、PG、seed 或 Next。原失败文件及原 driver SHA 保留；Root 仅授权 strip→rstrip newline 的解析修正，ui-attempt02 使用新 root，候选与预算不变。该前置失败不是产品 RED。

Playwright 自然结束后，独立再次核对本轮 nonce/root，原 helper 与私有 PG PID 均已不运行，41417/41418/41419 全空，postmaster.pid 不存在。**STOPPED.json 缺失**，仅证明资源实际终态，不补写正常 host shutdown 回执。原日志、EXIT、后置核对分别保留。

浏览器 HTTP/WebSocket 沿原网络策略阻断并核外部 ledger 为空；原 config 禁后台驱动和调度，host 不装配外部 collect/onBound adapter。本验证不是全进程 OS 出网沙箱，不涉及真实账号数据、真实采集、模型、安装包或用户 profile。T1369 production04 未执行。通过的是新增 consumer/source-shape 和真实 Next 双视口链，**不宣称已安装用户端恢复，也不替代视频号原采集失败与公众号未绑定的实际边界**。
