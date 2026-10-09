# T-1110 浏览器 source / DOM 当前完整增量只读复核

已查源码与隔离行为回归未发现确定性阻断问题。本结论仅覆盖内部诊断和 DOM 等待增量，不签真人原生采集成功、任务完成或整体 Gate。

## 快照与边界

工作树为 `/Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator`，基础 HEAD `72ffed51ebb246f7efd8b883322fba867c090d02`，下列源码为当前未提交增量。本代理没有改主树、运行测试、访问浏览器、31410、用户数据库、Cookie、身份或 profile。

| 文件 | SHA256 |
|---|---|
| `ai-worker/src/runtime/platform/wechat-browser-source.ts` | `5188dc09907a0700766d05188b6200ccddf3b1f95bc41575fac1e17b34f9981a` |
| `ai-worker/src/runtime/platform/wechat-browser-source.test.ts` | `415dc7aa70ccdf7b54dc08307c74b5a6e0b477f4cc99b01610e21f98e87c4db2` |
| `ai-worker/src/runtime/platform/wechat-dom-witness.ts` | `864ef35c3e10a4ee72794d9499a4246f0ec2b522f0c7e1e5a714931809efe572` |
| `ai-worker/src/runtime/platform/wechat-dom-witness.test.ts` | `672b20add3300ae9f365af1819768f052cbd77db54a704e40674864644ef2db6` |
| `frontend/src/server/persistence-client.ts` | `d2191c7758716c20ad1a7a895b3ca0c6f05a1a1012dacf01378a3502af17bc25` |

## 已检查的行为

- `wechat-dom-witness.ts:156–163` 区分 iframe 页面缺失、报表标签缺失、重复标签和日期控件缺失。标签 count=0 经 observe 等待；count>1 明确 `REPORT_SECTION_AMBIGUOUS`，不猜第一项；count=1 后才点击并进入唯一详情日期控件观察。固定新 code 在 `wechat-browser-source.ts:23` 白名单内。重复标签 fixture 明确检查 no click/no date query。
- `wechat-dom-witness.ts:26–28` 继续从原 controls 取得有限预算，每轮/读取后检查 signal，并用可取消的等待间隔。`wechat-browser-source.ts:169–191` 保留 inherited deadline、截止 controller、原取消 signal、finally 关闭；没有刷新原期限。`:216–220` 的登录再探针失败保原错误，只在实际登出证据时产生 LOGIN_REQUIRED。
- `wechat-dom-witness.ts:147,164–188` 仍冻结本次日期目标，要求 works 点击后的新 request、当前 frame、正确原生请求日期、response 完成与总数；日报和关注者仍要求精确窗口及 30 个真实日期，下载前复核原状态。这次分段诊断没有放宽完整性。
- `wechat-browser-source.ts:26–36` 读取异常 message 只进行四个固定 Chromium/Playwright 协议片段的匹配，输出可选枚举 NAVIGATION_ABORTED / CONNECTION_RESET / TUNNEL_CONNECTION_FAILED / TARGET_CLOSED。未匹配则不添加 failureKind。没有输出原 message、URL、Cookie、目录、身份、stack 或 cause；任意 source code/name 仍归一。其确定性协议匹配有 SEMANTIC_BOUNDARY_ALLOW 说明，不参与登录、状态或业务选择。
- `wechat-browser-source.ts:176–220` trace 沿实际调用更新；诊断同步回调抛错被隔离，原普通失败仍 BROWSER_OPERATION_FAILED，取消仍优先原 signal，finally 仍执行原关闭及停止未确认协议。正式 `persistence-client.ts:4695` 仅 console.warn 固定对象。
- 新 failureKind 不参与业务分支。原 collector `backend/src/application/collection/wechat-native-collector.ts:59–64,216–224` 继续将这些非公开内部错误归一到既有 EXPORT_FAILED 等协议，并保取消/期限主因和独立停止状态；本次没有改变公共 code/status、服务契约、预算、资源归属或重发策略。

## 已读实际证据

- `/tmp/t1110-navigation-diagnostic-red.log`：4 个新增分类用例实际 FAIL、22 SKIP，原代码诊断缺少 failureKind；日志包含 retry x2，不能称 RED 为 retry 0。SHA256 `f034f0e0716a34b8b3fb039fc694c2ddb024352dd774523ab01d7f17b57e073b`。
- `/tmp/t1110-navigation-diagnostic-final.log`：一次 **3 文件 / 49 PASS**，开始 23:05:01，耗时 5.65s。当前数量为 14 DOM + 26 source + 9 parser；包括延迟标签/日期、重复标签、四分类含秘密消息脱敏、原诊断回调异常、probe 保因、停止重试、原剩余期限与 late response 回归。SHA256 `4185a29dd40adea03536a906f30191daf299861237a865ee19482e7454f83d86`。
- `/tmp/t1110-navigation-worker-type.log` 和 `/tmp/t1110-render-ready-type.log` 在读取时为空；root 说明类型检查正运行。本代理不从空日志推断最终退出状态，也未独立运行类型检查。

## 未被本次复核证明的事项

root 报告 `collection-dfe56a37-49` 仍 failed / 0 页，内部 prepare / channelsDaily / REPORT_PAGE_MISSING；另一明确新 intent `collection-8d52aafb-55` 更早在 navigate / BROWSER_OPERATION_FAILED / Error 失败。这两份报告表明延迟渲染修复没有闭合整条真人平台路径，但不能据此确定两个任务同因或 Cookie 过期。四种新分类的真人 intent 仍待验证，不能根据合成回归替代实际平台证据。

failureKind 仅表明异常文本命中固定协议，仍不是网络、平台、账号或登录根因结论。打开前拒绝和 finally 中单独关闭失败继续使用原错误/停止协议，不承诺每条失败都产生新诊断事件。未发现需要本轮追加产品代码的确定性缺陷；真实采集可用性保持待验。
