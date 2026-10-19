# T1060：临时直接命名空间实验的只读范围复核

## 结论

未发现需要停止本次隔离实验的安全阻止点。当前实验不等于生产修复。尚缺实际有效配置命名空间逐项一致的强校验，不能宣称已有这一证据。

本 Agent 没有执行模型、探针、测试、安装或浏览器，也未改共享仓库。以下只审查 `/tmp/t1060-ai-direct-namespace` 的代码差异，真实输出留待主会话归档。

## 实际核对

- `diff -qr` 确认临时 `adapter/src` 与生产 `ai-worker/vendor/codex-acp/src` 只有 `CreatorOsPolicy.ts` 不同。政策名改为独立 probe 名，没有假装生产 v1 原封不动支持联合表。
- 联合表只允许 `enabled=false` 和直接命名空间列表；仅 `image_gen` 及固定任务名格式可进入，未知联合表键拒绝。图片回合不含 MCP 时合法列表只有 `image_gen`；MCP 回合为该任务命名空间和 `image_gen` 两项。
- `mergeCreatorOsMcpConfig` 将输入声明列表与本次 requested MCP 名称清洗后的命名空间集合精确比较；局部显式关闭无前缀特性，当前短、唯一任务名的清洗与固定上游实现一致。
- `probe-host.mts` 的其他逻辑复用原宿主。临时入口、政策名、联合配置及前缀开关外，原配置读取、登录核对、全局 MCP 禁用列表、协议版本、ReadOnly、原审批、网络关闭、ACP fs=false/terminal=false、默认权限拒绝均保留。
- MCP probe 服务只公开 `t1060_read_verification_project`，backend fixture port 只接受该 tool 名，返回固定只读标记，不触及用户数据库。一次审批仅限当前 session、真实 MCP 审批标记及 allow_once 选项；其它请求取消。其范围成立依赖于原 native 发现清单核验确实只允许这个唯一工具，本次代码保留该核验。
- 图片 probe 复用原图片队列，将文件保存到 `/tmp` 并返回模拟素材提交收据。这能测试真实原生图片到队列的链路，不能证明生产 backend 落库、用户素材采用、UI 或发布完成。
- 两 probe 沿原 `waitForSessionUpdatesIdle` 和图片 `flush` 排空，没有新任务编排、协议实现或宽泛授权。

## 待补的证据精度

临时 `CreatorOsPolicy.ts` 的 `assertCreatorOsConfigResponse` 继续调用 `checkFixedConfig`。后者验证联合表形状和名称格式，但**没有比较 native 回显中的列表与 policy.config 中本回合声明的列表相等**。输入 MCP merge 的精确比较不等于实际 `config/read` 回显一致。

当前固定隔离调用没有发现另一个活跃工具面，因此这不是本次已发生的权限扩张证据；但如要声称“实际有效配置精确匹配本回合命名空间”，应在 `/tmp` 校验 native 回显与声明集合相等，或归档过滤凭据后的实际对应字段。不要用现有形状校验成功冒称已有逐项核验。

本轮查看时 `rg --files` 未列出所述 direct-namespace 日志，故本回执没有模型工具/图片成功 verdict。
