# T-1394 本机启动失败诊断（2026-10-22）

> 后续状态：T1395已完成重装恢复启动；2026-10-22用户明确授权清理备份后，T1396已删除本报告目录下的`db-snapshot`及`db-inspect`。以下保全记录为诊断当时事实；轻量诊断证据仍保留，正式数据未删除。见[清理结果](../features/t1396-local-recovery-backup-cleanup.md)。

结论：数据库已由10/21开发验证升级到0139，但本机现成桌面包仍停在0137/0138。旧程序按迁移保护规则拒绝打开新版本数据库，重试五分钟后显示启动失败。已保全原库，未发现本次故障源于数据库损坏的证据；本轮诊断完成，启动尚未恢复。

```mermaid
flowchart LR
 A[10月21日开发验证使用已装库] --> B[数据库升级至0139]
 C[旧桌面包仅支持0137或0138] --> D[不认识0139升级记录]
 B --> D
 D --> E[保留原库并报启动失败]
 E --> F[从当前源码重建匹配App后验收]
```

## 已核事实

|对象|实际证据|
|---|---|
|故障日志|`sidecar-2026-10-22.log.enc`，405696字节，SHA256 `e3c648c90fd7d0e93e29c4f7fe5975379bfd01a7058d2328f1dfd6dc3fc99c78`。用项目原Rust `logging.rs` 与 `creatoros-logdec.rs` 在私有临时Cargo工程离线构建解密；明文不入库。|
|首错与超时|北京时间12:12:38.669：`CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN: 未知hash/时间或未来迁移，原库保留`；12:17:36.253宿主软看门狗超时。服务12:12:35.894已监听，12:12:36.088有`SIDECAR_STARTUP_VERIFIED`，因此首因在数据库迁移检查。|
|实际启动版本|PID43682来自`frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app`，二进制mtime10/16；子进程44242监听64736。该包迁移journal111项，最高0137；runtime的tar stamp与该旧包一致。|
|系统安装版本|`/Applications/CreatorOS.app`二进制mtime10/19，journal112项，最高0138。两App均显示1.2.0且bundle ID相同，均通过`codesign --verify --deep --strict`，为ad-hoc签名。两包迁移资产差异仅0138 SQL及主journal。|
|数据库实际水位|正常退出旧App并确认父/子进程均消失后，用APFS clone保全冷快照，再从另一副本执行`BEGIN READ ONLY`读取账本：共117条，最高when=1791043200012、hash=`74c2288c5ae979c5f84820181602708c182da3a0408faac181ce7a25009e22a8`，精确匹配0139。|
|错配来源|`docs/verification/t1382/final.md:164–168`记录10/21 13:14–13:42开发验证以`PGLITE_DATA_DIR=已装库`启动，并明确0139已执行；:204明确当时未验证已装1.2.0兼容。此证据解释此次版本落后，不归咎于用户数据损坏。|
|当前源码兼容检查|源码HEAD `5763199619968a3c342205d97d23a9efe59dc138`。在`db-inspect`副本只读事务中调用真实`inspectMigrationConvergence`，结果`ok=true, converged=true, needsUpgrade=false, historyCount=117`。该`needsUpgrade`是收敛检查字段，不代表无需执行后续0140，也不代替整包验证。|

源码依据：`backend/src/migration-convergence.ts`中的`assertKnownPrefixes`按hash与时间精确检查已知身份；`backend/src/db.ts`迁移失败分支关闭连接、保留原库，不隔离重建。当前源码已经登记0139/0140。单实例逻辑会聚焦既有同bundle ID进程，所以只重复双击另一份App也不能证明切换版本。

## 保全与恢复路径

私有证据目录：`/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1394-uiakb8a3`，权限0700。其中`db-snapshot`为冷快照、`db-inspect`仅供副本检查，另有原密文快照及本地解密结果。该目录不入Git，原数据库目录未改名、清空、回滚或改写迁移记录。本轮只正常退出失败的旧App，未删除App或缓存。

在`/Applications`、Downloads、当前target及本地索引范围未找到支持0139的现成App；Downloads的DMG为10/19旧产物。正确恢复方式是使用当前源码和既有签名构建链生成新包，先用副本验证，再安装并验证真实启动。既有入口为`pnpm -C frontend desktop:package-local`，只构建时设`CREATOROS_LOCAL_SKIP_INSTALL=1`；默认入口会安装和启动。不能删除0139回执、放松已知身份校验或把数据库退回旧结构。

本次用户请求为排查，未扩为完整重打包/安装，未执行原库0140迁移，未宣称新App或用户主流程已通过。

## 本轮验收和限度

日志首错、包内迁移资源、真实账本、历史操作记录四项互相印证；独立只读代理复核包资产与来源。当前源码的迁移前检查在用户库副本上通过。诊断没有产品源码变更，TDD/frontend/contract/e2e不适用；这不等于启动已恢复。

`pmem sync`成功；`reconcile --profile quick --read-only`退出1，22ERROR/17WARN，与T1386已有记录一致（过期评审收据及看板体积等），没有本任务对应错误。full未运行。任务包编译真实失败：新任务无task binding；按AGENTS回退读取任务行及SPEC，不伪造包或审核证据。
