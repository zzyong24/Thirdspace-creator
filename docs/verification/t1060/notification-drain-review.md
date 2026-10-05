# T1060 客户端尾通知独立证据

本轮只在 `/tmp` 写工件，未修改共享仓库，未运行真实 Agent、模型或浏览器，未读取任何登录凭据。子进程是固定上游的假 Agent，环境仅 PATH。

## 来源

- 仓库：`https://github.com/openclaw/acpx`
- 固定提交：`27efb1b57b9de22105a91e9154b1d29b51ede8cb`
- 原假 Agent：`test/mock-agent.ts`，下载原文件 `/tmp/t1060-acpx-upstream-mock-agent.ts`，SHA256 `18f7584018705d66eaeccedf0dc461eaa9fd4da4b107472c055a801369b4f2ee`。
- 原单测：`test/client.test.ts`，SHA256 `7abf4d9855309f683c794c9669260853aaa6e310e79a39b15ac072b5f9c6e731`。其通知排空测试直接检查原队列；本轮增加真实 stdio 场景。
- 许可 MIT，项目 vendored acpx 的原 LICENSE 保持适用。

未重新实现 JSON-RPC/ACP 协议。假 Agent 保持上游的 SDK、连接、会话和响应生命周期，只在原 `handlePrompt` 中增加 `creatoros-review-burst` 行为：并发发送 4096 个正文块，原 `prompt` 方法再发终态正文，然后返回 `end_turn`。

## 实际观测

实际当前复用 AcpClient，与假 Agent 的真实标准输入输出通道：

| 运行 | prompt 返回时已到宿主回调 | 原排空 API 返回后 | 尚未处理 |
| --- | ---: | ---: | ---: |
| 1 | 4080 | 4097 | 17 |
| 2 | 4088 | 4097 | 9 |
| 3 | 4071 | 4097 | 26 |
| 4 | 4068 | 4097 | 29 |

每次真实执行 exit 0，`waitForSessionUpdatesIdle({idleMs:0,timeoutMs:10000})` 均补齐到 4097。最后一次原始 JSON 位于 `/tmp/t1060-acpx-notification-review-result.json`。这证明 prompt response 不等于客户端回调已排空；不会把构造出的回调顺序当成自然传输证据。

随后以真实复用客户端 + 同一个上游 stdio fixture + 当前实际 `runCodexAcpInWorker` 运行非浏览器隔离测试。仅替换创建真实模型进程、桥和后台端口三个宿主边界，客户端事件/会话/prompt/排空均真实执行。当前 runner 使用原公开排空 API 后，结算正文完整包含全部 4097 个块，1/1 通过，retry=0，exit 0（17:24:16）。

这是本轮缺等待模式的实际观测及修复后 GREEN，不声称补拍了历史 TDD 红测，也不证明真实模型可用或原生权限配置已真机核验。

## 命令与工件

- 独立 runner：`/tmp/t1060-acpx-notification-review.ts`
- 真 Worker 隔离测试：`/tmp/t1060-acpx-notification-drain.test.ts`
- 仅 `/tmp` 配置：`/tmp/t1060-acpx-notification-vitest.config.mjs`
- 可整合补丁：`/tmp/t1060-acpx-notification-drain.patch`，包含可移植测试、原样上游假 Agent 和固定来源回执；未整合共享仓库。

命令从实际工作树的 ai-worker 目录执行：

```sh
./node_modules/.bin/esbuild /tmp/t1060-acpx-notification-mock-agent.ts --bundle --platform=node --format=cjs --outfile=/tmp/t1060-acpx-upstream-mock-agent.cjs --alias:@agentclientprotocol/sdk=./node_modules/@agentclientprotocol/sdk/dist/acp.js
./node_modules/.bin/esbuild /tmp/t1060-acpx-notification-review.ts --bundle --platform=node --format=esm --outfile=/tmp/t1060-acpx-notification-review.mjs --banner:js='import {createRequire as reviewCreateRequire} from "node:module"; const require=reviewCreateRequire(import.meta.url);'
node /tmp/t1060-acpx-notification-review.mjs
./node_modules/.bin/vitest run --config /tmp/t1060-acpx-notification-vitest.config.mjs --retry=0
```

保留真实的前置工具失败：首次将客户端和依赖全量捆为 CJS，依赖 `import.meta` 在工具构建中不兼容；一次 ESM banner 名称碰撞，随后改独立别名；隔离测试首版未写 stdin TS loader，及误用 `updateRuntimeOptions` 绑定回调导致 EMPTY_OUTPUT，均属本轮测试工件错误，修正为 `loader:'ts'` 与原 `setEventHandlers` 后实际通过。未将这些失败标成产品缺陷，也未将失败试验冒称成功。
