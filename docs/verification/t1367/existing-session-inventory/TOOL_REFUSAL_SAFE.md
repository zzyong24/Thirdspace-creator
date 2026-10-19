# 既有标签读取：工具拒绝原文与边界

## 原文

来源：本轮 `mcp__cua_repl.js` 第一次对既有视频号标签进行受控绑定/只读快照的返回，非页面内容。域名是公开origin，无路径、query或token。

> Browser Use rejected this action due to browser security policy. Reason: The site-safety policy blocks this action; no user permission prompt or Auto-review was attempted. Browser use could not acquire authority to observe page content. The site safety gate did not grant access for https://channels.weixin.qq.com. Site safety policy blocked this URL. The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input.

## 已明确的限制

- 工具明确称为 browser security / site-safety gate，未取得观察该origin页面内容的authority。
- 没有用户许可提示或Auto-review尝试；这不是自动审核拒绝后的重试机会。
- 原调用仅针对browser1已存在标签，步骤是命名本次自动化会话、claim既有标签、只读DOM快照及只读路由分类；没有goto/reload/click/login/profile创建。组合调用被拒绝，未返回页面正文；工具没有指出内部具体哪条规则或哪一步触发。
- 拒绝明确禁止用其他浏览器、CDP、浏览器命令、间接执行或其他绕法实现相同页面观测。因此未试browser2、Ego或应用采集来读取这页。

## 工具没有证明的内容

工具未披露是整站永久禁用、当前任务分类策略，还是当前会话的授权范围规则；不能把这一条返回扩写成这些内部分类已确定，也不能据此声称换浏览器或应用入口就被允许。它不证明用户平台登录失败、没有真实DOM或profile损坏。现有两个标签为login路由只是库存元数据，登录态仍UNKNOWN。

本次结论：在当前工具/任务授权上下文，目标站点页面内容观测被site-safety门拒绝，且同目的绕过被明确禁止。拒绝边界不能靠应用采集规避。后续可基于已合法保全的历史证据和离线受控本地测试继续分析；此拒绝不授予再次获取真实页面或账户内容的许可。

本说明只保存返回原文及必要分类；没有重试、探测其他表面或获取目标正文。
