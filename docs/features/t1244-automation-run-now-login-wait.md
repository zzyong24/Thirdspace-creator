# T1244 验收自动化立即运行的准入与授权等待

用户要求继续验证自动化全部功能。现有多平台定时任务四个浏览器case全部仅list/禁用/筛选/切组/归档，不调用runNow；既有T1209/1210公共后端链与安装版原任务自然运行的证据不能代签真实浏览器点击立即执行。准确只读诊断和候选见 `docs/verification/t1208/20261011-next-public-runtime-triage.md`、`run-now-no-binding-candidate.md`，后者尚不是已准入测试。

拟验最小合法边界：fresh A组及无真实平台登录绑定的小红书账号，经正式操作创建并先禁用self.metrics作业；在真实UI启用后一次点击立即运行。公开jobRun/AI/execution同一原ID推进到授权等待并如实0；不能把缺授权当采集成功、绕过真实身份或mock自有service。scheduler关闭cron但保手动manual路径，由原prepare→wake→claim→consume走真实无binding SCOPE_MISSING。

当前只写本SPEC及 `docs/verification/t1244/**`，诊断候选独评和准确源码/预算/写集绑定前不新增测试、不启动运行。旧409、旧FAIL、截图和trace保留。后续对正式schema逐项解析，run.status needs_reconnect、AI.status running且runtimeStatus waiting_user、execution.status blocked/runtimeStatus waiting_user/errorCode FLYWHEEL_LOGIN_REQUIRED 是待核当前公开消费者的三个不同状态，不合成“所有任务成功”。

单次真实UIrunNow不自动重发；有限固定观察最多30轮只读（原ID保留），每请求/观察至少120秒，完整外层按准确AST及真实等待串行成本复核。单Next/fresh DB/media/auth、worker1/retry0，桌面/窄窗口真图及公开同ID留证；旧用户任务/凭据/配置不碰。真实平台采集、原生App、Codex及付费模型不在这个授权缺口测试里。

```mermaid
flowchart LR
 A[隔离组新建正式作业] --> B[真实UI一次立即运行]
 B --> C[原run/AI/execution身份]
 C --> D[真实缺绑定授权等待]
 D --> E[扫码指引与真实零计数]
```
