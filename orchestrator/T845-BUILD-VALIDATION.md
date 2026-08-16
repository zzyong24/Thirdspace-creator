# T-845 Windows HyperFrames 分层模块解析修复验证

## 结果

生产 `exec.video.render` 已与 Windows closure RAT 使用同一模块解析契约。Windows 分层 runtime
中的 HyperFrames 子进程现在显式执行：

```text
node --require <runtime>/frontend/creatoros-module-resolver.cjs <runtime>/layers/core/render/vendor/hyperframes/dist/cli.js render ...
```

开发态和传统 `node_modules` runtime 继续直接执行 HyperFrames CLI。`NODE_OPTIONS` 仍不透传，
没有扩大子进程对模型密钥、数据库或对象存储凭据的可见范围。

## 红测

实现前运行：

```text
pnpm --dir backend exec vitest run src/modules/execution/video-render/executor.test.ts
```

结果：22 项中 4 项失败，分别证明生产 argv 缺解析器、缺解析器无前置错误、传统布局兼容无约束、
错误裁掉缺失包名。

## 绿测

```text
pnpm --dir backend typecheck
pnpm --dir frontend typecheck
pnpm --dir backend exec vitest run src/modules/execution/video-render/executor.test.ts src/modules/execution/child-env.test.ts
node --test tools/windows-closure-rat/*.test.mjs
node orchestrator/process/boundary-scan.mjs
node orchestrator/process/semantic-boundary-scan.mjs
git diff --check
```

结果：

- backend typecheck：PASS。
- frontend typecheck：PASS。
- backend：26/26 PASS。
- Windows closure tests：14/14 PASS。
- boundary：无新增违规，保持既有基线 5。
- semantic boundary：PASS。
- diff check：PASS。

## 诊断改进

HyperFrames 子进程现在分别保留有界错误首部和尾部，能够同时显示 `Cannot find package` 的具体包名
与 `ERR_MODULE_NOT_FOUND` 错误码；Windows、macOS、Linux 用户目录名会被替换为 `[USER]`，密钥形状
继续脱敏。

## 尚未伪造的证据

当前机器是 macOS，不能把本机 TypeScript/闭包契约测试写成 Windows 安装包真机通过。最终用户验收
仍需在 Windows 构建环境重新出包，安装后从桌面 UI 制作一个短视频，观察捕帧、编码并取得有效 MP4。
旧安装包不包含本修复，重复重试仍会失败。
