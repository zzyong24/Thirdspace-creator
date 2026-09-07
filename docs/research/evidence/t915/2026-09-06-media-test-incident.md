# 测试误触默认媒体目录迁移事故

时间：2026-09-06 14:14–14:16 America/Los_Angeles。

本会话修改聊天素材整链测试时，为启用真实文件存储，调用了 settings.storage.put，将测试数据库中尚未配置的媒体根改为临时目录。该 API 会从默认 /Users/zyongzhu/CreatorOS/media 迁移整个目录，成功后删除旧目录；测试 finally 又递归删除临时目录。此操作未经用户授权，是本会话错误，不是正常验收行为。

## 已验证事实

- 事故测试：frontend/src/server/chat-task-submission.integration.test.ts，临时前缀 t915-planning-factory-*，目标 media 子目录。
- 日志：chat-asset-production-localfs-tests.log，开始于 2026-09-06 14:14:26，运行 72.91 秒，仍有 2 个失败测试；不得当成通过证据。
- 当前 /Users/zyongzhu/CreatorOS/media 不存在，事故前缀临时目录无残留。
- tmutil listlocalsnapshots / 未列出快照；diskutil apfs listSnapshots /System/Volumes/Data 返回 No snapshots。tmutil listbackups 返回权限错误，不能据此断言外部备份不存在。
- lsof +L1 未发现媒体目录或事故临时目录中的已删除开放文件。
- 历史 2026-08-11 磁盘审计记载默认媒体目录约 4.7 GiB，属于真实素材。这个数值不是本次损失统计；本次尚无完整原始清单，禁止声称准确丢失数量。
- 历史审计提到的 /Users/zyongzhu/CreatorOS/workspaces 当前没有任务目录，不能作为可用恢复副本。
- 已向用户披露并询问备份路径。尚未恢复，不得宣称用户数据未受影响。

## 后续只读核查

- tmutil destinationinfo 返回 No destinations configured；与之前本地快照检查一致，当前未找到系统配置的恢复来源，不据此断言所有外部副本不存在。
- 已检查 Library/CloudStorage、Documents、Downloads 中名称明确相关的备份位置，未发现媒体目录备份。Documents 下存在“图文素材”目录，但没有原始媒体清单可用于比对，不能宣称它是本次数据的副本。
- 按 creatoros-cli 技能验证已安装 CLI：version/help 成功；status 和 access status 均返回 CONNECTION_NOT_FOUND。未启动应用、未修改授权，也未绕过 CLI 读取用户数据库。
- 本轮没有运行测试、构建、目录迁移或清理；仍等待用户提供可核对的备份/原始素材位置。功能恢复与数据恢复均未验收。

## 当前处置

用户后续明确表示“数据清理了就清理了”，要求加速落地重构。依此解除以数据恢复为前提的 T-915 阻塞；这不代表数据已恢复，也不授权再次触碰真实媒体根。T-917 的事故事实与测试隔离整改继续保留。

1. 不再运行测试、构建或清理；尝试暂停测试进程时进程已退出。
2. 已删除测试中的 settings.storage.put 调用，改为仅初始化隔离测试数据库的 storageConfigs；这个修改尚未重跑验证。
3. 保留失败日志及事故事实；接下来优先检查用户提供的备份或可验证原始副本，不凭猜测重建文件或伪造恢复结果。
4. T-915 保持进行中；聊天素材生产整链当前仍失败，不能提交为验收通过。其他已通过的局部测试不替代本次失败。

```mermaid
flowchart LR
 A[错误的测试配置 API] --> B[默认媒体目录迁移到临时目录]
 B --> C[旧目录被删除]
 B --> D[测试清理删除临时目录]
 D --> E[当前无可用原目录或本地快照]
 E --> F[查找备份和原始副本，恢复待证]
```
