# T1126 安装版粗剪导出确认路由诊断

用户要求全面功能验收，有问题及时建task修复。main d712130f 新包无备份安装、签名/镜像及65项旧数据回读成功。对原中性组grp-58776bff-101、project-58776bff-104、已采纳output-58776bff-119 revision7提交一次本地8.16秒粗剪导出（原素材6.76秒起，network deny），返回ai-task-69d4c1de-317；等待真实awaiting_confirmation，未执行成功。

公开动态describe ai.tasks.confirm为write/apply，显式同组同原task调用实际HTTP409，消息confirm not implemented for resultType execution_manifest。这不能证明视频导出实现不存在：该结果可能应由execution.tasks.confirm通过公开结果读回的真实执行ID确认。此前execution.tasks.list按project/kind只列旧任务，没有此新父映射，原因仍未确认。先核公开结果读取、真实ID/owner关系和正确操作；不猜exec前缀，不塞旧账号，不改schema/权限/状态，不重新提交导出或模型。仅正确入口验证完成后才能分类caller或product root cause。若发现产品/API或提示词缺口，先写精确SPEC并独评再实现，保原409，公共完整导出/回读及原素材/工程不变证据。

原提交、等待、确认描述/失败及输入都在本轮私有t1117验收目录，元数据见本任务verification；不复制正文/令牌入Git。本任务未修产品、不签导出PASS。当前新App公开连接正常；原生页面是否正常待用户当场回复；已退出包装冻结期后继续功能验收，后续修复另经提交再构建。

## 当场诊断结论

独立只读复核确认Caller选择错误，不是产品导出缺失。execution.tasks.get用原AI任务ID读回原生任务及真实8.16秒video.render清单；execution.tasks.confirm同ID成功采纳。原ai.tasks.confirm 409及最初UNKNOWN记录保留。最终完整公共链成功、原工程不变及媒体metadata回读见docs/verification/t1126/CURRENT_VALIDATION.md。本任务不修改产品或宣称独立视频解码/原生首页人工验收。
