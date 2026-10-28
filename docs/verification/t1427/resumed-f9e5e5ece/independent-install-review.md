# f9e5e5ece 本地安装独立复核

> 接手说明：本轮只追加证据可得性备注；原结论和哈希仍指原验收时版本，不代表本机重跑。原文保留于提交 c8589fe7f。原件所在电脑依用户接手规划说明，本轮只核对本仓库。


审核时间：2026-10-25；实际安装文件哈希核对时间为 10:08:00 UTC（18:08:00 北京时间）。审核者 `/root/t1427_contract_review`，未实施本轮构建或安装。本次只读核对现有收据与非秘密产物，唯一写入为本报告。已读 T-1427 任务包 §1–5、§7–9，写前核对 §6，并读取当前 SPEC。任务包中的旧版本锚与 SPEC 的早期状态描述是历史上下文，本轮安装身份以下列实际冻结收据和文件为准，未改写这些历史记录。

结论：本轮证据足以支持“从固定入口构建的 f9e5e5ece 本地候选已安装到 /Applications/CreatorOS.app，安装文件与冻结产物一致；安装当时 CLI 已连通；现有数据保全摘要未见项目或组成员丢失”。未发现安装身份或摘要之间的矛盾。这不构成完整产品、模型矩阵、UI 或 full 验收通过。

## 构建、安装与候选绑定

`package-freeze.json` 绑定干净提交 `f9e5e5ece06d7d86dbb5bd38db76d18cc2437d84`；构建环境仅登记变量名，未保存密钥值，自动安装关闭。`package-preflight.receipt.json` 和对应日志记录四个打包相关测试文件、58 项通过、退出 0、2775 ms；`package-local.receipt.json` 的真实 argv 是 `pnpm -C frontend desktop:package-local`，在外盘工作树执行，退出 0、639114 ms，子进程组已关闭且无残留。日志明确采用 `release-fast`，生成 .app 与 DMG，然后按显式 skip-install 结束；之后的独立安装由 installation-proof 记录，不能将两步混为打包脚本自动安装。

本次没有重跑上述测试、打包或安装。实际流式读取并计算以下非秘密文件 SHA-256，均与冻结安装收据相同：

| 产物 | 实际 SHA-256 | 独立比较结果 |
| --- | --- | --- |
| `/Applications/CreatorOS.app/Contents/MacOS/CreatorOS` | `856ac0b35d4dabb2fc159fe9338a9402b26a84225209c57c2164f63684b3ecdb` | 与外盘构建 .app、expected、actual 一致 |
| `/Applications/CreatorOS.app/Contents/Resources/sidecar.tar.gz` | `7c7c92df1b487392c9b4649a6d30d7c4f5dd6994b2f5ebb06ab579c7081b440b` | 与外盘构建 .app、expected、actual 一致 |
| 用户 Downloads 与外盘私有 HOME 中的 `CreatorOS-1.2.0.dmg` | `79d023a39152ac8e31b862bdcbce70e30c9d13589bedea63060c47699af21193` | 两份实物相同，均为 847634540 字节，与 dmg-verify / installation-proof 一致 |
| 外盘 rollback .app 主程序 | `c135dcda9f169ae68c611a39bc77b6eda6ecce76721ed8300d4597a46db8fbaf` | 与 previous 一致 |
| 外盘 rollback .app sidecar | `a9be9fbbd90253bc3ab37423e54c6a6d3f1503d25c7fa9dbd0107e4c0d6b7750` | 与 previous 一致 |

安装应用 Info.plist 为 `cloud.aitongban.creatoros` / `1.2.0`。本次实际执行只读 `codesign --verify --deep --strict --verbose=2 /Applications/CreatorOS.app`，返回 valid on disk / satisfies its Designated Requirement；`codesign --display --verbose=4` 显示 arm64、adhoc/runtime、TeamIdentifier 未设置，CDHash 为 `1a97d5924ea32099de57a7c61bfc47dc2b3448dd`。这是本地临时签名有效，不是 Developer ID 签名、公证或公开发布通过。release manifest 的 `codesign.signed=false`、`notarize.notarized=false`、`validation.status=not-run` 与日志一致；额外冒烟、TLS、产物质量扫描未运行，不能由打包退出 0 覆盖。发布 attestation 仍为 claimEnabled=false、publishAuthorized=false。

