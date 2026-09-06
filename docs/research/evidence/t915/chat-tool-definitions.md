# T-915：真实聊天工具声明接入准备流程

prepareChatTurn 现在返回与当轮 assembly.tools 完全相同的 toolDefinitions，并继续提供同源参数校验器。声明包含 name、version、description、parameters、effect，可供后续冻结到聊天 Worker 输入。此处不启动 Worker、不取得主模型凭据、不执行工具。

```mermaid
flowchart LR
 A[当轮真实白名单] --> B[核对登记名与原始执行入口]
 B --> C[显式副作用表]
 C --> D[真实schema与宿主参数校验]
 D --> E[参数和描述摘要版本]
 E --> F[可序列化Worker工具声明]
```

独立复核确认当前 45 工具：committed 11、proposal 11、none 23。表没有未知名称兜底，不根据名称含 read/render 或最终产物需采纳来推断副作用。local.read 消费一次授权，仍属 committed；上一批修复后 context.positioning.detail 属 none，video.edit.render 属 proposal。effect 是工具的最大可能副作用，具体执行未发生写入时仍须按事实返回 sideEffect:none，不能固定伪报已提交。

原始执行 WeakMap 同时记录真实登记名，拒绝把 script.draft 的执行函数挂到 context.projects 的只读声明下。未登记名称、缺原始入口、名称不符、缺参数或描述均在准备时失败。旧 SDK 执行与授权行为保持。

版本由人工实现 revision 加 name/effect/description/原参数 JSON 摘要构成；参数或描述变化得到不同版本，两种 script.patch 参数变体不共用错误版本。实现语义变动仍必须主动提升 revision；摘要不证明闭包代码或捕获上下文已冻结。输出 schema 独立复制，不会因声明被修改而改变宿主参数校验。

红测发生在文件实现前：新增测试套件因缺模块导入失败，未运行测试用例；不记作 5 项断言失败。实现后 5 文件 388 项通过：定义 5、原始入口 4、工具门 27、聊天准备 142、实际工具 210。包括全部 45 个真实工具和 selected/project 两种改稿参数变体通过 Worker 工具数组契约；错挂执行函数拒绝、未知名称拒绝、参数校验与 schema 副本隔离。独立只读代码复核未发现具体阻断，评审者未独立重跑测试。

前后端类型检查通过；边界原有 5 条无新增，orphan 0 errors / 100 warnings，任务范围门通过。本批没有商业模型、用户库、安装、推送或部署。

执行迁移尚未完成：material.gather 即使 none 仍含外部搜索；多个 proposal 工具仍调用模型；网页/截图工具仍含浏览器操作。这些不能作为宿主短读直接包装。后续真实宿主适配仍须结合任务恢复 RequestContext、冻结可信选区/Skill、实时授权、实际结果分类与统一工具账本。公开聊天入口仍未切换，T-915 保持进行中，完整 SPEC 范围未缩减。

最终全局 reconcile：211 errors / 1 warning，与前批一致，T-916 既有欠债保留；不调用 taskctl complete。
