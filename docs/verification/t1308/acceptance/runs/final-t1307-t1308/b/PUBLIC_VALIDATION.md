# T1308 新候选公共历史验收

三组真实 200 响应时序全部 PASS，实际 Playwright exit 0；共用 T1307 当轮两份真实会话，新增模型、owner/script 保存均为 0。待独立验收复核，不改原 T1306 的 1 FAIL / 2 PASS，也不追认原 T1305 未取得的完成顺序。

候选 source `dc46cfa700ec9c9cbada47fb76237d0b50d10a67`，控制 HEAD `354786143377c58a12876731d00b075c4008a858`，服务 `http://127.0.0.1:65353`。A 为真实 editor `ai-conv-bcda7005-361`，B 为真实联合候选 `ai-conv-bcda7005-107`。原业务身份、source query、owner URL、call/attempt 与 candidate binding 见 `BUSINESS_HANDOFF_REFERENCE.json` 指向的当轮真实 HANDOFF；未使用旧 ID 或复制业务 storage。

| case | 真实顺序 | 最终结果 |
| --- | --- | --- |
| 01 | 原UI选A、自然刷新；A/B真实请求与200原body均已到达并暂持；先释放A再B | B可见、菜单active=B、自然pointer=B；不强制失效A仍可见 |
| 02 | 同样建立自然A；先释放B再A | B保持 |
| 03 | A恢复真实完成且可见后，原UI选B | B可见 |

每组独立保存 `timeline.json`、请求身份、原 server body、释放时间、browser 响应/完成时间与 SHA、最终 DOM/aria/PNG、精确用户文本、菜单/自然指针、真实 case-result 和 isolation-result。目标 server/release/browser 三份 body SHA 相同，HTTP 200，无改 body/id；只控制已取得原回包的释放顺序。每个测试分别落文件，Playwright reporter 是权威执行结论，不依赖 worker 内 module 数组。原自然 FAIL 分支保留，首项失败也不会跳过后两项。

每组前后 article/graphic 完整 DTO、script `artifacts.get` metadata 与按真实 total 分页的所有 versions 深相等；模型及保存入口明确拦截，实际 attemptedWrites=[]。独立 fresh browser context 仅设置当前 fresh owned group/onboarding 偏好，不灌会话指针/业务 sessionStorage；指针由原UI选A与自然reload建立。原服务由C持有，未重启。

同冻结源码的本次 timeout verify 真实 exit 0，原件位于 T1307 run 的 `TIMEOUT_EXECUTION.json`。公共 run 的三项结果见本目录 `FINAL_RESULT.json`，各 case 原件独立保留。没有新增产品、控制面或父矩阵声明。
