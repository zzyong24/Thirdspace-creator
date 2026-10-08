# T1091 当前验证

公开消息现在能显式选择 Pi/Codex，并把文章、图文、原生剪辑或同脚本联合创作的真实保存目标传入原准备链。目标必须与真实会话项目一致，过期版本/摘要仍由原 owner 拒绝。联合创作仅由 `source:user` 的请求补 `public-request`，不接受客户端确认声明；新候选仍经原用户采纳端口保存。

本轮独立 SPEC `REV:dcd0b932fca7`、六产品与三个新增测试的[实施复核](IMPLEMENTATION_REVIEW.md)均已有实际记录。三组新增测试72例先当场 RED（52 FAIL / 20 PASS），修复后同跑相关用例97 PASS。双端及 contract 类型、boundary、semantic、orphan 实际 exit0。

扩大原 AI/联合创作回归154 PASS / 2 FAIL；两条失败已用旧 main 当场隔离复现为相同2 FAIL，见[基线诊断](CREATION_BASELINE_DIAGNOSIS.md)，登记 T1092。未修改旧断言或生产投影协议。原完整 Worker 两文件8 PASS。服务测试的 prepare assembly、前端测试的模型配置/启动均有明确替身边界，不能冒充真实 Codex 联网。

全部精确源码与日志SHA、argv/cwd/时间/退出码见[evidence.json](evidence.json)。当前新包、真实 Codex、文章/图文/native/联合候选的安装验收以及本轮完整 reconcile 仍待执行。前轮42项全局欠债保留，不代签全仓全绿或父任务的全功能矩阵。

安装版当前正式读取已回读中性项目的保存文章、图文、脚本及 v2/revision7 粗剪工程。原生目标应另建隔离 v3 工程验证，不能把旧 v2 冒称原生。普通浏览器被本地来源保护拒绝的证据保留，未绕过来源守卫，未代签原生点击。原片、已批准S1工程、真实用户稿件、图401、平台任务和凭据保持原有授权边界。
