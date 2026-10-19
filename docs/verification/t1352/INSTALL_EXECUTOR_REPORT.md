# 3b新包本机安装与启动验证

已按Root对T1352的明确安装许可，将精确3b候选安装至 `/Applications/CreatorOS.app`，正常启动并完成至少128.875秒真实观察。当前正式主进程PID9852，Next10259，worker10503；不是以浏览器截图代签原生App。

## 当场安装与退出证据

安装前重新发现并验证当前用户CreatorOS CLI，动态读取operations list/describe。第一次及紧邻quit前第二次都完整列含归档的6组，24次queued/running/pause_requested/cancel_requested查询全部0，没有沿用旧74b的历史零结果。只读查看旧App原生窗口11862，助手输入为空，没有未保存确认/保存中提示；原有HTTP403历史记录未重试或改写。

新App先ditto到同卷 `/Applications/.CreatorOS-T1352-installing-3b0f1471d.app`，此前stage与backup均不存在。主程序、server、tar、signature、Info.plist五项SHA与3b源相等，strict codesign exit0。仅对正式路径发送一次正常AppleEvent quit，返回0；原65175/65560/66120子树全部退出，无force、pkill或重复quit。将旧bundle保为 `/Applications/.CreatorOS-T1352-before-3b0f1471d.app`，暂存App安全rename到正式路径，正式签名和main/tar再次核对后仅正常open一次。

## 完整身份

| 对象 | 完整SHA256或结果 |
|---|---|
| Creator源码commit | `3b0f1471de3bf2f4de371849e29112a35a7ab4b3` |
| App主程序 | `f7f7d2006e7c0f1136d11421af89de32647544b4bda6abc3a7f03dd9a9e1a344` |
| DMG | `6a2f7f8cc100c8c63ea374274e48d41c5e23cd17c088193d0fbbb5e7f9a48d3d` |
| App/生成source/tar/runtime stamp | `6d767f835f1f06739ce2c6a90a9eeec19cc49f97b088f47baf7a28df57ca4baa` |
| runtime server.app主程序 | `5ed0e129e708e36048981aed983f7302b0c18139f5a174e4b8d5fabbacb6d59d` |
| runtime frontend/server.js | `5e0e2dac653770ffd12b68760ca5f659c09e98a2504c19707b70080c2b6ad652` |

源DMG：`/Volumes/T7-MacData/CodexBuilds/t1345-final-20261018-3b0f1471d/source/frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_1.2.0_aarch64.dmg`；唯一下载包：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，二者SHA相等。产品attestation creator=exact3b、binary/DMG实际SHA与canonical manifest、主程序内tar SHA的绑定见上级 `package-artifacts-attempt02/SUMMARY.json`。安装后完整tar→runtime核验31878文件/746链接/5059目录，0缺失、0字节/链接目标差异、0类型差异；聚合SHA `76d45e89e70cc4758b84f5672d5258664a2e69377ec5e0f5b0e8a3e49dc74a6e`。

lsof实际证明PID9852映射正式主程序，正式Next/worker映射本次runtime server路径；runtime stamp=`sha256:6d767f835f1f06739ce2c6a90a9eeec19cc49f97b088f47baf7a28df57ca4baa`，MAIN_PAGE_LOAD_FINISHED、NextReady、解包完成均真实出现。新CLI status为installed/full/connected、pid9852；新包公开回读仍6组且ID集合全等，24次活动查询为0。安装前记录的其余20个runtime进程目前仍全在，未按同名/路径终止它们。

## 原生窗口与真实提示

启动后重新通过CoreGraphics取得PID9852所属window13436，只截该App窗口，PNG `/Volumes/T7-MacData/CodexBuilds/t1345-final-20261018-3b0f1471d/checks/install/native-after-install.png`，SHA `27b257e3b1d7da010beb774912d544a45b479ba1ca1d90a76cce057d2028ea81`。已实际view_image看图：首页、原用户/当前组与真实内容数据正常可见，无阻断或未保存提示；截图未覆盖下方趋势卡，不冒趋势卡原生视觉验收。Root已收到并独立看图。

## 原始采集器错误如实保留

首版全tar采集器在落差异前assert失败，随后保存的差异只有missing=creatoros-clean-policy，0字节/链接目标差异。原因是独立只读采集器 `.lstrip('./')` 将根隐藏文件的点也剥掉；正确raw member是 `./.creatoros-clean-policy`。只修改T7自有只读采集器为“仅移除完整./前缀并保留隐藏点”，实际tar/runtime该文件SHA均为 `f1a94309c7196ae96c1ba5f09c3c829d1efb13011478addda27264d9013a98f4`，未改App/runtime使比较变绿。原assert、错误归一化清单及最终canonical结果分别保留，完整证据在 `runtime-first-collector-failure.json`、`installed-runtime-verification-observed.json`、`installed-runtime-verification-canonical.json`。

## 本阶段写入白名单与保护边界

实际安装写入仅新T7 `checks/install`证据、`/Applications/.CreatorOS-T1352-installing-3b0f1471d.app`暂存、正式App与旧备份的安全rename；正常App启动自行展开对应版本runtime。没有读取或修改业务数据库/正文/登录、激活、模型凭据，没有付费生成、采集、发布、取消或重提任务。正常启动和用户App自己的状态读写不被本报告冒称逐字数据哈希全等，公开组ID集合及保护路径元信息是本次真实证据。

旧App备份完整保留；13个缓存路径逐项仍在；业务Library数据、.creatoros凭据、runtime与原始日志、74b baseline、旧35项清理记录、两轮构建失败/成功现场和最新包全部保留。没有删旧App备份或缓存。后续清理由Root看图与核此报告后另行明确许可，本阶段不执行。

该包为本地ad-hoc签名、未Apple公证；不发布tag/Release或外部放量。主树文档/状态由control另行收尾，本报告只写新T7。
