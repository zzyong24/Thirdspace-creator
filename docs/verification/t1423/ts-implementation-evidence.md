# T-1423 TS 消费端实施证据

本工作仅在 `legacy-license-upgrade` 隔离工作树完成，TS 源码与测试于 2026-10-23 12:27:21（北京时间）冻结。13 个准入路径、完整 SHA256、必需 fixture 与日志 SHA 见同目录 `ts-implementation-evidence.json`。原生实现、控制面和正式打包由主会话负责，本作者未提交、推送、部署或执行真实授权、模型调用、经济写入。

## 实现结果

- 明确升级操作拆为 `probe`、`fulfill`、`sync`：先 fresh proof 与只读原凭据，缺绑定才传唯一 opaque token 调用 `license_restore_saved`。原生必须返回已验签、checked 保存确认的 ready，才继续 fresh proof、原权益履约与配置同步。status active、离线许可、未确认保存均不冒充恢复成功。
- 初次明确升级遇凭据 404 可进入同权益履约，但不据此声称此前未开户。已观察到提交 unknown 后只读一次，仍未知则停止，用户明确继续才开新的观察；同一 token 的逻辑履约最多发送一次。经济幂等仍由 Growth 原权益身份负责，无客户端 journal、经济 ID 或随机 Key 去重假设。
- 初始 probe 由 server 生成唯一密文观察 token；Node Map 钉真实 principal/account/group、稳定原许可身份和成功 proof 的原经济范围。后续阶段必须精确命中，过期、不认识、换身份均停止，不续期、不重新创建。每阶段、经济发送点及 vault/cache 写入前后复核。最多 256 个 live 观察，并覆盖并发读盘后入表的容量竞争。
- UI 每次明确新观察只有一个 730000ms 父截止，配置续读保留原截止；到期要求明确重新观察，不能静默换 token。取消和切组隔离迟到结果；已发 IPC 的 guard 持续到真实 promise 收尾，不声称撤销服务端操作。配置成功后真实 fresh store GET 完成才显示完整成功，旧 inflight GET 或 GET 失败不能冒充成功；部分成功只续配置。

## 实际 RED 与 GREEN

最初端口、路由与 UI 缺失均保留实际红测。跨请求换授权、失效观察、同 token 重复履约等 fence 红测保留于 `ts-fence-red.log`；257 个并发首次 probe 突破 256 上限的有效红测为 `ts-capacity-red-final.log`（此前 `ts-capacity-red.log` 是测试先抛 AbortError 的未完成诊断，不作为有效容量 RED）。父截止续期与缺 token 占用 native guard 两条实际红测为 `ts-deadline-guard-red.log`。

独审发现新升级 sync 在目录期限短于 proof 时，credentials、vault 或 cache 等待跨过目录截止，原实现仍错误返回 ready。`ts-directory-deadline-red.log` 保留 3 条真实 RED，修前 13 SHA 留在 `ts-source-before-directory-fix.json`。现仅新升级分支在 credentials 完成及各 commit 边界同时复核 proof、观察和目录期限；跨期保留经济 ready 的 partial，不冒充配置成功，已写回的过期缓存也不能被消费者采用。

最终命令与环境完整记录在 JSON：独立 `PGLITE_DATA_DIR`，`DATABASE_URL`、`CREATOROS_DATABASE_URL`、`POSTGRES_URL` 置空，7 个聚焦文件，`--retry=0 --testTimeout=180000 --hookTimeout=180000`。`ts-final-focused-r3.log` 退出 0，**7 文件、232/232 通过，27.00 秒**。此前 r1 的 227/227、r2 的 229/229 均保留为修前收据，不替代最终收据。广域类型、timeout、boundary 由主会话报告；作者没有并跑第二套重类型检查。

## Growth 真实输出消费与兼容补充

`fixtures/growth-formal-v1-economy-r1.json` 原字节复制自 Growth 实际 router/services 生成的 4 场景输出，SHA `a7c9ae53ce13c955e8bfcc219085edc04e483ef6da9cc10e5863f3bccf3d069d`。来源使用合成 authority、内存 SQLite 与 fake provider；Creator 实际消费 proof、Growth 签名目录、凭据和原经济 trace，并落实际加密缓存。trace 各项是来源已经明确执行的独立操作，不伪装成 UI 自动重放履约。来源与运行详见 `growth-fixture-manifest.json`。

实际 `active-key-without-wallet-30` 输出的 `credential.tokenPrefix` 为 null，原 Creator 字符串限制产生真实 RED，见 `growth-runtime-consumer.log`。权威 Growth `models.py:408` 将 `token_prefix` 声明为 nullable，`service.py:2882` 直接投影；因此仅补 string|null 兼容，未修改 fixture 或放宽 Key 非空、签名、身份范围、金额及钱包判断。null 前缀不代表缺 Key，也不能成为另建账户或重复履约理由。实际 4 场景与 bool/number/object/array 非法前缀 4 反例共 **8/8 通过**，见 `growth-runtime-consumer-green.log`；最终 232 测试再次包含这些场景。

`fixtures/node-observation-v1.json` 为现有 Node `encryptSecret` 用公开合成 master/handshake 实际生成的 enc:v1 密文，SHA `ee5c63606cc8ed2d0a13692cdb20a771e80c9c7e6c5d490d2089bbd18706b659`，供 Root 原生消费对照。没有使用真实主密钥或读取本机激活码。

以上仅证明本地受控消费链和组件接线。真实 browser/desktop UI journey、安装后行为、生产恢复接口、真实经济结果均未由这些测试验收；不得把这份证据写成生产 PASS 或任务完成。
