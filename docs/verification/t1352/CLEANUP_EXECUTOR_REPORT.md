# 核准旧缓存与旧App备份清理完成

Root已核安装报告、原生窗口与canonical runtime结果后核准精确集合；control也明确释放13项旧缓存。本次只删除classified-plan.json的13项proposedCaches和精确旧App备份，共14项；全部完成，0保留、0扩项。未重复此前T1344已清35项。

删除前逐项身份inode/device与已审清单相等、祖先无symlink；fresh全lsof与进程argv/cwd依赖检查0引用。旧备份main/tar SHA分别为74b的83ac…c22a9与f5ff…ba18，和保留74b原candidate完全一致；原candidate DMG ef1b…a6225f仍在。13路径非嵌套，清理逐项复核身份后使用精确路径，未向任何进程发信号。

## 原始Next trace先迁移保全

只读扫描发现旧.next/trace与trace-build属于待保全原始构建trace。Root追加明确许可后，先将二者原字节复制至下列私有目录：目录0700、文件0600，逐字SHA/尺寸一致且归档不在任何删除集合内，保留原来源、inode/device、uid/gid、mode、mtime/ctime/birthtime映射，再重新检查.next无引用后才清原缓存。原trace没有被丢弃，也未打印内容。

| 原来源 | 保护归档 | 字节 | SHA256 |
|---|---|---:|---|
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/.next/trace` | `/Volumes/T7-MacData/CodexBuilds/t1345-final-20261018-3b0f1471d/checks/cleanup-execution/preserved-old-next-traces/trace` | 31049 | `d43bff566e2b980fe4a9f49b38da550ae5b6a872a207ed361a795ba68847204c` |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/.next/trace-build` | `/Volumes/T7-MacData/CodexBuilds/t1345-final-20261018-3b0f1471d/checks/cleanup-execution/preserved-old-next-traces/trace-build` | 1360 | `67d9ce909c0f4475cca8eb3ba2ec056b949dcfe1fc7f424e7ffb583e6c5e45f6` |

## 精确删除结果

| 路径 | 删除前du归属KiB | 结果 |
|---|---:|---|
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/.next` | 679092 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/node_modules` | 2319876 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/node_modules` | 112 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/backend/node_modules` | 116 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/contract/node_modules` | 40 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/ai-worker/node_modules` | 80 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/mcp-server/node_modules` | 36 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/tmp/node-compile-cache` | 2220 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/src-tauri/target/release-fast/.fingerprint` | 11616 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/src-tauri/target/release-fast/build` | 196268 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/src-tauri/target/release-fast/deps` | 2303844 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/src-tauri/target/release-fast/examples` | 0 | 已不存在；删除前0引用 |
| `/Volumes/T7-MacData/CodexBuilds/t1300-final-20261018-74b03effa-script-bare/source/frontend/src-tauri/target/release-fast/incremental` | 0 | 已不存在；删除前0引用 |
| `/Applications/.CreatorOS-T1352-before-3b0f1471d.app` | 835988 | 已不存在；删除前0引用 |

互不嵌套条目du归属合计6,349,288KiB，约6.055GiB。这不等于实际释放空间。

| df观察卷 | 清理前可用KiB | 清理后可用KiB | 窗口变化KiB / GiB |
|---|---:|---:|---:|
| `/System/Volumes/Data` | 15,693,316 | 16,526,352 | +833,036 / +0.794 |
| `/Volumes/T7-MacData` | 897,747,324 | 903,226,740 | +5,479,416 / +5.226 |

以上为同一清理窗口df变化，可能包含同期磁盘活动；原始df与逐项du在deletion-results.json分开保留，不将du当实际释放量。

## 清理后新包与公开读回

同一正式新App PID9852持续正常运行，正式路径`/Applications/CreatorOS.app/Contents/MacOS/CreatorOS`。CLI重新读取status/access/list/describe与完整账号组列表：installed/full/connected，PID9852，435个公开operation；仍为6组，ID集合全等。未新增测试或反复截图。

- 新App主程序SHA256：`f7f7d2006e7c0f1136d11421af89de32647544b4bda6abc3a7f03dd9a9e1a344`
- 新App tar SHA256：`6d767f835f1f06739ce2c6a90a9eeec19cc49f97b088f47baf7a28df57ca4baa`
- runtime stamp：`sha256:6d767f835f1f06739ce2c6a90a9eeec19cc49f97b088f47baf7a28df57ca4baa`
- 最新Downloads DMG SHA256：`6a2f7f8cc100c8c63ea374274e48d41c5e23cd17c088193d0fbbb5e7f9a48d3d`

其余20个runtime PID仍全在，未被终止。新正式App/最新DMG、新3b source及全证据/failed-target-attempt01、74b原始App/DMG/tar/bundle/日志/source.git、全部runtime与用户Library/.creatoros数据均保留。实际被清的只有上表14条；保护路径存在性和旧candidate/new包SHA复核见原始结果。

安装阶段完整验证与原生图仍见../install/REPORT.md及native-after-install.png；原构建失败、原只读采集器assert与隐藏点归一化更正均保留，不把后续通过覆盖历史事实。

本分工已完成，没有剩余执行或批准等待；报告只写新T7。control可据本报告与FINAL_CLEANUP_RESULT.json关闭T1352，主树状态/文书由control处理。
