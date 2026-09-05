# T-915 research.gather_material 独立代码审查

结论：PASS。本轮限定增量未发现必须修复的新增阻断；不代表完整 T-915 验收通过。

审查范围：research-business-adapter、research-runner、research-node 共享纯函数、structured-business-schema、research-material-adoption.service、ai.service 分派及 persistence-client 生产装配。只读核对产品代码，未修改实现、未自行重跑测试。

- 上下文保真：新 prepare 保留原定位、topic、angle、项目高优先素材及原 formatUserMaterialFacet/researchFacets 组装；项目存在时先验证真实归属。未在 prepare 藏入模型或浏览器调用。
- 生成与恢复：生产旧 runGatherMaterial 分支已删除，任务由现有 structured Worker 处理。固定 schema 在有界生成修复中检查清洗后仍有素材，最终投影复用同一 normalizeResearchResult，不把无效对象先保存为候选。调用预算、未知结果和重放继续使用既有持久生成协议，没有新开绕过账本的模型路径。
- 来源诚实：该入口原本没有联网端口。冻结 model_memory，共享清洗保留；新资料标记 sourceType=ai、模型生成未联网核实，不将模型自报 URL 当持久网页证据。
- 采纳事务：锁实际用户/账号任务，检查唯一候选、状态及映射冻结来源；知识、首版、项目关联、采纳键和任务成功共用事务连接。生产知识与关联的所有权读取也使用该事务，不通过全局连接写入。
- 幂等与兼容：同批 title+URL 去重键与旧逻辑一致；未映射旧任务保留 adoptedKeys 恢复。成功重投在任务锁内返回，不重新创建用户已删除的关联或修改已归档知识；无项目任务仍可采纳。新来源元数据是诚实补充，不改变参考资料类型和关联角色。

验证边界：主代理记录的后台 21、Worker 65、真实 fork 4 个测试及类型结果见 research-migration-evidence.json 和对应原始日志；本审查不把这些结果宣称为审查者重新执行。真实供应商、UI 真机、安装包和完整延迟指标仍按原证据保留待验。热点选题链路不属于本次已迁移入口。
