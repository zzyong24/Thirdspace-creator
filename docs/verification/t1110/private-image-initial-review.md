# T-1110 私有失败图实现候选独立审查

对象：`/tmp/t1110-private-image-candidate-m6kha1cy/combined.patch`。独立实读 SHA256 为 `106492426066845083fdaf0ab89ee6c0f3a3398fb0882798387822f740ddf37c`，与 root 指定值一致。仅 worker browser-source TS/test 两文件；针对当前树 `git apply --check production.patch` 返回 0，未应用。没有访问浏览器、服务、真人数据或当前等待扫码任务，没有修改共享树。评审模式 homogeneous inherited。

结论：主体符合已选定的内部诊断语义，发现 **1 项取消/到期后清理保证缺口**；修正该项或准确收窄保证后，再由 root 采纳并执行本树 tests-only RED。它不是新权限或用户审批问题，也不得使原采集硬失败。

## 具体问题：所有删除失败被吞掉，敏感文件没有后续清理

候选 `wechat-browser-source.ts:211` 的 `remove = unlink(file).catch(() => {})` 不区分 ENOENT 与 EACCES/EIO 等真实删除失败；abort handler 和真实 writer finally (`:218`) 都使用它，返回后也没有 pending cleanup 或 retry。若 rename 已完成、deadline 后检失败且 final 的 unlink 失败，任务仍按原 deadline 结束，但磁盘上的敏感 final 文件会继续存在。挂起 write 取消后 temporary 删除失败时同理。这超出已接受的“OS I/O 无法瞬时撤销、结算后及时清理”窗口：当前程序会把尚未清理的文件当作处理完毕。

最小修正建议：仅将 ENOENT 作为已清除；其他失败由 worker 内部持有该随机文件的私有 pending cleanup，并在真实 write 结算后的 finally/后续私有清理入口重试。保持有限外层，不把清理异常改成采集 primary reason、不打印路径或内容、不新增公共 DTO、业务 commit、用户审批或采集硬门。如果 root 选择当前版本仅作本机临时“尽力清理”，须明确这一限度，不能将它记为已保证取消后及时清除。

必要合成回归为 temporary/final unlink 第一次失败、随后成功时，原取消/期限仍优先、pending cleanup 未丢失、文件最终清除，且没有第二条诊断、业务提交或提前 onStopped。当前 tests 覆盖 write 异常和 rename 后到期，但没有 unlink 失败输入族；107 PASS 不证明这一分支。

## 已核对成立的边界

- **默认与权限**：`privateFailureImageDir` 仅可信 factory 注入，默认关闭，公开 controls/服务契约没有目录、图片、路径或任意 async sink。触发在实际 identity 完整通过之后，仅 video prepare 的 typed SECTION_MISSING；公众号、错身份、其他错误、download/submit 阶段不取图。没有新工具、任务、浏览器或业务数据库写入。
- **原期限**：capture (`:221–235`) 的 local end 为至多 120000 ms、受原剩余期限收窄；前置登录复核、截图、后置复核与文件保存共同进入 bounded。screenshot SDK 显式 timeout 取 local/原剩余最小值；取消或原期限耗尽优先，自己的 localWait 耗尽只跳过取证、保原 SECTION_MISSING。不续期、不重发。晚 screenshot bytes 与晚登录观察结果遇到 aborted/local end 检查后不能进入保存。
- **页面事实**：取图前后复核同一 Page 的官方 video origin、无 URL credentials、当前 kind 固定报表 pathname；isLoggedOut 必须严格 false，路径变化、明确掉登录或检测异常跳过。仅当前 Page viewport PNG，fullPage false，不打开页、导航、点击、重选或操作隐藏 iframe。不宣称未知 UI 绝无 QR；图片仍按敏感内容处理。
- **目录与文件**：仅接受绝对 `/tmp`（含 macOS canonical temporary root）内子目录，拒绝 `/tmp` 根本身和逃逸；mkdir 请求 0700，lstat 拒绝目标符号链接/非目录、非当前 UID、任何 group/other 权限，realpath 再验 canonical root。权限缺 API 或检测失败只跳过图片；不改变原目录权限。随机 128 位文件名不含账号/任务 ID，wx 创建请求 0600，单图非空且至多 25 MiB。权限检查允许比 0700/0600 更窄的 owner 权限，不因此扩大可读范围。
- **真实写入结算**：writeFile 持同一 signal，并在自己的 try/finally 中真实 await；外层 race 结束不会丢掉该 finally。晚 write 结算后先 check，不能 rename。同步 rename 前后查 signal/end，后检失败走 final 清理；不夸称 OS I/O 即时撤销。此项在删除操作成功时成立，失败限度见上述具体问题。
- **错误与停止**：普通截图、检查、目录及写入异常由 capture 内吞，原错误及固定诊断继续一条；不输出图片字节、filename、目录、异常 message/cause 或 SHA 到公共 DTO/日志。截图函数没有 onReport/commit、onStopped/lease release 或第二 lifecycle；原 guard、closeProfile、onStopUnconfirmed 不变。真实关闭失败仍保原停止未确认协议，不能用截图清理替代实际停止证明。

## 证据范围

独立实读候选 `private-image-final.log` 显示三文件 **107 passed**；较早 `private-image-green.log` 为 106 passed、`private-image-red.log` 为靶向 3 failed/103 skipped。空的 `private-image-final-type.log` 本身没有退出码；root 给出的 type 0 归候选作者本轮执行，不是本审查重新验证。上述日志不能代替 root 当前产品树 RED/GREEN、Gate、私有实图或真实平台结果。源码当前默认不启用该诊断配置，根代理仍须本树真实 RED 后再应用。

共享 guard 的启动前 preflight await 仍在 race 前；source finally close 仍使用原停止协议。本候选没有修复或重新验收这些既有限制。本人扫码/真实报表公共链路当前结果保持原证据，不由本报告签通过。
