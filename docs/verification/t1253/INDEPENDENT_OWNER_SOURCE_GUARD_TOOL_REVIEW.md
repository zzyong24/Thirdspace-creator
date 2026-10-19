# T1253 原owner批次工具独评

精确 ebeeed71 / bc1fd905 **工具静态通过**。3035源码、3907工具项、93库3888实际实现均只读重核0漂移；没有启动envproof、Worker、测试、编译或构建。

```mermaid
flowchart LR
 A[首入口冻结／真实源与库] --> B[完整剩余预算准入]
 B --> C[原25／46／标准types]
 C --> D[实际源SHA＋ready双核]
 D --> E[原非零／关闭／残留／取消保真]
```

OT001已关闭：已apply源恢复known-before时，即使虚拟digest一致，after.executionReady和实际SHA比较也会拒绝source unchanged。prepare候选overlay保，执行不得把它当真实源。

外层23.22M/54.36M/12.48M从入口计；每helper2.16M、完整准备/cleanup及types未来第二子槽都保。SIGINT/TERM只当前scope AbortSignal，取消或上个子不quiet不得启动下个。实际_ts编译器和Vitestdist均绑定，标准types不用overlay。

原内部hook和build声明仍保，不拿本工具外层说明它们已新验。原25/46分母、每次原失败、actual关闭与source回执须运行后真实记录。测试会在beforeAll重建Worker，必须root独占dist窗口；当前仅静态工具收据，未给运行许可。
