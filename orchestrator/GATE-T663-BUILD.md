# T-663 BUILD Gate：内置 IP 课程与课程阅读器

> 状态：代码 Gate 已通过；双端安装包流水线与 macOS 本机真启动证据待补。

## 发布资产

- 课程来源：`win-video-tutor` Skill；仅在设计追溯中记录来源，运行时不依赖开发机路径。
- 稳定课程 ID：`xuehui-ip-practical-course`
- 结构：6 个模块、22 节课、119 个知识点。
- 随包课程组合 SHA-256：`de10a7289f66937d2016c02adadc65c83a3d28175212a4e465bdd29b970b57c3`
- 构建前与 sidecar 复制后均执行 `frontend/scripts/verify-built-in-course.mjs`，数量、正文、逐课 hash 与组合 hash 任一不一致即失败。

## 已通过的代码 Gate

- 课程资产校验：PASS。
- 课程阅读器、课程解析、用户知识隔离、幂等投影聚焦测试：PASS（19/19）。
- 既有知识库页面、标签、经验、交互、关系图回归：PASS（50/50）。
- backend knowledge service：PASS（24/24）。
- frontend typecheck：PASS。
- backend typecheck：PASS。
- frontend production build：PASS。
- boundary scan：PASS；0 条新增物理架构违规。
- orphan scan：PASS；0 error。
- 独立 SPEC 评审：`PASS[REV:44fafb228b46]`。

## 全局 reconcile 现状

2026-08-02 预检时，T-663 自身未被报错；全局 reconcile 仍因既有任务 T-635、T-642、T-645、T-653、T-656 的旧审查回执漂移而失败。该失败不由本任务代码引入，最终验收不得把全局 reconcile 描述为通过。

## 双平台发布证据（流水线完成后回填）

- GitHub Actions run：待回填。
- macOS artifact：待回填。
- macOS 本机安装与真实启动：待回填。
- Windows artifact：待回填。
- Windows 安装后 GUI / WebView 主页面真实启动：待回填。
