# T1216 自动截图 fixture 类型范围独立复核

2026-10-11，先读 `orchestrator/context/T-1216.md` 与本任务 SPEC，再只读现有 fixture 及实际安装 Playwright 1.60.0 类型定义。当前为前置范围评审，尚未修改 fixture 或运行新验收。结论 **PASS：仅补泛型注册即可，不需改变运行逻辑**。

## 代码证据

- `frontend/tests/helpers/test-environment.ts:114` 当前为无自定义类型参数的 `base.extend({...})`，第 161 行却注册 `t1207ScenarioCapture`，导致自定义属性未在 fixture 类型集合声明，并使该回调的 `page/context/provide/testInfo` 失去正常上下文推断。e5c 和当前已有五条诊断全文一致的实际日志已保存。
- 实际安装 `playwright/types/test.d.ts:6659` 声明 `extend<T extends {}, W extends {} = {}>(fixtures: Fixtures<T, W, TestArgs, WorkerArgs>)`，返回类型保留内置 test/worker 参数并加入自定义类型。`TestFixture<R, Args>` 将 use 的值类型和 `TestInfo` 明确传入回调；这里自定义 fixture 不产值、仅 `await provide()`，声明为 `void` 与现有语义相符。
- 原自动 fixture 在 provide 后保留测试错误，再截图/索引，双错误用 `AggregateError` 保留；`{auto:true}` 及 context HTTP/WebSocket 外网拦截、失败报告和 WeakMap 清理均已有实际代码，泛型注册无需触及这些路径。

## 准入范围与验证

仅将现有声明改为 `base.extend<{ t1207ScenarioCapture: void }>({...})`；泛型为类型信息，保持 test scope 默认与原 `auto:true`，不新增 worker fixture、不注入运行值。保留对象及回调主体逐字不变，包括错误捕获/重抛、截图选择和路径、attachment/索引、`provide()` 时机、网络 guard 和清理。不得用 `any`、ts-ignore、关闭类型检查或排除测试文件处理诊断。

改后真实运行 Packet 的 `pnpm --dir frontend exec tsc --noEmit` 与 `git diff --check`，并检查 diff 只有该泛型声明。本轮不运行 E2E、不新增低价值镜像测试，也不把类型修复签为真实截图或产品 UI journey 通过；原生命周期和外网隔离逻辑没有运行改动。当前仅范围 PASS，最终 GREEN 与退出结果待实际发生。

## 2026-10-11 实现与实测最终复核

结论 **PASS**。已只读当前 `git diff` 与本任务 before/after 日志，并从原 HEAD 取该文件做精确比较：仅把首次 `base.extend({` 替换为 `base.extend<{ t1207ScenarioCapture: void }>({` 即与当前文件全文相同，fixture 对象和所有回调主体逐字不变。因此没有运行时生命周期变更，原 provide 时机、截图/索引、单错重抛/双错 AggregateError、`auto:true`、HTTP/WebSocket 网络隔离和清理均保留；未使用 any、ignore 或排除文件。

`before.log` 实际正好五条原诊断；`after.log` 无类型诊断，主执行当场报告 `tsc --noEmit` **exit0**。空 after 日志本身不能单独证明退出码，本结论明确结合主执行的实际退出结果，不伪造额外日志内容。本人另跑这两精确测试路径的 `git diff --check`，实际 exit0。本轮未编辑 fixture 或产品，只追加本评审记录。

本结论只签最小类型实现与当前前端类型检查结果，不代签截图已经真实执行、产品 UI E2E 或全局 GREEN。旧 T1026 progress generate 失败没有改 validator/旧 write_set；新 pending 控制条目不等于 done/e2e，相关流程失败与其它全局债继续保留。
