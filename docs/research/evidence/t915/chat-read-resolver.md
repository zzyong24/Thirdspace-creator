# T-915：冻结只读工具解析与共享绑定

新增 createChatReadToolResolver，经真实宿主 reader 检查当前执行租约、业务与源消息绑定，再用 reader 返回的账号建立闭包。只恢复 modelInput.tools 中已审计的 19 类短读取；全量比较工具名称、版本、effect、参数和描述。不会按当前配置扩大工具集，不在父进程执行搜索或模型工具。

```mermaid
flowchart LR
 A[当前执行租约] --> B[任务原上下文与 Skill]
 B --> C[只重建冻结名单中的短读取]
 C --> D[授权与调用账本]
 D --> E[调用时读取当前账号业务数据]
```

chat-runner 的 18 个 context 读取绑定与产品说明校验提成共享函数，旧装配和新 resolver 复用。恢复时不读取整套 CreativeContext、不解析模型凭据；只有工具实际调用才访问领域读端口。模型传入项目 ID 不能覆盖任务绑定，项目检索默认排除原项目，封面参考模式保留 publication view；guide 从原 snapshot 验证并捕获正文。

前置红测为新 resolver 模块不存在，1 fail / 19 pass。后续覆盖真实 PGlite 提交与租约、账号、旧 fence、取消信号、工具版本/参数变化；项目与 publication 变体用派生 reader fixture 单独验证，不冒充真实项目库。对象复制阻止后续修改改变闭包。旧 runner/工具测试同步回归。

frontend 集成改用真实 getChatRuntime、真实账号项目服务、真实 Skill resolver、提交服务、宿主 reader/resolver、授权与调用账本。两账号读取互不串用，结果回放不重复读取，注入 503 结算为无副作用可重试失败；总共只执行三次领域读取。模型工具调用回执仍是 fixture，没有运行商业模型、真实 Worker 或公共聊天路由。隔离内存库测试没有访问用户库，开发环境 master key 降级提示不代表桌面密钥验证。

独立设计与代码复核没有本批具体阻断；评审者未重跑测试。完整 T-915 仍须接动态 dispatcher、模型/浏览器工具和全部公共入口，并完成性能与双平台验收。本批没有修改完整范围。

本轮结果：backend 380 项、真实服务集成 1 项，共 381 项通过；前后端类型检查通过。边界维持既有 5 条；orphan 为 0 errors / 100 warnings；精确写入文件的范围与复杂度门通过。CodeGraph 已刷新。

末次将短读取名单冻结为不可变数组，类型检查通过。pmem sync 完成；全局 reconcile 实测仍为 211 errors / 1 warning，未通过，保留 T-916 对账债务，不完成 T-915。
