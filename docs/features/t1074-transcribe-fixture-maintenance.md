# T-1074 当前持久转录协议的五处准确fixture维护

本仓 canonical Task 为 T-1074，来源 Growth/T-210 与 DEC201；历史 Creator T-210 定位多轮访谈完整保留，验证目录 docs/verification/t210 仅按跨仓来源命名。用户既有全部落地及功能验收授权内的测试维护，Root已核准准确合并补丁并独立静态复核，不新开正式review周期、不借历史PASS。

操作者是验证人员，已有原30测试库存、原task/owner/project与现行真实Host协议，带走准确故障注入、正文/版本/账本/原键回读及unknown/fidelity拒绝证据，交后续稳定性回归。失败保存原输出；fixture自身装配错误可仅沿当前公共契约准确修正，生产或业务缺口保FAIL另登记。步骤表测试不替代主入口、安装版或线上UAT。

## 现行依据与准确写集

准入源为Root docs/contracts/T-210-transcribe-fixture-maintenance-proposal.md、t210-root-proposal-review.md、t210-transcribe-fixture-maintenance-proposal.md、t208-final-source.json、t208-root-final-implementation-review.md、t210-merged-fixture-proposal.md及t210-independent-merged-proposal-review.md。实际T208提交5a472fb018609517f8feb17c8adb0c358e1f3bab已满足独占源码交接，不以其UI未完成虚报task complete。唯一代码为 backend/src/modules/ai-runtime/transcribe-runner.test.ts；基准SHA383d94cf7e409de00f8340e834175ab6660164f7fc389f68e19ac5a25323bcbe，准确合并diff20c12c282586d38867e3e9c6f4d8b40ad091572e4a32c5f1787f47caf9211c8c，目标252f58ba1a4a9262dbf7db3ded2739e89a0126dd71ab8a3fcbc54220a7f3fcda。禁止整旧候选覆盖。

| 原编号 | 准确测试维护及批准来源 | 必保反例/恢复 |
| --- | --- | --- |
| #2 | 真实output/version缺master；仅可选createArtifact(master_script)下游故障。既有T018/T030及实际restoreMaster独立事务catch，不反转已保存事实 | output/全部版本不变、零ASR/模型；解除故障原事实恢复一次master；整体Host未知另拒绝 |
| #7 | 实际DouyinNotLoggedInError经真实SourceHost同租约归属检查产生waiting_user。现正式R01/R05及准确端口 | 零等待/付费/正文/steps；缺必需来源端口仍unknown |
| #8 | T357采集逐字稿后处理[0.90,1.10]与距离≤15%、T1070 FR01/02及AC02。同字标点/换行稿合法校正 | 原超阈新增正文独立拒绝；真实完整JSON/两笔settled/保存正文不放宽保真 |
| #10 | T1070 FR02/AC02明确HTTP拒绝保原文；自产localhost401真实reserve/start/settle/rejected | 原键活租约read/prepare同结果、HTTP一次；整个Host裸throw仍unknown |
| #11 | T357/T1070模型缺省的已确认未执行说明；完整后处理protocol+真实null模型冻结原因 | 原文不改/零模型HTTP/原ASRsettled；缺必需protocol仍unknown |

T208新增Worker测试及existingIds/missingProjects完整保留。原#1/#4/#5/#6、partial/public wire/状态/费用/key/期限/重试与全部生产文件不改。新增五unknown/fidelity控制的T210标题为Growth来源，不冒历史Creator T210任务。治理只本任务新增BACKLOG/ID/DEC/module/progress task binding/context与taskctl event；旧对象、summary/stage/链及T208🔨原样。

## 验证与边界

Node25.9.0、pnpm10.32.1、原timeout、maxWorkers=1、retry=0。原失败前件复用T208 final-original30/final-original170的真实同runner383d94cf证据，不补拍成新RED。准确apply前再次核hash和git apply --check；聚焦五fixture及五unknown/fidelity控制、完整runner36槽、原170五文件（T2081/T2105新增分列）及backend typecheck实际执行。静态36槽不预写通过数；首fixtureFAIL与准确装配修正保原件和diff。零真实supplier、其它DB、浏览器、安装、部署、秘密或OS操作；只现合成PGlite与自产loopback服务。

```mermaid
flowchart LR
 A[原库存与真实Host协议] --> B[准确故障和合法模型输入]
 B --> C[正文版本账本及原键回读]
 C --> D[交稳定性回归及后续入口验收]
 B --> E[unknown与非法校正继续拒绝]
```

## 本轮准确工程交付

Root最终独立复核 t210-root-final-implementation-review.md 实核30份证据SHA/0600及唯一runner准确候选，准许仅runner+本SPEC的窄提交与本任务complete。实际聚焦11PASS；完整runner原30为26PASS/4FAIL，原五文件170为166PASS/4FAIL；T208新增1PASS、T1074来源控制5PASS单列，backend typecheck exit0。四个原partial/冷却失败、此前boundary/reconcile原失败如实保留；这里只完成五fixture及五控制的工程维护，不宣称原170全部通过、整体T188或入口/UI/UAT完成。

Growth/T210→Creator/T1074准确映射及历史T210原档案完整保留；T208仍🔨，T213/T214/T215和真实入口/UAT后续未闭环，不在本次提交实施。详细源码及命令/结果见Root docs/build/T-188-validation/completion/t210-final-verification.md/.json和本仓docs/verification/t210。
