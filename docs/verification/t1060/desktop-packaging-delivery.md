# T-1060 Worker 打包物化增量交付

日期：2026-10-04。共享工作树只读；所有修改、测试临时包树、证据与补丁回放位于 `/tmp/t1060-worker-packaging-edit` / `/tmp/t1060-worker-packaging-replay`。未安装、下载或执行跨平台依赖，未构建 Windows/完整桌面包。

## 根因

1. `tools/windows-closure-rat/stage-layered-workers.mjs::stageLayeredWorkers` 只有 jsdom/readability/mammoth/pdf-parse 四个物化根。T1060 已声明的 Codex0.159.3、fs-safe0.21.3 外置依赖未从真实源闭包物化。
2. 普通 `build-sidecar.mjs::bundleWorkerExternalPackages` 把 `@openai/codex/package.json` 当包名传给 `findPnpmEntryForPackage`，无法匹配真实 manifest.name。
3. Codex 平台包是 npm alias：请求名 `@openai/codex-win32-x64`，真实 manifest.name 仍为 `@openai/codex`，version=`0.159.3-win32-x64`。只剥 package.json 仍不能定位；分层原 `packageRoot` 也会错误拒绝这种真实包。

## 最小改动

- 分层仅追加 Codex/fs-safe 主包物化根。原 `stageMissingDependencies` 遍历其真实 optionalDependencies，并保留现有目标 `win32/x64` 与已有 vendor 层。
- `packageRoot` 只识别 Codex 的既定平台 alias；必须来自真实 Codex 主包的精确 npm alias 声明，resolved manifest 的 name/version/os/cpu 全部吻合。任何通用 alias 或伪造同名 manifest 仍拒绝。
- 分层沿原三 vendor 层确认目标 `codex.exe` 与 `fs-safe-native.node` 是非空文件，缺失诚实失败；已有其他合法 vendor 层可复用，不新增第一层目录假缺失。
- 普通打包仅把入口请求去掉 `/package.json`，可选精确来源版本传给原 finder。Codex 平台 alias 需根包实际 optionalDependencies 声明一致，按真实 name/version/os/cpu 选择原 entry，并以原请求 alias 名建立顶层解析锚。
- 所有复制继续使用原 `stageMissingDependencies`、`materializeNestedEntryTree`、`copyPnpmClosureVerbatim`，没有新的 copy 工具、依赖管理器或运行器。未修改 worker 外置解析请求清单。

```mermaid
flowchart LR
  S[真实锁定包与平台声明] --> A[原 stageMissingDependencies / 原闭包复制]
  A --> V[现有 vendor 层与解析锚]
  V --> B[核对真实名称、版本和目标字节]
  B --> P[进入原发行流程：Windows真机仍待验]
```

## 实际验证

| 证据 | 结果与范围 |
| --- | --- |
| `red.log` | 原生产源码 + 第一份测试：2 pass / 4 fail，exit1。 |
| `extra-red.log` | 追加同名伪造 alias、已有 vendor 层测试，修正前5 pass / 2 fail，exit1。 |
| `declaration-red.log` | 普通根包实际声明的源码检查修正前6 pass / 1 fail，exit1。 |
| `green.log` | 最终 `node --test tools/windows-closure-rat/stage-layered-workers.test.mjs`：7 pass / 0 fail，exit0。 |
| `ordinary-regression.log` | 隔离 Vitest 原 `build-sidecar.test.mjs`：19 passed，retry0，exit0。 |
| 补丁回放 | 原before快照按下表串行 `git apply`，三最终文件全部字节MATCH。 |

`evidence.json` 包含完整日志路径、SHA与统计，`source-before.json` 为原3文件SHA，`implementation-manifest.json` 为2生产文件前后SHA。测试用模拟原生文件证明复制/身份边界；没有把假fixture字节当可执行二进制。

只读当前真实 pnpm 源：Codex主包0.159.3、darwin-arm64平台0.159.3-darwin-arm64、fs-safe0.21.3均返回精确entry；Windows0.159.3-win32-x64返回null（本机未装）。不能登记Windows真实启动、原生binding加载或跨平台发行PASS。

## 补丁顺序

| 顺序 | 文件 | SHA256 |
| --- | --- | --- |
| 1 | `/tmp/t1060-worker-packaging-tests.patch` | `109a2e22bee7b9a6aeb8155c3779507f361d44c1873a028cb3336c1857e33d16` |
| 2 | `/tmp/t1060-worker-packaging-extra-tests.patch` | `56a665682868c9d809bfd7e7aaa4a354a94737a203600a9c89013c18cb84007b` |
| 3 | `/tmp/t1060-worker-packaging-source-tests.patch` | `591cd2599d53e72c250da52978d2234bd0b71e30032d5b15b2759b3997cae7ea` |
| 4 | `/tmp/t1060-worker-packaging-implementation.patch` | `6af6a3e69a7e7fda9a7019b56d952dddcdcd571caf86ffa2fa22e711fc02c129` |

写集仅：`frontend/scripts/desktop/build-sidecar.mjs`、`tools/windows-closure-rat/stage-layered-workers.mjs`、其现有 `stage-layered-workers.test.mjs`。控制面、DEC和集成Gate由root负责。
