# 精确复用与限制

| 来源 | 复用消费者 | 本轮不冒认的范围 |
|---|---|---|
| docs/features/t1332-group-radar-topic-upgrade.md | 已审组级升级、checkpoint/lease/child/project 真实归属 | 不新增 SPEC、账号或质量门 |
| docs/verification/t1332/runtime/implementation/OUTPUT_INDEX.json / RESULT.md | 原三模型控制链、Brief、7阶段/1活动、lease/CAS边界 | 原 green-worker-bind 末尾错误断言 DTO 组字段的 FAIL 保留；不是新供应商验收 |
| runtime/cases/green-worker-bind/formal-chain.json / parent-terminal.json / projects-after.json | 实际原父598d9882-16/child17/transform18和项目事实 | 仅历史只读，不连接该库、不重发原任务 |
| runtime/implementation/completed-readonly/run/RESULT.json | 同完成任务 enqueue 早返回、17表全等、0新调用 | 控制输入不是本次新包真实采集输入 |
| docs/verification/t1315/final-root/runner/cases.cjs:u35 / harness.cjs:openRadar | 现役雷达普通入口、原8小时有限观察、同组合同调用 | 不执行其 collect/material/research 其它根，不重复 rewrite_only |
| docs/verification/t1328/runtime/implementation/working/final-u08-u10/runner/register-owned.cjs | 现役进程身份登记，只读引用 | 不复制 SDK、大闭包、认证或业务数据 |
| frontend/src/features/intelligence/use-project-upgrade-queue.ts | itemIds/positioningVersionId/idempotencyKey 和普通升级行为 | 已完成 UI 返回不重发；幂等检查单列原 body/key API |
| frontend/src/features/intelligence/intelligence-workbench.tsx | ItemCard 标题/升级按钮/查看项目链接 | 不使用虚构 data 属性或新增 UI |

新包绑定及真实成功 collect 是尚未满足的依赖。原806 U35 因 collect174失败未 enqueue；此次新 NOT_RUN 不覆盖旧事实。合同收据记录当前离线读取源，不代表最终 sourcegraph 锁；正式执行前锁真实新包与其依赖闭包。
