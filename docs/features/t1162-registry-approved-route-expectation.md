# T1162 校准注册表测试缺失的当前已注册操作

T1159当前contract原组合12例真实11PASS/1FAIL（exit1、3.913414秒，原日志SHA f7f0a4d64348030e5beeb98bf922eae01232ca06b98d483bc04ab02ec6d84b81）。原registry严格断言多出5route：POST /ai/assistant-actions/adopt、GET /ai/assistant-actions/receipt、POST /canvases/create/adopt、POST /canvases/:canvasId/nodes/:nodeId/confirm、GET /workbench/tasks/:taskId/model-calls/summary。新native报告及当前3例已通过；源移植对registry只加1条微信报告，5条缺失也存在main aa7原测试字节，未执行aa7历史baseline，不虚构历史FAIL。

先核这5个当前ENDPOINTS实际定义、backend消费者与现有已审功能SPEC/用户范围；独立审核认可它们属于已实现公开合同后，只在contract/tests/registry.test.ts手写固定method/path与准确出处。不得从ENDPOINTS自动生成白名单、删除extra断言、允许任意路由、改产品/旧规范假造授权，未知route仍原拒。精确写集仅原registry.test.ts、任务SPEC/review/当前证据与真实控制事件。若实际缺少已审授权，不实施白名单修复，登记实际授权/实现差距。

原11PASS/1FAIL就是本任务当场RED，已有日志和源SHA保留；审核后原registry/本次native严格DTO/current group保护原组合及contract type实际GREEN才完成局部整改；完整canonical原债务不代签、真人/App/模型均不触发。代码源码行为不变，无新页面。
