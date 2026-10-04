# T1060 桌面打包增量独立复核

## 结论

PKG-001 已解决，本次限定增量未发现新的阻断问题，`findings: []`。这是来源与隔离打包行为的实现复核结论，不是 Windows 启动、真实 MCP 或图片链路验收结论。此前其他实现审查结论保持原范围。

## 实际核对

- 当前 `tools/windows-closure-rat/stage-layered-workers.mjs:7-22` 将原 Codex alias 身份校验提取为同一函数，校验真实根包名称、精确 optionalDependencies 声明、平台版本以及唯一 os/cpu。源包定位仍在第 34 行调用；复用目录现在在第 64 行、复制之前调用。因此同版本但名称、os 或 cpu 错误/缺失的既有包不能只凭非空二进制通过。
- 第 9 行对非 Codex 平台 alias 立即返回 false，尚未读取 owner；第 62 行原版本一致性规则、第 70-79 行原补齐复制和依赖递归保持原行为。补丁没有增加第二套闭包复制机制或改变其他依赖的身份策略。
- `stage-layered-workers.test.mjs:150-170` 对三个既有层分别覆盖五类坏身份，确认原字节门能通过样例、修复后的物化拒绝样例且不改写坏 manifest；合法三层分别保留已有转换字节，再次物化新增数为 0。三个层为 `frontend/.next/vendor`、`layers/browser/vendor`、`layers/local-ai/vendor`。
- Windows 原生文件门仍沿这三个层检查 Codex 可执行文件和 fs-safe 绑定的存在、普通文件类型和非空字节（第 107-118 行）。本轮未把夹具字节解释为可执行性或 ABI 兼容性证据。
- `frontend/scripts/desktop/build-sidecar.mjs` 本轮未变化，其前次复核的真实根包声明、精确 alias/版本/目标及原闭包复制路径结论保留。

## 测试与证据归属

- 核对委派实现工件 `/tmp/t1060-vendor-identity-edit/red.log`：25 项，10 通过、15 失败；失败正是三层的五类坏身份。该 RED 是提供方当场执行日志，本独立复核未重演历史 RED。
- 核对同目录 `green.log`：25 项全部通过。
- 本独立复核在当前共享工作树实际运行 `node --test tools/windows-closure-rat/stage-layered-workers.test.mjs`：exit 0，25 通过、0 失败、0 跳过（644.604375 ms）。只运行既有隔离测试，未写共享源码。
- 根会话报告的临时项目真实 ACP 文本回合为 authenticated、protocol 1、end_turn、正文 170 字符及真实 providerTurn metadata，且无工具调用。本复核未执行该回合；这项报告只能支持该文本回合范围，不能替代 MCP、图片或 Windows 验收。

## 当前 SHA-256

| 工件 | SHA-256 |
| --- | --- |
| `tools/windows-closure-rat/stage-layered-workers.mjs` | `505ad6474f25d894cab63821eb4e9247cc8be290a3db285eea857d748a9e7427` |
| `tools/windows-closure-rat/stage-layered-workers.test.mjs` | `583c917724e9ec96b89b4ce45704b7546d60b7772fe839b5a20d28d7f70fd161` |
| `frontend/scripts/desktop/build-sidecar.mjs` | `aca1c2313f3295eafcad580cd9e16dd612828d73232ad168595e9a1999c1a570` |
| `/tmp/t1060-vendor-identity-implementation.patch` | `d952947d2b71f902b75901c547d748eb0f6f72a5c5e4c23658a56b5dd835adc2` |
| `/tmp/t1060-vendor-identity-tests.patch` | `6af1b06ec0ee53fb359a98f96aa0a425e1fe8f90ab87f4ea1df7d66d4d4953cf` |
| `/tmp/t1060-vendor-identity-edit/red.log` | `ce5c551516ee423fd132f154001245b3e4a839c7462a696222125595589839bc` |
| `/tmp/t1060-vendor-identity-edit/green.log` | `32cfa9b08ee9eaa62f64a785c29fab8f9dad5a64a08a841ec6df5417763abdc0` |

所有共享源文件只读；仅本报告写入 `/tmp`。
