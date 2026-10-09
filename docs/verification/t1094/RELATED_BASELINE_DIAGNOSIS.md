# T1096 相关旧测试基线诊断

本记录只核事实，不修改原断言、fixtures、门卫或运行时代码。用户要求全面验证、缺口及时处理；正式修复需先完成对应 SPEC 与独立评审。

T1094 扩大回归仍有文章九条与 ai.task-execution 六条失败。用 detached HEAD `77003717de03a141d16b7af6301ab6cfe4635564` 的原产品和测试、符号链接到相同依赖、相同 Vitest 参数作独立对照：文章 9 FAIL/9 PASS；任务 6 FAIL/13 PASS。测试名称与当前失败逐项相同，比较 `same=true`，不声称所有根因都已排除。

文章九条失败均在寻找已按用户“脚本联合生成、右侧编导微调”方向移除的旧“根据脚本扩写文章”按钮处停止；其中手写保存、正文/标题保护等后续断言尚未执行，不能据缺按钮就宣称这些行为正确。不能为洗绿恢复用户明确删除的快速转换或多余入口，也不能未评审就删除旧业务断言。

六条任务旧用例在正式父资料归属校验处拒绝“父资料已归组或不可写”；必须核当前账号组归属和测试父项初始化，再决定 fixture 或真实服务缺口。不能把 owner 校验改为恒真、绕过归属或把失败结果转换成功。

原始证据：`t1094/article-original-770037-baseline.json/.log`、`task-execution-original-770037-baseline.json/.log`、`gate-2.json/.log`、`gate-3.json/.log`、`old-related-test-comparison.json`（SHA256 e11af88b63867dc4b67b28e6cbd11e56e9cada6360bf8fe92e6a30b516070326）。前端与后端正式 Gate 仍 exit 1，T1094 不据此标完整完成。
