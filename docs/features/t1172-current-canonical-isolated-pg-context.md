# T1172 当前完整校验缺少隔离PG配置

用户要求发现问题及时建任务修复。main 3d444493本轮完整canonical只调用node reconcile，没有携带前轮两项隔离PG变量；实际40错误比前轮42新增LED052、移除三条已正式失效转待验的旧UI receipt错误。不能将新增LED052混入旧39欠债。

原LED052公开runner第一步要求CREATOROS_TEST_POSTGRES_URL与CREATOROS_ISOLATED_PG_URL都显式指向127.0.0.1:55422，缺失即throw，禁止skip。只使用本会话已有隔离PostgreSQL和原完整runner重验，不触碰安装库；记录实际连通、命令及结果。若仍失败保留原错误并登记实际根因，不改断言、预算、门或生产代码。产品/测试/配置写集为空，阶段4-build环境诊断。

原971.517秒exit1和40错误不改签；补验最多证明LED052当场原公共测试，不把它拼接成完整canonical全绿。本轮后续全量命令保持隔离变量；taskctl和pmem如实收尾。

```mermaid
flowchart LR
 A[真实canonical新增LED052] --> B[核原runner要求]
 B --> C[原隔离环境公共链]
 C --> D[保留两轮真实结果]
```
