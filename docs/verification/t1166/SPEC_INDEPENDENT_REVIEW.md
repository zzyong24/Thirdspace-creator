# T1166 报告旅程外层预算：独立 SPEC 初审

- 评审时间：2026-10-10T04:05:19+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- SPEC SHA-256：`c03ef6783200d4f311a7dd391ef2775fb4e97c72e5765d7f22f6bed202e9a326`
- modules SHA-256：`27af86a79a033c6e5a5ab9bdcca953549dacef0b9c0dadd2a39d9a5dcb60cfea`
- timeout policy SHA-256：`94385308b37926c3f1b81cf3c8bf0533983025bfc539cac7c914770c112604cf`

## 结论

**PASS（仅预算与源冻结清单校准）。** 新旅程确为两个账号、三个视口及两次身份拒绝串行，当前 case 1500秒和 runner 3300秒不能机械覆盖每个既有120秒观察点的完整最坏路径。把本 case 提至25200秒、runner提至26400秒，符合 LED-053“外层覆盖内层串行、启动与清理”的要求。

该变更不缩短或修改任何内层120秒观察，不增加retry，不改产品、公共响应、断言或持久任务30分钟期限，也不会续期、重发或延迟取消。预算只是上限，不能当等待时长或成功证据。runner 的源冻结清单新增 T1165 的 contract/envelope 与 route.test 是必要的共享增量绑定，不改原56路径 manifest 或历史证据。

modules 精确限制为新 E2E case、runner与控制证据，验证包含 runner语法、真实完整公共Chrome、timeout-policy原入口与diff。SPEC诚实注明首轮52秒失败来自T1165错误码，不把静态预算风险冒充已发生超时。

本轮未运行 Chrome、Next、测试、模型、数据库或真人微信；PASS不代表旅程、T1159、安装或全局Gate已通过。
