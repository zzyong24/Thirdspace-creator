# T-756 / T-758 BUILD 证据：渲染状态恢复与分镜局部补充选材

日期：2026-08-10（America/Los_Angeles）

## 结论

PASS（任务范围）。渲染任务进入待确认后，当前制作页会立即收到新状态并展示预览与采纳动作；刷新或
切换页面时，同一份已保存分镜会连同当次项目素材清单一起恢复。用户主动补充素材时，只运行一次
`material.match`，不再重跑分场、信息卡、字幕或总导演，也不会因为素材多而自动反复优化。

```mermaid
flowchart LR
  A["当前完整分镜"] --> B["用户可选：补充或换选项目素材"]
  B --> C["一次 material.match"]
  C --> D["只更新 B-roll 与时间线"]
  D --> E["场景、信息卡、字幕保持不变"]
  E --> F["用户确认后进入渲染"]
  F --> G["running → awaiting_confirmation 实时回传"]
  G --> H["当前页直接预览、采纳或丢弃"]
```

## 本次根治内容

- “补充素材”是可选操作。已有完整候选即使带旧审片记录，也可直接确认进入渲染；系统不会自动发起
  下一轮优化。
- 局部选材请求携带当前稳定分镜，并使用稳定 `attemptId`；双击或重复提交只会命中同一任务。
- 后端只调用一次 `material.match`。场景、信息卡、双语字幕和 SRT 被物理冻结；局部匹配失败时保留
  当前素材绑定，不回退到完整分镜链路，不继续消费模型。
- 手工选择的素材仍受当前项目 inventory 与真实 `assetId` 校验；没有扩大到全局素材库。
- 已保存的 `production.videoEditingPlan` 增加同源 inventory。刷新后 B-roll 下拉恢复素材名称和换选项；
  旧版未带 inventory 的方案只从当前项目已有用料链重建，不重跑 AI。
- `ExecutionTaskCard` 每次轮询成功、采纳或丢弃都会把新状态回传父页面；外层切换 taskId 时重建跟踪
  状态，消除“切一次 Tab 才显示结果”。
- 没有改视觉样式；只调整了准确的按钮和状态文案。

## 红测与聚焦回归

- 红测复现：旧“应用选材”路径会重新调用 6 个模型节点；恢复页面缺失 inventory；执行卡切换 taskId
  后仍显示旧任务。
- 前端聚焦：3 files / 47 tests PASS。
- 后端聚焦：2 files / 72 tests PASS。
- production contract：1 file / 5 tests PASS。
- test-integrity：0 errors / 1 个既有 coverage 配置 warning；新增用例和断言，无删除、skip 或 suppression。
- frontend、backend、contract typecheck：PASS。
- 本次三个前端实现文件 ESLint：0 errors。
- frontend production build：PASS（26/26 页面生成）；保留既有 Turbopack 外部依赖追踪 warning。
- `git diff --check`：PASS。

## 边界门禁

- boundary：PASS，无新增违规；仓库仍保留基线内 5 条。
- semantic boundary：PASS。稳定哈希只用于请求幂等，素材创作匹配仍由 `material.match` 完成。
- orphan：0 errors / 100 个既有 warning，双向链路 clean。
- 未执行视觉校验：遵循用户已经明确取消视觉校验的项目规则。
- 未调用真实模型、未发起真实渲染、未修改或清理用户数据，因此没有伪造真机/真实消费证据。

## 全量与全局状态（诚实保留）

- contract 全量：27 files / 148 tests PASS。
- frontend 全量并发实跑：323 files PASS、2 files FAIL；2973 tests PASS、3 FAIL、1 TODO。其中两个
  `context-deps-resolver.test.ts` 断言是既有 Skill registry 与冻结期望漂移；另一个预览测试来自最终修正前
  已加载的进程，最终对应聚焦文件已 47/47 PASS。未把这次全量结果写成全绿。
- backend 全量并发实跑出现多个不相干数据库测试超时并长期不收敛，已在保留输出后终止；本次触及的
  runner 与 production contract 聚焦回归 72/72 PASS。
- `reconcile`：3 errors / 9 warnings，未伪报全绿。错误是 T-746 review receipt、T-727 frontend
  receipt、T-722 frontend receipt 的既有漂移；本任务没有修改这些历史回执或其归属文件。

## 发布边界

本 Gate 只证明 T-756 / T-758 的代码与聚焦契约已经收口，不等同于 CreatorOS 正式发布 Gate。本次不
创建 tag、不触发 GitHub 安装包、不修改 Activity/Growth，也不对真实用户放量。
