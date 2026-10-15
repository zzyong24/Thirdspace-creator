# T1294 普通构建 fresh 完整10项真实验收

结论：**10PASS / 0FAIL / 0SKIP / 0FLAKY / retry0，77.631秒**。真实唯一新Codex对话完成、持久回复可读；HTTP/持久层/Next关闭ACK完整、测试与关闭均自然exit0。不是诊断bundle，不覆盖之前任何失败；也不签原生App或所有模型/资金能力全验收。

## 准确来源与执行

Main HEAD `6f75509fc715045035559d622c3fc9ffd932e16f`。execution-worker SHA `cd50a5069fafdc67d0825cebea5e6eda6a5a9448428b272a2fbc1d5ec6405233`，status-worker SHA `1de879a6a271b2283cbf2437bd8b1070088141dbb3ff4ede8d0d5a55199aee58`，均为Root普通build，无RPC tap。原正式spec SHA `750561c25396f2946611706619feba54a4eb413af9200336610ab4b9eb71f8d9`。

本代理按明确授权仅运行一次：

```bash
node docs/verification/t1294/run-journey.cjs
```

原runner准备新owned库/媒体/鉴权/缓存根，独占127.0.0.1:64062服务PID1290，原driver 1worker/retry0执行完整10项，最后自行关闭服务。本代理未改正式源/测试/control、未build dist、未操作用户App或用户DB，未恢复/重发旧任务。执行前binding及结束后源4186条/11bundle核对均无变动（条数以FINAL_RESOURCES_AND_SOURCE.json为准）。

## 实际10项

|验收|实际结果|
|---|---|
|fresh官方默认/GET不自动写/四行来源/唯一额度卡|PASS|
|自配与mixed图片重开保留/主动图片同CAS统一|PASS|
|真实CAS冲突/草稿与失败保留/不覆盖并发保存|PASS|
|RedFox模型页保存掩码重开删除/旧深链|PASS|
|向量测试停用/资料创建修订/关键词搜索与错组隔离|PASS|
|常驻充值/原空body connect/未配置诚实错误/零资金新操作|PASS|
|desktop设置与助手/无画布与重复检查横条|PASS|
|narrow设置与助手/无横向溢出/四控可达|PASS|
|原生context CSS640×450、DPR2等效200%|PASS|
|原UI官方→Codex保存后首条新聊天同4ID完成且持久可读|PASS|

每例耗时/geometry在FINAL_CASES.json。等效200%为真实CSS640×450、devicePixelRatio=2、html zoom=1、scrollWidth=640；标题/输入/提交/关闭均ratio1，沿原内部滚动可操作。实际PNG头为1280×900，额外断言通过；并非CSS html zoom截图，也不冒原生系统缩放。

## 唯一新聊天

- group：`grp-49f13d97-256`
- conversation：`ai-conv-49f13d97-288`
- source：`ai-msg-49f13d97-289`
- aiTask：`ai-task-73036f8c-6ba8-4ae2-9839-6076b89a6b18`
- execution：`execution-task-b9dd913b-0d93-42fa-a40a-b56ccbb44565`

公开最终观察`succeeded/errorCode=null`。一次UI提交、一次chat POST、一次200回执，conversation/source/AI/execution四ID完全相同；额外engines请求0，retry/resume0。原测试核execution真实owner/group/account-null及源消息对应的assistant，assistant ID=`chat:ai-msg-49f13d97-289`，持久文本非空且同文可见断言通过。本代理已实际查看完成截图，清晰显示固定fixture回复“连接正常”。服务已正常关闭，未为补额外readback再开库或服务；attempt值未在本次attachment导出，不补推。

## 截图与准确限制

28个PNG文件含附件副本，共14份唯一字节，完整尺寸/SHA在FINAL_RESULT.json。本代理实际查看200%1280×900图和聊天完成1536×1024图；Root也已实际查看默认模型、短高及聊天图。不是仅检查文件存在。

图中Next开发环境“1 Issue”badge原样保留，未删除或重开新聊天规避。只读现有next.log发现末次/accounts后第324行browser console：`[describeUserError] Error: 请先进入此账号组，再查看共享资源。`，栈为ResourceGrantsPanel.check/load（resource-grants-panel.tsx:22:128/34:5），并指开发humanize console输出。独立还有account-null ingestion.douyin.status的AccountRequiredError/428，以及用例主动触发的CAS ConflictError。**badge条目未打开，不能严格断定该badge只对应哪一条，也不能把428凭图当唯一原因或声称console零错误。** 安全有限摘录和原日志SHA在NEXT_DEV_ISSUE_OBSERVATION.json。它不使已通过的10项断言变成未执行，也不证明安装App存在同一开发badge。

本轮不发生真实充值/外部资金、官方付费模型验收，不调用额外真实模型。此前正常bundle fresh聊天拒绝、diagnostic-only成功、8轮旧字节实验的1次status RPC拒绝均独立保留。close生命周期6族POSIX Node通过只证明局部关闭合同，不把这次成功倒推为唯一RPC根因已确认。Windows、打包安装App和用户完整业务项目不由这份浏览器10项代签。

## 退出与保留

`strict-test-exit.json`为code0，`strict-run-result.json` shutdown code0。server-acks依次有http-closed、dispose-reachable(true)、persistence-closed、next-closed，时间04:41:35Z；PID1290已无进程，64062无listener，当前无Playwright临时profile进程。全部测试contexts/browser及owned服务已自然关闭，没有杀用户App。owned库、原日志/截图和ID保留，未删除业务数据。

完整原playwright.json、strict-playwright.log、binding.json、server-acks.json及源/资源复核为准；FINAL_DELIVERY_BINDING.json固定本报告与精确证据SHA。