`installation-proof.json` 的安装窗口为 09:51:59–09:52:38 UTC，记录 installed=true、CLI ok=true / mode=installed / connected=true / productId=creatoros / packageId=cloud.aitongban.creatoros。本次未再次调用业务或读取连接文件；CLI 连通结论限于该安装收据，不等价于所有模型能用。

独立读取 Git 对象，`f9e5e5ece` 到 `75b74649e43e001bf6682867c331e14308074a61` 的 34 个变化路径与 `control-only-candidate-update.json` 完全一致，均为 Stop hook、治理文档、任务状态、审核事件及证据；产品工作区、依赖锁、补丁和 reconcile 检查配置均未变化。后者可作为后续 full 的控制面候选，已安装二进制仍绑定 f9e5e5ece；没有证据表明按 75b74649e 重新构建，报告不作此声明。

## 数据保全与未完成范围

只审阅既有 `installation-before.json` 和 `data-preservation.json`，未读取用户数据库、项目文件、密钥、连接文件或运行中服务。摘要记录安装前后均 66 个项目、missingProjectIds=[]；before 的项目数组长度与 66 相符。成员前后数组精确相同、均 5 项，并与 installation-before 的成员数组一致；组 ID 一致、groupVersion 均为 1，组名为“月明水清深”。因此该安装窗口的公开项目清单与组成员摘要支持无丢失结论。它不是所有项目内容、附件、历史任务和数据库字节的完整性证明；本次没有重新获取 after 清单来独立重算差集，missingProjectIds 的结论来自已有保全收据。后续合法测试产生的新项目或任务也不应被误判为安装破坏。

候选秘密扫描原退出 1、32 条历史合成 fixture 命中保持；已读取另一审核者的 `candidate-secret-review.md`，其离线资格分析认为命中不是运行时秘密。本次没有重做该分析或把扫描记作退出 0。此项与安装产物身份核对分别记录。

模型矩阵仍在执行，不要求重发、不触发替代任务、不代签未完成组合。只读首轮官方 Pi 的 `0068-official-pi-turn1-get-1.json` 已确认任务 `ai-task-c34e9921-536` 为 runtimeStatus=waiting_user、errorCode=CHANNEL_MODEL_PAYMENT_REQUIRED，固定提示为 HTTP 402 支付或权益核验拒绝；顶层 status=running 不能解释为对话成功。安装与 CLI 连通没有修复或证明该拒绝已恢复。T-1412 full 仍需其真实终态收据，本安装独审不推导其结果；额度页验收按既有用户确认跳过，不补签 PASS。

## 证据绑定

以下路径均相对仓库根；原始收据没有由本审核修改。

| 证据 | SHA-256 |
| --- | --- |
| `docs/verification/t1412/resumed-validation/package-freeze.json` | `1ccb812935981e058abf8e3de372693e3fb8afb311369811a87ff13e4ff632c5` |
| `docs/verification/t1412/resumed-validation/package-preflight.receipt.json` | `3c922c8fd69d4261979287b9aa8014c11d2c677f253d64f84555de3a780749e2` |
| `docs/verification/t1412/resumed-validation/package-local.receipt.json` | `2d8bc4ee5c2cff10bc75d9f85bc936f6cf5d47d56165e8c9b6f3959a80760d16` |
| `docs/verification/t1412/resumed-validation/dmg-verify.receipt.json` | `3863258f250206484c2a4c53ec15f0eae16cb64b4d1a5bbdaaaa0436ae90701f` |
| `docs/verification/t1412/resumed-validation/installation-proof.json` | `0f1d55aa49a490f2589d14e3d4e3cb4d9dd4ead8e5515f8000df0a278c827883` |
| `docs/verification/t1412/resumed-validation/installation-before.json` | `9dff15af1d46fe83db6eb663de57e6d7dc7a46ccef22d24d1fda819442785fb3` |
| `docs/verification/t1412/resumed-validation/data-preservation.json` | `8f4911a728f165d7380241bd380f0266b3ab32084956e89fe02d8f07a5fe961e` |
| `docs/verification/t1412/resumed-validation/control-only-candidate-update.json` | `c4fb0797e69a229fa9f9120fe7593f2c553fffce147cade2808f919db5498318` |
| `docs/verification/t1427/resumed-f9e5e5ece/cli-retest/receipts/0068-official-pi-turn1-get-1.json` | `f320529d1b2c9d66501f21df41430c3d93caefb42c8f3d1999eb4033dc056006`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
