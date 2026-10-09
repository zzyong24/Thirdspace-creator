# T1116 稿件并发保存回归再次失败的实际诊断

本任务承接用户“有问题建task及时修复”及T1114实际完整对账；43项失败较T1112多LED052与LED027，本任务核LED027。当前没有内层失败日志，不能猜成CAS被破坏，也不能按测试重跑通过宣称修复。

```mermaid
flowchart LR
 A[LED027当场失败] --> B[分段保存原测试日志]
 B --> C[核版本竞争 回滚 或初始化超时]
 C --> D[确认范围 独評 修复]
```

原入口为backend的artifacts.repository.integration.test.ts与artifacts.service.test.ts成功后，frontend的chat-script-patch-card.test.tsx；完整对账仅报告检查返回非零，没有保存是前一段还是后一段失败。T1114没有改这些产品文件和测试，关联原因仍须实际核对。全局1650.020671秒、退出1，日志SHA `1e61e1761593475e5fbf3f867a4390ce15a59c8a344751731196fce48c6a5a71`。

先逐段执行相同原命令并保存输出，不触碰用户稿件或数据库、不删除竞争、回滚、previousVersionId或撤销断言。若需修复产品或验证入口，必须建立精确SPEC与独立复核；没有当场发生的RED/GREEN不得补拍。T1114的只读诊断与这项写入/CAS机制分开验收，原失败保留。

原两段命令逐段实际完成，未改参数或断言：backend90.878815秒、退出0，两文件44PASS/0SKIP，日志SHA256 `9796cb6f6bb00228680b9a4edc831cf90c3d2accb1eeeed18f23bcc2fe2e0655`；frontend1.823580秒、退出0，一文件5PASS/0SKIP，日志SHA256 `96827a9b4bf259442306e005bf654ff9b6d6211f4b3eadefab1a4a7a635a33ad`。两段均未重现内层错误，不能因此称产品修复或反推全局原因。createDb按真实options使用PGlite，未根据两种PG环境变量改数据库；不能把配置差异编作根因。原完整对账LED027失败保留，任务继续待核。
