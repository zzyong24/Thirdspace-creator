# T1183 实施与实际验证

只校准 `frontend/src/server/ingestion/douyin-cdp.test.ts` 首次成功用例的固定默认导航预算及旁注，从 60000 改为 120000；消费者已采用两分钟执行预算。原 144 个用例、重试次数、退避、原错误透传和人工 60000ms 错误文本均保留。没有产品、SDK、配置或执行预算变更。当前文件 SHA 见 SOURCE_INPUTS.json；精确两行 diff 见 IMPLEMENTATION.diff.gz。

原 LED018 完整串行命令实际 154 PASS/1 FAIL、exit1，Rust 后段未执行；原日志及收据保留。独立初审实际在编辑前完成，但第一次正式登记因为我把独立报告复制到工具管理路径而 exit1；当时仍进行了第一次编辑与检查，不能声称正式登记在那次编辑之前。第一轮检查真实 exit0，保留原收据，不用它补造前置 Gate。随后恢复两行到原始内容并确认 diff 为空，第二次登记因不支持的 reviewctl 文件名仍 exit1，第三次采用支持的 `.T-1183.review.md` 路径实际登记 PASS，才重新应用同样两行修改。所有拒绝、start、首轮及合法登记后的复验原始日志均保存。

正式登记后重跑原完整命令实际 exit0、6.640042 秒：前端 155 PASS，Rust `windows_` 17 PASS（259 filtered，6 条编译警告）。这只是当前源树回归，不代表 Windows 安装或原生客户端验收。前端类型、boundary、semantic、orphan 和 diff 检查实际 exit0；boundary 保留既有 5 条基线，orphan 保留既有 100 条警告。

timeout-policy 原公共入口当场执行 30.225977 秒、exit1：公共回归组通过，静态扫描仍 27 条失败，冻结于 TIMEOUT_STATIC_ACTUAL.json。按既有 T1081/T1066-timeout-policy/T1101-global-gates 保留，不删除检查、缩短预算或把失败签成 PASS。所有本轮 argv、退出码、时间和原日志 SHA 汇总于 CURRENT_CHECKS.json。

完整 canonical 在未编辑这两测试的 b34447aa 上实际 exit1、27 ERROR/1 WARN，1158.662260 秒；原输出冻结于 ../t1015/current-20261010/，不能用本项新的局部 PASS 改写旧完整输出。此处没有重跑未变的其它全局检查，也没有签全功能、真实模型、真实平台、安装 App 或上传列表刷新通过。T1181/T1182 的研究暂停和未解决结果保持。

待独立实施复核及收尾 pmem/taskctl 后仅完成本测试契约校准，整体稳定性验收仍未完成。
