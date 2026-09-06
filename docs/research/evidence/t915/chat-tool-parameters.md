# T-915：真实工具参数校验接入聊天准备

prepareChatTurn 现在从本次实际装配的工具读取 inputSchema，保留原 JSON Schema 给模型，同时建立宿主可 safeParse 的 parameters。复用已安装 Zod 4.4.3，没有新增依赖；旧公开聊天入口尚未切换。

```mermaid
flowchart LR
 A[真实工具参数描述] --> B[检查受支持约束]
 B --> C[保留原描述给模型]
 B --> D[JSON值检查与Zod结构校验]
 D --> E[Unicode字符长度与整数语义]
 E --> F[宿主执行前可用的参数校验器]
```

转换器会忽略部分 JSON Schema 关键字，所以按类型显式限制受支持子集。默认值、未知format、uniqueItems/contains等未支持约束、未知required字段、相反范围及混合枚举约束不能静默放行。任意 JSON Schema 支持不在本批声明内。类型、归属、范围校验不会代替模型的语义选择。

当场红测发现转换器的字符串长度按 UTF16 单元计数；本批在转换副本移除该项，运行时按 Unicode 字符数递归检查。独立复核又发现无 items 数组的数量约束被忽略，补充红测后仅在转换副本加空 items，让数量约束生效。integer 转换副本使用 number，随后按 Number.isInteger 校验，避免加上 JSON Schema 未声明的安全整数上限。公开 schema 副本与内部约束隔离，外部改描述不会改变已建立的校验。

3 文件 371 项通过：参数边界 19、全部工具 210、聊天装配 142。覆盖全部实际工具及选中段落/项目上下文两种 script.patch 参数变体；根据原schema建立合法输入，验证解析不改值，并覆盖必填、额外字段、嵌套数组、枚举、异步schema、Unicode和整数边界。prepareChatTurn 测试确认实际工具拥有校验器，非法 topic.enrich 参数拒绝。此处均是参数/准备层测试，不是真实工具执行或商业模型验收。

backend/frontend 类型检查通过，范围门通过，边界原有 5 条无新增，orphan 0 errors / 100 warnings。runtime_code_review 最终只读复核无剩余具体阻断。工具 version/effect、真实执行端口、持久 Skill/可信上下文和公开入口迁移仍待完成；T-915 保持进行中。

## 后续真实工具接线的只读事实

runtime_code_review 核对实际 handler 和 ChatRuntime 端口后，确认 context.* 与 creatoros.guide 可复用领域纯读端口，仍须逐轮冻结白名单和实时归属校验；getChatRuntime 的 contextReaders 是已有装配来源。不得把异常统一当成查询成功的空数据。

learning.capture、brief.fill、script.patch、video.edit.render 仅产候选或依据当前真值建立补丁；topic.generate/enrich、script.hooks、calibration.diagnose、review.analyze、positioning.generate、knowledge.distill 仍含宿主模型调用。material.gather 仍有长网络操作。以上旧闭包不能整体包装后声称已迁入 Worker。

material.screenshot/web.read 可能保存 pending 资产；script.draft、publish.package、project.transcribe、material.generate、cover.generate、intelligence.douyin.share、review.script、planning.thesis 会创建任务或记录。需要用户采纳最终产物，不代表工具自身无副作用。local.read 成功还会消费一次授权，已结算读取必须回放，不能再次消费授权或执行。旧错误信封会吞异常，未知提交必须保留未知结果语义。

上述只是源码接线事实与依赖顺序，没有缩减完整 T-915 范围，也没有将真实执行迁移标记为完成。

最终全局 reconcile：211 errors / 1 warning，exit 1，与前批一致；既有欠债由 T-916 跟踪，未记全绿。

首轮红测日志因 Vitest 展开完整 Zod 对象达到 9874 行，已无损压缩为 chat-tool-parameters-red.log.gz；解压往返字节校验通过，原始 SHA-256 见同名 JSON 证据。
