# T-868 BUILD 验证：video.cards 根级动态协议局部恢复

## 用户可见结论

用户本次错误与 T-865 的静态枚举越界不同：`video.cards` 的 JSON 字段都能通过基础 Zod schema，
但最终动态协议检查发现某张卡的 `sceneIdx/at` 或 `visualPlan` 动作/引用关系不合法，并只返回根级
`custom path=[]`。旧恢复器依赖具体字段路径，无法知道是哪张卡失败，因此文本兜底仍整批报错。

本次不放宽协议，也不猜模型本意。恢复链把每张卡重新交回原动态 schema：

```mermaid
flowchart LR
  A["同一次模型 JSON"] --> B["静态 schema 局部恢复"]
  B --> C["逐卡执行原动态 schema"]
  C -->|"原样合法"| D["保留卡片与 visualPlan"]
  C -->|"删 visualPlan 后合法"| E["保留卡片，降级可选动效"]
  C -->|"仍不合法"| F["只丢该张坏卡"]
  D --> G["整批重新通过原动态 schema"]
  E --> G
  F --> G
```

## TDD 证据

### RED

命令：

```bash
pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts -t 'T-868 RED'
```

结果：`1 failed | 90 skipped`。真实形状中 `grow` 错用 `opacity`、另有一张 `sceneIdx=9`；旧
`normalizeObject` 返回后，原动态 schema 仍为 `success=false`，与用户日志的根级 `custom` 一致。

### GREEN

```bash
pnpm --dir ai-worker exec vitest run src/nodes/structured-node.test.ts src/prompt/templates/video-decisions.test.ts src/prompt/creative-output-recovery.test.ts
pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts
```

结果：AI Worker `37 passed`；Backend `91 passed`。

覆盖：

- generateObject 的同一响应携带可解析 JSON 时，直接局部恢复，模型调用仍为 1；
- 动作属性动态非法：只删除 `visualPlan`，保留卡片正文；
- `sceneIdx` 越界：只删除该张卡；
- 同批前后合法卡完整保留；
- 恢复结果重新通过原动态 schema；
- 未解析错误消息、未猜 role/动作、未放宽 schema、未增加模型请求。

补充回归：AI Worker 全量 `49 files / 385 tests passed`；AI Worker 与 Backend typecheck 通过；
`semantic-boundary-scan`、`boundary-scan --quiet`、`git diff --check` 通过。Backend 全量运行时多个与
本任务无关的数据库服务测试同时出现约 16 分钟级资源争用超时，已停止该失真运行；本次修改文件的
独立 Backend 回归稳定为 `91/91`，未把全量环境争用伪报为通过。

## 明确未做

- 未调用真实模型或产生计费；
- 未自动重跑用户当前失败任务；
- 未修改用户项目、候选或模型配置；
- 安装版需包含本修复的新本地开发包后，再由用户主动重试分场。

## 本地开发包交付

- 冻结候选：`e618632334e1b23e590025cae92e793aeb763d35`；版本四处一致为 `1.1.0`。
- 固定入口：`pnpm -C frontend desktop:package-local`，构建、替换安装与启动均成功。
- 安装包：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`。
- DMG SHA-256：`11a28c002f4f81b5aeb569a1f1badf83c8eeb9e162ff5eeefef9944d462e9194`；
  `hdiutil verify` 为 VALID，`codesign --verify --deep --strict` 通过。
- 已安装 `/Applications/CreatorOS.app` 并真实启动；窗口数为 1，sidecar 监听本机动态端口，首页
  HTTP 返回 `302` 正常跳转，未出现连接拒绝或白屏。
- sidecar tar SHA-256 为
  `8a8c663ffc7470a311b7f9102b69064d6c82cd844a14f4597654c80a8fde413e`，安装运行时 stamp 与之完全一致。
- 这是开发环境本地包，仅做 ad-hoc 签名；没有 Developer ID 签名、公证、推送、tag、GitHub Release
  或生产发布。
