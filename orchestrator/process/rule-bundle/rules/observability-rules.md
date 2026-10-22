# Observability Rules（运行日志与可支持性）

日志是每个运行系统的基础设施，不是出错后临时补的调试输出。适用于 API、页面服务、后台任务、
定时任务、队列消费者和外部集成适配器。

## 最低合同

- 每次请求由服务端生成不受来访者控制的“参考编号”；响应头或安全错误体返回同一编号。
- 正常完成、业务处理前被安全门拒绝、未捕获异常都写结构化完成日志；异步任务继续传递同一编号。
- 最低字段为 `timestamp,level,event,service,environment,reference_id,method,route,status,duration_ms,error_class?`。
  `route` 只记模板；未知路径用固定标签，禁止记录 query/body。
- 接入 OpenTelemetry 时使用标准 `trace_id/span_id/trace_flags` 关联，不把外部 `traceparent` 直接当可信身份。
- 日志字段使用 allowlist。禁止 Cookie、Authorization、密码、验证码、激活码/充值码、支付资料、
  模型 Key、完整个人信息、原始异常 message/stack、上游响应体；换行和控制字符必须清洗。
- 规格写清保留窗口、访问角色、告警和删除策略；敏感业务的生产日志访问需审计。

## 交付证据

- `PRODUCT_SPEC` 有可支持性 NFR；`SERVICE_CONTRACT` 声明参考编号、字段、脱敏与异步传播；
  `TEST_PLAN` 覆盖早退、404/405/校验失败、未捕获异常、异步传播和负向泄密。
- BUILD 证明格式器在真实运行入口启用，而不只测试一个孤立 formatter。
- SHIP 必须在生产或生产等价环境制造一个安全失败，从响应取得参考编号，再反查到唯一日志事件；
  同时证明用户输入和秘密不在日志中。没有这条回执，不得宣称日志系统可用。

界面只称“参考编号”。工程错误码和实现术语保留在日志/诊断元数据，不直接交给用户理解。

## 标准依据

- [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)：结构化日志字段与 trace 关联。
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)：跨服务传播格式及外部输入的安全注意事项。
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)：安全事件、字段清洗、敏感数据排除与日志注入防护。
- [GOV.UK Error message](https://design-system.service.gov.uk/components/error-message/) 与
  [Writing for GOV.UK](https://www.gov.uk/guidance/content-design/writing-for-gov-uk)：错误说明和普通语言原则。
