# T1106 范围外已有回归与环境结果

受影响前端4文件扩大回归实际75 PASS /3 FAIL；三项为T1022“改写阶段暂时失败保留已有结果”及T744两种“活动任务期间旧稿只读不可误采纳”。将原HEAD d35f7d57 的frontend/contract/backend/ai-worker源码通过git archive复制到独立临时目录，使用相同已安装依赖，按原文件名和T1022/T744运行，实际同名同因3 FAIL /4 PASS（frontend-baseline.log）。未改原产品、旧断言或删测试；T1106受影响历史登录/恢复动作及27项相关测试PASS。旧改写候选状态断言需独立核对，不能用本修复洗绿。

执行 tools/timeout-policy/verify.mjs 真实退出1：静态检查发现已有多处短执行预算；后续动态公共链测试均通过。四个本任务产品文件不在静态失败路径中，未改任何超时或执行预算。既有根因归T1018/T1081及T1101-global-gates；本任务不伪称全仓超时规范全绿。

归档PG首轮使用历史测试角色zyongzhu，但55422已被main集成独立测试服务器使用（路径明确isolated-pg，不是用户库），该服务器角色为creatoros_test。首轮role不存在和两项默认10秒hook超时保留在archive-guard.log；没有停掉其他会话服务器、没有改角色/配置。纠正连接角色、使用180秒全局测试与hook预算，直接运行原Gate的三个文件，最终59 PASS、0 FAIL，结果记录archive-guard-final.log。仅随机测试数据库，未操作用户数据库。自己旧临时PG未成功启动，无需也不得停止他人服务器。
