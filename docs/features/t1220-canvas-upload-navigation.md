# T1220 恢复画布素材选择器上传入口

用户授权全功能验证和及时修复明显缺口。T994原规范要求无素材时可去素材中心上传；后续T1069改成全库分页搜索（无total），覆盖旧“搜索已加载N”语义，但T1101/1117保留空态和原动作，没有删除上传入口的确认。当前CanvasAssetPicker只显示共享空提示，真实上传页面不可从抽屉到达。

BUILD窄修复：保现有紫色品牌/圆角/图库，已读取项目oil-ui-pro及existing-project/UI_RULES。只在画布drawer素材区加可见“去素材中心上传”链接，使用原editor leaveCanvas('/assets')，先保存、冲突/失败留原画布及恢复，不直接router.push绕保存；导航中不可二次离开。page呈现已有上传入口不重复加。共享AssetPicker搜索/库存/确认、库权限/成员/生成模型均不变。

写集：frontend/src/features/creative-canvas/canvas-asset-picker.tsx；canvas-editor.tsx；canvas-editor.test.tsx；frontend/tests/e2e/creative-canvas.spec.ts仅T994空态用例（在T1219定位器修改结束后串行）；docs/verification/t1220/**。先独立复核精确产品方案，再改产品。原失败/截图保留。

验收：现有组件测试增补入口点击接原保存离开、保存失败不导航（不假mock UI成功），现有版本冲突保护原断言保留；实际隔离浏览器从空素材抽屉点击链接到/assets，再回原画布检查标题/节点已公共保存，逐例截图。旧全库计数断言按T1069改为实际搜索控件和真实空态，不伪造total；保导航断言并强化点击+回读。运行frontend types/相关组件/边界；图看实际目标视口和相邻区域。此局部动作修复不重新探索风格，不代签真实模型/原生App。
