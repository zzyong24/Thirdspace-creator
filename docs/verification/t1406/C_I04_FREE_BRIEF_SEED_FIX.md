# C：I-04 自由简报进入准备请求（2026-10-26）

## 新安装版的真实结果保留

来源 `99233e758920de5088ab0bd73a3fb96468822950` 的有界实机测试已正确将空 `brief.fill` 回执记录为 `invalid_input/none`，准备父任务进入 `BRIEF_INPUT_REQUIRED / waiting_user`，0候选。用户明确补充后，原父创建了恰一个新子任务，旧任务状态、错误回执、来源及其它步骤保留；第二次模型仍返回空资料，完整非空候选/采纳未完成，结果保持 **partial**。

此轮公开 `projects.patch` 与后续 `projects.get` 证明自由简报237个UTF-8字节精确保留。实际项目上下文读取主要投影 `briefDetail`，新准备源消息却只有固定通用请求；自由 `project.brief` 虽被输入变化指纹计入，却未被该入口明确传入新消息。不能据此说模型已看见补充正文。原冻结完整模型prompt未从公开DTO取得，此限制继续保留。

聊天轮次实际为 succeeded：空资料错误后又完成成功的只读工具，符合现有末次工具终态策略。验收work脚本已改为精确保留旧子/业务任务实际状态指纹；没有为了匹配partial夹具去改产品状态或旧回执。实机请求严格为一个新父、两次准入、一次补充，没有第三次请求。证据为工作目录 `installed-I04-final-real-model-summary.json` 及 `post-upgrade/evidence/installed-i04-final-99233e75-1/`；旧6c失败仍另存。

## 最小补修

仅新准备源消息调用 `buildProjectPreparationBriefSeed`。将当前已验归属项目的标题、八项已有规划字段及自由简报原文放在明确标注的用户资料JSON中；JSON可逆转义换行、引号和尖括号，避免资料伪装为系统边界。提示已有结构化字段优先、缺资料不得编造、结果仍是待用户采纳的候选。

不把自由文本自动写成结构化字段，不修改通用上下文、工具定义、公共schema、旧任务/源消息/账本或原父期限与执行预算。同一输入版本若已有源锚，先返回原锚，不以当前资料改写旧prompt。其它项目资料不会拼入该请求。

该入口新增保守的单次 **64 KiB UTF-8序列化user-message** 上限，包含JSON转义和消息包装开销；它不是既有4M字符策略的“字节换名”，也不修改全局聊天/执行预算。超过上限在创建会话、源消息或新模型子任务前明确拒绝，原brief完整保留、不截断。父任务沿既有失败/重试路径显示可读提示；用户公开保存缩短资料后，可明确重试同一父任务。

## 当场红绿及证据范围

使用缓存Node25.9.0与pnpm10.32.1，未调用真实模型或原安装数据库。命令见对应工作日志首行。

- `i04-free-brief-source-red.log`：首次服务路径红测2失败5通过，失败为新源消息没有补充原文。
- 独评指出需覆盖真正公开操作入口后，`i04-free-brief-public-red.log` 改为真实 `createProjectsTransport` 的 `projects.patch/get/preparation.start`，2失败5跳过，仍在同一缺失正文断言失败。包装脚本打印emoji的GBK输出异常单独记录，不算产品故障；完整测试日志已保存。
- `i04-free-brief-source-green.log`：2文件13/13通过，19.51秒。实际公开PATCH/GET、准备提交入队、原始源消息、正式 `prepareChatModelMessages` 转换与冻结modelInput串联，精确恢复自由原文及已有规划；旧消息/调用账本、父期限/预算和同revision重放保留。长中文与双层JSON转义超限均无新增会话/消息/业务任务/模型成本，缩短后公开重试仍沿原父创建新子任务。
- `i04-free-brief-regression.log`：4文件71/71通过，34.80秒，包含上述新回归以及原项目准备service和正式候选宿主测试。与13项有重叠，不相加。
- 根代理随后完整backend类型检查在新增测试发现9处 `EndpointInput` 形状缺字段：PATCH/start缺query，GET另缺body。`backend-typecheck-20261025T182813Z.log` 原样保留，不算类型通过。第一次补 `query:{}`、GET的 `body:undefined` 后，运行测试13/13通过（`i04-free-brief-typefix-test.log`，19.61秒），但第二轮完整类型检查仍失败：`backend-typecheck-20261025T183031Z.log` 明确这9处query应为undefined。该中间修正不计类型通过。
- 读明 `EndpointInput` 条件类型和具体endpoint无query schema后，仅把这9处改为 `query:undefined`，GET保留 `body:undefined`，未加any/强转、未改生产实现。实际执行 `run-check.py backend-typecheck` 得到 `backend-typecheck-20261025T183215Z.json/.log`，47.228秒、exit0；随后 `i04-free-brief-typefix-query-final-test.log` 受影响2文件13/13、20.61秒通过。以上批次重叠，不相加；不再把运行测试通过冒充完整类型通过。

集成测试中的首轮供应商回执是隔离完成链的显式空输入夹具，仅用于让真实准备父进入待输入状态；没有用伪造非空输出证明修复。本补修证明新资料已进入实际新子任务的来源与冻结输入，不代表真实供应商一定生成候选。独立源码审查、根代理类型/worker/boundary、后续签名构建/安装及新的有界实机模型复验分别记录；当前已装99233的I-04仍partial。
