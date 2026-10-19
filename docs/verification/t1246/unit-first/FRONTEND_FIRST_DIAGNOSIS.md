# 前端完整首轮逐文件归因与最小写集

冻结533224f，原559文件520PASS/38FAIL/1SKIP；5078例4911PASS/158FAIL/8SKIP/1TODO，另1unhandled error。原断言/范围未变，无重试；全部559测试源码SHA与开跑前一致，结果集合missing/extras=0，专属tree HEAD533/git clean，见frontend-after-source-discovery-check.json。

下表只列可支持的分类；空write_set表示诊断不足、不能预先改产品或断言。每文件的真实源SHA、每个失败稳定ID/完整stack、共同因果与下一核查点均在frontend-first-file-classification.json。数目是失败/该file原声明，不能把共同前置修法当已经验证下游。

| 原file | 失败/声明 | 当前根因类别 | 集中最小write_set（空=未确定） |
|---|---|---|---|
| src/test/function-key-invariant.test.ts | 1/2 | 确定性路由别名与旧穷尽断言不一致，批准合同待独评 | frontend/src/test/function-key-invariant.test.ts |
| src/test/icons.test.ts | 2/3 | 诊断不足，未签产品或fixture |  |
| src/server/chat-task-submission.integration.test.ts | 2/14 | 空稿拒绝父终态合同差异，签修复仍需独评 | frontend/src/server/chat-task-submission.integration.test.ts |
| src/server/legacy-frozen-source-read.integration.test.ts | 4/4 | 诊断不足，未签产品或fixture |  |
| src/server/persistence-client.favorites-diagnostics.test.ts | 2/2 | 诊断不足，未签产品或fixture |  |
| src/server/platform-worker-entry.integration.test.ts | 1/3 | 诊断不足，未签产品或fixture |  |
| src/server/review-insights-worker-entry.integration.test.ts | 3/3 | 诊断不足，未签产品或fixture |  |
| src/server/script-worker-entry.integration.test.ts | 2/5 | 诊断不足，未签产品或fixture |  |
| src/app/(creator)/layout.guard.test.tsx | 1/10 | 诊断不足，未签产品或fixture |  |
| src/components/overlays/new-project-dialog.prefill.test.tsx | 2/2 | 诊断不足，未签产品或fixture |  |
| src/components/shell/zero-account-guidance.test.tsx | 1/6 | 诊断不足，未签产品或fixture |  |
| src/features/article/article-workbench.test.tsx | 9/19 | 诊断不足，未签产品或fixture |  |
| src/components/ui/creator-date-picker-antd.test.tsx | 1/7 | 已确认旧fixture未冻结今天的月份 | frontend/src/components/ui/creator-date-picker-antd.test.tsx |
| src/features/copilot/chat-diagnosis-card.test.tsx | 1/5 | 已确认错误态诚实文案差异，批准合同/下游待独评 | frontend/src/features/copilot/chat-diagnosis-card.test.tsx |
| src/features/projects/publication-result-actions.test.tsx | 12/13 | 已确认旧global mock未接当前冻结typed client；逐例下游仍待 | frontend/src/features/projects/publication-result-actions.test.tsx |
| src/features/projects/quick-create-work.test.tsx | 3/3 | 已确认旧global mock未接当前冻结typed client；逐例下游仍待 | frontend/src/features/projects/quick-create-work.test.tsx |
| src/features/projects/work-editing-recovery.test.tsx | 2/12 | 诊断不足，未签产品或fixture |  |
| src/features/settings/check-update-card.test.tsx | 8/8 | 已确认fixture缺公共端口 | frontend/src/features/settings/check-update-card.test.tsx |
| src/features/settings/identity-section.test.tsx | 5/5 | 已确认fixture缺公共端口 | frontend/src/features/settings/identity-section.test.tsx |
| src/features/settings/settings-interactive-region.test.tsx | 52/80 | 已批准ready门与旧fixture前置冲突，逐例下游仍待 | frontend/src/features/settings/settings-interactive-region.test.tsx |
| src/server/__module_integration__/assets.persistence-client.test.ts | 2/7 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/content-calendar.persistence-client.test.ts | 1/3 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/data-foundation-prefer-real.persistence-client.test.ts | 1/3 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/knowledge.persistence-client.test.ts | 1/3 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/local-platform-binding.persistence-client.test.ts | 4/7 | 已确认生产严格载荷回归；逐例到达阶段待独评/复测 | backend/src/modules/platform-account/account-binding.service.ts |
| src/server/__module_integration__/platform-account.persistence-client.test.ts | 1/4 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/publication-cover-bytes.persistence-client.test.ts | 1/1 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/publishing.persistence-client.test.ts | 3/3 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/query-services.contract.test.ts | 1/12 | 诊断不足，未签产品或fixture |  |
| src/server/__module_integration__/search-indexing.persistence-client.test.ts | 2/5 | 诊断不足，未签产品或fixture |  |
| src/server/intelligence/share-import-runner.test.ts | 1/5 | 诊断不足，未签产品或fixture |  |
| src/server/ingestion/account-binding-stage.integration.test.ts | 10/12 | 已确认生产严格载荷回归；逐例到达阶段待独评/复测 | backend/src/modules/platform-account/account-binding.service.ts |
| src/server/ingestion/chromium-guard.test.ts | 2/14 | 已确认旧fixture外层不覆盖真实政策预算 | frontend/src/server/ingestion/chromium-guard.test.ts |
| src/server/ingestion/douyin-cdp-comment-diagnosis.integration.test.ts | 1/1 | 诊断不足，未签产品或fixture |  |
| src/server/ingestion/douyin-throttle-integration.test.ts | 2/14 | 已确认旧fixture外层不覆盖真实政策预算 | frontend/src/server/ingestion/douyin-throttle-integration.test.ts |
| src/features/reference-editors/noterelay/native-bundle.test.ts | 4/4 | 已确认共同fixture输入缺字段；合同归属待最终独评 | frontend/src/features/reference-editors/noterelay/native-bundle.test.ts |
| src/app/api/v1/auth/auth-routes.test.ts | 3/8 | 本机身份初始化合同与旧canonical断言差异，批准范围待独评 | frontend/src/app/api/v1/auth/auth-routes.test.ts |
| src/app/api/v1/local/reset-workspace/route.test.ts | 4/9 | 已确认owned环境与旧fixture路径前置冲突 | frontend/src/app/api/v1/local/reset-workspace/route.test.ts |

已确认的Reporting13与NoteRelay4共同前置细节见FRONTEND_COMMON_FIXTURE_REVIEW.md；52设置失败需逐例核，下游不可机械签fixture；1unhandled另保frontend-unhandled-first.txt。绑定生产根因source绑定在account-binding-runtime-source-binding.json，原10/4失败与不触达下游均保留。路径/命令别名/主用户具体消费者见FRONTEND_PATH_IDENTITY_REVIEW.md，预算与日历见TIMEOUT_CALENDAR_FIXTURE_REVIEW.md，创作typedclient及文字状态见FRONTEND_CREATION_REVIEW_IN_PROGRESS.md；已知消费者不代表批准方向或已复验。其他旧注册表数量、phantom账号/组、已退役UI、历史手建DDL/新偏好字段等仍需获批SPEC/真实消费者因果，不能一概归旧债或改数字。

原opt-in公共timeout smoke单独追加1PASS/exit0，真实reader31138ms，原550k/outer1.2M；保持全包原skip。它不是真实平台、模型或原生App，见TIMEOUT_SMOKE_RESULT.md。后端与后续四类型检查仍运行/待返回，未签全部首轮完成。
