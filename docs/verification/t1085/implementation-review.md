# T1085 实施独立复核（最终当前字节）

- 基点 HEAD：`3a60fafc4fd299d2a0d2efc403ee6a24691075de`
- 结论：**PASS_IMPLEMENTATION_EVIDENCE**，限 T1085 产品/fixture 写集；不代签安装版、T1086/T1088 或全部聊天功能。
- 方法：只读源码和既有结果，未执行模型/API/DB/App/测试，未修改仓库。

## 当前关键字节

- `ai-worker/src/runtime/chat/chat-pi-loop.ts` `4f26ac95534c041bd042d9d43d24feff13d64092f837c4b1435640eb25aba001`
- `ai-worker/src/execution/chat-worker-run.ts` `969308d2f8a3e5e57134893b5d1a4aaa2e222749bba3562a8382fd35f7dfe5b3`
- `ai-worker/src/runtime/chat/chat-pi-loop.protocol.test.ts` `d2ca99d0afc8510764a75c8eab3dcdb9eb9ca0174aece2cba29aac39df5ce19b`
- `frontend/src/server/chat-read-host.integration.test.ts` `d721e667db94f59e5a8be9e29c251356cc81e7280a617165e7eb2d120d760dc1`
- `frontend/src/server/chat-task-submission.integration.test.ts` `55350e1cc89623996b6b891d5b1788b4d1eddfe60569d8b56534e3b388d90832`
- `backend/src/integration/chat-workbench-plan.integration.test.ts` `bd1fa3b71378a2df66f9c236b2319b73424c9b698ddfed8646ddf8bda234dc25`

产品语义判断沿原独评不变：真实 reservation.input 按 provider call ID 克隆，缺绑定不使用 Pi `{}`；对象键规范化但数组/类型/error/tool 分组严格；原 unknown、durable owner、lease、deadline、checkpoint 不变。

## 最终证据

1. Protocol 当前精确 30/30 PASS、retry 0：`protocol-signature-green-final.json` SHA `44fe18b8c9633fcfb5b8b0565cdd61bc4fdb0acf5cc2672f6595cbe64b033809`；日志 SHA `a15e611baf0841e9da8c548e81c252b32b444a07c4afa26ee2d56290b87031ab`。它取代含后来删除 unused matrix 的第一轮 31 PASS 作为当前协议测试证据，历史 RED 保留。
2. Frontend 三文件精确 23/23 PASS、retry 0、无 skip：`frontend-full-calibration-final.json` SHA `d5101cc7a6fe9993c25371e33fd08bb5e63ad60630c51f45b2247e22c619f97c`；日志 SHA `3d8c5a8d6e362253d6daa546710a5f504150604a2990c7cefc4c29de33191eae`。
3. 该运行后只把两个 fixture 未走到的模型配置解析器从错误 repository 调用改为正式 `createSettingsService(...).getModelConfig`，没有改 T1085 产品链或已通过用例的断言。当前 frontend typecheck exit 0：`frontend-type-final.json` SHA `971e4b11f5bd0413d8d7344fda8f70ce3816674d9d40fc5af83851b221fa1c73`，日志 SHA `4c0cd880abe2a1a1a1f20e2f9d2825951e19ae4e848a3f36d2216d3b9e20d035`。

当前证据关闭此前“30/23/类型待跑”项；T1085 后端计划用例及相邻 T1088 terminal receipt 的最终准入仍按各自记录，不由本报告互相代签。
