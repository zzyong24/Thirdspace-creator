# T-1320：恢复Codex混合工具流投影

## 已知事实与未定因边界
当前新包0e1dc6228的T1315原chat824/execution-task-e80980cf-825持续运行，只有user823/steps空；公共events404、summary calls=[]不代表没有真实模型/tool call。原sidecar安全投影见T1316本轮runs，已见部分tool_settled/tool_projection_appended及HOST_PORT_REJECTED/ConflictError，但具体首port/中文断言尚待白名单核对；不得称原825首因已证，更不将continuous attempt>3当调度错误。

源码可达混流假设：chat-tool-stream-projection.service.ts ensureInputs(:75–100)对native的initial仅纳入kind=tool，而savedInputs取同root的全部tool-input-*；chat-tool-stream-chunks.ts ensureExternalToolCard(:54–69)为Host external_tool none已写同root输入，随后ordinary worker原wrapper complete→project可能误拒“工具输入卡与模型回执不符”。这是待完整受控链验证的假设，不是已执行RED。

## 最小合同与边界
仅普通与Host混合输入投影的完整可信账本归属核验：按原root/call/toolCallId/operationKey/可信冻结定义/参数digest与顺序建立可验证的全局输入流，保原普通节点投影与Host none早投影、Host proposal仅终态投影。不能仅过滤掉savedInputs而忽略未知已存input，不能把全部external_tool盲加入initial令proposal提前显示；不能吞projection冲突、改ledger/receipt/费用/usage/租约/fence/UNKNOWN/来源/权限/期限/重入授权。恢复只读原thread不增turn；原最终external-chat-turn成功commit的ordinary唯一input/output和proposal deferred政策不变。

生产W仅 backend/src/modules/execution/chat-tool-stream-projection.service.ts。chat-tool-stream-chunks.ts、external-chat-turn.service.ts等只读；若确须修改额外源，先精确delta独审，不能临场扩大。

## 必须先发生的完整RED
新owned隔离数据库，以真实公开chat创建/submit→真实prepare/dispatcher/immutable execution worker/SDK native JSON-RPC协议（仅外部供应商边界替身），同turn先调用system.features真实Host none结算/早投影，后调用topic.generate真实ordinary worker节点，子模型完整合法usage/receipt结算，再经execution-chat-tool-ports真实wrapper投影直至root终态。system host复用assistant-system-root真实工具定义/版本/source封印，不mock complete/project/ledger或spy写流冒完整链。捕首中文throw、root/两类call/全流前后、结果/DOM若存在、完整before源码/测试/config/worker SHA与自然exit。基线若未复现该假设，保事实并回报，不按猜测改产品；不改原825/旧库/旧任务、不新真模型。

## GREEN与保护族
修后同完整混流根任务succeeded，普通候选可读且所有原input/output卡准确，不丢Host none结果。反序、多次交错、Host proposal在worker前/后都仅原合法终态出现；同receipt重复幂等不重卡，原thread只读恢复不新turn，toolCallId/callId/root/digest/参数/顺序篡改、陌生已存输入仍拒。真实最终external-chat-turn commit必须通过，不能只孤立ensureInputs helper绿。普通topic-only完整对照可精确引用已绑定受控证据，实际不同字节或未覆盖处补测，不把原缺usage族混成此次有效RED。跨user/group/account、取消/fence/unknown/费用与原freeze门保留。后续新包真实混合聊天另验；受控协议不冒真实供应商或原现场已修。

## 精确测试与执行
新增W frontend/src/server/__module_integration__/mixed-codex-tool-stream.persistence-client.test.ts；自有docs/verification/t1320/runtime/**、IMPLEMENTATION_RESULT.md及acceptance/**、REPORT.md。其它相关tests只读复用/参考，禁止旧fixture beforeAll build dist。真实immutable execution-worker.cjs在/private/tmp/t1300-artifact-940jy2at/sidecar/frontend/runtime，5618216B/SHA3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454；外部protocol替身为owned loopback，不访问用户DB/凭据。独立config显式include唯一test，cache仅own runtime，不merge原include。正执行/观察最短120s保长值，hook180s、完整test3600000ms、外层86400s覆盖串行/清理；不缩原持久任务deadline/重发unknown。

用户全功能修复原授权与Root本轮裁决覆盖，当前仅待审，产品不START。B独评、真实reviewctl PASS及supported lease/packet后，R唯一生产writer一次完成前RED→最小实现→GREEN/Gates/报告；异常新范围停报，正常步骤无需重复求确认。固定timeout-policy Gate由C最后独占一次，五包缓存实际记录，各任务仅引用适用原结果；其余type/boundary/semantic和本链受控回归依准确命令实做。最终pmem/reconcile/taskctl真实收尾，不洗父矩阵/旧FAIL/29旧债，不签整体全绿。
