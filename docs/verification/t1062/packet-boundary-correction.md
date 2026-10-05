# 任务包路径声明补正

2026-10-05：用户已明确授权整合原生工作台/Skill/来源包；前一串行来源候选的1739路径清单覆盖了reference-editors、WorkBuddy脚本及两项已有Windows worker脚本，但T-1062初始模块Packet未列这些物理来源前缀。本次明确补入，与源台账和候选before/after SHA一致；不回溯声称旧Packet已经验证这些路径。串行过程中只有一个产品写者，主会话仅控制面/来源证据。

另修三条既有非法声明：T1021的Next[projectId]只读路径改为其项目路由只读目录前缀（冲突检测更保守，无新增产品写权）；T1003审核写集只列有限1/2/3轮路径；T1019 helper只读glob改为实际service/test两文件。保留原safe-pattern校验及全部门卫，不修改实现或删除失败。
