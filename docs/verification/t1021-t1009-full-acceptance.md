# T-1021：T-1009 全量验收记录

## 验收结论

2026-09-20 在 Apple Silicon Mac 上完成 T-1009 产物工作台的代码回归、真实私有 socket 端到端、原生导出、桌面打包、覆盖安装和 CLI 只读冒烟。最终所有本机验收项通过。

## 自测发现与修复

首次运行真实 Mac 组合验收时，7/8 通过，模型工具链登记后的 Blob 回读失败，报错为 `OwnershipError: 产物不存在`。继续接入真实原子端口后，工具调用和产物均已落库，但任务被标记为 `TOOL_REQUIRES_RECONCILIATION`。

根因有两处：

1. 真实组合测试宿主只转发了 `dispatch`，遗漏 `commitAndSettle` 与 `markUnknown`，没有覆盖聊天任务的 v2 原子产物协议。
2. v2 原子结算回执保存内部能力名 `artifact.register`，而模型冻结调用使用提供商工具名 `artifact_register`。跨进程重复 ACK 的内容完全一致，仍因名称不一致和 JSON 属性顺序差异被拒绝。

修复内容：

- 真实 Mac 验收宿主转发产物原子结算与未知态端口，并断言任务使用 `artifactProtocolVersion=2`。
- 产物谱系同时冻结内部能力名与模型回执名；正式结算、未知态、迁移和对账统一写入模型回执名。
- 已结算工具的重复 ACK 按工具调用 ID、冻结工具名和 JSON 传输后的结构内容做幂等核对；内容变化仍拒绝。

## 测试证据

| 范围 | 结果 | 覆盖内容 |
| --- | ---: | --- |
| Contract | 6/6 | 工作台能力、结果与请求协议 |
| Backend | 54/54 | Blob、产物版本谱系、原子结算、未知态、权限与跨进程幂等 ACK |
| Frontend | 47/47 | 产物 API、历史、卡片、预览、HTML 渲染与导出 |
| 真实 Mac 主机 E2E | 8/8 | 私有 socket、文件写读查、账号/任务/fence 隔离、双版本 Blob、HTML→PDF/PNG、模型工具链、随包 Node 命令 |
| Rust 原生导出 | 2/2 | 字节/MIME/大小校验，取消、覆盖与写入失败区分 |
| 桌面打包脚本 | 42/42 | 本地包、安装替换、产品身份与运行时装配 |
| TypeScript | 通过 | `next typegen` 与 `tsc --noEmit` |
| 桌面运行时冒烟 | 通过 | sidecar ready、首页 200、浏览器 hydration、未授权 dispatch 403 |

真实模型工具链使用本地 OpenAI Chat 兼容流式夹具，只替代模型选工具的外部网络响应；工具预留、启动、执行、原子结算、Blob、PDF 渲染和 Worker IPC 均走真实实现。

## 安装包与安装后验证

- App：`/Applications/CreatorOS.app`
- 版本：`1.2.0`，构建号 `1.2.0`
- 启动进程：PID `8371`
- DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`
- DMG SHA-256：`fcbbc2f56c7fcc0ca086abc61cf2d4c8c80788dff57ca9eaa5260370af76b0bc`
- 构建 sidecar SHA-256：`55830ad0d4cfedcbc365fbd264dc6c1eb6221c8b436c470cae1afbec76a58647`
- 安装包内 sidecar SHA-256：`55830ad0d4cfedcbc365fbd264dc6c1eb6221c8b436c470cae1afbec76a58647`
- `hdiutil verify`：通过
- `codesign --verify --deep --strict`：通过本地 ad-hoc 签名校验

CLI 安装后只读冒烟：

- CLI：`0.1.0`，契约：`0.4.0`
- 服务连接与访问：`ok`，`full`
- 操作目录：258 项
- 绑定账号：1 个
- `projects.list` 描述：成功
- 绑定账号下 `projects.list`：成功，返回 83 条并记录 request ID

## 验收边界

- 本轮未在 Windows 真机运行；Windows 的导出错误分支由 Rust 单测覆盖。
- 本轮未调用外部商业模型，避免把网络或额度状态混入本地功能验收。
- 本地包使用 ad-hoc 签名，未执行 Apple Developer ID 签名与公证；这不影响本机覆盖安装和功能自测。
