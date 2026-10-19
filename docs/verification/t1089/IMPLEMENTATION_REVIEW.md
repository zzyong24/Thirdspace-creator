# T1089 独立实施复核

- 复核时间：2026-10-09（Asia/Shanghai）
- 复核方式：只读源码、SPEC/DEC 与既有证据；未修改仓库，未执行数据库、模型、API、UI 或安装版操作
- 结论：**PASS_STATIC_AND_FOCUSED_EVIDENCE；最终全文件后端回归与 reconcile 仍在运行，不能据此完成任务或宣称整体 PASS**

## 复核对象与字节绑定

| 文件 | SHA-256 |
|---|---|
| `backend/drizzle/0130_legacy_source_ownership.sql` | `cc25f17ac270d230b82f1697bd20c674931877459cc0a70f667cab3461a3fc70` |
| `backend/drizzle/meta/_journal.json` | `7c517512f66ec5461f751668a2629f730827a3c0c404b80236ce839f74e3b2b4` |
| `backend/src/migration-convergence.ts` | `f409e62f1321d15c93f86634b3274a602f1d3936d11da832ee289184e6feb58e` |
| `backend/src/legacy-source-migration.test.ts` | `a4e200cc778fbe75295d3dbf5f6ad871334de892886221bdfefc5f831caea535` |
| `frontend/src/server/legacy-frozen-source-read.integration.test.ts` | `cfa9e53e4ed52a6a0708f997a840e7740504bfd1daa28846e54a7bb4f1bd084b` |
| 当前 SPEC | `cd23b99741904335979c5694f9fc90799deb7ec02de7ea26605b3b069a660697` |
| 产品定位 | `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800` |

复核时 HEAD 为 `b75eb8dad4aa4953f15ead5ff259bbec3af05071`，上述五个目标文件均与作者最终冻结 SHA 一致。

## 实施结论

### 1. 归属证明没有创造新 authority

`0130` 只为三类旧 source 行补 `group_id`，证明链要求真实、启用的账号，唯一 active canonical group、当前 membership `version=1`，并核对项目、作品、artifact、content/artifact type、user/account/group。它没有从任务 payload、模型输出或客户端声明推导 owner，也没有改旧任务、冻结输入、版本、digest、state 或 ledger。

迁移先对 authority 表执行 `SHARE NOWAIT`，对 `projects/content_outputs/artifacts` 执行 table `SHARE NOWAIT` 与有序 row `FOR SHARE NOWAIT`，再对三类 source 表执行 `SHARE ROW EXCLUSIVE NOWAIT` 和 NULL source 行 `FOR UPDATE NOWAIT`。父对象和 source 的 proof 位于同一 PL/pgSQL 子事务；`lock_not_available` 会整轮回滚后在事务外等待并重试。这样避免了父 INSERT phantom、半轮 DDL/回填和失败轮残留锁。

新增函数与三个 trigger 只处理后续 INSERT，沿同一 proof 规则盖章；旧行回填和新行盖章共用相同 authority 条件。没有放宽跨账号、已归档组、成员迁移或多历史 membership。

### 2. journal / convergence 保持严格 lineage

journal 仅追加第 105 条 `0130_legacy_source_ownership`，`idx=104`、固定 `when=1791043200003`。convergence 固定 SQL SHA、journal 长度与尾项，并要求 0128、0129 已存在后才接受 0130；reference catalog 只有在 receipt 存在时才纳入新函数和 trigger。未来 journal、缺失前缀、SQL/hash/catalog 漂移仍会拒绝，旧 104 项没有重写。

现有迁移回归三文件实际通过 36 项：证据 `existing-migration-final.json` SHA `9a594bd1cdd18d41d14425ae386f2bb97ae6cc14d55c152978f5feb5d8b7fa1a`，日志 SHA `a337a7eeca12cc34b1972d0d88d31cc974fd416d3bae62fcdbbd878cfb0d7add`。这支持 normal 104、fresh 与 lineage/catalog 边界，但不替代正在运行的最终 31 项新迁移全文件回归。

### 3. 三族旧任务恢复语义与真实证据相符

前端集成文件用隔离 PGlite、真实服务端口、`WorkerSupervisor` 子进程和 local SSE 验证三族；模型端是受控本地协议，不是实际模型或用户数据库。

