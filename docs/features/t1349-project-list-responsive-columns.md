# T1349 项目列表窄桌面列宽缺陷登记

本项为真实验收发现的独立既有问题，当前仅登记待审，不允许实现；不冒完整SPEC独立评审通过。T1345/46/47/48源功能不包含项目列表布局重构。

2026-10-18冻结候选954580cc7，实际1280×800和1024×680浏览器打开/projects，正确组的真实项目行/标题在DOM，但标题宽归零。两次toBeVisible各观察120秒失败。原始结果、截图、trace及归因见 docs/verification/t1346/candidate-attempt01/；PROJECTS_BASELINE_IDENTITY.json证明 frontend/src/features/projects/projects-page.tsx 与开工88945全文件SHA均d1c6f0f8a2efee54e15eb01d44eb79309926b864cc394e7e28f874aeb23d2227。

实际原因：表头及行固定非首列808px、6个间隔96px、左右padding40px；首列还需封面84px与间距16px。可用宽度不足时minmax(0,1fr)首列归零、阶段文字挤到封面上；1024右侧更多部分被父overflow-hidden裁切。打开链接仍在可视窗，但不能据此声明标题视觉通过。

![1024真实失败](../verification/t1346/candidate-attempt01/e2e-artifacts/t1346-account-group-switch-切组真实连续旅程-1024×680-t1346/test-failed-1.png)

后续应先按oil-ui-pro与现UI_RULES确定最小响应式列方案、独立SPEC评审，再基于同实体行与实际最小窗口失败修复。不得靠隐藏身份/删除合法动作或只换断言关闭本问题。本轮切组公共归属验证改为可见的真实project-row、正确标题文本、同ID打开链接可见且在视窗、旧组row为0；此只校验切组归属，不验本缺陷已修。
