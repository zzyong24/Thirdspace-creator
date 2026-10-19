# T1098 核对安装重启时的后台同步失败

用户要求发现问题及时建task修复。T1095包已安装、HTTP首页已加载、原10任务/4对象和旧失败回执对照一致；同一次实际启动日志还记录两个 scheduled.intelligence.sync 任务 status=failed、candidateCount=0，另有一个定期采集暂未启动的 Error。

- 实际任务：ai-task-35324f91-138、ai-task-35324f91-263。
- 定期采集日志的真实账号：acct-c68e8d14-137；未证明它与上述两个任务相同归属。
- 原启动前缀证据保留在本机私有验收目录；两个文件SHA256：df7834f63e7cf3f21ef34c1c9b7764c1d8cd3fc8a318823d66cb0f08383d61e1, 5fa568d1657c09d158d4e202f7e0994bc3986856bf28a4aaf36b7f8c9af304a3。

当前只证明日志确实报告失败，不证明本次新代码导致、任务新建时间、供应商原因或采集永久不可用；不能把 finishReason=null 推断为无错误。需要从原任务的公开状态/来源与原实际错误核对归属和原因，再判断重启恢复、配置、供应商或产品接线问题；不清历史、不自动重发、不操作其它组作品。

```mermaid
flowchart LR
 A[实际启动失败记录] --> B[核对原任务归属与回执]
 B --> C[定位真实失败原因]
 C --> D[独立评审最小修复]
 D --> E[原链回归及安装验证]
```

本文件是缺陷登记和待核诊断，尚不是产品改动准入SPEC。无代码、合同、数据库或权限变化；T1095本地启动已通过的事实与后台同步失败分别保留。

2026-10-11 T1209修复旧作业缺版本的409后，当前安装版原调度器在两组自动创建self.metrics真实run（run-5efd8bb4-530f-42d1-8830-6f3bb379f195与run-4f1bbadf-5506-4090-ae34-12a727fb60ac），均membership/group版本1、running、error=null；这些事实已能区分准入问题与外部执行尚未完成。原ai-task-f394bff8-1465 intelligence同步失败仍保留，新ai-task-0f0dcc73-148/153/316同步成功；第1次对标页导航超时、第2次恢复并取得33条公开作品。

公开execution.tasks.get还观察exec_90e4dc58-d3ee-4b9f-8a8d-5a91afdaf729对应ai-task-0f0dcc73-152，running、attempt=2/maxAttempts=3，checkpoint=null，heartbeatAt=2026-10-11T01:57:35.184Z/leaseExpiresAt=02:02:35.184Z。这是当前观察而不是“卡死”或根因判定；后续须核租约推进、工作者和原最终结果，不能由running签外部采集成功。原公开只读证据docs/verification/t1209/installed-collector-execution.json，本轮没有显式手动触发、取消、替代任务或改变定时配置。