- `canonical-null-anchors`：升级前已有可结算旧任务；升级后用原任务、原 source 继续 replay，模型请求与 handler 计数不增加，commit body、payload 和被保护行保持一致。
- `null-frozen`：旧 account 来源原先可读，已有结算结果升级后 replay；任务、execution、call/result/message/finish 和冻结 group/version/membership 不重写。
- `canonical-null-conversation`：旧 host admission 原本拒绝，因此升级前没有伪造 settled receipt；升级后原任务 ID 首次合法执行，允许必要的一次模型/工具调用，仍不创建第二任务。

最终前端回归为 4 PASS、0 skip、exit 0，证据 `frontend-recovery-full-final.json` SHA `4c02ff1abc66a400f84acb22ccf0fddf4fa72636dddfb6f216bcb18fd7526621`，日志 SHA `f98491d9da8314ea206a7715f9cf4381beaec940a63758bf1fb6e33fcd10feb2`。三份 raw evidence SHA 分别为：

- `canonical-null-anchors.json`: `ea97eea7f5257413b15e842bdee008f8d46ee07f35566244ba7c9b23ac34a1aa`
- `canonical-null-conversation.json`: `6854c477afcfa06b42299af34adb688bf55c55e1cb0df17ca1f06c98044d59aa`
- `null-frozen.json`: `8d22151595868d1a10f04246d2a202e70fc57b54307345148056f4252476b226`

前端 typecheck exit 0，证据 SHA `1db45727eab5eac5db3c1df5635ec1a2a85aac9d119b7330d3ba9c4f68a2bb45`；原 T1086 四家族未改文件也实际 4 PASS、0 skip，证据 SHA `85876e1bad2ca05f03c0878b1ecc9a55a9bc7cdd63c1880d7f895a798bc57ee9`。

### 4. 锁、取消与反向竞争的聚焦证据

最终 backend test 增加了 source row NOWAIT、真实 `pg_cancel_backend` 取消、失败子事务对旧数据/104 ledger/函数与 trigger 的完整回滚、下一次正常迁移，以及两种反向 group-migration 参数的串行验证。聚焦选择实际 4 PASS（其余 27 filtered）、exit 0，证据 `pg-cancel-multigroup-first.json` SHA `8a87783629cad67e9d2915eaf3bca10bbb8958a03b24f1e25a2b438c91a2ec54`，日志 SHA `5a20bcb512adb3a8a352064b955124342796d86eac3a522041e002af9d5ebaf3`。

该证据证明新增并发族按预期运行；最终同一冻结字节的 31 项全文件回归仍在运行，不能用 filtered run 代替。

## 已完成 Gate 与当前状态

| Gate | 实际状态 |
|---|---|
| Backend typecheck | exit 0，`backend-type-latest.json` SHA `f5de92044cdb03a24937ba1aff43fd76114ad8746b7ca1d0b16ee2ba1b461ab2` |
| Frontend typecheck | exit 0，证据 SHA `1db45727eab5eac5db3c1df5635ec1a2a85aac9d119b7330d3ba9c4f68a2bb45` |
| 现有 migration 回归 | 36 PASS，exit 0 |
| 前端恢复三族 + 原 resolver | 4 PASS、0 skip，exit 0 |
| 新并发/取消聚焦 | 4 PASS、27 filtered，exit 0 |
| boundary scan | exit 0，证据 SHA `062df81dd91cbf5205057e1a9cd91884a42305d136aa73b6ac235abe3a1c3b23` |
| semantic boundary scan | exit 0，证据 SHA `4e253403d596204f431adad440b2f34a6857ebfa220bbe0d4770df30e3e05460` |
| orphan scan | exit 0，证据 SHA `2618dd1ea11f23ac720c9bdae64ed36a810158edfccfee958c93353f9babed1a` |
| 最终 backend 新迁移全文件 31 项 | **运行中，尚无 result JSON，不得声明 PASS** |
| 当前 reconcile | **运行中，尚无结果；若出现既有全局欠债，需按实际归因保留** |

## 最终判断与边界

当前冻结实现与已审 SPEC/DEC 一致，静态审查未发现阻断缺陷；归属证明、迁移原子性、严格 lineage、三族旧任务恢复和重点并发/取消均有对应的实际证据。因此该实现可进入提交冻结与后续最终 Gate，但最终 31 项 backend 全文件结果与 reconcile 未完成前，不能执行 `taskctl complete`，也不能写成全部测试通过。

本报告没有验证安装版、UI、Codex、真实模型、真实用户库或原生交互；也不关闭其他任务及全局既有欠债。后续若目标五文件任一 SHA 变化，本结论需对变化文件重新绑定。
