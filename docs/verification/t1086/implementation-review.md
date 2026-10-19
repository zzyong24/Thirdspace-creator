# T1086 实现独立复核（最终证据绑定）

- 复核时间：2026-10-08T17:29:33.628668Z
- 复核类型：只读实现与证据复核
- 候选 HEAD：`3a60fafc4fd299d2a0d2efc403ee6a24691075de`
- 结论：`PASS_IMPLEMENTATION_EVIDENCE`
- 限定：此结论不代表安装版、真实模型、完整 contract registry 或 T1089 通过。

## 结论

T1086 当前五个产品文件及五个测试文件与已评审边界一致，未发现必须修复的实现遗漏。最新四族前端真实 Worker/Public owner 回归为 4 PASS、0 FAIL、0 SKIP；后端 owner/host/prompt/assembly/production 相关回归为 213 PASS、3 SKIP；最终前端类型检查退出码为 0。因此，T1086 当前实现可以按已有流程进入后续提交与安装验收。

这项通过仅覆盖本地实现和已经发生的测试。安装版及真实模型仍待验证；T1089 的“已注册账号关联旧 group=null 来源”缺口仍然开放；完整 contract suite 的 43 个既有失败也没有被本次结果洗绿。

## 四族归属证据

最新前端回归覆盖：

1. 纯组；
2. 组账号；
3. `legacy-registered`；
4. `legacy-premigration`。

四族均经过完整 prepare、Pi Worker 和公开 owner 读取链，实际统计为 6 次读取、7 次工具调用、8 个模型轮次，业务 DTO 零变更。结果文件 SHA256 为 `6c8241afbe960829fffb9e5617c1af95f2ddcf452445d22a17b16b81ee70a934`；日志 SHA256 为 `7a8dc207293533794a72917679a619273173cd4faa5af250e8dac2e90499a41b`，耗时 72.845 秒。

`legacy-premigration` 夹具只通过原公开 account repository 在隔离运行库创建旧账号。执行前后真实 group 与 membership 数量均为 0，提交上下文、execution 和 conversation 的 `groupId` 均为 `null`。部分父记录出现 `grp_legacy_<accountId>`，这是既有 workspaceFilter 使用的账号 canonical 归属标签，不是实际组，也没有凭空创建 membership。读取仍只允许 `groupId=null` 或同一账号的 canonical 标签，跨账号与真实其他组继续拒绝。

先前把所有父记录都要求为 `groupId=null` 的测试假设不符合现有 canonical 归属规则；其真实失败仍保留：结果 SHA256 `0b6539f7667cdf4e367da020c333a8a35651f9c254960cc0e1d8b9c4e00cfd90`，日志 SHA256 `576968579284124c4abb3c8439cd596fc7f1a10101fafb5b1506d6bff83fd505`。最终校准没有放宽 owner 判断。

## 当前源码绑定

产品文件：

- `contract/src/resources/assistant-system.ts`: `a258e187b20bd54c994d2bbff7a25e281506ced3862ca8f92963f0916cbc063b`
- `backend/src/modules/ai-runtime/chat-tools.ts`: `1f737085ed0f1cec960747df0d405e048e7fef9a4975fdf0c705464500adb752`
- `backend/src/modules/ai-runtime/chat-system-tool-host.ts`: `310586b85ec56efca0434ec165eac0d316fd4eaef12701d8bcd06d17ea416286`
- `backend/src/application/chat/assistant-system-root.ts`: `7fc71a6c6a86805760a663d60aac7b3fd04443f389b6f2de23199f0b860b5fa3`
- `backend/src/modules/ai-runtime/assistant-functional-prompt.ts`: `d7459c59697ef89c332bf4738a6918e22b77f46b3b35180c18f8a10508e0d20a`

测试文件：

- `contract/src/assistant-system.test.ts`: `fff4016197b673c7e79b0eb83901d8b14da165650e8fd787e35da34bafd9bf9f`
- `backend/src/modules/ai-runtime/chat-system-tool-host.test.ts`: `38ca68d172e887740d1161a8036717f1a0b3b7588be5aa8a955fc8804573acee`
- `backend/src/application/chat/assistant-system-root.integration.test.ts`: `d192f72b5a193cb92303ead1806ca7d735c25dea0344b7905c5ad78e70143c35`
- `backend/src/modules/ai-runtime/assistant-functional-prompt.test.ts`: `c4dbcf91c7ed0a26595cb26b61ff92cb91181c1d72b353e0704de8b0d0342a35`
- `frontend/src/server/assistant-native-editor-read.integration.test.ts`: `0a8bd5d488491a3955d6435acffc9429bde16d4af137fa349c19bb90ceeadcbb`

最终前端类型检查结果 SHA256 为 `88a5780acaa65c327f9fe1875a52f9900c6750d4eb00cce3cdf4d865cd462759`，日志 SHA256 为 `4c0cd880abe2a1a1a1f20e2f9d2825951e19ae4e848a3f36d2216d3b9e20d035`，退出码为 0。

后端相关最终结果 SHA256 为 `ba3b67473d994a372360f3b6f0b58d2999a717997e6f21c732a6ecd34f5107ff`，日志 SHA256 为 `878947ef5142c5ba3efded2f08f27c970c2d43cd9b5294c2fde3315dc728803c`，实际 213 PASS、3 SKIP。三个 skip 必须继续按其原条件解释，不能写成 216 全通过。

## 明确保留的边界

- 未进行新版安装包验收。
- 未运行真实付费模型，因此不声称真实模型通过。
- T1089 的真实注册账号旧 `group=null` 来源问题未被本次 premigration 夹具关闭。
- 完整 contract suite 仍有 43 个既有失败。`contract-registry-baseline-source-comparison.json` SHA256 为 `77d40176d0f5605db50cd6f3af65b70521d2b6dd19e0ad564dc31ba9a3881719`，确认 44 个 registry 源文件与基线 `3a60fafc4fd299d2a0d2efc403ee6a24691075de` 字节一致，T1086 没有新增公开 ENDPOINTS。该全局欠债不能写成 T1086 回归。
- 本报告不代表 CreatorOS 全功能、T1085、T1088 或其他任务通过。
