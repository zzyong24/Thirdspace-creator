# T1097 实施与公共 UI 交接

本轮实施的当场红测与后续日志均完整保留，未修改首轮验收结果。实际局部验证：frontend 111 项、backend 167 项、contract 114 项、新来源/采纳 10 项、真实隔离 Pi HTTP 与 ACP 宿主公共 Worker 集成 2 项通过。各组存在交叠，不相加为总覆盖数。

```mermaid
flowchart LR
 U[页面明确身份和资料版本] --> F[原任务冻结上下文]
 F --> C[AI 仅产候选]
 C --> R[原消息和工具账本来源读回]
 R --> H[用户选择元信息及事实]
 H --> B[原 owner 原事务 CAS 保存]
 B --> V[原回执和指定版本读回]
```

公共 UI 新源：frontend/tests/e2e/t1097-assisted-work-candidate-adoption.spec.ts。实际 --list 为 2 个 viewport 用例，尚未启动 body、官方模型或 native App；由 route 在已绑定 fresh candidate 中统一实跑。不能直接用原配置长跑：既有测试 helper 的历史输出必须机械迁到本轮独立证据根，并绑定新源 SHA、原输入、Worker 包、独立数据/Next、owned 端口与清理。每例 18,000,000ms；所有请求、页面默认操作、导航及有限观察至少 120,000ms。外层须覆盖两例原完整串行预算、真实项目 cleanup 槽、启动及清理余量，不以 helper PASS 代签账本。

两例验证真实 article typed_patch 路径：公共上传真实文档、UI 中性身份和精确文件选择、真实按钮 POST、原消息来源、完整候选读回、预览、非空元信息默认保持、editor 事实保持、真实人工采纳及指定版本读回。附原 task/call/tool/digest 与文档 SHA；官方 ledger 验证明确 pending。它们不覆盖联合成员/typed_snapshot/ACK/ABA 全部 UI 场景，其余正式验收仍应逐项运行和保留缺口。

T1062 原文件仅 manual schema 导入和 parse 窄化；三个原 document 断言保留。封存生成树未编辑，由 root 重新生成下一轮 driver。

Worker 第三次公共集成实际 2 PASS，曾使用独占 build 窗口，已释放。post-build binding 诚实标明未记录完整 pre-build source SHA，不能代替最终稳定重包绑定。前端当前类型检查剩封存 generated T1062 三条 union 和 DR006 resolve，未为抹红编辑封存副本；后端相邻 canonical 历史 fixture imports 的类型修复由 root 管理。

读回结构化截断通知已追加真实 host 测试：正文各文件前60000 UTF16，原总长/实际提供长/截断布尔在text之后；短文false，逐文件独立上限。实际完整 backend broad 第四轮167PASS/10files；单筛选1PASS日志仅补充，未将166skip当已跑。新UI v2源 SHA7b1d67a061c10a40e9ad9cf71ecdd8e0f681ea73b9fa3e38eba5a60e705e821e，420k响应观察/300k远程poll和保存观察。
