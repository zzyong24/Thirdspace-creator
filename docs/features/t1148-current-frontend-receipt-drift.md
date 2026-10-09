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

## 当前正式失效事件（2026-10-09 UTC）

18:21:22–23，按独立审查确认的原taskctl路径分别block T1108、T1117、T1136，旧验收自动回到待验，原报告与历史completion事件均保留。18:31:19，T1149在当前正式SPEC PASS后修改CanvasEditor，另正式block T1140；原efe9两次成功及实际查看14图不改头换面。原四次wrapper receipt分别保于私有验收目录，T1140新事件日志SHA bbbdcf5b25cade149d4e9f04034173a579c689ef5a412c691b5d8f9ac3c1103b。

当前需要按最终受测字节补验的旧任务为这四项。新T1149 Chrome不能代替它们原合同。后续真正resume/新report/complete发生后单独登记；此段只记录已经发生的block，不声称旧验收已恢复。

## 最终源码四项正式补验（2026-10-09 UTC）

3d444493产品源码闭包冻结后，原taskctl路径依次真实resume并complete T1108、T1117、T1136、T1140；每项原allowlist实际重新执行exit0、0retry，并有新报告、当轮visible-copy、原公共写后读、当前源码SHA和审计事件。当前前端audit实际exit0（1.081秒）。根本轮实际看共享七图、排期十二图和素材二十图，未把模型/真人平台/原生App或200%人工体验算通过。

完整新工件和实际命令收据在docs/verification/t1148/revalidation-3d444493。原路径被runner更新的45份已接受工件逐字节恢复3d提交对象；当轮生成字节和原始日志另外保留私有，旧报告/head/事件不改签。旧素材目录一张16:58截图不属于当轮capture列表，排除而保留原字节。

本轮全canonical原40错误没有改签；T1172补验59公共用例只能消除该环境缺失的疑虑。T1171/T1173归档与身份机械修复改变历史执行索引覆盖，不能把新audit0说成原来源alias或全局历史审核欠债已修。其责任和原错误仍保T1082/T1101-global-gates等任务。本任务只闭合四项最终源码补验，所有非本合同验收继续待验。
