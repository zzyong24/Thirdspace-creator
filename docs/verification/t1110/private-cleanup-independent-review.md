# T-1110 私有图清理修正独立复评

结论：指定清理增量符合 root 已选定的有限重试及永久 OS 失败限制，未发现新的具体阻断项。上一轮“瞬时删除错误被全吞、无重试”的问题已由该候选修正；不将旧候选追溯改签 PASS，也不代签 root 当前树 TDD、整个 worker type 或真实微信平台。

本次只读候选、源码与合成日志，仅写本报告到 `/tmp`，未 apply、访问浏览器/服务或真实数据。评审模式 homogeneous inherited。

## 摘要与代码一致性

独立实读：

- `final-production.patch` SHA256 = `871e7d3c52dd73774238f3e0159f885fb50ee31e4d96bc5a417461eb336da2e9`。
- `manifest.json` SHA256 = `f87f08f3290f7762fc423ed3fd1360eb9122cf92b783fa5a2e75d305684f890d`。
- 候选 source SHA256 = `ec7c53bc4c83bb57b8f707acd2ba1602f6722f9626c6a3843f8b3031814df19a`，与 manifest 一致。

`cleanup-production.patch` 只改原保存器内部 remove；完整 final production 相对于上一已审私图候选也只有这一增量。每个既有 remove 调用在固定三次 for 中逐次 await unlink；成功立即 true，ENOENT 明确 true，其余异常进入下一次；三次耗尽返回 false。没有 delay、timer、持久清理任务、后台 producer、公开路径或业务重发。原 abort/finally 调用点、真实 write await/finally、rename 前后检查、signal/end、页面复核、原错误/diagnostic/停止所有权均未改变。

一个文件可由原 abort 与 finally 两个入口分别清理，各入口自己的 remove 至多三次；不能误称该文件全生命周期只有三次，也不能把“次数有限”声称为 OS unlink 可立即中断。外层原 bounded probe 仍限制主执行等待，晚真实 write 结算后保有 finally。清理允许继续处理已有私有文件，不新增报告或业务晚提交。

root 已明确接受的限度在代码注释、REPORT 与 manifest 中一致：永久 OS/权限故障三次仍失败时，敏感文件可能残留；root 在本次排障结束始终删除整个私有临时目录，不按业务是否成功省略。这不是“任意物理时刻必已清空”的保证，也不要求第二个 cleanup producer、新公共字段或用户审批。当前 remove 返回 false 没有升级成公开错误，保持原采集 primary reason，符合此次选定语义。

## 缺口的实际回归

新增测试实际调用 public source、合成 Page，并在 `/tmp` 写入合成 bytes 后同步真实 rename；把原 deadline 推到耗尽，第一次 final unlink 抛 EIO，第二次调用真实 unlink。物理空目录断言在次数断言之前；还验证原 deadline 错误、一次诊断、一次真实 onStopped 不变，test finally 删除合成目录。

独立实读 `private-cleanup-red-physical.log`：旧可生成图/rename 的生产 source 下，**1 failed / 107 skipped**，实际失败是目录仍有一个随机合成 PNG；该日志摘要与 manifest 一致。它不是“OA source 还没实现截图”的替代红测。实读 `private-cleanup-green.log` 为三文件 **108 passed**，摘要也与 manifest 一致。type 0 为作者候选目录的窄四文件及真实 import 依赖执行记录；空 type 日志本身不独立证明退出码，也不代表整 worker type。

root 仍需在自己的树分别保留旧图实现→新增物理 EIO RED→清理增量 GREEN 的真实证据。读本轮共享树时已出现旧私图生产 source 的原单次 remove、以及新增 EIO test，符合 root 预定红测基准；所以 final-from-OA 与已落新 test 的补丁不再 apply 是基准已变化，不是代码兼容失败。此时 `git apply --check cleanup-production.patch` 实际返回 0；只做检查，没有应用。

## 保留的范围限制

factory 默认关闭；图像仍为敏感本人本机工件，不进入公共 DTO、业务库、日志、Git、分享或外部模型工具。前后路径/明确 loggedOut 检查不证明未知 iframe 绝无 QR；对此不补词表或采集质量门。原 120000 ms probe、较早父期限、晚 bytes 丢弃和真实停止未确认协议保持前次审查成立范围。

共享 guard race 前 preflight await 与原 source finally close 的限制仍在；本修正没有验收或解决这些共享路径。真人扫码、QA/真实报表当前结果由 root 的实际链路证据承担，本报告不签通过。
