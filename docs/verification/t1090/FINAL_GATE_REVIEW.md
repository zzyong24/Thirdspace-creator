# T1090 实施最终 Gate 独立复核

- 复核时间：2026-10-09（Asia/Shanghai）
- 复核方式：只读最终结果、日志与五路径字节；未修改仓库，未运行测试、数据库、模型、App、构建或 Git 操作
- 前置静态实施复核：`implementation-review.md` SHA-256 `5b6fe4aa7a6512824f154de4a5390f270e1d0bc4f19001fb93c9f22029604955`
- 结论：**PASS_IMPLEMENTATION_GATES；可以提交冻结的四个产品文件并按既有用户授权进入本地打包。reconcile、实际打包与安装尚未完成，不能签任务完成。**

## 最终字节绑定

五路径与前置静态复核完全一致：

| 路径 | SHA-256 |
|---|---|
| `backend/src/modules/ai/chat-turn-history.ts` | `7fe5cb7ef3c499107b5570de8ddc081d9da169181d887e7af7d58943a856d727` |
| `backend/src/modules/ai/chat-turn-submission.service.ts` | `2dfe0b81703688458fdd93c61f43e635204b0b00fb3cc8305746931377cca64d` |
| `backend/src/modules/ai/chat-turn-completion.service.ts` | `029dccdb1b6f316e5ae7b73133e1b125dc2902d8e59f8716b550560249c30b96` |
| `backend/src/modules/ai/external-chat-turn.service.ts` | `ff4386742c6dc15be75195b037f28077f769cacb947edb32b75070357af850b3` |
| `backend/src/modules/ai/frozen-chat-history.service.test.ts` | `2a68fa6297e18670d33279be35462fb46a73a5b8252eb6b2bef72d53b9a3eb20` |

因此前置审查关于机械历史选择、旧 digest/ID、owner/workspace/project、lease/fence、账本、回执和终态校验未放宽的结论继续成立。

## 实际 Gate

### 后端冻结历史与原相关回归

`frozen-history-green.json` SHA-256 `a6b80ce0f72d970616bf3f193bc47949054abdd6cb642adf2184a3e04b761765`：

- 精确运行新增 frozen-history、原 completion、submission、external、proposal 五个文件；
- 5 files / 139 tests 全 PASS，0 skip，exit 0；
- retry 0，单测试与 hook 均 180 秒；
- 日志 SHA-256 `0f1b3da6eb20ac91595571b4774df0232c9d947b843bf01723d6272fa02a392b`。

该结果包含新增 21 项的 GREEN，并保留原 completion 60 例及其他三个原文件，没有用只跑 helper 代替公开 service 路径。

### 实际 Worker 恢复

`worker-recovery.json` SHA-256 `4442b498e61e10dc04b2b43ff05baca21cf4d6f24dd6d2ea9502b7e903807ec9`：

- 原 T1089 三族恢复与 T1086 四 scope 两个 frontend 文件保持原字节；
- 2 files / 8 tests 全 PASS，0 skip，exit 0；
- 耗时 134.307 秒；
- 日志 SHA-256 `db4d76eead9eac28f2b8f949599d38e045c8cd0139a4ecf547d6cd9e6a6c3e79`。

它补齐前置报告中 pending 的完整 Worker/公开 service port 回归；不等于 live Codex、模型供应商或 UI 人工操作。

### 类型与结构边界

| Gate | 结果文件 SHA-256 | 实际结果 |
|---|---|---|
| backend typecheck | `91346a32a95ac25e991158f234d99fa89b559dc0580317d3b4efa5ef81497e5a` | exit 0 |
| frontend typecheck | `0bbca6e47ed5b3e8624d30c4ac834b16abea6b6f796ee815d579148918b00f47` | exit 0 |
| boundary scan | `d6745dc4b4b73865a07870a51529fc9b802165f57d62d990f8e3267a5c1a9d84` | exit 0 |
| semantic boundary scan | `f62b5efe728bc3b02dc9769a6d4ccb7c2ec746229aee8db87bcf86bfad2b5ad9` | exit 0 |
| orphan scan | `e82fc7bd1cd201d9cff33f7ad00614235355543961b93bba954fc1a8ad4d2cf0` | exit 0 |

### 打包入口基础回归

`package-basic.json` SHA-256 `35fad121e7973c7357f9243ef4c0502bcc48d227c24a2685f6118d9ff56e10fd`：4 files / 45 tests 全 PASS，0 skip，exit 0；日志 SHA-256 `cf16cba96415c6a3360aca365f09b1e107584dad0370485fa31503cd971466d9`。日志中的 `--localstorage-file` warning 没有转成测试失败，但该结果只是打包脚本回归，不是实际生成和验证 DMG。

## 准入判断

当前证据满足提交冻结实现的条件：

1. 原 RED `33581c...` 被同一五路径的 139 项 GREEN 覆盖；
2. 原 completion/submission/external/proposal 回归全部保留并通过；
3. 完整 Worker 恢复与类型、物理边界全部通过；
4. 五路径 SHA 与独立静态审查绑定一致；
5. 没有新增 schema、迁移、权限、模型判断、第二账本或 UI 范围。

因此可以提交四个产品路径及其新增测试，并按用户既有授权启动本地打包。此结论只批准下一步，不代表打包产物已经存在或可安装。

## 仍待完成

- `reconcile-current` 仍在运行，尚无结果；若失败必须保留实际错误并做范围归因，不能写全绿。
- 尚无本轮实际 DMG build、包内 source/hash、签名/挂载验证。
- 尚无本轮安装、真实首页启动与公开 AI 只读复验。
- 未验证 live Codex、全功能 UI、平台登录、发布或用户内容写入。

在上述结果出现前，不能执行 T1090 的最终完成裁决，也不能把本报告表述为安装版或产品整体 PASS。
