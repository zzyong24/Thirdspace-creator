# T-893 内容雷达永久重试与长逐字稿弹窗根治验收

## 根因与修复

```text
用户点击生成选题
  ├─ 纯文本改写调用没有中止信号 ─→ provider 不返回时任务永久 running
  ├─ 重启只 recover 过期租约为 queued ─→ 没有 topic_preview 消费器，任务永久排队
  └─ textarea 随正文无限增高 ─→ 弹窗底部保存按钮被推到窗口外

修复后
  ├─ 改写节点 180 秒硬上界 + provider abort ─→ 成功或可重试失败终态
  ├─ 每个阶段保存检查点后续租 + 启动顺序 drain 到空 ─→ 中断任务可恢复且不重复执行
  └─ 弹窗三行网格 + 中间正文独立滚动 ─→ 两档窗口都能保存
```

## 红测证据

- `agent-runtime.test.ts`：模拟 provider 永不返回，旧实现连续三次均在 5 秒测试上限超时，证明
  `timeoutMs` 没有被消费，任务不会自行结束。
- `topic-preview-runner.test.ts`：新增启动恢复消费者、既有 claim 复用与检查点续租契约；旧实现没有
  `drainIntelligenceTopicPreviewQueue`。
- `intelligence-workbench.test.tsx`：旧弹窗没有视口高度上界、内部滚动区和固定尺寸 textarea。

## 绿测证据

```text
pnpm --dir ai-worker exec vitest run src/runtime/agent-runtime.test.ts
2/2 PASS

pnpm --dir backend exec vitest run src/modules/intelligence/topic-preview-runner.test.ts
6/6 PASS

pnpm --dir frontend exec vitest run src/features/intelligence/intelligence-workbench.test.tsx
49/49 PASS

pnpm --dir ai-worker typecheck
PASS
pnpm --dir backend typecheck
PASS
pnpm --dir frontend typecheck
PASS

pnpm --dir ai-worker test
49 files / 389 tests PASS

pnpm --dir backend exec vitest run src/modules/ingestion/ingestion.douyin.test.ts
39/39 PASS（全量并发运行时的 3 个五秒超时已隔离复跑通过）

node orchestrator/process/boundary-scan.mjs
无新增违规（基线 5，当前 5）
node orchestrator/process/semantic-boundary-scan.mjs
PASS
node orchestrator/process/orphan-scan.mjs
0 error
```

## 真实浏览器验收

隔离测试库创建真实账号、从 W3C 公开 RSS 采集真实作品，在 1536×1024 打开逐字稿弹窗并粘贴
120 段正文；随后把窗口缩至 1024×720。浏览器断言正文 `scrollHeight > clientHeight`、保存按钮底边
不超过 720 像素，并通过按钮真实调用 `intelligence.transcripts.uploadManual`；弹窗关闭后继续执行
选题生成与一键立项全旅程。聚焦 Playwright 运行退出码为 0。

## 全量套件诚实边界

- frontend 全量：329 files / 3080 tests 通过，4 项既有失败。两项是未更新的
  `material.generate.image/video` 工具名冻结表，两项是 `script.draft` 新增 `thesis` 后的旧上下文冻结表；
  失败文件及其生产定义均与本任务无 diff。另有一个素材用料链集成测试仍引用已经退役的 canonical
  Project fixture，隔离复跑同样报 `Project not found`。本任务没有修改这些测试、素材链或 Project 服务，
  不把整仓状态写成全绿。
- backend 全量：224 files / 2933 tests 通过，3 项抖音 ingestion 测试因与 frontend 全量并行抢占资源
  超过 5 秒；同一文件隔离复跑 39/39 通过。
- 本轮没有修改飞书 Base 记录、用户 CreatorOS 账号、模型配置或真实项目数据；也未把尚未打入安装包
  冒充用户真机已修复。
