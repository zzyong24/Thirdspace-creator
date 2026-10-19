# T1339 本地受控验证结果

缺失实测维度不再被当作0相减：唯一calibration.service.ts按同key两侧有限数值计算，保真实0、原dimensions优先和四位小数。新结果、旧结果DTO及概览KPI/行/原因共用可比数据；无可比pair跳过反馈，完整pair阈值/首次幂等/best-effort不变。未接通T1336 no-op。

修改前真实公共RED：三组人工partial/zero/empty先真实创建并完成manual回执，1用例17个目标断言失败。原失败、终态库、原ID和0600测试应用key完整保留。修改后同公开链2PASS：新库正常写入，另一case只开本轮RED库、同原ID读overview/携原真实runId重放；旧rubric/version/prediction/result/ingestion五类领域行逐字值与JSON hash全等，旧raw坏deviation未回写，DTO/概览只读投影纠正，反馈0增。该全等不外推省略runId的重放（原completeRun会更新completedAt）。

必要校准回归5文件57PASS、0FAIL/0SKIP；新增有限数值/明确0/缺值/非数值/非finite/优先级/四位小数、无pair反馈与完整pair反馈失败保护均通过。完整前后端类型各一次0，精确共享R同阶段稳定源/测试；C统一diff/timeout/boundary/orphan/semantic五命令0，输入零漂移。没有重复T1337模型或回归。

公共GREEN两个PGlite均真实DISPOSED；57回归进程实际退出，所有输入before/after零漂移，无残留进程组。全程0AI/execution/model call/fork/fetch公共事实，不冒真实供应商或平台指标。DB/key均未复制。源/依赖读窗已RELEASE，服务/test稳定。全局reconcile与最终新完整包实际UI验收未在本回执发生；C负责最终对账/clean类型/打包，不在此taskcomplete。

本GREEN工作树除B唯一校准service外，含Root已审R1338 Moments requestRows合法修正，差异按原RED→当前SHA精确单列；不冒原7f1二进制或全源码只改一文件。
