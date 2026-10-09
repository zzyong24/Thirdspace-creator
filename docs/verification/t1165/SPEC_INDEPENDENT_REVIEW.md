# T1165 平台身份拒绝错误 envelope：独立 SPEC 初审

- 评审时间：2026-10-10T04:02:08+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- SPEC SHA-256：`f31799ea20ba4d68356c85783a4eb18899c2c81c3a3cc7f62870f5391f982663`
- modules SHA-256：`ec65d4a6fa114845bed2411c251a3638b6079d7888a8fbd40232806cc5f84603`
- 产品定位 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- actual-refusal SHA-256：`1c2ecfeb1aab3c8de64d8c4e355b16a12bce1f6dbda53da7e491bc5b3be4f615`
- error-context SHA-256：`ccbdd8678d0cbc8153506e88c4498db5c66a6ee35f3d067ba0c749d7503550bd`

## 结论

**PASS（仅授权当前结构化错误链修复）。** 精确增加既有 `SCOPE_MISSING` 到 contract 错误类别并映射原 HTTP 400，是恢复已批准恢复入口所需的最小改动；没有放宽后端权限、真人微信研究、未知错误或 5xx 处理。

## 核对结果

1. **现场失败与静态链一致。** 后端 platform collection service 在缺可信绑定、缺 capability 或授权失效时抛固定 `SCOPE_MISSING`。当前 `dispatchErrorResponse` 只有当 `.code in ERROR_HTTP` 时才返回结构化 envelope；`contract/src/envelope.ts` 未登记该码，因此实际响应退化为 HTTP 400 + 裸字符串。冻结证据确为 `{"error":"此账号需要重新完成平台身份核验"}`，前端自然只能得到 `code=null`。
2. **既有产品语义已经批准。** T1020 明确未受信身份必须拒绝，并以 `SCOPE_MISSING` 引导重新连接。NativeReportPanel 只在固定 code 且非 5xx 时显示“扫码绑定账号”；`FORBIDDEN_ACCOUNT`、网络错误与 503 即使携带同 code 仍走未知结果/核对原 key，不会被本修复冒充身份恢复。
3. **产品写集最小且物理位置正确。** 只改 `contract/src/envelope.ts` 的 ErrorCode/ERROR_HTTP。backend service、dispatch 分支、HttpTransport 与 Panel 运行时无需改动；它们已经分别产生、保留和消费该固定码。HTTP 仍为原 400，未知 code 仍回退裸字符串，数据库冲突、5xx 与其它结构化码保持原行为。
4. **公共链回归足够。** 新 route 测试必须从带 `SCOPE_MISSING` 的真实错误进入 `dispatchErrorResponse`，经 `errorEnvelope` 严格解析，再由 `createHttpTransport` 取得同 status/code/details/message；同时断言 unknown 仍字符串、5xx 不触发扫码。modules 还绑定原 HttpTransport、NativeReportPanel、contract/frontend type 与不改断言的 T1159 Chrome。
5. **安全和研究边界不变。** Chrome 仍使用手工未验证微信账号、真实0报告和零 run/扫码/下载；按钮只是恢复入口，不能把未验证账号变成已授权。真人绑定、同步、模型、用户库、安装与原研究 family 都继续暂停。

## 未代签范围

本轮没有运行测试、Next、真人微信、模型、数据库或安装。PASS 只允许实施并执行正式命令，不代表 T1159/T1161、AC-LIVE、安装或全局 Gate 已通过。
