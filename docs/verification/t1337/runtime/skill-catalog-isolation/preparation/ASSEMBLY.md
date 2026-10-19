# T1337 实际配置前置与公共隔离红绿装配

状态：文本准备，NOT_RUN。性能窗口由C独占；现在没有运行syntax、collection、type、RPC、模型、浏览器或构建。

同包前置先执行 `probe/observe.cjs` 一次。它从原 readonly-v1 透明复制，仅添加 skills.include_instructions=false；保留原16项扩展/MCP禁用、原HOME/CODEX_HOME继承、key-only配置元数据与身份清理。删除skills/list，严格只有initialize、initialized通知、config/read。原实际配置须返回boolean false；不满足时停止方案，不授生产硬门。config/auth原值不落盘；authFilesRead=0仅表示fixture显式读取0。

公开调用不是真实供应商模型：只将外部CLI/合成HTTP传输换成明确fixture。生产URL守卫、collect service/queue、Host、持久账本、工具、候选、confirm与领域落库保持真实。原T1335公共测试透明新副本恢复collect/material/research三个串行case；原goal/Skill/schema/工具回复/证据/采纳/幂等不变。

CLI的新代码仅初始化精确0.159.3默认自动目录为true，并解析actual argv的skills.include_instructions布尔字面值，向config/read如实返回。它不按该值改变业务回复，不伪造供应商错误/工具缺失/token膨胀。原业务链全部完成并保存BUSINESS_CHAIN_COMPLETED之后，再断言两次实际启动配置均为false。RED是隔离配置缺失而非业务或预算失败；三个case各自finally清理，不能首个失败截断后两族。

原实际worker7727daf3def469a3c564de54c245384a4bc93e007bbedd0a28f383678899e709在RED只作已绑定来源，准备阶段尚未复制/构建/链接。新外盘根由C核不存在并创建0700；后续probe、red-v1、green-v1各唯一子目录，旧DB/UNKNOWN不重开。RED两依赖仅精确jsdom与@mozilla/readability链接到既有真实包，避免ESM import不遵循NODE_PATH的旧夹具错误；性能结束后才实际物化并锁定。

全部T1334_*变量仅沿用已证fixture内部协议名，值均绑定本次新root/runId，非旧运行恢复；没有复制旧trace/requestId。worker-entry本轮字节未改；IPC只记既有安全头与requestId SHA，原调用/返回/throw不变。

每根持久观察仍从提交前创建原1800秒绝对期限，不续期；test28800000ms、hook180000ms、maxWorkers1、retry0。三test+六hook=87480s global；再startup/report1080=88560s execution，前后hash各1800+cleanup600，外层92760s。实际外部外层同预算执行，不能只写JSON声称。

实际same-binary false前置与完整公共RED均待Root核后才能两源生产；现在产品写集为0。后续唯一agentic opt-in，common默认不变；三既有worker测试仍保持原字节，生产实现及边界测试另按Root顺序推进。受控GREEN只证配置接线和完整业务链，不证明旧token全部首因；最终新包三新根仍各100000原预算真实验收。
