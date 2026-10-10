# T1187 独立SPEC初审

结论：**PASS，限最终明确的两个接口测试替身范围；findings=[]。** 未执行测试、服务、CLI、DB或模型，未修改仓库/任务/消费者，也未建立tool-owned相邻正式review文件。

当前SPEC SHA256 `e963ea787b3487cd36a0160541d14e90c039425aa1d376e207eb577acd7c0801`，constitution SHA256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。唯一待改测试 `frontend/src/features/copilot/ai-copilot-content.test.tsx` SHA `8f360dd063260dba9700c4c58b3364c141c3ba3e5a007bd4fbea8b7f48cf3f36`，仍与HEAD及SOURCE_BEFORE逐字相等。阶段stage4-build；本initial packet不代替根代理随后正式record/start。

独立核到四处control建立点：默认mock约80行，以及真实SDK三例525/552/573行；每处仅fetch/cancel。该文件没有x-execution-task-id回执header。真实createChatTaskControl已有currentTaskId方法，初始/未取得回执为null；原两例实际测试同轮HTTP503仍保execution-original，新submit清旧回执。四处明确补null不造任务ID、不回退真实接口，也不意味着验证了有回执的持久任务恢复；既有source-message/conversation header与恢复原消息来源是另一个真实标识，原断言必须保留。

组件4行真实import acquire、864行layoutEffect取得并返回cleanup；旧module mock只导出get。仅补currentTaskId的初读范围确实不完整，不能无条件批准。最终SPEC已在正式记录前明确补该已知缺口：module mock导出acquireLiveChatSession:()=>()=>{}，与当前ai-copilot-interactions.test.tsx的已有测试隔离边界相同。此替身不访问真实全局会话map、不更改fake live的conversationId/epoch/sourceEngines/transport，不改变冻结target或重接body；空cleanup不能声称验证真实观察/清理。真实观察者数量、回收、切组/卸载、迟到metadata、显式停止和原任务恢复由未改的实际consumer/session公共链另证。

写集仅此测试，精确四个null方法与一个module mock导出。保原20例、strict prepare等待与保存UNKNOWN零发送、按钮/快捷/autoSend、服务器source恢复、旧会话/附件/引擎/冻结稿、Codex不可用零提交与就绪仅一次发送，以及真实SDK、重试预算和全部原断言。不得删/skip/放宽原断言，不能把产品改成optional currentTaskId/acquire或吞掉其生命周期。若实施后不同机制暴露，保原错误另task/独评。

原LED020 receipt/gzip与N原件逐字相等，log SHA `91b8de50967a0a5de605e46b299b541bfa46ddfc4ef41d6ea12a330c204a2716`；实际exit1/15.150848秒，后端274PASS、前端66PASS/18FAIL，错误为缺currentTaskId。新增acquire缺口是源码确定事实，不伪称原日志已执行到该layoutEffect错误。

当前真实任务control、session、实际consumer、interactions四文件原receipt实际11.184484秒exit0/83PASS；log SHA `5d9120364d76a783961dd4e89a2b16a9d68127c01c6112864769fc0db804cb88`，私有原log/receipt与归档逐字匹配，源码快照与HEAD当前相等。独立实读实际session与consumer：原组件observers挂载1/卸载0、账号组隔离、真实回执metadata关联/错误未知ID不保护、同任务有限重接、成功解除保护与停止/迟到响应，均非空acquire替身。此83PASS是**编辑前基线**，不声称修改后重跑或真实模型/native验证。

后续仍须原20例和LED020完整串行、双端类型、boundary/semantic/orphan/diff及独立实施复核。原LED020失败、canonical27 ERROR/1 WARN/exit1、19项旧审核欠债及各owner保留；研究仍暂停、2/2耗尽、剩余0。不预签实施GREEN、完整Gate、任务完成、安装版/native/付费模型/平台/全功能或研究恢复。全部实际读路径及SHA详见READ_SET。
