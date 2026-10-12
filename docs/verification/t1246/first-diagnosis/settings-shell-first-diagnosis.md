# 设置返回和Shell原例只读分诊

原候选533224f；四条真实FAIL不重写。来源SHA与完整原case见settings-shell-first-source-binding.json。没有改代码或跑复测。

Shell焦点例12次Tab后未到header，root已实际查看本例最终PNG：焦点仍在侧栏“运营分析”，正文仍工作区初始化骨架。当前侧栏已获批准增加创作者总览、定位、雷达、画布、运营分析和自动化等入口。旧最多12次Tab不是新的可操作控件完整上限，未证明键盘困住。集中仅原app-shell.spec.ts：等待真实工作区/正文就绪，依据本例实际可见可操作控件计算有限遍历边界，记录每次真实Tab的焦点归属并保持侧栏→header→正文顺序、循环/跳过header严格拒绝，不用直接focus冒充键盘、不把上限改某个随意更大数。保可达性要求，不能从本例失败签产品键盘死路。

Shell间距例实际paddingLeft/Right均24px、gap=normal；原test读取app-page-content.firstElementChild。shell-router422现在包ProjectVideoSessionHost，host返回data-video-route-outlet wrapper，其自身不承担dashboard section-gap；真实dashboard-page102仍是gap-section-gap。集中仅同原test定位实际当前可见Dashboard main并等真实加载，保20px section gap和24px gutter，不移除持久原生会话host、不把期望改normal。

设置两红真实在关闭后等待/accounts120秒超时，最终about:blank。原trace记录初始goto/accounts→实际侧栏Settings链接click→路由/settings→7分类/键盘/宽窄图→close，不是未打开或设置表单坏。外观用例关闭前主题/密度真实本地已变化，刷新持久后置尚未执行。产品handleOpenChange仅以window.history.length>1决定router.back，否则push首页；usePrimaryNavigation当前确实router.push。现有trace未记录每次history state/index或close回调次数，所以不能从源码猜一定replace或两次back。继续保实际返回风险，集中前补有明确来源的历史/关闭观测后才锁最小产品写集；不得改预期成about:blank/首页、吞返回失败或恢复后称前轮已通过。准确需调查SettingsDialog、primary navigation与首载group refresh并发；只修已证明消费者，不重构路由架构。

```mermaid
flowchart LR
 A[真实侧栏打开设置] --> B[设置分类操作已到达]
 B --> C[关闭调用历史返回]
 C --> D[实际about:blank 原返回失败]
 D --> E[补历史与关闭次数证据]
 E --> F[限定修复和同原例复测]
```
