# T1215 采集登录说明回归核对

本轮backend6文件54例52PASS2FAIL，原scheduled-collection-runner.test.ts两例等待「设置 → 账户」「扫码登录」，实际固定说明为「账号管理」对应平台「扫码绑定」。本轮未改runner产品或原测试。保docs/verification/t1212/backend-regression.log，先e5c原树基线、来源用户确认/词表及实际扫码入口，再独评精确夹具范围；不降低needs_reconnect/0计数/错误收口断言，不以假入口恢复旧字符串洗绿。BUILD诊断，当前无产品写集。
