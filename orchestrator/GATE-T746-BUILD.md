# T-746 BUILD Gate — CreatorOS 内置“重新输入激活码”

日期：2026-08-09
状态：本机实现与回归通过；Windows 编译与安装包行为交由本轮正式双平台流水线验证

用户已明确取消视觉校验；本任务不生成或伪造视觉旅程收据，以组件交互测试、原生行为测试和正式包
双平台编译作为当前验收证据。

## 用户确认与产品边界

- 用户已明确放弃独立 EXE，改为 CreatorOS 正式版设置内的产品功能；
- 入口只清本机激活状态，不联网、不包含激活服务器地址、不调用解绑或换绑 API；
- 不删除项目、素材、数据库、账号、模型配置、模型密钥、机器身份或工作区；
- 不改变服务端绑定事实；重启后进入既有激活页输入新码；
- 前端不接收路径、激活码、服务地址等参数，唯一调用是无参数原生命令
  `license_reset_local`。

## 独立评审

首轮评审发现旧 sidecar 仍持有权益与 Windows 路径一致性风险，结论 FAIL；修订后明确“先锁链路并
确认旧 sidecar 停止，再清理固定白名单，最后由原生壳整体重启”，复审通过：

```text
PASS[REV:ebc8dce5c4c3]
```

## TDD 证据

RED：

```text
cargo test activation_reset::tests --lib
结果：1 pass / 3 fail
原因：清理模块、停止先后顺序与保留项实现尚不存在。

pnpm exec vitest run src/features/settings/activation-reset-control.test.tsx
结果：FAIL
原因：设置入口组件尚不存在。
```

GREEN：

```text
cargo test --lib
结果：160 pass / 0 fail / 1 live test ignored

pnpm exec vitest run \
  src/features/settings/activation-reset-control.test.tsx \
  src/features/settings/settings-page.test.tsx
结果：33 pass / 0 fail

node --test tools/reset-creatoros-activation.test.mjs
结果：12 pass / 0 fail（维护者备用脚本）
```

Rust 覆盖：sidecar 停止先于删除、停止失败时零删除、固定白名单、业务数据全保留、Windows
`HOME → USERPROFILE` 路径一致性、源码无 URL/网络调用。前端覆盖：非激活态不显示、取消不调用、
确认只发无参数命令、失败如实提示。

## 工程门

```text
pnpm --filter creatoros-frontend typecheck
结果：PASS

pnpm --filter creatoros-frontend build
结果：PASS（保留仓库既有 Turbopack 动态路径 warning）

定向 ESLint（T-746/T-747 前端文件）
结果：PASS，0 error

cargo fmt --check
结果：PASS

node orchestrator/process/boundary-scan.mjs
结果：PASS；无新增违规，剩余 5 条均在既有基线

node orchestrator/process/orphan-scan.mjs
结果：PASS；0 error / 100 existing warnings

node orchestrator/process/test-integrity.mjs
结果：PASS；0 error / 1 existing coverage-config warning

git diff --check
结果：PASS

node orchestrator/process/reconcile.mjs
结果：2 error / 9 warning；仅为 T-727 与 T-722 的既有 watched-path receipt 漂移。
T-746/T-747 的 manifest 日期、边界、孤儿链、review event chain 与 lessons 均通过；不篡改历史
receipt 洗绿。
```

完整 `pnpm --filter creatoros-frontend lint` 在本轮生产构建后会扫描被生成到
`frontend/src-tauri/sidecar/frontend/.next` 的压缩构建产物，因此报 1042 个
`no-require-imports` 等生成物错误；本次源文件定向 lint 为 0 error。未为规避该现象擅自改 lint 或
发布配置。

## 未伪造证据

- 当前机器只编译了 macOS 条件分支；Windows `JobObject` 的确认停机分支需由正式 Windows
  GitHub runner 编译和打包验证。
- 本轮没有执行真实换码或修改服务端绑定；产品功能的承诺仅限本地状态退出。
