# 本地包构建与只读完整性核验

最终冻结源码：`3b0f1471de3bf2f4de371849e29112a35a7ab4b3`，source/tree仍干净。五任务最终Gate由Root读取并授权后，本分工只调用固定 `desktop:package-local`，显式 `CREATOROS_LOCAL_SKIP_INSTALL=1`，未安装、退出或删除任何App。

## 构建真实结果

首次run 225.202秒exit1：复制的Rust缓存保留已删除旧13dd权限路径。原日志、错误、metadata及中间产物全部保留；原target同卷原样移入本根 `failed-target-attempt01`，未改产品、测试或构建脚本，未恢复旧13dd路径或造symlink。

Root授权仅再生缓存后，attempt02从全新target以完全相同固定入口执行，446.663秒exit0，未超时；Cargo自然返回release-fast Finished，最终App/DMG生成并显式跳过安装。没有重复45项不变基本测试，之前4文件45项PASS证据仍有效。两轮日志及result独立保存。

## 安装候选身份

| 对象 | 精确结果 |
|---|---|
| DMG源路径 | `/Volumes/T7-MacData/CodexBuilds/t1345-final-20261018-3b0f1471d/source/frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_1.2.0_aarch64.dmg` |
| 唯一下载包 | `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg` |
| DMG字节 | 847034558 |
| DMG SHA256 | `6a2f7f8cc100c8c63ea374274e48d41c5e23cd17c088193d0fbbb5e7f9a48d3d` |
| App路径 | `/Volumes/T7-MacData/CodexBuilds/t1345-final-20261018-3b0f1471d/source/frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app` |
| App主程序SHA256 | `f7f7d2006e7c0f1136d11421af89de32647544b4bda6abc3a7f03dd9a9e1a344` |
| sidecar.tar.gz SHA256 | `6d767f835f1f06739ce2c6a90a9eeec19cc49f97b088f47baf7a28df57ca4baa` |
| sidecar/frontend/server.js SHA256 | `5e0e2dac653770ffd12b68760ca5f659c09e98a2504c19707b70080c2b6ad652` |

构建source tar与包内tar SHA相等，tar内server.js与生成目录server.js SHA相等；主二进制含canonical ProductManifest与本次tar SHA；release attestation的creator commit exact3b、binary SHA与DMG SHA均与实际读取一致。Downloads与source DMG SHA相等。

## 真实读核

- 原App `codesign --verify --deep --strict` exit0，arm64，Identifier=`cloud.aitongban.creatoros`，版本1.2.0，实际ad-hoc签名。没有Apple Developer ID签名或公证，manifest明确notarized=false。
- 新DMG `hdiutil verify` exit0。仅readonly/nobrowse/noautoopen挂载；挂载内App再次严格codesign通过，与source App的8个文件/链接记录全等，聚合SHA `328aa958cc1b299eafd3c87c5e3db35fa9bde42ca9fb963fa665529d21098ead`；已正常detach。
- source仍exact3b且status空。原App尚未退出或替换，新App尚未启动，因此不冒已安装、原生UI或120秒启动观察通过。
- 本机包不发GitHub Release、tag、push、外部下载或生产配置；attestation claimEnabled=false/publishAuthorized=false，growth/activity release commit未绑定，不用于正式三仓发布。

完整证据：`package-build-attempt02.log`、`package-build-attempt02-start.json`、`package-build-attempt02-result.json`、`attempt02-environment-preflight.json`、`package-artifacts-attempt02/SUMMARY.json`与该目录commands/逐命令stdout/stderr。首次失败证据与`PACKAGE_BUILD_FAILURE.md`原样保留，不把后续成功覆盖历史FAIL。

本包已完成build及产物读核，交Root审核后再单独交接本机安装。安装前须重新公开检查活动任务、确认原生未保存提示，正常quit仅正式App并核其子树退出，同卷暂存/备份替换，再正常启动至少120秒与真实PID/runtime stamp/窗口实图核验。清单只是后续方案，此处没有执行。
