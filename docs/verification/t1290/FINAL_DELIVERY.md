# 本地main合并、安装包交付和空间清理结果

本轮用户要求的物料交付已完成：CreatorOS原15个worktree提交均可达本地main；14个非主工作树已移除，当前只保留主目录。Growth关联改动已在自身main bbf225eb2aa73a9c8ae0f9b925289f3ec79f2bdf，保留这个main检查点，不清理其它Growth工作树。未推送或部署。

## 可安装产物

- 路径：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`
- 版本：1.2.0，macOS Apple Silicon；本地ad-hoc，未Apple公证。
- 源码commit：`30cd8f68e6d7c539b3bd01d4e90d5f695526f86b`；打包冻结后没有修改生产源码。交付/清理/状态记录提交晚于该commit，不能冒安装包已从后续文档commit重建。
- 大小：850565272字节。
- SHA-256：`b6d276adc5f8f91ea9be6e20197af1018c994d17b3ac13fcb5175d87c75f4f24`。
- 固定入口 `pnpm -C frontend desktop:package-local` 退出0；现有 `CREATOROS_LOCAL_SKIP_INSTALL=1` 跳过自动覆盖本机应用，由用户安装验收。
- `hdiutil verify` 退出0，真实只读挂载包内App、codesign deep/strict验证退出0，应用标识与1.2.0准确；包内二进制SHA与本次attestation一致，attestation Creator源码commit与冻结一致；挂载已卸载。

## 验证和真实限制

打包四项基础测试45 PASS；完整contract79文件519 PASS；原三迁移文件在独占真实PostgreSQL完整76 PASS（31/28/17，无skip/retry，node与PG0且PID/socket/listener完全关闭）；最终Copilot原文件61 PASS和frontend类型0，四包类型0；正式PGlite15/PG18公共迁移负族及并发通过，native715源码和七产物一致、86测试380断言通过。详细绑定和原始失败均保留。

本次不是全功能验收签字。原全frontend失败、全backend中止exit130、Growth旧全量失败、T1291旧额外验证器库存差异保持。全局reconcile现场32 ERROR/0 WARN，跨越T1286新审核期间的旧receipt失效已由新审核be715ef3b46d及当前review audit确认不再列该问题；原32项日志未改写，其余归因登记T1292。用户之前已明确暂不授权原生App自动化、缺六份历史素材可以跳过；当前未执行App操作/真启动、真人模型、资金或服务器上线。关联Growth服务代码未部署，新官方模型来源全链须待服务器相应接线验收，不能把本地包完成称为线上功能放量。

## 清理与恢复

清理前实际空闲36428488704字节，清理后99509792768字节；同一`shutil.disk_usage`测量实际释放63081304064字节，约**58.75 GiB**。逻辑82GiB不是释放量。

唯一未提交/ignored证据1977份及原历史夹具已保留（额外约2081662985字节），65份同相对路径Main副本逐SHA一致。Git外备份根`.worktree-preservation/t1290`权限0700，W机器身份副本0600/32字节且未进Git。8树正常git worktree remove、2树工具归档，另外4树工具多次queued但未确认完成，先建立`codex/t1290-preserved-*`可恢复Git快照，再使用已授权清理移除；unit原dirty两JSON及两trace保持可恢复。完整记录在cleanup-inventory；用户真实媒体、数据库、激活和主目录源码未重置，当前包保留。

原App/功能验收留在T1278、T1207、T1246，不冒该物料任务已签UI旅程。任务状态只能通过taskctl，原T1288用普通文本evidence的完成尝试被程序拒绝，状态未更改。

## 后续安装授权

用户随后明确要求安装并打开；T1293已完成正式路径安装、签名/二进制匹配和本次真实主页面加载确认，旧App暂存已清理，未重置数据或激活。详见[安装报告](../t1293/REPORT.md)。此前T1290未安装/未启动的记录保留其当时语义，当前安装结果以T1293为准，全功能仍由用户验收。
