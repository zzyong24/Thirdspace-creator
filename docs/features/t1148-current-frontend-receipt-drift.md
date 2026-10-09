# T1148 核对本轮共享页面修改后的旧验收记录失效

用户要求发现问题立即建task并修复。2026-10-09 17:48:21–18:06:35 UTC，main efe9f1ce 完整canonical实际执行1093.915秒exit1：42ERROR/0warning，原39项完整保留，新增T1136、T1117、T1108三个frontend receipt watched_paths漂移。实际冻结的11条产品/测试/runner源码与HEAD全程未变；不能把新增检查失败说成产品运行失败，也不能称全量通过。

实际证据为docs/verification/t1140/full-reconcile-canonical.json、canonical-comparison.json及原完整日志。T1136的AssetPicker，T1117/T1108的CanvasEditor/测试等路径被本轮已审素材布局和页组画幅修复修改；原验收确实绑定旧提交，不能把它们的report、visible-copy或completion event改头换面。

先以当前正式消费者核验漂移和补证范围。只写本任务诊断工件与看板/审计控制记录，保存所有历史失败/报告/原图/事件。当前T1140先完成新main真实Chrome、精确选用/回读、六视口及正式taskctl验收；T1141、T1145的当前局部结果另有明确范围。后续合入剩余源码还会改变共享路径，旧任务的当前补验必须绑定最终源码，不能拿中间结果代签最终安装。

不修改frontend-validation/taskctl验证器，不删除旧合同/断言/审核或把验收改为“—”逃过检查。旧PASS已失效时只通过正式taskctl block留审计并转换为待验，再在原合同实际复验后resume/complete；若需范围变化，先精确SPEC和独立复核。当前尚未执行这些旧任务状态转换，不把旧历史完成抹掉。

4-build maintenance，真实新问题已登记；产品字节写集为空。此任务不代签全功能、模型、扫码、原生App、新安装包或T1144原清理失败根因。

```mermaid
flowchart LR
 A[共享路径已审修改] --> B[旧源码绑定失效]
 B --> C[保存旧证据并登记]
 C --> D[最终源码按原合同补验]
```
