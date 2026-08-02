# T-657 定位前采国内中文联网搜索 BUILD Gate

日期：2026-08-02  
结论：实现与聚焦自动化验证通过；未单独打包。

## 故障证据

- 用户以“国内智能体”搜索，却收到 Cafe Flora、Seattle 餐厅等英文境外结果。
- 代码审计确认初版只把原始关键词交给全局搜索 provider，缺少地区/语言约束与结果相关性过滤。
- repository 对所有历史候选永久 append，导致二次搜索无法覆盖上一轮未采纳结果。

## 修复

- 默认搜索范围改为中国大陆、简体中文，并在 UI 允许显式切换地区和语言。
- 只发送本次可见短关键词与公开范围词；不拼接访谈答案、作品或逐字稿。
- 新增关键词相关性、中文内容与国内来源优先筛选；明显无关英文结果直接过滤。
- 二次搜索替换未采用候选，已采用证据跨搜索保留；空结果给出可行动提示。

## 验证

- TDD 红测：后端首次因缺少“中国大陆”限定失败；前端首次因 request body 缺少
  `market/language` 失败。
- backend `positioning-research.test.ts`：2 / 2 PASS。
- backend T-652 positioning service 聚焦回归：2 / 2 PASS。
- frontend `positioning-discovery-workflow.test.tsx`：3 / 3 PASS。
- frontend 定位前采两个变更文件 ESLint PASS。
- contract：27 files / 147 tests PASS。
- contract、backend、frontend typecheck PASS（Node 25）。

## 未宣称事项

- 本轮按用户当前节奏不单独构建桌面安装包；真实 provider 的召回质量仍取决于所配置搜索服务，
  但无关英文境外结果会在进入证据板前被本地领域筛选拦截。
