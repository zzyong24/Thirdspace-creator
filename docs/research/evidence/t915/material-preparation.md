# T-915 素材生成准备提取与取消边界

`material.generate` 的当前稿读取、唯一段落引用核对和生成请求准备已从大工具文件提取为 `prepareMaterialGeneration`，原入口直接复用。参数类型共用，原 schema 与提示文案不变。准备模块不创建任务、不调用模型，后续原子提交可复用它而无需执行旧 dispatch。

```mermaid
flowchart LR
  INPUT[原工具参数] --> PREP[固定输入与当前项目]
  PREP --> READ[读取当前稿并核对指定段落]
  READ --> STOP[检查是否已停止]
  STOP --> READY[生成请求准备完成]
  READY --> CHECK[入口再次检查停止]
  CHECK --> SUBMIT[原任务提交端口]
```

原代码接受取消请求后，仍可能继续执行读稿并提交素材生成。本批在准备开始、异步读稿返回后、派发前检查同一个取消信号。提交一旦开始仍沿原语义返回真实 taskId，不用后续取消隐藏可能已发生的提交。

实际证据：

- `material-preparation-red.log`：直接调用原生工具执行，预先取消和读稿期间取消仍触发提交，2 项失败。
- `material-preparation-final.log`：准备模块、原聊天工具及运行器共 364 项通过。覆盖取消不提交、准备期间输入与项目对象变更不影响原请求，以及既有强制视频图种、style trim、当前稿绑定、段落错误、信息卡和事实截图拒绝等行为。
- `material-preparation-types.log`：后端与前端类型检查。
- 独立只读复审确认原卡片、文案、强制图种、段落绑定和空稿兼容未遗漏；审查者未重跑测试。
- `pmem sync` 已运行；`material-preparation-reconcile.log` 实测仍为既有 211 errors／1 warning。范围与复杂度检查通过；boundary 无新增、剩余 5 条；orphan 为 0 errors／100 warnings。整项 T-915 不标记完成。

本批未把 `material.generate` 接入持久 Worker 工具清单。当前原子提交服务仅认可 `planning.thesis`，恢复判定也只认可该工具；素材生成还需接通子任务类型、当前稿快照与事务回执，才能保证提交恢复不重复生成。不能仅把旧 dispatch 包装成“可重试”。正式完整场景仍保留 9 项未接工具，未改变其断言。
