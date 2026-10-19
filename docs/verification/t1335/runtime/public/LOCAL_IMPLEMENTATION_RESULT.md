# T1335 本地实现与受控公共验收

唯一生产改动位于 `backend/src/modules/ai/agentic-proposal-staging.service.ts`：先核记录及 canonical 的可选内部 callId 归属，再仅比较 type/toolCallId/toolName/input 四个原协议字段。旧记录缺省 callId 仍兼容；显式 foreign/null/非字符串拒绝。精确 tools[input.toolCallId]、工具ID、证据、URL、顺序、范围及事务门均保留。

本次修改前公共 RED 自然 exit1/58.889s：真实 record.callId 等于当前 model.id，canonical 不含该内部字段，四个协议字段逐字相等而整体对象不等；原 commit 被拒绝后，原 awaiting_confirmation 硬断言失败。RED、原始 snapshot 与错误均冻结保留。

同一公开夹具 GREEN 自然 exit0/41.107s、1PASS：原 AI ai-task-c4ed9a64-7 / execution exec_5ca3b9f4-6923-419a-aac3-a39054daa6eb，1 model 与2 tools全部 settled，无错误。正式候选进入 awaiting_confirmation，真实确认后 succeeded，落1条知识和1个revision；原 sourceMetadata/证据/来源及正文读回断言通过。重复确认后知识与版本逐字相同，未新增。host STOPPED、persistence DISPOSED；4个登记PID实际消失，完整输入前后0漂移。

这是实际公共服务、自然worker、Host、账本与采纳链的受控结果。外部CLI和HTTP为合成I/O，真实供应商调用0；不宣称真实模型可见性或新完整包已通过。原T1334诊断的5次拒绝中，仅前4次由Debugger取得同一中文错误/栈，第5次只有ConflictError安全事实，原证据不改。

R独立边界结果：原60项 RED为53PASS、6目标FAIL、1 foreign-evidence夹具FK失败；该夹具窄修后，同60项GREEN全部通过（16staging+34native+10Pi），86.224s、清理及漂移均通过。R完整backend类型检查0/51.098s；B完整frontend类型检查0/68.603s。C的4静态门全部exit0，知识合同knowledge.test.ts 8PASS；历史100warnings/0errors如实保留。既有123worker/contract分列继承，不重复计数。R/C原件由各自冻结索引管理。

B公开运行已正常清理并RELEASE读窗，生产/测试/依赖0W；本报告与轻索引封存后RO。任务整体完成与最终包真实collect/material/research仍由C/Root按新包绑定推进，不重开旧UNKNOWN，不续跑原root。
