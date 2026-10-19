# T-1110 内部诊断增量只读复核

本次结论：已检查的内部诊断、首次失败保因与停止边界没有剩余确定性阻断问题。结论仅覆盖下列源码和已有回归证据，不签真人原生报表采集、完整任务或视觉 Gate。

## 版本与范围

- 工作树：`/Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator`。
- 基础 HEAD：`72ffed51ebb246f7efd8b883322fba867c090d02`；诊断实现及测试为当前未提交增量。
- `ai-worker/src/runtime/platform/wechat-browser-source.ts` SHA256：`40d09cec5626523b84a970654989d927edae7406c257aeea5e9287069f3cf691`。
- 对应 `wechat-browser-source.test.ts` SHA256：`58df7ec0495978ca0efd5b266fa83035ecdaae3a387f67ba7496ce688c0569fa`。
- `frontend/src/server/persistence-client.ts` SHA256：`d2191c7758716c20ad1a7a895b3ca0c6f05a1a1012dacf01378a3502af17bc25`。
- 本代理只读源码和隔离测试日志，未重跑测试，未访问浏览器、真实数据库、profile、Cookie、私人身份或报表。

## 已闭合

1. **脱敏诊断**：`wechat-browser-source.ts:11–28` 只构造固定 `platform/stage/kind/code/exceptionName`。异常代码与类名须在白名单内，否则归一；不复制 `message/stack/cause`、URL、目录、身份或报表正文。`emitDiagnostic` 捕获同步消费端异常，不改变业务失败和清理。正式消费端 `persistence-client.ts:4695` 只记录该结构化对象。该内部观察补齐在原批准 SPEC 实施范围内，没有新增公共 DTO、所有权协议或采集能力。
2. **真实阶段**：`wechat-browser-source.ts:167–175,197–211` 按实际 openProfile、navigate、readIdentity、prepare、download、submit 调用更新 trace；失败时回执一次。每次回执复制字段，后续 trace 更新不回写旧事件。
3. **保留首因**：`wechat-browser-source.ts:211` 的二次登录探针异常被忽略，并检查原 signal。原窗口/下载错误不再被探针异常替换；只有实际探针返回已登出才产生 `LOGIN_REQUIRED`。未知内部 SourceError 仍保留原错误协议，而诊断代码和类名归一，不能泄露未知字符串。
4. **停止与期限**：`wechat-browser-source.ts:101–118,160–182` 保留原 inherited deadline、signal、finally 关闭与未确认停止协议。诊断 callback 抛错不阻断 close、onStopUnconfirmed 或其原 retry；最终 close 失败仍按原 `BROWSER_STOP_UNCONFIRMED/resourceStopUnconfirmed` 处理。本轮没有续期、扩大预算、重发或改变宿主资源所有权的改动。

## 已读证据

- `docs/verification/t1110/diagnostic-red.log`：实际 2 FAIL，原诊断未调用，17 SKIP。
- `diagnostic-extra-red.log`：实际 2 FAIL，原窗口错误被 probe 覆盖，以及未知代码没有诊断，19 SKIP。
- `diagnostic-stop-red.log`：实际 1 FAIL，停止场景诊断未调用，21 SKIP。
- `diagnostic-worker-final.log`：一次 3 文件、42 PASS（11 DOM + 22 source + 9 parser），开始时间 22:39:13，耗时 3.30s；文件 SHA256 `6a923f552ccc205ac0978b63591daae6bd3bc083f1f2ebe66f7aa49f3ca95837`。
- 新增测试 `wechat-browser-source.test.ts:61–82` 覆盖含秘密的原始异常、诊断消费者自身抛错、probe 遮蔽原错误、未知 code/name；`:118–123` 覆盖关闭失败、原 retry 和停止确认。已有取消、剩余期限及 late response 回归保留。
- 本轮 `diagnostic-worker-type.log`、`diagnostic-frontend-type.log` 都为空，没有诊断输出。root 报告实际执行 exit 0；本代理未独立运行类型检查，不把空日志本身当退出状态证据。

## 结论的实际限制

新诊断针对 `withProfile` 业务 catch；打开前的明确拒绝和 finally 中单独关闭失败仍由既有固定错误/停止协议表达，不承诺每条拒绝都有新阶段事件。`onDiagnostic` 是同步 void 端口，当前正式消费者为同步 console；本轮测试覆盖该协议。

root 已报告真人第二次视频号绑定成功、首次原计划 `EXPORT_FAILED/0 报告`，但没有向本代理提供该失败的阶段诊断。不能由此推断 Cookie 过期、转译 evaluate、frames、下载控件或其他真实根因。本轮新配置加载后的真实同步 intent 尚未执行；真人采集仍待实际验证。
