# T-1420 继续核查（2026-10-28）

用户已明确选择：阶段1保持待验，先完成接手规划阶段3链接补注与阶段4盘点。未恢复或改动密钥，未替换已安装应用，未增加付费模型调用。

## 本轮已发生的证据

- 当前生产前端 `pnpm build` 成功，完整输出见 `t1420-next-build-20261028.log`。这是编译证据，不是 Mac 安装态验收。
- 授权环境下公开 CLI `status`、`access status`、`groups list` 成功；本机账号组「1」与抖音账号「我是谁」已核实。此前沙箱内的 CONNECTION_STALE 是进程可见性误判，不代表应用已退出。
- 调用现有 `buildLocalPackageEnv()` 预检失败：缺少本机 `~/.creatoros/verdict-signing.key`；同目录 `verdict-public.key` 也不存在。没有读取或记录密钥值。既有 sidecar 更新根预检 `runSidecarSigning({preflight:true})` 已通过。
- 当前分支还没有可供验收的新 Mac 包；真实模型正文、原生界面、原图 ZIP 的安装态验收继续未通过。

## 独立评审发现并已复现的两项缺陷

1. `creative-results.service.ts` 的 `createBundle` 外层 catch 把逐页生图 `queued / GENERATION_SUBMISSION_UNKNOWN` 误写成 failed，并返回成功回执。原预约缺 candidateId，后续既不能原键恢复也不能普通重试。只保留 queued 仍不够：前端成功收到 bundle 后会清除原队列，所以修复还必须保留可恢复的未知回执。复现见 `t1420-bundle-red.log`：后端真实数据库＋公开 transport，模拟 owner 已提交但回执丢失，另一页成功；期望拒绝未知回执，实际返回 partial_completed/failed。
2. `graphic-post-results.tsx` 的 `MediaPreview` 在获得下载 URL 时就标记已预览，图片未实际加载也开放采用。复现见 `t1420-preview-red.log`：完整与简洁两种工作台，图片尚未触发 load 时采用按钮已启用。

回归测试补丁保留在 `pending-regression-tests.patch`。为遵守用户先做阶段3/4的安排，本轮未开始修改以上实现；测试补丁尚未应用到活动源码，不把红测留在当前正常套件中。现有断言没有删改。

恢复阶段1时，先应用补丁并修复上述两项：未知提交沿原请求键恢复且成功页不重提；图片真正成功加载才开放采用，失败允许重新载入预览。再补齐当前分支 Mac 安装态与真实正文验收。正文旧候选为 `...` 的现象不能由当前源码静态检查判定已解决。

## 原始日志归档

本目录的 `.log` 原件受仓库通用忽略规则影响，已将逐字相同内容以 `.log.gz` 入库；原件保留在本机。文件映射、字节数及 SHA-256 见 [raw-log-archives.json](raw-log-archives.json)，解压与原件一致。构建成功、缺陷复现失败和全局对账既有错误均按原输出保存。
