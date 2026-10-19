# T1369 连续导航诊断：待授权续接点

本任务仍进行中，用户反馈的导航卡死尚未取得可定位产品RED，未修产品，也未证明已恢复。已完成的T1370/T1371与本问题分证；安装App仍为旧2d源码，本轮未安装替换。

## 当前流程边界

- 工具正式R3 PASS[e8916b9b3f96]仅绑定旧SPEC SHA256 `6f8114cc1f5fbc686abed00a695c4f2ffb8b33d389e47f964cf45d38d36078cb`，不认可新增候选。
- 待授权候选SPEC SHA256 `4f608dbb11ca3e269bef9a5d78351b5bec0fb09c636a513f2e69ccae718ad18a`；精确夹具边界proposal SHA256 `f846415eb6ebdc4d96e42c15e5310adc4e3d56c13247fb82c239df875393f1de`。实际静态独审认为方案无阻断，未生成工具第4receipt。
- 用户已收到单次新审核周期问题，尚无答复。`control/REVIEW_CYCLE_REQUEST_DRAFT.json`只是请求草案，不是capability。没有Owner=user真实授权，不record新cycle、不执行production04。任务state仍🔨，不complete。

## 已发生与未发生分证

|诊断|实际结果|能证明什么|
|---|---|---|
|natural-attempt01|自然连续操作完整通过|本次未复现，不能称修复|
|response-attempt02|首首页document原120秒超时，未到受控；finally取证阻塞后owned中断|前置/清理失败保原，不当导航首因|
|response-supplement03|exit1/630.200567秒，首首页GET正文600000.56ms期限耗尽；context close54ms、observer完成|未进入受控，清理终态不冒服务端查询完成|
|安装runtime只读Chromium|四个read dispatch快速403且finished|准入差异；旧pending解释撤回，不当产品根因或用户Tauri实证|
|production01|exit1/5.155582667秒；tsx CLI长Unix socket119B/EINVAL|仅fixture bootstrap前置失败，未构建/种子/签名/启动/UI|
|production02|同原sandbox短路径IPC探针exit1/422.091ms、EPERM/marker缺失|PASS断言阻断后续；未构建/种子/签名/启动/UI|
|production03|标准Node loader探针0/1322.885ms；随后原host ps EPERM，wrapper1/5.152955750秒|仍未构建/种子/签名/启动/UI；原归属门未删|
|production03后置清理|wrapper最初留owned PG24400，另经原root/UID/owner/pgdata/PID核验后pg_ctl0/142.422ms，三端口空|残留与后置清理分别保，不冒wrapper已清理|
|production04候选|未执行|仅候选代码/静态核；必须真实新cycle授权与正式审核后续接|

## 待授权边界的大白话

原宿主和种子需要真实ps核对自有PG；原沙箱会拒绝这条系统命令。候选只把原合成host/PG/seed放外层准备（明确不具OS禁网），继续严格核私有root/nonce/UID/PID/监听和私有数据库，源码未装真实采集/登录触发/模型/发布适配器。构建、Next和浏览器仍逐字用原sandbox；不删ps门、不改许可guard、不增加网络例外或改产品。

唯一production04预算保原stage/core，共同seed/start/authready600秒；清理PW120+Next120+host480=720秒，覆盖host内ps180+pgCommand240；独立外层18840秒完整覆盖。这里是待审计划，不是已运行/已通过。

```mermaid
flowchart LR
  A[01–03前置失败原件保留] --> B[候选: 合成fixture外层准备]
  B --> C[用户单次cycle授权待答]
  C --> D[正式独审record后唯一04]
  D --> E[实际网络与UI结果决定下一步]
```

续接前读取本报告、BACKLOG T1369、候选SPEC/边界proposal与请求草案。不得重跑已耗尽旧实验、借旧PASS或只靠静态假设修产品；需要真实可定位公共RED才按已审窄范围修。full本轮T1373安全预检阻断而未执行，不能把旧665的58项失败冒当前结果。保foreign9/T1255、旧worktree及所有私有失败原件；无新真实collect/登录/模型/安装/用户库访问或site-safety绕行。

## 待证上游线索

仅保Root已核的两条线索，不作为根因、升级建议或新增实验授权：

- [Next PR #95391](https://github.com/vercel/next.js/pull/95391)修正旧action推进队列；相邻`#84299`需要ServerAction条件，本项目纯filter/侧栏尚未证明满足。queue action pending与RSC正文在途不能互相替代。
- [Next issue #96101](https://github.com/vercel/next.js/issues/96101)是HTTP1预取挤占连接的用户报告，因缺少复现自动关闭，未获官方确认。CLI直连读取很快也不能排除浏览器同源连接排队。

未据此新增研究任务、下载、依赖升级或产品改动。

最终候选driver已由独立Sol按实际字节静态核对，无静态阻断；精确SHA与未变原harness/seed/两产品源见`control/PRODUCTION04_CANDIDATE_STATIC_REVIEW.json`。执行方本轮静态frontend类型检查exit0/45.089925秒，Node/Python语法和ESLint退出0；这些不是production04运行证据。该候选仍待真实用户单次newcycle授权与正式审核，中央未重跑以上检查。
