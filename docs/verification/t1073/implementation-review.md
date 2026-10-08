# 实现独立复核

2026-10-08，只读评审代理 `resource_spec_review` 使用与主实现不同的 `gpt-5.6-sol`，按已审SPEC核对真实源码、测试、当场日志及公共消费者。下表记录评审当场返回的结论，不替代主整合验证或正式安装版验收。

| 最终候选 | 独立结论 | 当场独立复跑 |
| --- | --- | --- |
| Worker `7081ba6b8911ecaece9f9212a8b115082d08c7ee` | FR-001/002无阻断；与先审版本源码/测试相同，amend只增加原日志gzip/SHA及可读空白规整；准确最终SHA已复核 | Worker83、supervisor16、私有契约7通过，全路径diff检查通过 |
| 前端 `ce5d89d88f4c3433b9579dea800c4c6f2a8e5db2` | FR-005/006/007、预览无阻断；两项FR-004 major经真实消费者回归销账，最终SHA、干净工作树及唯一commit已核对 | 首版106；停止补充3文件70通过；最终121/121当场日志与36份原始gzip/SHA核对，全路径diff通过 |
| 后台 `54a2e8c9074f3afd6a7752f7d67ecada0eac1746` | FR-008及取消/停止归属无阻断，最终SHA未漂移 | 调度/心跳39、根dispose/旧browser/聊天协议7通过 |
| 主响应流 `chat-execution-stream.ts` | pull背压、只取消订阅、旧错误/审批/DONE兼容无阻断；新增metadata只来自当前页真实状态，SDK深合并保留旧字段 | 初版13+后端流7通过；结构化状态先RED7fail、GREEN20通过的日志与源码核对；主追加running→succeeded/finish字段保留21通过 |

第一项major：无审批卡的waiting_user只留下text/error，卸载后可能被当闲置。修复用SDK既有metadata及本轮真实响应头原任务ID关联；waiting_user/unknown_result/paused受保护，终态、无回执或错ID不误保护；迟到状态留在原scope，同原任务成功后可释放。

第二项major：显式停止接受cancel_requested后中断SSE，旧metadata.running可能永久保护。修复只在原active turn的取消被服务端接受后释放本地关联，不写cancelled、不删除服务端原任务；失败保留原流。组件捕获原session.chat，停止pending按原session/turn归属，旧回执不能清掉或停止新turn、新scope。独立实际Copilot/SDK复跑70通过，最终候选两源码和回归与所审版本一致。

全局34错误/1告警、后端12条历史测试类型错误和浏览器像素缺项均需保留真实限制，未被本评审改成PASS。主整合已执行实际持久事件→响应流→SDK→缓存链23项（含cancel_requested与原lease确认cancelled分离），根服务/流28项及生命周期301项通过；适用门结果见REPORT与最终对账。

最终整合追加复核（2026-10-08）：HEAD a3d9db286a52b825c77eec29abb55e7618d23b84，主响应流源码/测试仍为主线程未提交改动。独立只读评审再次实际运行23/23通过（11.37秒，test/hook120秒、retry0），确认最后两例真实串联隔离PGlite的enqueue/claim/ledger/事件读写与订阅、chatExecutionResponse、DefaultChatTransport、SDK Chat和live-chat-session。无审批waiting_user在卸载及100scope压力后受保护，原任务succeeded后释放；真实command schema和tasks.command返回cancel_requested，仅释放本地控制及SSE，最终cancelled由原workerId/attempt的acknowledgeControl产生。无新建任务和伪造终态。生命周期脚本静态逐项覆盖FR-001..008，无新增阻断；脚本只设置单测/hook预算，没有整组watchdog，不能由此声称全套有总执行上限。

日志保护追加复核：backend组开始前Buffer快照，原测试仍实际生成/解析/断言内存回执；子进程退出后打印并还原。测试非零、spawn或读写错误仍非零，历史两文件SHA与HEAD一致。评审提示探针失败未写文件时可能仍是旧字节；主线程把非零/异常路径标签改为“失败后文件快照（可能仍是旧证据，不视为新观测）”，不修改测试、计数或通过条件，最终reconcile执行该标签版本。
