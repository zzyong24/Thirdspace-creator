# T1157 校正验收报告把夹具声明写进浏览器运行时字段

当前T1149 Chrome两例75.625041秒exit0，但正式frontend-validation未执行浏览器前校验exit1：environment.runtime必须标识真实运行时。实际消费者frontend-validation.mjs:419拒绝runtime包含mock/fixture/jsdom，原报告将真实Chrome版本描述与合成能力/503声明混在此字段。原失败报告、可见文案及原exit1日志/receipt已冻结私有t1157-original-report-validation-failure。

大白话：运行时字段只描述实际Chrome；哪些输入是夹具应在数据说明里完整保留。不是产品或浏览器功能失败。

```mermaid
flowchart LR
 A[真实Chrome流程通过] --> B[报告字段混入夹具声明被拒]
 B --> C[保原FAIL并准确分开字段]
 C --> D[原正式消费者重新校验]
```

4-build维护，精确写集仅尚未被接受的docs/verification/t1149/FRONTEND_VALIDATION_REPORT.md及本诊断、BACKLOG与taskctl审计事件。运行时仅记录真实macOS、Google Chrome channel及隔离测试运行环境；合成能力和一次503保留在报告正文及data声明，不改data.mode真实save/get属性，不删除已有数据限制或扩大体验结论。不改验证器、产品、合同、已有接受报告或原失败receipt。原校验实际exit0后仅关闭本字段校正任务，T1149整体Gate另验。

## 当场结果

2026-10-09 19:21:42 UTC，原frontend-validation validate --task T-1149命令实际exit0，四后置条件报告校验通过；真实runtime已准确分离，data.fixture_declarations与原正文完整声明合成能力和一次503。原exit1与尚未接受报告保于T1157_ORIGINAL_REJECTED_REPORT.md。这里只通过静态报告校验，没有再次执行浏览器或签T1149整体完成。
