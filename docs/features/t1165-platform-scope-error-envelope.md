# T1165 保留平台身份拒绝的结构化错误与扫码恢复入口

T1159 当前真实 Chrome 首轮 exit1、52.602101 秒，原后台诊断明确 code=SCOPE_MISSING，但 trace 实际 HTTP400 body={"error":"此账号需要重新完成平台身份核验"}。客户端只能取得 code=null，页面显示普通身份错误，没有“扫码绑定账号”恢复按钮。失败记录、原截图和实际响应见 docs/verification/t1165/original-browser-failure；私有原 trace 保留。前三个视频号窗口的入口/刷新/返回、展开管理和取消转组已实际走过，但整轮失败，不签 T1159 或 T1161 完成。

根因是 contract/src/envelope.ts 的 ErrorCode/ERROR_HTTP 未登记既有平台 SCOPE_MISSING；正式 dispatchErrorResponse 只为已登记码保留结构化 envelope，其它回退字符串。原 T1020-service-contract-review 明确未受信身份必须拒绝并引导重连，NativeReportPanel 已按该固定码恢复，mock 测试绕过了实际 dispatch。不能凭中文消息猜扫码状态，不能给任意未知错误伪造身份恢复。

阶段为4-build维护修复，复用已批准错误语义和既有恢复按钮，无新产品方向/IA/数据归属。精确产品写集仅 contract/src/envelope.ts：新增 SCOPE_MISSING 枚举并映射原真实400，沿用既有统一dispatch和HttpTransport，不变后端权限、HTTP状态、未知错误回退或5xx未知结果。测试写集仅 frontend/src/app/api/v1/dispatch/route.test.ts：新增真实dispatchErrorResponse→errorEnvelope严格解析→createHttpTransport完整公共错误链回归；保原route测试。T1159原Chrome测试无需改变任何断言或响应，即是现场RED与GREEN验证。

先独立SPEC审查，再登记start。新增回归先在未改产品时实际RED；映射补齐后原route/http-transport/native-report-panel全部测试、contract/frontend类型和原完整Chrome旅程通过才签局部修复。断言原400、真实code/details/message、unknown仍string、5xx仍非扫码；Chrome保持真实手工未验证账号、0报告、无run/扫码/下载副作用，完整响应不route替换、0retry、原120秒与外层预算。依T1159原研究暂停，任何真人微信、模型、原用户库和安装启动不触发。

控制与证据写集仅任务SPEC/review/当前证据，BACKLOG、modules、DECISION_LOG与真实事件、生成PROJECT。本任务不修改原validator、source manifest或历史PASS；T1159 current-input审查仍指原冻结范围，本任务增量单独记真实最终SHA。扫码按钮复用既有oil-ui-pro规范，没有新的视觉方向。
