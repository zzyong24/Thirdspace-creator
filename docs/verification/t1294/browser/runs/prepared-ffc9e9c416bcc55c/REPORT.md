# T1294 冷启动首条聊天诊断（仅诊断bundle）

本轮 **1PASS / retry0 / 69.616秒 / runner自然exit0**。只运行正式spec grep“唯一新本地Codex对话”一例，经真实UI官方→Codex保存后即时发送首个新聊天。没有另建额外对话、没有重试/恢复原失败。fresh owned库与Root新服务92329/59136，marker/UID/listening已核；执行前binding所有源与bundle匹配。

**不能作为normal/release验收**：本轮execution-worker bundle `035a0e999e0334d67d5aba7252089035a89e53d13abc6e7ff99d716ea57d00a2` 含Root安全tap。成功不证明诊断代码对时序毫无影响，不推导间歇失败已解决，也不覆盖前一fresh正常bundle失败。只说明本次冷启动诊断环境未复现“首轮必失败”。RPC tap固定字段由Root独立读取，本代理没有导出RPC帧/provider原文或读取凭据。

原始ID：

- group `grp-0d74a350-5`
- conversation `ai-conv-0d74a350-37`
- source `ai-msg-0d74a350-38`
- aiTask `ai-task-60ed9491-7807-4e2f-b359-0d42dea5bc9b`
- execution `execution-task-6de13595-e5e8-4487-97d3-da01f5e405f9`

一次UI提交、一次chat POST、一次200回执，四ID完全一致；engines额外请求0、retry/resume0。正式测试的同execution owner/group/account-null、最终`succeeded`、源消息绑定、持久assistant和页面可读断言全通过。测试结束再用原公开只读接口核同execution：`attempt=1/status=succeeded/errorCode=null`；owner为原aiTask、group原值、accountId=null；源user消息存在，assistant ID精确为`chat:ai-msg-0d74a350-38`，modelMetadata.sourceMessageId对应原source，持久文本长度4，精确为fixture预期“连接正常”。详见public-final-readback.json。

已实际查看`codex-original-task-readable-complete.png`，页面显示这条固定测试输入与“连接正常”，不是只检查图片存在。全部截图尺寸/哈希在DIAGNOSTIC_RESULT.json。

原命令、test SHA、起止时间和退出码在DIAGNOSTIC_PROCESS.json，原log/Playwright JSON保留。本代理生产/测试/control写0，没有打开用户App、读用户DB或执行资金操作。

Runner92587/Worker92601已自然退出，随后ps无对应PID，原Playwright关闭全部测试contexts/browser。Root服务92329仍由Root管理，本代理未关闭；结束已立即通知Root。旧正常bundle失败、两个布局失败与后续布局通过证据均各自保留，不能跨bundle合成全绿。
