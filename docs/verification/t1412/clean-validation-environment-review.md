# T-1412 干净验证工作树依赖环境独立复核

复核日期：2026-10-25。复核者：独立审查子代理 `/root/t1427_contract_review`。本次只读现有源码、文件元数据和收据，仅新写本报告；未重跑安装、esbuild、原八组验证、full 或真实业务，未读取用户 `.env` 正文。

结论：本次 172 个 `.bin` 生成脚本的精确路径重定位可作为测试环境准备接受，未发现该项的阻断。实际字节证明修改仅把主树依赖路径替换为干净工作树对应路径，不构成产品或依赖包实现补丁。这个结论只覆盖本报告核对的环境准备范围，不代表 T-1412 实现独审、原八组 Gate、full、安装态验收或官方对话已通过。

## 绑定与历史事实

- 候选提交：`4fb509fff576184c0b3bf3b73ca14178ace690a6`。
- 主树：`/Users/zyongzhu/Workbase/Thirdspace-creator`。
- 干净工作树：`/Users/zyongzhu/.codex/worktrees/t1412-full-validation/Thirdspace-creator`；独立读取 HEAD 与候选一致。
- 六个依赖目录：根目录以及 `frontend`、`backend`、`ai-worker`、`contract`、`mcp-server` 下的 `node_modules`。
- `offline-relink-receipt.json` 记录在私有 HOME 等 13 项显式环境中执行 `pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir …`，真实退出码 0；日志显示 pnpm 10.32.1、锁未改和 Already up to date。这只能证明命令成功，不能证明所有复制脚本已重生。
- `dependency-check.json` 仍保留首次真实失败：172 个脚本残留主树路径。后续 `shim-relocation.json` 和 `dependency-check-final.json` 是追加纠正证据，没有覆盖或改称首次成功。

## 独立只读核验

| 核验对象 | 实际检查与结果 |
| --- | --- |
| 172 个重定位脚本 | 逐一读取当前目标文件，全部为工作树内普通 `.bin` 文件；当前字节 SHA 与 afterSha256 一致；反向替换后 SHA 与 beforeSha256 一致；出现次数与收据一致。所有旧前缀原来只出现在 `export NODE_PATH=` 行，其路径后缀包含 `node_modules`，未改变命令、参数、条件或其他文本。 |
| 主树保全及文件独立性 | 172 个主树原文件 SHA 均仍等于 beforeSha256；源与目标逐项 inode 不同，权限 mode 相同。实际最终状态证明目标不是与主树共享同一 inode 的硬链接，且保留原可执行属性。 |
| 265 个 `.bin` 普通文件 | 重新只读扫描六个目录，均不再含主树绝对前缀。 |
| 4,998 个符号链接 | 重新只读枚举，不跟随链接遍历；绝对目标、解析后逃离工作树和断链均为 0。内部 workspace 链接仍落在本工作树。 |
| 66 个原生文件 | 当前工作树文件逐一计算 SHA，与 `state.json` 保存的克隆前 nativeBefore 完全一致，未发现缺失或改变。此结论覆盖该清单中的文件，不扩张为所有平台原生功能均已运行。 |
| HyperFrames 与 Pi 包 | 对实际已打补丁包目录比较源与目标的普通文件集合和字节，排除嵌套 `node_modules`：HyperFrames 59 个、Pi 611 个文件均一致，无路径集合差异。未把修改 `.bin` 等同于修改包源码。 |
| 锁与补丁 | 干净工作树和主树的 `pnpm-lock.yaml`、HyperFrames patch、Pi patch 当前字节完全一致，SHA 见下文。 |
| 候选源码 | `candidate-source-check.json` 的 5 个文件逐一匹配实际工作树 SHA，并与候选提交 `git show` 字节一致：`verify.mjs`、`check.mjs`、`hyperframes-cli-isolation.mjs`、`hyperframes.test.mjs` 和 `orchestrator/process/reconcile.config.json`。 |
| 原生烟测回执 | 只读 `native-esbuild-smoke.json`：在干净工作树通过固定 Node/pnpm 运行 `pnpm -C ai-worker exec esbuild --version`，exitCode 0，stdout 为 `0.28.1`，stderr 空；本审查没有重跑。 |

执行方提出通过临时文件与 atomic replace 避免写入共享 inode。现有 `shim-relocation.json` 没有记录该系统调用过程，因此本报告不把“亲见原子替换操作”作为已证事实；已经独立证明的是最终所有目标 inode 独立、主树字节保全、权限一致和全部变更精确可逆。对本项最终状态验收，这些证据足以排除共享硬链接导致主树被一并修改的结果风险。

## 哈希绑定

| 文件或对象 | SHA-256 |
| --- | --- |
| `clean-validation/dependency-check.json`（原失败） | `d1865cf80882e8cd551451fedb6689d80d0de9dab7768c532b33fc016cf1b362` |
| `clean-validation/offline-relink-receipt.json` | `dc4d639d0b6600633437c2b4b05909a7ed7b47d2c4be5ac58506afbdea92b2a3` |
| `clean-validation/shim-relocation.json` | `47a86ffb24dc0ce3efd276ae800e21b8274efaa605ab12a3a881857f5880eb43` |
| `clean-validation/dependency-check-final.json` | `ac1afadc18afa4bdbabe5f6e3a3c6fa04d5d1c6a01b8b46c272bd1db8135982d` |
| `clean-validation/native-esbuild-smoke.json` | `dbaff04e98387f579c323ace763dc9b2ba6e906923ca5692374b3d9353022319` |
| `clean-validation/candidate-source-check.json` | `b5d32c299e6dd67e9d64e09847688d1b25ddd2f23ea10cde86f9fcbc64789273` |
| `clean-validation/state.json`（本次读取版本） | `4e1e8a45b64f272302c46c89997f6575b9623ab702192b1acbbcb37a7490d0f2` |
| `pnpm-lock.yaml` | `c8cda15d07ebe8355d85916cb2e93f7d81ce5a38057ad2af2c3161338b3f888e` |
| `patches/hyperframes@0.7.54.patch` | `15761c896a52b54f07273e5031b38c4480484a466917f4cc65badf472149d5c0` |
| `patches/@earendil-works__pi-ai@0.80.7.patch` | `0845475547acfdae94e2b4f8daa2efa4d65c12e9f54c9a35aa9df5dc9ab3bd94` |
| HyperFrames CLI（最终收据绑定） | `1250669d951c4a462b7e4b5d574256f61978797ba3b941cc8491d620e3ef925b` |

## 后续仍适用的边界

`full-run-environment-review.md` 的原前置条件保持：不得向 full 全局注入 `DATABASE_URL`；owned PG 只投影规定的四项变量；私有 HOME、显式环境和干净源码只能限制配置继承，不能替代 OS 级网络/文件隔离证据；Cargo、浏览器资产及 LED-061 历史非秘密 fixture 需按各自真实准备和执行证据判断。NODE_PATH 包装器仍会附加已有的 `$NODE_PATH`，故后续执行环境继续不得继承外部 NODE_PATH 或其他预加载配置。

本报告没有评审后来出现的 `timeout-policy-original-eight` 执行结果，也没有据依赖准备成功推定 full 必能通过。后续产品或配置改动必须重新绑定其提交和真实 Gate；生成脚本的本次精确环境修正不放宽任何测试断言、范围或验收门槛。
