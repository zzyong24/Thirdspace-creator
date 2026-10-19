# T-1251 当场验证结果

真实原文件完整 22 例最后一轮 22 PASS / 0 FAIL / 0 SKIP，exit 0，Vitest 子进程 62.669 秒、含准备与清理的 wrapper 63.313 秒，retry 0。10 例叶 catch 测试原 7 FAIL 后实际 10 PASS；叶测试与整链是不同文件，不把重复整链次数累加。

原 18 PASS / 4 FAIL 与日志作用域修正轮 19 PASS / 3 FAIL 完整保留。作用域错误是新增观察 finally 读 try 内 requests，移至同 case 外作用域后实际再次完整运行。没有修改生产分类器、生成策略、call budget 或旧任务状态。

实际 HTTP 最后消息：badOutput 为 partial（5 请求、31 token），diagnosisEmpty 为 partial（3 请求、17 token），均含 transient 与恢复文案、不含真实候选；正式 conversation_reply、UI 恢复文案与原终态合同一致。混合恢复 succeeded（6 请求、38 token），原 3 个已结算模型事实不变、实际最后消息含真实开场卡。

新增有限生成从合法业务 owner 和公开 persistent enqueue 创建，出生冻结 180 秒期限；真实 Worker 发起一次受控 HTTP 后，注入 clock 越过原期限，原任务 failed / EXECUTION_DEADLINE、原调用 unknown，无自动重发和正式候选写入，原 ID、budget、deadline 不变。它是 generic model.structured 期限验证，不能签为不存在的有限 chat.submit 参数或 AI 业务正式成功链。

运行结束源码绑定一致、stdout close、owned process group 无残留、本轮隔离目录清理完成。受控 HTTP、独立 Worker 与 PGlite 都实际运行；官方账户模型、已安装原生 App 和全系统功能验收不在本报告通过范围。

完整证据见 [WHOLE22_FINAL_ACTUAL.json](WHOLE22_FINAL_ACTUAL.json)；原始 JSON、stdout 与退出/源绑定在 execution/whole-stage1-95103e8e94b4990e2b8a9da2fd9f0847。
