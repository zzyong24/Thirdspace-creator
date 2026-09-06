# T-915 网页搜索配置归属收敛

搜索配置解析器及原测试从 frontend 移到 backend 的 ai-runtime 模块。原入口使用后端导出，旧文件删除；渠道、web.search、search.default、环境配置、免费浏览器默认值的解析顺序保持一致。移除原解析文件中没有消费者的 SearchConfigError，执行工厂自己的同名异常保留。

```mermaid
flowchart LR
  F[原网页入口] --> R[后端统一解析器]
  W[Worker 私有请求：网页调用 ID] --> G[后端核验当前父调用与归属]
  G --> C[受信配置读取回调]
  C --> V[再次核验租约、输入与取消]
  V --> P[仅向 Worker 返回配置]
```

新增命名端口 resolveChatWebReadSearch，仅接收 callId，后端从真实父调用恢复账号上下文。读取配置前后都走 admission 校验，并比较网页 URL 与输入摘要；配置读取在数据库锁外。取消时不返回凭据，未装配或读取失败时明确报错，不冒充未配置。配置不会写入任务、调用账本或网页证据。

## 当场验证

- [红测](chat-web-read-search-config-red.log)：新增服务方法尚未实现时，2 项配置行为用例失败、34 项跳过。
- [后端回归](chat-web-read-search-config-green.log)：45 项 / 2 文件通过，包含迁移后的全部解析器测试、私有配置返回、跨父调用、伪造输入、取消、未装配与读取异常。
- [原网页入口回归](chat-web-read-search-config-frontend-green.log)：3 项通过，使用隔离 PGlite 与临时 LocalFS。
- backend、contract、ai-worker、frontend 类型检查均退出 0。首次 backend 检查发现正则捕获索引可能为空，增加捕获存在检查后通过；不改变合法环境引用解析。
- 独立只读复核确认解析顺序、前后端依赖方向及凭据返回边界。测试凭据是明确 fixture；这不证明实际 Worker、模型请求或日志的完整链路隔离，也不代表商业搜索供应商已验收。
- boundary：既有 5 项、无新增；orphan：0 errors / 100 warnings。已执行 pmem sync；[全局 reconcile](chat-web-read-search-config-reconcile.log) 仍为 211 errors / 1 warning，与前基线一致，未通过。不将局部通过作为整项验收。

该端口尚待 Worker 搜索器与生产装配接入，chat.web-read 能力未开启。仍需接通会话资源、启动恢复和真实父子进程链路；T-915 全入口迁移、旧路径退役、性能与双平台验收均继续保留。
