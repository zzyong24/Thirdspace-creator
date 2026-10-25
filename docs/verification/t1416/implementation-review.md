# T-1416 独立实现复核

审核者：`/root/t1408_contract_review`。结论：代码复核通过，未发现确认缺陷；整链回归和类型检查尚未完成，不签验收通过。观察截止 2026-10-25 10:48:57 UTC（北京时间 18:48:57）。本次没有运行测试、浏览器、构建、业务或控制面操作，仅写本报告。

本复核沿用已读 T-1416 任务包 §1–5、§7–9 及写前 §6，绑定已审核 SPEC `docs/features/t1416-browser-visible-document-assertions.md`，SHA-256 `25cd3f02f0fb7fcf6e28ef6d1b29b9370a358dc98d4d4c433a7d20ba834d87a9`。实际比较 `75b74649e..4128c68c8` 的测试 diff，并核对主树、外盘和提交对象中的文件字节，三者 SHA-256 均为 `57e7b204be81a28646bd384f59e65b383afb541a84deb60fe76c9061c2c663c5`；两树 HEAD 均为 `4128c68c82a71e485110a026c1fbd288c549f363`。

## 断言与不变量

产品相关 diff 仅新增测试内 `expectExampleVisibleDocument`，把原两处 `toContain("Example Domain")` 替换为该 helper。helper 先取 `[visible text]` 后的 data 内容，在第一个关闭 data 标签处截止，再对区块开头要求精确 `<data origin="https://example.com/">`，并要求完整英文可见段落。缺少区块、空文本、仅标签页标题、不同来源或缺完整段落均不能满足这些断言；源码没有把抓取的 HTML 注入返回结果，也没有 mock navigate/extract。

这与生产 `act_extract` 的当前可见正文、脱敏、来源包裹契约一致。原真实返回包含其他语言与被脱敏段落，因此无需要求整页只等于一段英文；对完整目标段落的包含检查保留了正文读取事实。生产 URL、HTTPS、端口、信任证书、CDP 和脱敏路径均未改动。外部页面与网络仍可能变化，未把公开网站依赖描述为稳定本地夹具。

为精确核对范围，本次只做静态字节比较：从新测试文本去掉新增 helper，并将两处调用还原为原断言后，全文与旧提交逐字相同。由此确认其余原断言、五个 realTest、执行条件、profile/account/task 身份、两个账号的私有状态隔离、取消第一个账号后第二个账号继续工作、租约释放、profileStopped、Rust 退出与 finally 清理，以及所有等待时间均未删除或调整。没有改为 skip、only、retry 或放大超时。`orchestrator/process/reconcile.config.json` 在两提交间逐字相同，SHA-256 仍为 `c8c13b6788b08f48aa4f154bcbdd0d1f74cf72a0e3e4863788e9b4aaa9cb8ffc`。

## 原始 RED

已完整读取 `docs/verification/t1412/resumed-validation/cft-five.log` 和 `.receipt.json`。原命令运行两个原 frontend 文件、`--retry=0 --reporter=verbose`；最终为 31 PASS / 2 FAIL，共 33 项、0 skip，五个 realTest 均有实际执行记录。收据为自然退出 1、101379 ms、未耗尽预算、没有 outerAbort、进程关闭且无残留归属成员。

两处失败分别精确位于原 509 行（Node/DB→Rust socket→真实 Chromium）和 639 行（双账号隔离及取消后继续读取），均是 `Example Domain` 子串期望失败。两段 Received 都已包含 `[visible text]`、精确 `https://example.com/` 来源和拟断言的完整段落，而缺旧可见标题。第一例的详细证据现已补齐，初审时说明的截断局限已消除；原 RED 文件没有被本审核修改。`cause-evidence.json` 所记 HTML 与 RED 日志哈希与实物一致。

## 驱动及待完成证据

只读核查 `run-led054.mjs`：从冻结候选配置读取原 `lesson.check`，不手工重写测试列表；使用 `/bin/sh -c` 执行原 frontend 两文件 → ai-worker 协议 → backend 四文件的完整 `&&` 链，仍为 retry=0 和 2700000 ms 预算。首次 driver 用错 `item.id` 的修正只发生在 `4128c68c8`，变为实际字段 `item.led`；原错误检查位于 runtime.start 与测试之前，该次准入失败不能计作产品 RED 或测试执行。

驱动先检查旧 full/RED 进程关闭及无残留、冻结 HEAD 与预期工作树状态，记录源文件和配置 SHA；清空继承环境后采用既有私有环境投影，新建 owned PG，仅投射四个既有专属 PG 变量，未设置全局 DATABASE_URL。执行、receipt 采用原有有界进程封装；finally 负责停止本轮 PG，并保存源文件复核。后续 frontend typecheck 仍使用原私有环境。代码读审认可该执行路径与当前协议一致，实际退出、PG 清理及 candidate-after 仍须由终态收据证明，不能靠源码推导成功。

截至上述观察时间，`led054-green.log` 已记录一个真实页面完成 navigate/extract/close/fixture cleanup，但 `led054-green.receipt.json`、frontend typecheck 日志及收据尚不存在。局部日志不是原整条命令成功：还需核所有 frontend 测试及五个 realTest 0 skip、后两个 && 分段、typecheck、PG 停止和源文件未变等真实终态。主线程正在执行，不应重复启动或替未完成结果签绿。

旧 full 的 54 项成功与 LED-054 失败继续保留；最终只能按实际证据称“原 full 失败后单项修复复验”，不能改称新候选一次 full PASS。安装包仍绑定 `f9e5e5ece`。本复核不代签官方 Pi、图片幂等资格、安装态 UI 或完整推送条件。

## 证据 SHA-256

| 工件 | SHA-256 |
| --- | --- |
| `frontend/src/server/workbench-browser-host.test.ts` | `57e7b204be81a28646bd384f59e65b383afb541a84deb60fe76c9061c2c663c5` |
| `docs/verification/t1412/resumed-validation/cft-five.log` | `0ff3252bf5531e48feb1014309148a2236fd3f7118962cbd259eaaae86623edc` |
| `docs/verification/t1412/resumed-validation/cft-five.receipt.json` | `67d2e4dac58723988bff1becaaa525b223eb508bb96a2102041075b8dd06af26` |
| `docs/verification/t1416/run-led054.mjs` | `3b5dc073642a527d84307105e25887b896b2beab409c5ac037772213bb57f60d` |
| `docs/verification/t1416/candidate.json` | `7becc891451428919a3f3cb1b5ccc12002ec2c00d23a4c9f1422608b53173aab` |
| `docs/verification/t1416/cause-evidence.json` | `e7822d971c1eaedb9a0b3902229e49f6b5825c218dc16ed21fab3fc221032cff` |
