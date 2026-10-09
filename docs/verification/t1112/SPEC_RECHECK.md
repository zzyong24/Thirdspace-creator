# T-1112 SPEC 复审

- 结论：**PASS**
- 当前 SPEC SHA-256：`9fa8157f52977cfe9710524fd72fd22294fd2759dde55a8eeb925ef846655c49`
- 当前 modules.config SHA-256：`da42d8c89503d63c27371aaa4e533340699477df2c0849ee548f427f95dd5cd9`
- Constitution SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`

## REV-001 销账

T-1112 现有精确 `verify_commands`：scope contract与原workbench合同、新PGlite公共组合加原CLI invocation/workbench、原dispatch、contract/backend类型、boundary/semantic/orphan、diff和reconcile。所有Vitest均明确 `retry=0`、无文件并行，test/hook至少120秒；引用的既有测试路径均真实存在。

## REV-002 销账

同一新增PGlite公共组合现明确覆盖：真实空组与归档组成功、旧账号成功、不同user/错误组/非成员拒绝、缺工作区/缺认证拒绝、其余七项仍拒绝。由此直接验证scope转为group后的归档读取与成员边界，无需新增产品路径。

新增事实校准也正确：正式CLI读取本来会记录invocation审计，并可能清理过期结果，因此验收改为“零业务写、保留原审计”。隔离库无过期结果时只允许本次读取审计，不产生写任务；这比笼统声称零数据库写更真实，没有放宽数据归属。

原两项 finding 除 `status` 与 `resolution_evidence` 外字段保持冻结。DEC仅记录既有账号组共享与全面AI工具缺口修复授权，没有扩成原参数诊断合同。

本复审不代签实现、测试GREEN、完整reconcile、安装复验或全局绿色。
