# T1211 调度命令夹具隔离

T1210运行既有父子/飞轮/自动化三文件34例，32通过2失败；失败均为同一命令请求号对应不同输入。`execution-scheduled-child.service.test.ts` beforeAll共享数据库，两个参数化取消用例共用child-cancel/parent-control，两个retry用例共用retry-daily，却针对不同fixture的任务。先在冻结6730树原文件实跑，保基线失败；不推测是T1210引入。

BUILD，限定唯一写集 `backend/src/modules/execution/execution-scheduled-child.service.test.ts`：在这些用例命令键加既有真实fixture.id，只改变隔离用例的请求号，任务/父子映射/停止/预算/状态/拒绝断言全部原样保留。不改变产品、timeout、公共幂等保护或其它测试。独立只读审核后修改；真实同键不同输入仍应被原guard拒绝，不能删除该保护。

验收：6730原基线真实失败、当前修复后13例通过，并再次相关三文件；仅后台测试夹具，无页面交互或frontend journey适用。证据收于docs/verification/t1210的原基线与新日志，记录当前源和退出码。产品上游消费任务继续T1210，不能用夹具PASS代签安装或外部采集。

6730冻结树原文件当场13例：10通过3失败；其中两条是上述请求号冲突，另尚未attach准入是T1210已确认父查询缺陷。当前T1210树对应三文件34例：32通过2失败；保留全部原输出，不把3失败基线写成2失败。独立范围复核PASS后仅三个键加f.id，后续原13例和相关三文件复验。
