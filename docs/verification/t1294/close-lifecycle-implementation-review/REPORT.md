# T1294 close 生命周期独立实施审查

结论：在本轮已审的私有RPC关闭范围内，**未发现阻断性 finding**。生产close在真实child close后完成、重复close join同一Promise、一秒SIGKILL兜底直到管道关闭才撤，符合既有scope。没有把它认定为RPC拒绝根因，也不把Node测试冒普通bundle新聊天完成。

本代理未写此生产候选；只读源码并在独占临时目录执行额外Node假进程，无Codex/模型/用户数据/服务，未build dist。逐源及HEAD绑定见REVIEW.json。

## 实施要点

- protocol第31行在spawn后即注册child close Promise，覆盖先exit/error再显式close的调用顺序；逻辑closed与实际child close分离。
- 第84–88行重复close直接返回同一closing Promise，pending只拒绝/清空一次、先停新请求，不会第二个观察者提前完成。
- 无PID spawn-error等待原child close；自然exit触发既有fail再进入close，也可由后续close join。
- POSIX第98–104行先发原进程组SIGTERM，保原1000ms清理宽限，在真实close后finally撤timer，修正原父exit过早撤兜底的问题。没有缩短120000msRPC预算、原任务deadline或换握手参数。
- 原abort路径仍先执行原onAbort后finally close；关闭中的通知链按既有closed门丢弃，不能靠该通知链观测SIGTERM。新增close本身没有引入新的业务结算/重试/恢复或全局锁。
- 当前closeChild在正常路径只等待退出并清理timer，不透出provider/raw内容；外部原finally仍用Promise.allSettled，不让其清理取代业务根因。既有onFailure/onAbort回调异常策略未被本修复改变，不在这里扩写。

## 额外实际无模型验证

`verify-owned-close.mts`直接导入真实protocol源，spawn唯一owned Node脚本，原request显式120000ms，单族外层观察180000ms；60ms只是fixture确认“尚未完成”的观察间隔，不是执行上限。最终6族均PASS，完整结果在OWNED_NODE_RESULT.json：

|真实族|实际结果|
|---|---|
|SIGTERM后由owned marker确认，等待外部stdin release；重复close对象相同，pending拒绝一次|PASS，约133ms|
|子进程自然exit，fail路径后再close仍join，PID消失|PASS，约141ms|
|无效owned binary触发spawn-error/no PID，close等待实际close|PASS|
|构造前已取消，await close后真实PID消失|PASS|
|ready后取消且忽略SIGTERM，最终SIGKILL，原PID消失|PASS，约1066ms|
|父SIGTERM退出0，孙进程同原组忽略SIGTERM并持stdout；close等原1秒组SIGKILL再完成，两PID均消失|PASS，关闭约1004ms|

最后一族是真实原进程组/继承管道，不是spy kill或自报“已关闭”；它验证了父exit不再过早撤SIGKILL兜底。最终所有记录PID absent、正式源SHA未变、owned临时目录真实移除。此前两个夹具尝试分别存在通知编码/错误signal和closed后通知观察错误，均是夹具控制问题，未产生可用产品RED；记录及失败脚本完整保留在INITIAL_FIXTURE_NOTRUN.json、SECOND_FIXTURE_CONTROL_ERROR.json、failed-fixture-sources，旧临时目录清理在FAILED_FIXTURE_CLEANUP.json。它们不并入6族PASS，也不冒测试历史通过。

## 准确边界

Windows本机未执行。静态实现仍用原taskkill /PID /T /F，辅助进程非零/错误回退child.kill后再await原childClosed；这比只等辅助进程完整，但本轮没有Windows真实进程树证据，不签Windows全验。

同组孙进程管道族通过，不代表主动脱离原进程组、关闭继承管道的任意后代都被本方法枚举清除；也不闭合RequestIO.stop直接SIGKILL producer的另一个owner边界。本任务没有增加这种承诺或新端口，不扩RequestIO/global锁。

Root已报告原新增2族真实RED2FAIL/9PASS→11PASS、相关Worker87PASS及两包类型0；本代理未代为重跑这些Gate。我的实证仅上述额外6族POSIX Node生命周期。8轮旧字节实验的1次status RPC拒绝仍独立保留，不能因关闭修复而洗绿或称唯一根因。后续普通bundle/fresh新聊天公共链由Root授权另跑，结果各自记录。
