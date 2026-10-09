# T-1107 校准平台公共回归的账号事实锚与操作目录

用户要求全功能验证发现问题及时建task并修复。当前额外24例为22PASS/2FAIL，原失败及重试污染保留。本次只修过期测试，不改产品、安全门、唯一键、服务合同或数据归属。

## 已确认事实

T1062总控DEC规定user+account+platform+externalId事实锚，创作属于组，平台事实属于真实账号与冻结组；不按名字猜归属。当前和1889基线publishing.repository的findByExternalKey、getPublicationRowById及reAnchor门均使用factFilter，不是旧测试假设的user级唯一。

实际retry0公共dispatch探针：A/B自己的同名项目与作品都走正式服务、fresh隔离PGlite；B登记A同externalId返回新B记录，ID不同、accountId=B、outputId=outB，A登记前后完整DTO逐字不变。原断言仍失败，日志372cfe65c55f8c6906f48417c70ee1b50995d3d0624c94e41090b9731c69638b；原报告曾误断跨账号换锚，根核源码/合同后撤回，原报告及勘误均保留。动态结果ownership-public-result.json记录全部正式读取。

账号操作数组当前/1889均精确六ID，第6项accounts.bindingCapabilities为正式持久化能力读取；原测试已经遍历六项拒绝无ctx，仅最后数字5陈旧。

## 限定修复与验收

仅修改两个测试：

- frontend/src/server/__module_integration__/platform-account.persistence-client.test.ts：标题/注释改六项，数量5改精确六ID数组；保每个无ctx拒绝、CRUD回读、多用户隔离。
- frontend/src/server/__module_integration__/account-isolation.acceptance.test.ts：原跨账号get、revision/list/create、父output404以及B正常读取全部保留。旧C09改为不同真实账号相同externalId分别成功、ID不同、B归属准确、A完整DTO不变；追加新B记录对A不可读，B同账号不同项目登记该externalId返回409且B原锚不变。

不改其它断言、fixture初始化、全局重试或预算。正式聚焦运行retry=0、no-file-parallelism、执行/观察120秒以上，隔离运行避免beforeAll共享状态经重试污染。修测试前独立SPEC初审与taskctl start；原真实22/2及追加日志只算实际发生结果，不补历史RED。测试修后两个文件及platform-collection公共接口全部通过，publishing原完整service/repository/transport测试验证原同账号imported/orphan/idempotency/conflict能力，backend/frontend typecheck与boundary/semantic/orphan/diff实际检查；全局reconcile保留T1018/T1081/T1082等原失败。

本任务是现已确认合同的测试校准，无页面变化、供应商执行、真实库访问或新发布许可。root串行仅写上述测试及任务文档/控制面；独立只读复核实现和实际运行。修后与T1105/T1101统一main无备份出包，不push/tag/Release。
