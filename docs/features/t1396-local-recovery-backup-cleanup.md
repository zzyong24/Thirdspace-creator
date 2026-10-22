# T-1396 清理启动恢复留下的旧版及数据副本

## 用户授权与范围

2026-10-22，T1395安装及启动、核心数据验收通过后，用户明确授权：「旧版app 以及完整数据 可以清理掉 没关系」。按上下文清理本次诊断与重装创建的旧版App、旧DMG、完整应用备份和数据库副本；当前安装App、正式应用数据、新DMG及诊断验收记录保留。不清其他任务备份，不改产品代码，不停止当前App。

## 精确清理边界

- `/Users/zyongzhu/.creatoros/backups/t1395-20261022-123449/`下：`CreatorOS-before.app`、`CreatorOS-before.dmg`、`app-data`、`db-after-first-start`、`db-migrate-test`、`db-migrate-test-attempt1`、`db-migrate-test-attempt2`、`db-migrate-test-attempt3`。
- `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1394-uiakb8a3/`下：`db-snapshot`、`db-inspect`。
- 项目工件只写本文件、BACKLOG、taskctl事件、pmem生成PROJECT及T1394/T1395报告的清理后状态说明。

## 验收

执行前检查目标均在已确认私有根内、非符号链接，与正式App及数据目录无重叠；记录大小和待删清单。按固定清单删除后确认全部不存在，正式App及数据、新DMG仍存在，当前主页HTTP200。记录逻辑大小与磁盘块占用，不将APFS克隆大小冒充实际释放空间。保留轻量诊断和验收结果。完成后pmem sync、quick只读对账、taskctl complete；历史22ERROR/17WARN如实记录，不触发全量产品测试。

## 执行结果

10个明确目标已删除，合计逻辑大小12.14GiB；不将此数宣称为实际释放空间。主代理与独立代理均核对真实路径边界通过，执行前复核设备/inode及运行进程。删除后10个目标全部不存在，三处受保护路径仍存在且设备/inode未变；PID79835/80033仍运行，主页HTTP200。轻量日志、摘要、截图和验收记录保留；删除清单及结果位于私有目录中的`cleanup-plan.json`、`cleanup-result.json`。

context-plan确认4-build、legacy兼容模式；context-compile因缺task binding失败，按AGENTS回退本SPEC与任务行。无源码变更，不扩大到产品测试或其他任务备份。

pmem sync成功；quick只读对账退出1，仍为既有22ERROR/17WARN（历史审核记录及看板体量），无本次新增，未宣称全绿；full未运行。
