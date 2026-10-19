# T1187 核对编导前端回归的旧会话替身

用户要求全功能稳定性验证，发现问题及时建task修复。T1186当前原LED020完整串行命令实际15.150848秒exit1：后端3文件274 PASS，前端3文件66 PASS/18 FAIL。18例均在AICopilotContent读取taskControl.current.currentTaskId()处TypeError，旧测试live-chat-session替身仅提供fetch/cancel。原日志SHA91b8de50967a0a5de605e46b299b541bfa46ddfc4ef41d6ea12a330c204a2716，原字节/receipt在docs/verification/t1186；不凭失败数量推断用户端同样故障。

stage4-build维护，先读当前真实live-chat-session与chat-task-control消费者、该测试所有替身创建点和现有覆盖。当场源码另确认组件864行layoutEffect调用acquireLiveChatSession，而旧vi.mock只导出get；仅补方法仍未覆盖完整已知接口。待独立SPEC初审PASS并taskctl start后，唯一写集为frontend/src/features/copilot/ai-copilot-content.test.tsx：默认control与三处真实SDK control各补currentTaskId:()=>null，表示这些旧例未取得持久任务回执；live-chat-session替身另外提供acquireLiveChatSession:()=>()=>{}，明确为测试获取/释放观察的隔离边界，与已有ai-copilot-interactions测试准备一致。不得声称这个空观察替身验证了真实资源释放；真实生命周期由未修改的原公共链独立验证。不修改产品，不新建假任务ID、不隐藏恢复提示，不在组件加入可选调用来绕过真实合同。若涉及其它未明确机制，保日志另建任务/独评，不追随失败顺手改用例。

原20例、全部错误原因、冻结target、strict prepare、按钮/快捷发送、autoSend、真实SDK、Codex不可用零提交与等待状态、原任务恢复断言及重试配置不删除、不skip、不宽松化。补接口只表示该旧替身未持有回执，不能声称验证了真正持久任务恢复。已有真实chat-task-control/live-session测试另运行；若源码已提供有回执状态与释放/重新提交的测试覆盖，原样保留，不用静态null替身替代它。

验收：本文件完整原20例；原LED020完整串行命令，双端类型、boundary/semantic/orphan/diff、相关真实任务控制/会话及恢复公共链。实际已在修改前执行chat-task-control.test.ts、server/ai-runtime/live-chat-session.test.ts、live-chat-session.consumer.test.tsx、ai-copilot-interactions.test.tsx：4文件83 PASS/exit0，11.184484秒，原日志SHA5d9120364d76a783961dd4e89a2b16a9d68127c01c6112864769fc0db804cb88及receipt/源码快照在docs/verification/t1187；这些源无改动时不伪称修改后另跑。保留T1186原LED020失败，不改guard、预算、SDK、reconcile配置或付费模型与平台状态，不执行原用户库/App或第三上传实验。独立实施复核实际diff与receipt；pmem/控制审计/taskctl/main提交仅关闭本测试准备修复，历史canonical27/1及19项审核欠债按原owner保留。未改变产品则不重建同一包。

```mermaid
flowchart LR
 A[编导组件读取真实任务回执] --> B[核真实control接口]
 B --> C[补旧测试替身的缺失方法]
 C --> D[原20例与完整工具链复验]
```
