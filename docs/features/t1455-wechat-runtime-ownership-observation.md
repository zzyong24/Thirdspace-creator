# 核对实际视频号runtime与可见根的归属条件

T1454实际本机验收失败，父home、当前唯一Frame/host与open根都已核实，但runtime原生document精确标签0且association=false。现有合成Wujie对象关系不能代替真实平台关系。父任务已开第三轮研究门，不继续猜测业务修复。

本任务只增加原正常采集SECTION_MISSING诊断的固定机械投影：归属检查首个拒绝条件（固定枚举）、runtime是否有Wujie对象、当前frameElement是否存在；固定官方DOM协议的host data-wujie-id与当前iframe name是否存在/相等、全父document同ID host数与同name iframe数。只返回布尔/计数/null，禁止输出这些ID值、URL、文本、账号信息。官方vendor源码明确host用data-wujie-id，iframe用name，值同sandbox.id；这是待核实的机械关系，不直接作为成功条件。

保留T1454原owned短路计算语义和全部选择/读数/状态/预算不变。额外固定属性和tag查询只用于诊断，抛错留null不得影响业务结果；不打开额外浏览器，不截图，不读profile或凭据。旧失败/清理/观察者抛错守卫不变，仍需同Frame/当前host。只在prepare的typed SECTION_MISSING走原JSON sink，严格独立白名单，不混旧轮快照。尚未执行的门保持not_checked/null。

先跑公共collectNativeReports安全诊断RED/GREEN：合法固定对象出端口，任意URL/正文/未知键拒绝，原错误和物理停止不变；完整微信359族、types/timeout/boundary通过。安装后只发起一次正常同步读取实际元数据；不重放已耗尽的一次截图授权，不以取证完成宣称报表成功。以真实首个拒绝条件及官方DOM协议决定下一步，研究门仍约束后续业务改动。

范围：wechat-browser-source.ts/.test.ts、wechat-dom-witness.ts、wechat-wujie-regression.test.ts；docs/verification/t1455、第三轮研究卡及既有控制面。无服务契约/数据归属/产品方向变化。
