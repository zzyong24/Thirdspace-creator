# T-915：转写事实原子落稿与派生稿恢复

范围：承接已评审 R-03/R-05，生产 transcribe runner 与离线回填的落稿属主迁入 backend projects service。本批没有完成 ASR Worker 迁移，也没有切换正式 /api/chat。

```mermaid
flowchart LR
  A[转写结果 / 回填正文] --> B[后端项目锁与事实事务]
  B --> C[保存逐字稿及当前版本]
  C --> D[独立事务补口播稿]
  D --> E[已有人工稿保留]
  F[已有逐字稿重试] --> D
```

- 同账号项目锁覆盖查重、建逐字稿及版本，主写入失败全部回滚。
- 可选口播稿在另一个事务中创建及写版本；失败保留逐字稿、不留下空稿。恢复重读保存的事实，忽略第二次请求携带的不同正文；已有人工稿不覆盖。
- 图集 source 与显式 skipMasterScript 禁止初始化标记均在恢复中生效。新增标记保存在原 contentData 内，无数据库结构迁移。
- runner 命中已有事实后调用显式恢复端口，不再次抓取、抽音或 ASR；恢复失败只告警，不把成功事实判失败。
- production persistence 删除原 5 端口业务装配，绑定统一 service；搜索派生索引在事务提交后更新，失败不反转事实。
- backfill-transcripts 复用同服务，要求显式 accountId，并使用随机 ID 避免不同运行的序列碰撞。仅修改脚本，未执行真实回填。

## 验证事实

内存 PGlite + 真实 projects/artifacts service；runner 外部抓取和 ASR 使用 fixtures。未访问真实媒体、安装应用或计费模型。

- 39 项测试通过：新服务 8、既有事实 helper 9、runner 22。覆盖并发、版本失败回滚、保存事实恢复、用户稿保留、跨账号、图集、显式禁止初始化、索引成功/失败及零重复 ASR。
- 最早新测试因模块缺失未执行断言，不能当行为红测。首次实现 3 过/1 失败是测试误读初始版本，已修为按 currentVersionId 验证。
- 两个真实断言红测：派生恢复异常把成功事实判失败；显式 skipMasterScript 在后续恢复中失效。日志保留，修复后上述 39 项全绿。
- backend typecheck、frontend tsc --noEmit、回填脚本单独 TypeScript 检查均退出 0。一次误用不存在的 frontend package filter 未执行检查，不计 PASS；随后使用 pnpm --dir frontend exec tsc --noEmit 真正运行并通过。
- CodeGraph 刷新及 impact 核对到生产装配与回填消费者，rg 交叉核对动态端口；独立只读复核无实际链路阻断，复核提出的索引与通用 skip 标记边界均已补测。

## 尚未完成

跨 attempt 的转写任务业务去重、抓取/ASR/后处理的 Worker 检查点与未知计费结果恢复、onTranscriptReady 重建任务幂等和恢复尚未完成。正式聊天路由、其余 R-05 入口、旧路径退役、性能和双平台验收仍按原 SPEC 保留，T-915 不标完成。

pmem sync 已执行。全局 reconcile 退出 1：211 errors / 1 warning，物理边界仍为 5 条；与上一批 chat-publish-reconcile.log 的 212 条 ERROR/WARN 诊断逐行集合一致，无新增或消失。全局既有欠债继续保留 T-916，不宣称全绿。
