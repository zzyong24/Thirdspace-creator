# T1246 第三轮完整验收工具

这里是 T1261 授权的新工具与输入源。第一、二轮源、原失败和未运行项不覆盖。分母保持原 170、官方 103（49 生成＋7 非生成＋38 路由＋7 设置＋2 T1097）、协议 7、Pi 1；Doocs 2 独立计算。

输入来源见 `inputs/SOURCE_INPUT_MAP.json`。原 driver/manifest 与原 100/100 输入仍从 round-2 逐 SHA 核对；新运行用例由本目录 source 明确复制并在准备和最终核验中逐 SHA 检查。原170只校准16路由公开DTO前置，其他 experience、recovery、reliability 等原断言仍保留。状态 fixture 的两处 `version:null`、正式聊天四个 ID 与项目深链、正常截图联合 ready 和失败即时诊断图、PG 短 socket、Doocs 唯一许可与原 reporter bytes 校正均记录独立来源。

`tool/reseal-legacy253-lineage.cjs` 使用真正新 commit、同 HEAD 包/11 Worker、已批准完整 scope 和真实动态图；其参数与原已审消费者相同。新增 source 表保旧253 lineage、旧原 source 列表，原 generated SHA 表另保；新 runtime 明确匹配 round-3 source。不得把旧50c7包当本轮新包，不重跑旧 collector。动态图若沿用，只能在当前实际所有物理文件/链接/loader 字节仍相同并经当前准入后使用，不能因文件名相同推断。

共同预算及具体尚无静态输入上界的消费者见 `inputs/COMPLETE_CONSUMER_BUDGETS.json`。已知截图增量不冒充全链上界。未砍72M case/独立 teardown、原更长预算或持久任务期限；nativeAvailable 原120k HTTP观察仍明确是待公共链验证的限制。缺原offset媒体未合成替代，原4秒通用fixture是另一组输入。

新三份 joint/原170/新111 seal 和 Doocs seal 实际产出后，当前两角色准入 JSON 必须含：`role` 为 `root`/`peer`、`verdict:"PASS"`、真实 `candidate`、两份 `jointManifestSha256`/`doocsManifestSha256`、`headClean:true`，以及顺序一致的 `profileCounts:{original:170,official:103,protocol:7,pi:1,doocs:2}`。这是本轮唯一实际输入准入，不添加另一层 SOURCE 审核。

```text
固定 Node prepare-dispatch-inputs.cjs 新joint 新Doocs Root准入 Peer准入 新空私有输出路径
固定 Node dispatch-once.cjs 输出/DISPATCH_INPUTS.json 真实packetSHA original
# 原170进程/stdio/log/组真实关闭并核空间后，依次 official、protocol、pi、doocs
```

派发每个 fresh nonce 一次，父预算由实际源函数与当前图计算，保持单 birth、60秒分段、完整 owned 清理。失败先保真实原回执再继续独立 profile；不自动重发模型、不改原ID或断言。正常截图必须真正就绪，失败图先落盘。App、安装、系统认证和 Windows 保持未验。本目录 SOURCE/静态验证不能替代新包后的完整公共浏览器与模型/同ID账本验收。
