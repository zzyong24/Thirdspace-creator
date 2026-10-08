# T1093 独立实施复核

- 最终定向复核时间：`2026-10-08T23:44:27.786817+00:00`
- 正式 SPEC SHA-256：`9cceae8d6f01f5d5c4089748a8adb3e7c432b9f0650c5cea5b4caeabbbc81a72`
- 正式复评回执：`REV:267bf399a6b1`。
- 产品 SHA-256：`316665a03b8fd24b521944d14cfd09994b6913392355f651feac45c1f6a7d3e2`。
- 新增测试 SHA-256：`101c24c5c0360f296e409adf61b3d9034851cd21a379091af96e3d92e211dc2e`。
- 结论：**PASS_IMPLEMENTATION_AND_FREEZE_CHAIN / MAY_FREEZE_FOR_REMAINING_GATES**。未发现产品或当前范围测试缺陷；这不是安装版 Pi、打包、完整 reconcile、原生 UI 或 task complete PASS。

## 产品与范围

产品差异仍只有 `backend/src/modules/ai-runtime/assistant-functional-prompt.ts`。它只在 editor/creation 完整工具对存在时注入：

- native ticks 以 JSON number 整数示例表达，示例明确不是工程值；真实时间、ID、摘要、轨道和声音仍来自实际 read。
- creation 第一次 read 使用 `{}`，不猜 digest；成功后复制裸64hex、共同scriptSourceRef与完整两稿。
- 只有 `status:error + invalid_input + sideEffect:none` 才指导同一原任务以实际改变参数纠正；原参重复、权限/归属/版本旁路、unknown当none、续期和替代任务均禁止。
- 只有成功 propose host receipt 且业务候选无错误才可声称候选就绪。

原工具 description/schema/definition version/hash、Worker循环、公开合同、owner、采纳、期限和T1091六产品来源没有产品diff。严格门仍拒绝字符串数字和伪digest。

## RED / GREEN 与冻结链

### 原真实 RED

`red-methods.json` exit 1，新9例 `4 FAIL / 5 PASS`，精确缺失number示例、creation空读及两工具族纠错方法；日志 SHA-256 `d589d7081aad33fb13a8430d09425032f6c7f13ed0be41f6446a964403cd7e9f`。该RED保留。

### 方法与原 assembly GREEN

`green-method-assembly.json` exit 0，三文件 `119 PASS`，日志 SHA-256 `ed7479639775c3199c3f5e6ea36bbf2aec22e2c62261786c82b6a048e37f8fdf`。

### IMPL-001 历史发现与关闭

初次独评发现新增9例只直接调用 helper，不能证明新增方法进入实际 assembly/submission 冻结链；该历史 finding 保留。

作者随后只改新增测试文件，新增 editor / creation 两例：

1. 通过真实 `prepareChatTurn` 取得 actual assembly、toolDefinitions、modelMessages；目标reader是显式准备夹具，清楚声明不代领域归属或真实Pi。
2. 通过原 `createChatTurnSubmissionService` 和隔离 PGlite 创建真实project/conversation/message/task/execution。
3. 断言新增方法 marker 位于最终 `assembly.system` 和持久 `execution.payload.modelInput.system`；工具定义含正确工具对。
4. 以产品 `chatInputDigest(modelInput)` 核对 `aiTasks.inputData.modelInputDigest`。
5. 同源再次 submit 必须 replay，故意把 assemble 改为抛错后仍不再装配；task/execution payload与inputData序列化字节保持。

第一次补测因 import 指向不存在的 `../project/project.service` 导致 suite `0 test / exit1`，日志 SHA-256 `b62de503750dda0fb991ebcdcd2f8aae30f8f30e35953edcb5c68c3954a69c96`。这是测试接线错误，不是TDD RED或产品失败，历史原样保留。仅修正import后：

- `green-freeze-methods-correct-import.json` exit 0；新文件 `11 PASS / 0 skip`。
- 日志 SHA-256 `3cc7ba47160580d295b3373cf8e7c1d7b4094e625acff047a326893a00ace792`。

**IMPL-001 已关闭。** 两例没有伪造模型成功、领域owner或联网调用，仅证明SPEC要求的装配与冻结链。

## 当前其它实际 Gate

- 原完整 Worker 两文件：`8 PASS`，122.166秒，日志 SHA-256 `15f0720415a5b2f61d61496cc76efb9345ef6d9b969a60d6eaba9cc65e30786a`。
- backend新增测试后的 typecheck 日志 SHA-256 `931327292db1bbff62320abd8dd57032ae19ad39b9e012d04233dc49d716637b`，输出无错误。
- 当前已落盘的 public owner/front、协议Worker、contract/backend/frontend type、boundary/semantic/orphan记录均为exit 0；最终提交证据仍应由root绑定完整命令清单和当场源码SHA。

## 保留边界

- `context-compile` 与 `progress generate` 的原 exit2 继续保留；交互式单人路径使用显式implementation context-plan，不伪造Task Packet成功。
- 当前可以冻结代码、完成剩余Gate并进入固定入口打包，但不能由单测推断Pi必然遵循。
- 新包装后仍须真实 Pi native / creation：正式 propose host receipt ok、精确base/script refs、业务DTO不变、零采用、原key重放及重启恢复。失败或unknown不得换key重发。
- 原生preview 409、Code Mode外部提示、T1092和旧42项全局欠债仍保留；不签原生UI、全功能或用户验收。


## 最终类型接线复核（当前字节）

冻结链测试随后仅做类型接线校准，产品字节保持 `316665a03b8fd24b521944d14cfd09994b6913392355f651feac45c1f6a7d3e2`：

- `RequestContext`、`ChatTurnSnapshot`、`ChatTurnAssembly` 使用正式导出类型，未用 `any` / `unknown` 或断言绕过 submission 合同。
- `prepareChatTurn` 返回的 `modelMessages` 经 `chatWorkerInputSchema.shape.messages.parse(...)` 转成正式持久化消息，保留合同允许的完整消息结构；没有手工删字段来迎合类型。
- 测试目标reader仍只作为明确准备夹具；领域owner、真实模型和联网能力没有被虚构。

两次历史类型失败完整保留：

1. `types-backend-with-freeze-tests.json` exit 2：错误 import 加上 assembly callback / ModelMessage 类型不匹配，日志 SHA-256 `5997a21b56582120e8f947e63d536c3e84a9aeb440d197ca860b411812e8b24f`。
2. `types-backend-final.json` exit 2：import已修，但正式 ChatTurnAssembly 仍拒绝宽泛 `ModelMessage[]`，日志 SHA-256 `50b62c504dcd2f1296e0e42d3a82cd57f7e87ae878ef1f81b8fcae4ccecdde9e`。

它们是新增测试的类型接线失败，不是产品RED，不能抹除或改称TDD。最终证据：

- `green-final-methods.json` exit 0，新增11例 + 原functional/assembly 共 `121 PASS / 0 skip`；日志 SHA-256 `d52c85820953c3bc89ff5838cbcce1f65f9b15ad5d83f40991501a614d58437e`。
- `types-backend-final-contract-messages.json` exit 0，41.095秒；日志 SHA-256 `931327292db1bbff62320abd8dd57032ae19ad39b9e012d04233dc49d716637b`。

最终范围仍是一个产品文件和一个新增测试文件。当前字节可以冻结到 main 并进入固定入口打包；真实安装 Pi native/creation、包来源、HTTP启动、原key恢复与完整reconcile仍必须按SPEC实际完成，不能由121例代签。
