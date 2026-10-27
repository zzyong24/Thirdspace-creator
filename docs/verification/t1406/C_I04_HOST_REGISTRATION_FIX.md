# C：I-04 正式候选宿主回执版本补修（2026-10-26）

## 已装实机的真实失败保留

`6c7f7dc05701265bc88a961901a509bba7061e83` 已装版本的一次有界真实模型验收未通过 I-04。仅在专用 local 组创建了新合成项目 `project-intake-ca0ad105afd965f540ec2b1dcdbb07d2`，新父 `execution-task-8104f429-1288`、子 `execution-task-8104f429-1297`、业务任务 `ai-task-8104f429-1296`。模型两次调用 brief.fill 的输入均为 `{}`，实际回执却是 error/no_evidence/none。子与业务任务为 partial，父最终 CHILD_PARTIAL/blocked，没有进入 BRIEF_INPUT_REQUIRED 等待补充。候选为0。

只发出一次模型业务准入，没有再补充、重试、新父、直接DB、伪造工具回执或更改原项目。公开DTO不提供原deadline/budget，未以源码推断冒充实机相同。前置work脚本曾有creationMode枚举错误和对DTO groupId字段的错误假定，均保留为脚本失败；首次模型请求发出前已修正，未归为产品缺陷，也未额外创建第二项目。

实际安装失败的安全证据为工作目录顶层 `installed-I04-real-model-summary.json` 及 `post-upgrade/evidence/installed-i04-real-1/`。其FAIL不会因为下面的源码绿测而覆盖。原始通用回执隐藏底层异常；没有读取密钥或解密日志，不能声称实机公开API暴露了原始异常类。

## 源码遗漏与最小修复

正式 `createChatTaskToolHost` 注册 `createChatCandidateTaskToolHost`；此前候选宿主只把 tools 交给 `createChatHostToolAdapter`，漏传原任务已经冻结、reader可以恢复的 `toolFailureReceiptVersion`。适配器只有显式版本1才把 ChatToolUserError 转成 invalid_input；缺标记时保守走 generic no_evidence。空字段的 native guard在读取项目brief之前就抛该错误，不能把这条实际通用错误笼统归为模型凭据或外部frame/evidence不足。

补丁仅让同一次 restore 返回 `{tools, toolFailureReceiptVersion}`，再将原冻结值透传给适配器；执行时的动态resolve仍核原组、原任务、冻结定义。不默认版本1，不把任意 no_evidence 转成输入不足，不追认旧任务或重写旧回执。

旧缺版本任务保持旧协议：工具空输入仍 no_evidence；其旧completion允许文字结束为succeeded，父仍拒绝没有候选的结果并blocked。不能为了让新测试断言partial而给旧任务补版本或改变其完成语义。

## 当场红绿与范围

之前的 terminal 集成直接创建 adapter 并硬传版本1，因此没有覆盖正式候选宿主遗漏。现已替换成真实 `createChatTaskToolHost(createChatHostContextReader(db))`、真实冻结租约、工具预留/执行、检查点和 completion，再由准备父处理。模型供应商回执仍是隔离测试的显式合成输入，不冒称实机模型请求。

1. 生产修复前执行：

```text
cwd: backend
Node25 node_modules/vitest/vitest.mjs run src/modules/ai-runtime/chat-candidate-tool-host.test.ts src/integration/project-preparation-brief-terminal.integration.test.ts --maxWorkers=1
```

`i04-host-registration-red.log`：2文件，5失败9通过。新版本空对象/全空白以及正式宿主完整链真实得到 no_evidence，期望 invalid_input 的断言失败，准确复现注册遗漏。

2. 首轮修后运行的 `i04-host-registration-green.log`：62通过1失败。唯一失败为新增legacy夹具错误期待partial；确认旧completion协议后仅修正该夹具期望，未改生产语义。原日志保留，不补拍为通过。

3. 最后有效命令：

```text
cwd: backend
Node25 node_modules/vitest/vitest.mjs run src/modules/ai-runtime/chat-candidate-tool-host.test.ts src/integration/project-preparation-brief-terminal.integration.test.ts src/modules/projects/project-preparation.service.test.ts --maxWorkers=1
```

`i04-host-registration-green-final.log`：3文件63/63通过，29.41秒。覆盖正式组合宿主的新版本空字段、旧缺版本兼容，真实completion/父等待与一次明确补充，原父deadline/budget/旧子与账本保留、成功只读context、普通读取失败和夹杂其它错误仍阻断。各项隔离测试不与早期重复批次数量相加。

根代理负责后续独立审查、backend types、worker build、boundary及必要回归；本说明不预填其结果。源码尚待新提交、prepare/sign/package、重新安装以及新有界真实模型复验。当前已装6c版本的 I-04 仍FAIL。
