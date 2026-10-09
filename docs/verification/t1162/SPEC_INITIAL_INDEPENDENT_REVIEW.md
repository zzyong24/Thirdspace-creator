# T1162 注册表当前已批准 route 期望：独立 SPEC 初审

- 评审时间：2026-10-10T03:49:43+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- SPEC SHA-256：`3d0ff53550892fd603704a72a9b0b2d2c9ca557d5f567a7704ac5b5461bf2a2c`
- modules SHA-256：`81871dd46ea33ee4a2135bd09c1f7d6fa077b4938dde65527d4f237e06ffffd2`
- T1074 SPEC SHA-256：`c33f1a6a06bcb5a4782abda16153c0877654f707a733612d3773060e251ed411`
- T1114 SPEC SHA-256：`4099eec59cd87db242acc198e4748dfe6f61673dae2308383000f44001caa103`

## 结论

**PASS（仅允许测试期望校准）。** 五条 route 均已有正式合同、作用域与消费者依据；把它们逐条手写加入严格 registry 期望不会扩大产品白名单。不得自动从 ENDPOINTS 生成名单，也不得删除 extra 断言。

## 五条 route 的已审出处

- `POST /ai/assistant-actions/adopt`、`GET /ai/assistant-actions/receipt`、`POST /canvases/create/adopt`、`POST /canvases/:canvasId/nodes/:nodeId/confirm`：同由 T1074 正式引入。当前 `assistant-system.ts` 的四个严格 endpoint、`workspace-operation-scope.ts` 的 group 作用域、CLI policy 以及 backend assistant action transport 均实际存在；前端系统操作卡有 receipt/adopt/confirm 消费路径。T1074 还明确规定来源由可信 scope 注入、模型不能伪造来源、采用/确认走原 owner 与幂等边界。
- `GET /workbench/tasks/:taskId/model-calls/summary`：T1114 正式引入的 owner-only 只读摘要。当前 `workbench.ts` endpoint 与对应 SPEC 一致，仍为 group 读取，不进入模型任意工具目录，不开放原参数正文。

这些定义不是 T1159 微信移植新造的授权。当前 registry 的 extra failure 表明固定测试清单漏记已经存在的已审合同；校准精确五条 method/path 是合理修复。SPEC 诚实保留 aa7 未实际跑历史 baseline 的边界，也没有把 11PASS/1FAIL写成产品行为退化。

modules 写集只含 `contract/tests/registry.test.ts` 与控制/证据文件；验证包含完整 registry、native report、current WeChat integration 和 contract type。当前范围足以证明固定清单更新且未知 route 继续被拒绝。

## 证据边界

本轮没有执行测试、应用、真人微信、模型或数据库。PASS 只授权测试校准，不代表 T1159、安装、全局 Gate 或 AC-LIVE 通过。
