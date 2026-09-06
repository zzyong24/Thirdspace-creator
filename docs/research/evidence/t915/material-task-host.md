# T-915 素材工具原子提交适配

素材工具现在有可选的统一宿主适配。它从原聊天任务恢复账号、项目、功能选择和冻结工具定义，读取当前稿，准备 `asset.generate` 子任务，再交给已有事务服务创建任务和保存父回执。准备本身不调用模型、不提交事务、不唤醒执行者。

```mermaid
flowchart LR
  TOOL[原聊天素材调用] --> CHECK[核对账号与冻结定义]
  CHECK --> READ[读取当前稿一次]
  READ --> PROMPT[同源提示词和稿件快照]
  PROMPT --> PREPARE[准备素材子任务]
  PREPARE --> TX[已有原子提交服务]
  TX --> WAKE[通过注入端口唤醒原任务]
```

`atomicMaterialGenerate` 是服务端显式选项，持久准备在首次等待前复制它；默认保持关闭。只有注入 material 端口才装配新工具。旧论点工具版本不变，素材原 schema、描述、排队结果卡和用户显式选择的图片／视频类型保留。项目素材没有稿件读取端口时不静默跳过；取消、账号不符、定义变化、失效段落与事实截图伪生成均拒绝进入提交。无项目生成保留原始描述。

同一次读取用于提示词与 `scriptSnapshot`，避免二次读取把不同版本拼在一个任务中；这不等于提交事务已经锁住当前稿版本。后者仍需在正式迁移时完成并验收。

## 验证事实

- `material-task-host-red.log`：新增 10 项测试在实现前失败，当时没有素材提交适配。
- `material-task-host-first.log`：初版素材与既有论点适配 17 项通过。
- `material-task-host-final.log`：补充调用方参数／attempt 修改、准备期间取消、持久选项冻结后，6 个文件共 416 项通过；包含现有聊天、素材准备和真实数据库原子提交回归。
- 第一次类型检查发现测试夹具缺少必要类型断言、mock 参数未声明，已修正；没有改产品实现来迁就测试。
- `material-task-host-types-fixed-test.log`：类型修正后素材适配 12 项通过。
- `material-task-host-types.log`：中间类型检查仍因可选 inputData 访问失败；改为可选访问后再次验证，不覆盖失败记录。
- `material-task-host-types-final.log`：backend 类型检查通过；frontend 包名筛选未命中，不视为运行证据。
- `material-task-host-frontend-types.log`：改用 frontend 目录运行类型检查，通过。
- 独立只读复审未发现本批阻断；审查者没有代跑测试。
- `pmem sync` 已执行；`material-task-host-reconcile.log` 保留现有 211 errors／1 warning。范围与复杂度检查通过，orphan 检查通过，物理架构无新增违规（同步时剩余 5 条）。全局对账未通过，不能写成全绿。

上述是本地测试与夹具证据。素材 host 用注入服务检查准备参数；原子提交回归使用实际数据库及通用提交服务，但未将新 host 与真实素材供应商串成跨进程生成旅程，不能按这些结果宣称素材 Worker 验收完成。

## 尚待完整迁移

实际 `asset.generate` 仍走宿主旧 runner。生成 Worker 需要持久化提交前状态、原 provider jobId、未知计费提交与结果接收事实；恢复视频只查询原 job，未知提交不得重新付费；素材落存储与候选回执需要幂等恢复。当前恢复扫描器仅接受已有论点准备，本批没有扩大到没有执行器的素材任务。

正式聊天入口、全部工具迁移、旧路径退役、性能同条件样本以及双平台和真实供应商验收仍未完成。T-915 保持进行中。
