# T1094 安装版最终独立复核

- 复核日期：2026-10-09（Asia/Shanghai）
- 源码提交：`e71022fff7cee5bb8b5917bba33b498e017f0133`
- DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`
- DMG SHA256：`72b7764d6f99ca739dd9a642a46f694b74d4ba7fb7d638e81942019c353deecc`
- DMG 大小：840,213,865 字节
- 复核方式：只读证据与当前提交；未运行 CLI、模型、浏览器、数据库、构建或安装
- 结论：**PASS_INSTALLED_T1094_LIMITED_SCOPE**

## 结论范围

证据足以证明 T1094 的有限安装目标已经实现：固定源码提交构建并安装后，原 `ai-task-434be109-200` 可经公开 get/list 严格读取为真实 `partial`，原消息、结果、任务 ID、execution ID、source message、model input digest 和幂等键保持；同一原键与完全相同 payload 回放返回原 message，没有新模型任务、采纳或业务 DTO 写入。温和重启后上述事实继续成立。

这不等于 T1094 任务完成或全功能通过。正式相关 Gate 仍有 9 个 Article 与 6 个 ai.task-execution 旧失败，全局 reconcile 仍为 42 error / 0 warning；原 Pi 联合候选没有成功，原生窗口体验、真实模型、平台流程与全功能均未代签。

## 源码、构建与包来源

`source-freeze.json` 绑定：

- HEAD/branch：`e71022f…` / `main`；构建开始时工作树干净；
- 16 个 T1094 产品文件与 T1093 测试夹具 SHA 和独立实施复核一致；
- 未发现新私钥、token 或敏感路径；
- `taskComplete=false`，并明确保留 42/9/6 项失败。

`postbuild-source-no-drift.json` 证明固定入口构建 exit 0 后 17 个源文件未漂移。构建耗时 348.279 秒，四项打包基本测试共 45 PASS。当前工作树存在的是安装后证据文档更新，不改变已经冻结和构建的提交来源。

`new-package-verification.json` 证明：

- `hdiutil verify` exit 0；
- 源应用与挂载 DMG 内应用均通过 `codesign --deep --strict`；
- `CreatorOS`、`creatoros-server`、`sidecar.tar.gz`、`Info.plist` 的源包与 DMG 挂载字节逐项相同；
- 版本为 1.2.0，本地 ad-hoc 签名，未公证；
- 包内迁移和编译运行时来源有明确 SHA 绑定。

因此该 DMG 可以归属于 `e71022f…` 的本地构建；证据没有把本地签名写成公证或正式发布。

## 安装与启动

`new-app-installation.json` 记录原 App 经 `osascript` 温和退出并确认进程结束，未执行 `pkill`；随后用临时安装路径复制并切换到 `/Applications/CreatorOS.app`。全程：

- `backupCreated=false`；
- `dataReset=false`；
- `forcedKill=false`。

首次启动与温和重启的验证分别绑定安装文件 SHA，均观察到：

- sidecar startup verified；
- main navigation request；
- main page load finished；
- 公开 CLI 连接与安装模式检查 exit 0。

外部观察脚本总时长包含探针和 CLI 读取，不能解释为精确冷/热启动性能。证据也没有证明用户亲眼操作过原生窗口。

## 原任务与数据不变证明

首次安装回读和温和重启回读共同证明：

- 原 task 200 的 `status=partial`、`runtimeStatus=partial`；
- `executionTaskId=execution-task-434be109-201`；
- `sourceMessageId=ai-msg-434be109-199`；
- `modelInputDigest=0c16752c4977feab31a92647b31706f3db90fb8252d3f2611fbd93cf191f189c`；
- `idempotencyKey=chat:ai-msg-434be109-199`；
- 原消息 2 条，SHA256 `809402ccf20a89cd2be87ee753bc640a8f4b41aef5939ebd3d336eb4ca9d07b3`；
- 原结果 1 条，SHA256 `2b5279b5f577fa672e18681c6eef99d19d51d223963fb206dbe29b2bf937bdcd`；
- 同一原键、同一 payload 回放返回原 message，任务列表不变；
- `newModelTaskSubmitted=false`、`adopted=false`。

原 10 个任务在重启前后保持原状态。四个业务 DTO 前后 SHA 保持：

- Article `aaa74d5794a1ec1cc40172d0b13db609bddcaabcb12556479429b898836ad547`
- Graphic `6de267299eb5ab3434b817b8a6ca05ef631e3559b672b8224d9a5c91e8bfb7c3`
- Native `ca93818fe60a756cc97d9a977385391fda17b827fe10e8c26908316d69059816`
- Composition `c72f419b9afa3afbea82c850dc537928d91f0c9038fcf52df237b3659d462bd5`

`warmSameOriginalTasksAndData=true` 将首次与重启后的任务、回放、消息/结果和 DTO 对照闭合。证据支持“公开读取修复且没有附带业务写入”，不支持“原 partial 已转成功”或“联合候选已生成”。

## Gate 与全局边界

完整 reconcile 实际 980.162 秒、exit 1、42 error / 0 warning，日志 SHA256 `5a7dc597bbef244902c857fc708f2a8e4fbfe10583fb9d46624d709b7079ea5a`，与 T1091 保存的 42 项日志逐字相同，没有新增。本轮仍保留：

- 正式 Article 9 FAIL；
- 正式 ai.task-execution 6 FAIL；
- T1096 后续诊断；
- T1095 / 原 Pi 联合候选缺口；
- 原生 GUI、真实模型与平台流程待验。

这些事实允许对 T1094 的安装读取修复作有限 PASS，但不满足 taskctl complete 或“全部 Gate 通过”。BACKLOG 保持 T1094 为进行中是诚实状态。

## 未代签

- 原生首页视觉、窗口切换与用户主观体验；
- 真实模型再次执行或候选质量；
- Pi 联合候选成功或采纳；
- 原生拖拽、播放、导出；
- 平台登录、采集、发布；
- 正式签名、公证或外部发布；
- 全功能、完整 reconcile PASS、T1094 task complete。

当前证据没有发现阻断有限安装结论的新缺口。
