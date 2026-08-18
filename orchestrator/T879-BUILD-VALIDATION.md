# T-879 构建验证：总导演自动修片时间线闭合

## 真实失败证据

- 最新加密日志 `sidecar-2026-08-18.log.enc` 只读解密后确认：
  - `video.scenes`、`video.cards`、`video.broll`、`video.subtitles` 均已完成；
  - `video.director` 两轮都返回 `status=ok`；
  - 任务 `ai-task-23b30dc3-160` 最终在第⑤步被取消，错误为“总导演自动修片后时间线仍未闭合”。
- 因此失败不在模型超时或模型无输出，而在确定性修片后的实际覆盖仍有空洞。
- CLI 已按公开发现流程验证，但本次桌面启动未开启 CLI 完整访问，`status/access status` 均返回
  `CONNECTION_NOT_FOUND`；未绕过连接读取数据库、连接文件或用户项目。

## 红测

```text
pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts -t 'T-879 RED'
```

修复前结果：`1 failed`，20 秒两条长字幕只得到 `[0, 10]` 两个卡片插点，期望连续覆盖所需的
`[0, 5, 10, 15]`；复现了插点被吸附/去重但游标仍前进的真实缺陷。

## 修复

- 确定性补位落在真实 gap 起点，不再吸附回 SRT 句首；卡片内容取该时刻活动的原始口播行。
- 每次真实新增后重新合并 card/B-roll intervals，再寻找首个 gap；补位未新增时不再推进假游标。
- 开场由素材退出点接力，不在 0 秒强插一张与真实素材重叠的卡。
- `overlay`、角标与纯辅助层不再算主舞台覆盖。
- 最终仍存在不可修复结构损坏时，安全日志记录脱敏的 sceneIdx/code/message，继续禁止半套候选落地。

## 验证结果

```text
pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts
# 97 passed

pnpm --dir backend exec tsc --noEmit
# PASS

pnpm --dir backend test
# 225 files passed / 2 skipped；2926 tests passed / 4 skipped

node orchestrator/process/boundary-scan.mjs
# 无新增违规

node orchestrator/process/semantic-boundary-scan.mjs
# PASS

node orchestrator/process/orphan-scan.mjs
# 0 errors；100 条既有 warning

node orchestrator/process/reconcile.mjs
# 本任务 LED-039 与全部 lesson guard 均通过；全局仍因 96 条既有 strict receipt/历史归档行错误退出 1
```

新增回归覆盖：稀疏长句、长句内活动原句、素材提前退出后的尾洞、短场景、overlay 假覆盖、重复插点。

`reconcile` 的 96 条错误均指向 T-859/T-858 等旧任务的 SPEC receipt 链接或归档旧行缺“验收”列，
不包含 T-879，也没有任何 lesson guard 失败；属于当前修片范围外的既有控制面迁移欠债，因此未伪报全绿。

## 尚需真机回执

代码级闭合与回归已完成；原用户项目未被修改，也未自动重提计费任务。包含本修复的桌面包安装后，
需要用户对原项目重新发起一次分镜并确认候选真实生成，才能补上正式包的运行态回执。
