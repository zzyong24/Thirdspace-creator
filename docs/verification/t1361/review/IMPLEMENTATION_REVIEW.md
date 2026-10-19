# T1361 最小实现独立只读审阅

**未发现可定位的阻断问题，findings=[]。** 已先与作者workspace_refresh确认最终冻结SHA；仅检查实现/既有证据并写本报告，没有修改源码、执行测试、启动服务或请求App。正式全族E2E仍由control验收，本报告不代签。

正式生产仅account-switcher.tsx（b064a41d…32d6fa3）；新增回归workspace-initialization.test.tsx（2ed3f2eb…fd2e62b）；Provider生产8faac403…451db0未改。完整哈希在同名JSON。

| 核对点 | 实现与证据 | 结论 |
|---|---|---|
| 两步与预算 | account-switcher:62–80仅创建一次waiting/epoch/scope/timer/deadline；navigation阶段只replace；152–159在实际transition不pending、同scope/世代有效且未超原deadline时将stage改为refresh并执行一次刷新 | 没有第二次初始化timer或120秒续期，没有同一队列立即连续发replace+refresh |
| 取消/卸载/ABA | cancelInitialRefresh推进epoch、清waiting/timer并释放旧wait；effect先核alive/current epoch/current scope；RAF先核alive/当前scope；卸载取消RAF与waiting | 旧phase不能据原promise晚完成再补发；新回归覆盖耗尽预算后旧navigation提交和快速反向时旧navigation先完成 |
| 真实范围/遮旧 | 第二阶段仍调用原Provider.complete；Provider生产完全不变，继续要求serverScope/liveScope一致，切组synchronizing/旧页面与overlay遮挡未减 | 没有强制complete、绕过后端或只凭B存储/HTTP200放行 |
| 同URL与有日期目标 | performSwitch始终把groupSwitchHref传给两步owner，同URL也replace；原groupSwitchHref及writeCurrentGroupId清理字段不变 | 覆盖未提交筛选不反映window URL的意图替代，也保原日期/实体清理及无关query |
| 外部manager/同scope | scopeChanged外部事件经同owner带clean href；manager.enter只writeGroup/setCurrentId，没有另发router导航；同scope广播仍只list，组件自发事件仍跳过自身 | 没新增第二导航owner；绑定后同组manager自己的refresh不因本修改再触发切组流程 |
| retry/首次恢复 | 初次未放行/非恢复/无前台活动的既有reload例外未动；已放行错scope的显式重试改走同两步；首次load自动恢复仍可直接refresh、相同scope保实例 | 未见新死锁或扩大重载路径；完整公共保护族仍待control |

红绿证据已逐项读原件：components-red.log原断言在导航未交付前发现refresh已调用，1FAIL；新真void/React Suspense模型不使用旧latestRefresh作为正确性依据。components-green-final.log为2文件55PASS/3.37秒，eslint-final空输出由作者报告exit0；本审阅未重跑，不能自行从空日志推断退出码。

诊断01实际记录旧源码replace和refresh相邻派发，Provider serverA/liveB、refreshPending=true持续至原120秒FAIL；两源debug撤回的originalEqualsRestored均true。这不是漏replace的静态猜测。无debug public-green01同最小真实Next场景exit0：原Aworkspace=primary200/finished，新增完整refresh原Flight同时含initialScopeB与workspaceB，最终B的UI/URL/storage/cookie一致；我已实际查看其final-observed.png，B组名及视频播放200正常可见。B意图→可见771ms，释放A→可见397ms，均只是该次事实，非普遍性能承诺。

既有async router mock只保其有限保护范围，新Suspense模型也不是Next本体。最终锚是已发生的上述真实Next最小公共链；control仍须完成T1361正常/最小全输入族、T1356未完成的暗色/原生200%/SQL故障恢复及全部正式Gate。原body两SHA不等仍保其观测边界，不将身份相同冒原字节逐字同一。

本次没有审美/额外功能意见，没有扩大写集或替代作者实现。无阻断表示此最终小改可继续正式验收，不表示全族、strict或安装已通过。
