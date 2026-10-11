# 稿件编导上下文指引只读追踪

2026-10-11 根只读确认：DraftChatRail 内实际 readEditorState().target 存在，状态栏显示当前文章/图文/视频和dirty，但传给AICopilotContent的embed仅project selection、request、blindPredict、title/subtitle，并未传当前target用来派生空态。AICopilotContent默认 buildCopilotViewModel 返回全局 SUGGESTED_ACTIONS，empty/placeholder固定最近评论出选题；chips明绑 topic.generate/script.draft/material.* 等旧功能优先键。故不只是图片视觉问题，推荐动作也会请求不同功能，仍须实际请求测试定性。

sendPreparedRef 在每次当前稿面消息前真实 await draftEditor.prepareEditorTurn()，成功才冻结 editorTarget/creationTarget 和当前executionEngine；自由文本不等于未绑定target。发现的提示不贴合不能用来签自然语言编辑全部失效。代码可根据真实枚举target展示固定示例和功能目录对应入口，这是确定性页面呈现，不代替模型理解创作意图；不能按输入关键词选择改稿。

候选需只改变当前目标的空态/placeholder/推荐动作，并保全局模式/公开真实functionKey、预填不自动发送、当前稿保存准备/回执/版本/采纳、@项目/附件/Skill及换组换Tab。尚未给精确产品写集、正式范围独评或运行组件/模型/候选链；T1222仍待办。本记录不构成修复或PASS。

已读路径：frontend/src/features/draft-workbench/draft-chat-rail.tsx；frontend/src/features/copilot/ai-copilot-content.tsx（默认vm、sendPreparedRef、applyQuickPrompt、empty/textarea/chips）；frontend/src/fixtures/selectors/copilot.ts；contract/src/resources/work-editor.ts和ai-public-message.ts。后端方法目录提示与真实生成/采纳链尚待逐目标核对。原oil tokens/已认可布局保持。
