# T-1207 浏览器场景逐例截图索引

本索引按 scenario-index.ndjson 每行保留一次运行记录：345 条历史运行记录、224 个不同 Test ID（独立用例）、67 个 spec；251 PASS、86 FAIL、8 TIMEOUT、0 SKIP。重复 Test ID 不合并，状态按历史记录逐次统计，不代表全功能通过。

[打开静态截图总览](E2E-GALLERY.html) · [完整 E2E](full-e2e.log) · [扩展路由矩阵](route-matrix-expanded.log) · [视觉基线](visual.log) · [无障碍矩阵](accessibility.log) · [媒体导入/导出](media-tab.log) · [Appium 探测](appium-probe.md)

## frontend/tests/e2e/ai-copilot.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | opens the centered dialog from any page via ?copilot=open | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-copilot--AI-Copilot-dialog-opens-the-centered-dialog-from-any-page-via-copilot-op--9480b6ed6fd209fa023c72a96f8437ac6d707b133b429ca9e2aa0fcff8e57dca.png) | `398e1e2dd9ad70ed36f5-fcf91ee232c21f1ceebf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-copilot.spec.ts--398e1e2dd9ad70ed36f5-fcf91ee232c21f1ceebf--1) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="overlay-layer"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="overlay-layer"]')[22m

```

| PASS | close button removes only ?copilot=open and preserves the pathname | [http://127.0.0.1:3887/projects](http://127.0.0.1:3887/projects) | [查看原图](screenshots/ai-copilot--AI-Copilot-dialog-close-button-removes-only-copilot-open-and-preserves-t--25587ef1f5e04317b2f7b221fb3bfce6a03b8c1a9504bd1517d1d90d0d25127f.png) | `398e1e2dd9ad70ed36f5-dcc4b7fd4af8e8e4743c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-copilot.spec.ts--398e1e2dd9ad70ed36f5-dcc4b7fd4af8e8e4743c--2) |
| PASS | Escape closes the dialog | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/ai-copilot--AI-Copilot-dialog-Escape-closes-the-dialog--b406278f6d82a32017f28c2a407ab874a2fbb328dd15508739b6adaf5646cf6a.png) | `398e1e2dd9ad70ed36f5-d52cda08622f4d2279b0` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-copilot.spec.ts--398e1e2dd9ad70ed36f5-d52cda08622f4d2279b0--3) |
| PASS | browser Back closes the dialog | [about:blank](about:blank) | [查看原图](screenshots/ai-copilot--AI-Copilot-dialog-browser-Back-closes-the-dialog--6f74aa8a116f2236358ee9e822d30983964c3ac8a74dba2fe1e83a17408912a2.png) | `398e1e2dd9ad70ed36f5-64566ff6a53827201d07` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-copilot.spec.ts--398e1e2dd9ad70ed36f5-64566ff6a53827201d07--4) |
| FAIL | submit button does not post a real network request | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-copilot--AI-Copilot-dialog-submit-button-does-not-post-a-real-network-request--ba1032b3334eee45de5a5392d824bdf91ebe1ac69bb790e4b112f9c23d760a9d.png) | `398e1e2dd9ad70ed36f5-1f5c45fadccdf95473d0` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-copilot.spec.ts--398e1e2dd9ad70ed36f5-1f5c45fadccdf95473d0--5) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  - 1[39m
[31m+ Received  + 8[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   "http://127.0.0.1:3887/api/v1/dispatch",[39m
[31m+   "http://127.0.0.1:3887/api/v1/dispatch",[39m
[31m+   "http://127.0.0.1:3887/api/v1/dispatch",[39m
[31m+   "http://127.0.0.1:3887/api/v1/dispatch",[39m
[31m+   "http://127.0.0.1:3887/__nextjs_original-stack-frames",[39m
[31m+   "http://127.0.0.1:3887/api/chat",[39m
[31m+ ][39m
```


## frontend/tests/e2e/ai-nonblocking-recovery.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | E2E-T1022-01 没有模型时保留输入并直达模型设置 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-nonblocking-recovery--E2E-T1022-01-没有模型时保留输入并直达模型设置--aa776516d5a90522e269bc261b5367433187d89e49ce531e7e126d1fb7f48586.png) | `b1917f7e2b85c508f785-fa5c03a7fb79a3aa1d14` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-nonblocking-recovery.spec.ts--b1917f7e2b85c508f785-fa5c03a7fb79a3aa1d14--6) |
| PASS | E2E-T1022-02 / E2E-T1023-01 临时失败沿同一轮自动恢复并交付完整结果 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-nonblocking-recovery--E2E-T1022-02-E2E-T1023-01-临时失败沿同一轮自动恢复并交付完整结果--43f997c5079cf25bbf685d178bd46abc8c541272ac6e75df784fc4c189a78363.png) | `b1917f7e2b85c508f785-4b56b8ddb7222c079be9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-nonblocking-recovery.spec.ts--b1917f7e2b85c508f785-4b56b8ddb7222c079be9--7) |
| PASS | E2E-T1023-02 / E2E-T1023-03 持续提交失败会停止自动请求，继续恢复仍沿原轮完成 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-nonblocking-recovery--E2E-T1023-02-E2E-T1023-03-持续提交失败会停止自动请求-继续恢复仍沿原轮完成--ac16839a43f3592011e3d7687d177718ffdd64e1fc4ec89e8bccb88badd54732.png) | `b1917f7e2b85c508f785-ec6e814c8a555c2f4cf3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-nonblocking-recovery.spec.ts--b1917f7e2b85c508f785-ec6e814c8a555c2f4cf3--8) |
| PASS | E2E-T1023-04 已收到持久任务回执时停止重连也明确保留后台任务 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-nonblocking-recovery--E2E-T1023-04-已收到持久任务回执时停止重连也明确保留后台任务--d9ae9d9e4fcd0f94742f15d86de5b0fe8d14ca36c4b98de51597a3ba8bee833b.png) | `b1917f7e2b85c508f785-2ac94144d655b91b3cd1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-nonblocking-recovery.spec.ts--b1917f7e2b85c508f785-2ac94144d655b91b3cd1--9) |

## frontend/tests/e2e/ai-recovery-guidance.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | E2E-T913-01 模型未配置时直接打开模型配置 | [http://127.0.0.1:3887/settings?highlight=text-model](http://127.0.0.1:3887/settings?highlight=text-model) | [查看原图](screenshots/ai-recovery-guidance--E2E-T913-01-模型未配置时直接打开模型配置--e4431e5930596fafbc48124ab91e7577ebf2d60b345beeae58b72fe6e1080079.png) | `34fe78d5587cd6d38cdf-a95b439cd207b9efcf26` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-recovery-guidance.spec.ts--34fe78d5587cd6d38cdf-a95b439cd207b9efcf26--10) |
| PASS | E2E-T913-02 定位缺失时直达定位中心 | [http://127.0.0.1:3887/positioning](http://127.0.0.1:3887/positioning) | [查看原图](screenshots/ai-recovery-guidance--E2E-T913-02-定位缺失时直达定位中心--9762a17d1dd8cb170aae4ec989d34e7028d76178b803508d0d6dcf24f773a7fe.png) | `34fe78d5587cd6d38cdf-9fbc761a49eb05a433db` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-recovery-guidance.spec.ts--34fe78d5587cd6d38cdf-9fbc761a49eb05a433db--11) |
| PASS | E2E-T913-03 自带 AI 额度不足时只显示真实额度入口 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-recovery-guidance--E2E-T913-03-自带-AI-额度不足时只显示真实额度入口--e4a3afce294feb337f837ee390edc5481db881c3c987d2a63a06efd7f04b8d81.png) | `34fe78d5587cd6d38cdf-7ed48ed2efeb2c28dd37` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-recovery-guidance.spec.ts--34fe78d5587cd6d38cdf-7ed48ed2efeb2c28dd37--12) |
| PASS | E2E-T913-04 / E2E-T913-05 未知故障自动恢复且不泄露内部状态 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/ai-recovery-guidance--E2E-T913-04-E2E-T913-05-未知故障自动恢复且不泄露内部状态--3d127aec6c33e8642bfea0cd80d62263e4bdfb175b3eb05f8239d05355611041.png) | `34fe78d5587cd6d38cdf-896fe501bb45d5efcf9b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-recovery-guidance.spec.ts--34fe78d5587cd6d38cdf-896fe501bb45d5efcf9b--13) |

## frontend/tests/e2e/ai-reliability-recovery.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| TIMEOUT | 视频决策失败可见、终态停轮询，重新运行显式携带来源任务 | [http://127.0.0.1:3887/projects/project-a65785f2-243/production](http://127.0.0.1:3887/projects/project-a65785f2-243/production) | [查看原图](screenshots/ai-reliability-recovery--视频决策失败可见-终态停轮询-重新运行显式携带来源任务--fb887f54404721c89720d47f625aa4e35ff1a6053a48705d41ec93cebae5b538.png) | `78c95fd594dd575ec449-d42c1ed4c6ebb279cf35` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fai-reliability-recovery.spec.ts--78c95fd594dd575ec449-d42c1ed4c6ebb279cf35--14) |

失败证据：

```text
[31mTest timeout of 90000ms exceeded.[39m
```


## frontend/tests/e2e/all-routes.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | route dashboard (/) renders with single shell and correct active state | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-dashboard-renders-with-single-sh--429781f5ada40b8594085e6d0152763caa71e8ec5196c063302bdd824358ee93.png) | `66d28c9c49bf28775f51-67c15989f50e97164845` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-67c15989f50e97164845--15) |
| PASS | route projects (/projects) renders with single shell and correct active state | [http://127.0.0.1:3887/projects](http://127.0.0.1:3887/projects) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-projects-projects-renders-with-s--fb4f2fbe7f1ef830dab8452b6da376338607b8c8518cc8a12677cc8d2ec352dd.png) | `66d28c9c49bf28775f51-92b2647822eadf543845` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-92b2647822eadf543845--16) |
| FAIL | route project-overview (/projects/ai-native-browser) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/ai-native-browser](http://127.0.0.1:3887/projects/ai-native-browser) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-project-overview-projects-ai-nat--a07312b283a9c97d88aa65e6ddb0a3ea68173fcb4739801e8f12a80eba4c3ebb.png) | `66d28c9c49bf28775f51-234ab65402bd8d1f3b8d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-234ab65402bd8d1f3b8d--17) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  locator('[data-slot="app-top-header"]')
Expected: [32m"project-[7moverview[27m"[39m
Received: [31m"project-[7mworkspace[27m"[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveAttribute" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="app-top-header"]')[22m
[2m    14 × locator resolved to <header data-layout="flow" data-masked="false" data-slot="app-top-header" data-testid="app-top-header" data-mode="project-workspace" class="z-header flex min-w-0 items-center gap-3 px-page-gutter h-header shrink-0 border-b border-border bg-surface">…</header>[22m
[2m       - unexpected value "project-workspace"[22m

```

| PASS | route research-workspace (/projects/ai-native-browser/research) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/ai-native-browser/research](http://127.0.0.1:3887/projects/ai-native-browser/research) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-research-workspace-projects-ai-n--324b9d51d0b41595c5e88e7a4654a9bae7236d6a3e6d47c5f65ba901ed65a7c5.png) | `66d28c9c49bf28775f51-d1e7b905f02d26278af5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-d1e7b905f02d26278af5--18) |
| PASS | route planning-workspace (/projects/ai-native-browser/planning) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/ai-native-browser/planning](http://127.0.0.1:3887/projects/ai-native-browser/planning) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-planning-workspace-projects-ai-n--bf412dd9fb453086422c67abb795755ac4759d202c011b0905d23bc1de58790d.png) | `66d28c9c49bf28775f51-c4cb33277646a5d72cf8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-c4cb33277646a5d72cf8--19) |
| PASS | route script-workspace (/projects/ai-native-browser/script) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/ai-native-browser/script](http://127.0.0.1:3887/projects/ai-native-browser/script) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-script-workspace-projects-ai-nat--e87c0dae240642615d0b5667e8986ce6e0b62aaac1a76dcdcd7347c1d58e259d.png) | `66d28c9c49bf28775f51-0d1ac67893fd59194950` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-0d1ac67893fd59194950--20) |
| PASS | route publishing-workspace (/projects/ai-native-browser/publishing) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/ai-native-browser/publishing](http://127.0.0.1:3887/projects/ai-native-browser/publishing) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-publishing-workspace-projects-ai--814b8a0f94227989c870b4e7f5d5e28d2500f7e18173d209fa7c8123e515a027.png) | `66d28c9c49bf28775f51-214866cec8ea74931171` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-214866cec8ea74931171--21) |
| FAIL | route analytics-review (/projects/ai-native-browser/review) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/ai-native-browser/review](http://127.0.0.1:3887/projects/ai-native-browser/review) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-analytics-review-projects-ai-nat--71d4d620f468a1b26152e6f43e9bbb1cc57f4ea2721b593fd94e7b1008087710.png) | `66d28c9c49bf28775f51-a9d66ebd122c84407a70` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-a9d66ebd122c84407a70--22) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -  1[39m
[31m+ Received  + 28[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   "%c%s%c [review] readReviewHistory 读失败(诚实空,但这不是正常态): background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px  Server   AccountRequiredError: AccountRequiredError: legacy workspace requires a selected account (ctx.accountId missing)[39m
[31m+     at requireAccountId (about://React/Server/file:///Users/zyongzhu/Workbase/Thirdspace-creator/frontend/.next/dev/server/chunks/ssr/backend_src_1xlke06._.js?23:1521:15)[39m
[31m+     at workspaceKey (about://React/Server/file:///Users/zyongzhu/Workbase/Thirdspace-creator/frontend/.next/dev/server/chunks/ssr/backend_src_1xlke06._.js?24:1648:158)[39m
[31m+     at requireWorkspace (about://React/Server/file:///Users/zyongzhu/Workbase/Thirdspace-creator/frontend/.next/dev/server/chunks/ssr/backend_src_1xlke06._.js?25:1652:5)[39m
[31m+     at Object.listOutputIdsByProject (about://React/Server/file:///Users/zyongzhu/Workbase/T
```

| PASS | route knowledge (/knowledge) renders with single shell and correct active state | [http://127.0.0.1:3887/knowledge](http://127.0.0.1:3887/knowledge) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-knowledge-knowledge-renders-with--042b1e9d6d5ea9a6b2467e2beed119f086678006edc5182378849fa176efdcb1.png) | `66d28c9c49bf28775f51-857476dbb8d6bfd34698` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-857476dbb8d6bfd34698--23) |
| PASS | route assets (/assets) renders with single shell and correct active state | [http://127.0.0.1:3887/assets](http://127.0.0.1:3887/assets) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-assets-assets-renders-with-singl--699b77cfbaef7bd493db1b54ecd13528da0fbb39cfd5ad8ef33e6c57d97a6847.png) | `66d28c9c49bf28775f51-96c450daccfc6cb44d8f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-96c450daccfc6cb44d8f--24) |
| PASS | route publishing-center (/publishing) renders with single shell and correct active state | [http://127.0.0.1:3887/publishing](http://127.0.0.1:3887/publishing) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-publishing-center-publishing-ren--d6a80e62638d8c4aa90a7bb038cb10ca3f61ad47dec0db21c413aa9763180096.png) | `66d28c9c49bf28775f51-b6820805ebca3a365cb1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-b6820805ebca3a365cb1--25) |
| FAIL | route experience (/experience) renders with single shell and correct active state | [http://127.0.0.1:3887/knowledge](http://127.0.0.1:3887/knowledge) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-experience-experience-renders-wi--15ecdf978e8123b80eab8b9383835820df1ce5ed3c38db407eec09cf84edd422.png) | `66d28c9c49bf28775f51-5839d001c13f1e01acb5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-5839d001c13f1e01acb5--26) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32m"/[7mexperienc[27me"[39m
Received: [31m"/[7mknowledg[27me"[39m
```

| FAIL | route search (/search) renders with single shell and correct active state | [http://127.0.0.1:3887/search](http://127.0.0.1:3887/search) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-search-search-renders-with-singl--9ac05c8d94c5578eee5d42e0f1111f90a4b2c7f4086649eb6b2bc48287c37b47.png) | `66d28c9c49bf28775f51-f186a8ca4c212fd720d3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-f186a8ca4c212fd720d3--27) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')
Expected: [32m1[39m
Received: [31m0[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')[22m
[2m    14 × locator resolved to 0 elements[22m
[2m       - unexpected value "0"[22m

```

| FAIL | route settings (/settings) renders with single shell and correct active state | [http://127.0.0.1:3887/settings](http://127.0.0.1:3887/settings) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-settings-settings-renders-with-s--ad51719822f06d3755706e1143f79844c00a9872a7497123389188d1e1105172.png) | `66d28c9c49bf28775f51-d79ab2f37da89909c2fc` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-d79ab2f37da89909c2fc--28) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')
Expected: [32m1[39m
Received: [31m0[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')[22m
[2m    14 × locator resolved to 0 elements[22m
[2m       - unexpected value "0"[22m

```

| PASS | route new-project-overlay (/projects/new) renders with single shell and correct active state | [http://127.0.0.1:3887/projects/new](http://127.0.0.1:3887/projects/new) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-new-project-overlay-projects-new--c3584cd3522e16341e44e897ebf4d89ee4d5aa87973a9374452df54cf4642543.png) | `66d28c9c49bf28775f51-fde9726edb9abcc80bb9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-fde9726edb9abcc80bb9--29) |
| PASS | route ai-copilot-overlay (/?copilot=open) renders with single shell and correct active state | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/all-routes--Whole-system-route-matrix-Task-26-route-ai-copilot-overlay-copilot-open---122f15dcc0f6e695a06a37dbb36a8f42d5a94a6627f14c5c67013536c336a0b2.png) | `66d28c9c49bf28775f51-54df8791a1e014b0dc24` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fall-routes.spec.ts--66d28c9c49bf28775f51-54df8791a1e014b0dc24--30) |

## frontend/tests/e2e/app-shell.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | renders one Sidebar and one TopHeader on the root route | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/app-shell--AppShell-renders-one-Sidebar-and-one-TopHeader-on-the-root-route--24ccc7f71f1382501f86e6e6ac4fa7d19308a7c375eb48d279a9615796eef625.png) | `826b944a90800335c80d-11865233906ffda9b84e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-11865233906ffda9b84e--31) |
| FAIL | lists the seven approved primary nav items | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/app-shell--AppShell-lists-the-seven-approved-primary-nav-items--38bf68205e93247e3a2aee57633531300ae46f1f4f714f90fa31813bc0e22b54.png) | `826b944a90800335c80d-29f41b2bbed70474183c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-29f41b2bbed70474183c--32) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  getByRole('navigation', { name: '主要导航' }).getByRole('link')
Expected: [32m7[39m
Received: [31m13[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for getByRole('navigation', { name: '主要导航' }).getByRole('link')[22m
[2m    14 × locator resolved to 13 elements[22m
[2m       - unexpected value "13"[22m

```

| PASS | derives the active nav item from the pathname | [http://127.0.0.1:3887/knowledge](http://127.0.0.1:3887/knowledge) | [查看原图](screenshots/app-shell--AppShell-derives-the-active-nav-item-from-the-pathname--440ec5786b1121e8328be61efa4c6385419f63f8ad77222c87e2f89c46f9baae.png) | `826b944a90800335c80d-373e840ad52875d01d6f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-373e840ad52875d01d6f--33) |
| FAIL | focus order: sidebar -> top header -> page content | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/app-shell--AppShell-focus-order-sidebar-top-header-page-content--655a5b554f7ce62af7138aec8b4c7e45be657ef1f41cf51d0d18f79b8af151ee.png) | `826b944a90800335c80d-9f1ba789128856c63381` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-9f1ba789128856c63381--34) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

| PASS | the page scroll area is the only scrollable region in the main frame | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/app-shell--AppShell-the-page-scroll-area-is-the-only-scrollable-region-in-the-main---66e48921cbf7b982dbac3ea7008a6c517d964ea5b68ddca380636bb4b7aec2ea.png) | `826b944a90800335c80d-e8c81f6af7fb459ed9ec` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-e8c81f6af7fb459ed9ec--35) |
| PASS | dashboard wheel scroll stays inside the Radix viewport | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/app-shell--AppShell-dashboard-wheel-scroll-stays-inside-the-Radix-viewport--e0c391429a1b6cb27153bd9f7784ac7af4486efd34c4ba6cb007aae2019c4576.png) | `826b944a90800335c80d-fc8e67a63249257a738e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-fc8e67a63249257a738e--36) |
| FAIL | applies shared page spacing tokens in the browser | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/app-shell--AppShell-applies-shared-page-spacing-tokens-in-the-browser--db37cd9c5f34b35e0dd088e5ef866bc447aedf1ab3d7e17f44adf41f0ff67de4.png) | `826b944a90800335c80d-4077f0e7e007a8275809` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fapp-shell.spec.ts--826b944a90800335c80d-4077f0e7e007a8275809--37) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  - 1[39m
[31m+ Received  + 1[39m

[2m  Object {[22m
[32m-   "gap": "20px",[39m
[31m+   "gap": "normal",[39m
[2m    "paddingLeft": "24px",[22m
[2m    "paddingRight": "24px",[22m
[2m  }[22m
```


## frontend/tests/e2e/asr-configuration.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 普通路径只需预设、模型与 Key，高级字段可按需展开 | [http://127.0.0.1:3887/settings](http://127.0.0.1:3887/settings) | [查看原图](screenshots/asr-configuration--ASR-建议配置与小米-MiMo-轻量配置-普通路径只需预设-模型与-Key-高级字段可按需展开--698bfc3704886be6f07509784d6051b6fe0355c94fe6a6b2945c72cc9fef9686.png) | `3a3f64115f61a11ac1a8-84fcdda1872075fc24e4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fasr-configuration.spec.ts--3a3f64115f61a11ac1a8-84fcdda1872075fc24e4--38) |

## frontend/tests/e2e/assets.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the assets gallery with toolbar, type sidebar, and detail panel | [http://127.0.0.1:3887/assets](http://127.0.0.1:3887/assets) | [查看原图](screenshots/assets--Assets-Center-page-renders-the-assets-gallery-with-toolbar-type-sidebar---44126b7305134232970f5652803659ac95522f7c619b0ab96feba9a0bdd0cbea.png) | `7d95edad6f617a74a29d-605171d5500a33bc7afb` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fassets.spec.ts--7d95edad6f617a74a29d-605171d5500a33bc7afb--39) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="asset-card-grid"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="asset-card-grid"]')[22m

```

| FAIL | clicking a different card updates the AssetDetailPanel | [http://127.0.0.1:3887/assets](http://127.0.0.1:3887/assets) | [查看原图](screenshots/assets--Assets-Center-page-clicking-a-different-card-updates-the-AssetDetailPane--f21980d5915100846d6929d8b5992e863c21b0f0a8fb212526d77c118921ab16.png) | `7d95edad6f617a74a29d-425739d7596a7f96ed34` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fassets.spec.ts--7d95edad6f617a74a29d-425739d7596a7f96ed34--40) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```


## frontend/tests/e2e/audience-task-topics.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 九宫格退役、普通选题入口保留及历史配置无损 1366 | [http://127.0.0.1:3887/topics](http://127.0.0.1:3887/topics) | [查看原图](screenshots/audience-task-topics--九宫格退役-普通选题入口保留及历史配置无损-1366--df437330e30e86e9154399e736f3861dfac33e86f5774efef63df0bcf45262d8.png) | `6184addb0cd8981bb6c2-68b1edfa312c6923fb95` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Faudience-task-topics.spec.ts--6184addb0cd8981bb6c2-68b1edfa312c6923fb95--41) |
| PASS | 九宫格退役、普通选题入口保留及历史配置无损 1024 | [http://127.0.0.1:3887/topics](http://127.0.0.1:3887/topics) | [查看原图](screenshots/audience-task-topics--九宫格退役-普通选题入口保留及历史配置无损-1024--e796a3583224001433652a7028219c4ac8d396b6afc3707cd858c4f91982a5f2.png) | `6184addb0cd8981bb6c2-12680378b152e77ba038` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Faudience-task-topics.spec.ts--6184addb0cd8981bb6c2-12680378b152e77ba038--42) |

## frontend/tests/e2e/automations-group-media-jobs.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 组总览读到真实多平台作业，平台与账号筛选只收窄私有作业并保留共享项 | [http://127.0.0.1:3887/automations](http://127.0.0.1:3887/automations) | [查看原图](screenshots/history-before-20261011-next-journeys/automations-group-media-jobs/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-组总览读到真实多平台作业-平台与账号筛选只收窄私有作业并保留共享项--b15134c01f2a26a85b849d4f61e771dd18732fd7e116fb368202ccba55d02e0b.png) | `8cf1aa680fa498b7616c-8a4197f04152371ff15a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-8a4197f04152371ff15a--43) |
| PASS | 切换账号组只改变工作区列表，回到原组后原 job ID 与排期仍相同 | [http://127.0.0.1:3887/automations](http://127.0.0.1:3887/automations) | [查看原图](screenshots/history-before-20261011-next-journeys/automations-group-media-jobs/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-切换账号组只改变工作区列表-回到原组后原-job-ID-与排期仍相同--21413cb7b7a6986cc776adc504a213000dfc9dd3e96138ba996c45be6bdceca0.png) | `8cf1aa680fa498b7616c-970fa63bd6a10887733c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-970fa63bd6a10887733c--44) |
| PASS | 归档账号的历史作业仍可读，按账号筛选会标明归档状态 | [http://127.0.0.1:3887/automations](http://127.0.0.1:3887/automations) | [查看原图](screenshots/history-before-20261011-next-journeys/automations-group-media-jobs/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-归档账号的历史作业仍可读-按账号筛选会标明归档状态--bd8d2d325317377c47e18fed57fe802fe64afb69df528143b61d24a106cb3bf8.png) | `8cf1aa680fa498b7616c-988eac3021af476e0a81` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-988eac3021af476e0a81--45) |
| PASS | 没有作业的账号组显示真实无计划空态和账号入口 | [http://127.0.0.1:3887/automations](http://127.0.0.1:3887/automations) | [查看原图](screenshots/history-before-20261011-next-journeys/automations-group-media-jobs/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-没有作业的账号组显示真实无计划空态和账号入口--8c1fab9a09284ea062a7c1a9328da9a4077bf333159fc71e766b37705a3ef44e.png) | `8cf1aa680fa498b7616c-7efb87b1497819a89281` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-7efb87b1497819a89281--46) |
| PASS | 组总览读到真实多平台作业，平台与账号筛选只收窄私有作业并保留共享项 | [http://127.0.0.1:3911/automations](http://127.0.0.1:3911/automations) | [查看原图](screenshots/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-组总览读到真实多平台作业-平台与账号筛选只收窄私有作业并保留共享项--b15134c01f2a26a85b849d4f61e771dd18732fd7e116fb368202ccba55d02e0b.png) | `8cf1aa680fa498b7616c-8a4197f04152371ff15a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-8a4197f04152371ff15a--337) |
| PASS | 切换账号组只改变工作区列表，回到原组后原 job ID 与排期仍相同 | [http://127.0.0.1:3911/automations](http://127.0.0.1:3911/automations) | [查看原图](screenshots/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-切换账号组只改变工作区列表-回到原组后原-job-ID-与排期仍相同--21413cb7b7a6986cc776adc504a213000dfc9dd3e96138ba996c45be6bdceca0.png) | `8cf1aa680fa498b7616c-970fa63bd6a10887733c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-970fa63bd6a10887733c--338) |
| PASS | 归档账号的历史作业仍可读，按账号筛选会标明归档状态 | [http://127.0.0.1:3911/automations](http://127.0.0.1:3911/automations) | [查看原图](screenshots/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-归档账号的历史作业仍可读-按账号筛选会标明归档状态--bd8d2d325317377c47e18fed57fe802fe64afb69df528143b61d24a106cb3bf8.png) | `8cf1aa680fa498b7616c-988eac3021af476e0a81` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-988eac3021af476e0a81--339) |
| PASS | 没有作业的账号组显示真实无计划空态和账号入口 | [http://127.0.0.1:3911/automations](http://127.0.0.1:3911/automations) | [查看原图](screenshots/automations-group-media-jobs--账号组内多平台定时任务可见性-T-1199-没有作业的账号组显示真实无计划空态和账号入口--8c1fab9a09284ea062a7c1a9328da9a4077bf333159fc71e766b37705a3ef44e.png) | `8cf1aa680fa498b7616c-7efb87b1497819a89281` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fautomations-group-media-jobs.spec.ts--8cf1aa680fa498b7616c-7efb87b1497819a89281--340) |

## frontend/tests/e2e/built-in-ip-course.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 内置 IP 课程从目录到学习进度形成连续真实旅程 | [http://127.0.0.1:3887/knowledge?view=course&lesson=lesson-02](http://127.0.0.1:3887/knowledge?view=course&lesson=lesson-02) | [查看原图](screenshots/built-in-ip-course--内置-IP-课程从目录到学习进度形成连续真实旅程--96dd4c0da7949962ed2c7e8d5fbdc25b0241ddad547ae21dec374b13b90af0d9.png) | `0c19a94c4dee15d00a09-2f4f76eb4edf677320f5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fbuilt-in-ip-course.spec.ts--0c19a94c4dee15d00a09-2f4f76eb4edf677320f5--47) |

## frontend/tests/e2e/channel-public-links.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 设置页不展示常驻官网入口，人工反馈仍只使用包级链接 | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/channel-public-links--T-729-T-871-当前桌面包公开入口-设置页不展示常驻官网入口-人工反馈仍只使用包级链接--244c07cb38b00a446b7fd05286fd02b37dfea471dfc207359f324eef8978e3a5.png) | `d7e70427cf33679d6c34-95715f11c70794614609` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fchannel-public-links.spec.ts--d7e70427cf33679d6c34-95715f11c70794614609--48) |

## frontend/tests/e2e/content-radar-one-click-project.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 内容雷达只有改写初稿和局部选题字段时仍可一键升级项目 | [about:blank](about:blank) | [查看原图](../t1208/20261011-before/screenshots/content-radar-one-click-project--内容雷达只有改写初稿和局部选题字段时仍可一键升级项目--7b172b275f363a9dbe59f4cb912cbea2a12a3cbb438632902bf1f8793b74625e.png) | `24be249374a0952f42fe-4c8c214b8ca5c531b6bf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcontent-radar-one-click-project.spec.ts--24be249374a0952f42fe-4c8c214b8ca5c531b6bf--49) |

失败证据：

```text
Error: 等待采集 intelligence-run-a65785f2-560 超时
```

| FAIL | 内容雷达只有改写初稿和局部选题字段时仍可一键升级项目 | [about:blank](about:blank) | [查看原图](screenshots/content-radar-one-click-project--内容雷达只有改写初稿和局部选题字段时仍可一键升级项目--7b172b275f363a9dbe59f4cb912cbea2a12a3cbb438632902bf1f8793b74625e.png) | `24be249374a0952f42fe-4c8c214b8ca5c531b6bf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcontent-radar-one-click-project.spec.ts--24be249374a0952f42fe-4c8c214b8ca5c531b6bf--315) |

失败证据：

```text
Error: 等待采集 intelligence-run-07d196a4-17 超时
```


## frontend/tests/e2e/copilot-project-reference.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 长标题只显示一次，正文不重复，窄屏不溢出 | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/copilot-project-reference--Copilot-项目引用直读-T-642-长标题只显示一次-正文不重复-窄屏不溢出--a34fdc7026a3afc374d22abc165555cb60108c188a8ff1b0a33c015a1a6be583.png) | `149f4ad961637238c6cf-0e89f9a09ec8bf9ced86` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcopilot-project-reference.spec.ts--149f4ad961637238c6cf-0e89f9a09ec8bf9ced86--50) |

## frontend/tests/e2e/creative-canvas.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | T-993 画布可保存、重开，切换账号后列表和直链隔离 | [http://127.0.0.1:3887/canvases/81abca79-5539-4625-ace4-04e5eb41f996](http://127.0.0.1:3887/canvases/81abca79-5539-4625-ace4-04e5eb41f996) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/c6f3575711b1fa5f-creative-canvas--T-993-画布可保存-重开-切换账号后列表和直链隔离--e4970f3b2c30763642679c5efb579799dd4c01d608507dc6f1917a8fe818fbab.png) | `23f3a61ee9d7cd098d2f-f3f77e01e6626b73f7ce` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-f3f77e01e6626b73f7ce--51) |
| FAIL | T-993 首次自动选账号后画布可创建，新增节点不会重叠 | [http://127.0.0.1:3887/canvases?tab=canvases](http://127.0.0.1:3887/canvases?tab=canvases) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/09760f93db875269-creative-canvas--T-993-首次自动选账号后画布可创建-新增节点不会重叠--25e86d881015bb50964a739baba2b19d7f01ebda6052f7d177bf4d923e4d173d.png) | `23f3a61ee9d7cd098d2f-c377daf519fe86936a1d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-c377daf519fe86936a1d--52) |

失败证据：

```text
Error: locator.click: Error: strict mode violation: getByRole('button', { name: '新建画布' }) resolved to 2 elements:
    1) <button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">…</button> aka locator('header').filter({ hasText: '创作画布在无限画布里整理想法、制作图片和视频。每个账号的画布和素材独立保存。新建画布' }).getByRole('button')
    2) <button type="button" class="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">…</button> aka getByRole('button', { name: '新建画布' }).nth(1)

Call log:
[2m  - waiting for getByRole('button', { name: '新建画布' })[22m

```

| PASS | T-993 视口缩放只保存在本地，不改画布内容版本 | [http://127.0.0.1:3887/canvases/f7c8f7d2-15e1-4225-84e8-c0e165ace0c3](http://127.0.0.1:3887/canvases/f7c8f7d2-15e1-4225-84e8-c0e165ace0c3) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/b0c886c0c739e213-creative-canvas--T-993-视口缩放只保存在本地-不改画布内容版本--8be70fe2ec62e445cbb84a8043b75c529e8f33e39bef15c0d5da767849dd14fa.png) | `23f3a61ee9d7cd098d2f-74c16b866a7ab5fac87e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-74c16b866a7ab5fac87e--53) |
| PASS | T-993 双指滚动平移、组合键缩放，节点文字仍可独立滚动 | [http://127.0.0.1:3887/canvases/017a17bd-6c3a-4551-9b3b-301268ff832f](http://127.0.0.1:3887/canvases/017a17bd-6c3a-4551-9b3b-301268ff832f) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/20a7fe902e9de3e2-creative-canvas--T-993-双指滚动平移-组合键缩放-节点文字仍可独立滚动--fa3fde65fe73934b8fbae9a6abc2d117148496e596d02d172452e3c401e3bc1c.png) | `23f3a61ee9d7cd098d2f-9a2455f979ec9d89792b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-9a2455f979ec9d89792b--54) |
| PASS | T-993 旧版无尺寸画布可读，保存后补默认尺寸且连线不丢 | [http://127.0.0.1:3887/canvases/d8c4cfbf-0bd9-4d04-a90f-3373cdb7bc0f](http://127.0.0.1:3887/canvases/d8c4cfbf-0bd9-4d04-a90f-3373cdb7bc0f) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/1980f23aee85435e-creative-canvas--T-993-旧版无尺寸画布可读-保存后补默认尺寸且连线不丢--74c72badb4a4d49d91b363a0f2017d5f32026a8b30848c3ab5e249bd44b95aa5.png) | `23f3a61ee9d7cd098d2f-0c2be7164b5e6d6531d6` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-0c2be7164b5e6d6531d6--55) |
| TIMEOUT | T-993 当前账号图片与视频能插入画布并实际预览 | [http://127.0.0.1:3887/canvases/4896334f-63bf-4dc6-885f-61436164f070](http://127.0.0.1:3887/canvases/4896334f-63bf-4dc6-885f-61436164f070) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/a985bc1a1d96ed56-creative-canvas--T-993-当前账号图片与视频能插入画布并实际预览--58505b225c5277984184906170ccec0d1131d818b06ff13582ed8bde1de1c1e9.png) | `23f3a61ee9d7cd098d2f-17b9336c087792b5462c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-17b9336c087792b5462c--56) |

失败证据：

```text
[31mTest timeout of 30000ms exceeded.[39m
```

| FAIL | T-994 作品素材入口、项目画布过滤与安全返回 | [http://127.0.0.1:3887/canvases/ec4d59cf-1adc-4835-a7ee-96cca289c87e](http://127.0.0.1:3887/canvases/ec4d59cf-1adc-4835-a7ee-96cca289c87e) | [查看原图](../t1220/run-1791693959226-51961/6744d12f0484c0d1.png) | `23f3a61ee9d7cd098d2f-eeceae934f9613508ba9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-eeceae934f9613508ba9--57) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByText('搜索已加载的 0 件素材')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for getByText('搜索已加载的 0 件素材')[22m

```

| PASS | T-994 画布版本冲突时不离开并给出恢复动作 | [http://127.0.0.1:3887/canvases/8004af64-0c97-439f-b4d0-4942d428873b](http://127.0.0.1:3887/canvases/8004af64-0c97-439f-b4d0-4942d428873b) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/cc5825b2fbd3bd9b-creative-canvas--T-994-画布版本冲突时不离开并给出恢复动作--e5b75faf017d44a97d9095980e80f789ad3aa072e15f9a11ab85963a9f58b780.png) | `23f3a61ee9d7cd098d2f-06e15471e2014b5b29f7` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-06e15471e2014b5b29f7--58) |
| PASS | T-994 生成结果就地保留并加入当前作品（模拟任务回执） | [http://127.0.0.1:3887/canvases/dbc8014d-fbbb-4e74-b307-5755ed175178](http://127.0.0.1:3887/canvases/dbc8014d-fbbb-4e74-b307-5755ed175178) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/7fa1f7bdd3845723-creative-canvas--T-994-生成结果就地保留并加入当前作品-模拟任务回执--bb66e56934c72c797bd439516b8b1f88853fe4400e76b26fd8c8f48a8c77d5c7.png) | `23f3a61ee9d7cd098d2f-94eb7feef0961e85b381` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-94eb7feef0961e85b381--59) |
| PASS | T-1021 首页案例独立浏览、取消无写入，多页模板创建原画布并可重新读取 | [http://127.0.0.1:3887/canvases/e9f3f06b-0b4e-4b2f-9978-87b746226360](http://127.0.0.1:3887/canvases/e9f3f06b-0b4e-4b2f-9978-87b746226360) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/4f1f7db90346a8f8-creative-canvas--T-1021-首页案例独立浏览-取消无写入-多页模板创建原画布并可重新读取--0ab2be9e557f965097deefc2793cee790d1c49b1c29412d52d8e5e93ee9c56f2.png) | `23f3a61ee9d7cd098d2f-a73e5da40497e2dd126e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-a73e5da40497e2dd126e--60) |
| TIMEOUT | T-1021 资产独立上传，选用追加原画布并冻结真实文件 | [http://127.0.0.1:3887/canvases?tab=assets](http://127.0.0.1:3887/canvases?tab=assets) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/bd6556bb35006b3e-creative-canvas--T-1021-资产独立上传-选用追加原画布并冻结真实文件--159c0b0308dae5b4ab54cfa09e11fb3accd866e4bb3b7190862a161b6b6050c6.png) | `23f3a61ee9d7cd098d2f-840c89ee9bbc88375ed1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-840c89ee9bbc88375ed1--61) |

失败证据：

```text
[31mTest timeout of 30000ms exceeded.[39m
```

| PASS | T-1101 缩略素材、精确连线、运行锁与重生成确认（模拟模型回执） | [http://127.0.0.1:3887/canvases/2529e144-2a1b-4bc2-8a3c-2e2b3f54a241](http://127.0.0.1:3887/canvases/2529e144-2a1b-4bc2-8a3c-2e2b3f54a241) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/2ba99802bedd3085-creative-canvas--T-1101-缩略素材-精确连线-运行锁与重生成确认-模拟模型回执--a2f043798d904db898656f5e881ad2cad38b3201b47dbf4e0b802ab06d87f187.png) | `23f3a61ee9d7cd098d2f-5e9f5b3f91aef02174a2` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-5e9f5b3f91aef02174a2--62) |
| PASS | T-1101 三平台表格直接打开扫码弹窗，无重复刷新和下方扫码区 | [http://127.0.0.1:3887/accounts](http://127.0.0.1:3887/accounts) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/756ea563e59d4d68-creative-canvas--T-1101-三平台表格直接打开扫码弹窗-无重复刷新和下方扫码区--1f05cda34b82416f6631f0fae5b7788b95c380059c5522b2babfb1ff1b4af36b.png) | `23f3a61ee9d7cd098d2f-3197831785de5363598f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-3197831785de5363598f--63) |
| PASS | T-993 画布可保存、重开，切换账号后列表和直链隔离 | [http://127.0.0.1:3903/canvases/936146e3-55ff-4ab9-b799-f789f5cfc1a4](http://127.0.0.1:3903/canvases/936146e3-55ff-4ab9-b799-f789f5cfc1a4) | [查看原图](screenshots/creative-canvas--T-993-画布可保存-重开-切换账号后列表和直链隔离--e4970f3b2c30763642679c5efb579799dd4c01d608507dc6f1917a8fe818fbab.png) | `23f3a61ee9d7cd098d2f-f3f77e01e6626b73f7ce` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-f3f77e01e6626b73f7ce--320) |
| PASS | T-993 首次自动选账号后画布可创建，新增节点不会重叠 | [http://127.0.0.1:3903/canvases/ac335244-8062-408c-9714-df0fafd2102f](http://127.0.0.1:3903/canvases/ac335244-8062-408c-9714-df0fafd2102f) | [查看原图](screenshots/creative-canvas--T-993-首次自动选账号后画布可创建-新增节点不会重叠--25e86d881015bb50964a739baba2b19d7f01ebda6052f7d177bf4d923e4d173d.png) | `23f3a61ee9d7cd098d2f-c377daf519fe86936a1d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-c377daf519fe86936a1d--321) |
| PASS | T-993 视口缩放只保存在本地，不改画布内容版本 | [http://127.0.0.1:3903/canvases/9ea0e660-0e77-4d04-a1e7-e4cdca261c6a](http://127.0.0.1:3903/canvases/9ea0e660-0e77-4d04-a1e7-e4cdca261c6a) | [查看原图](screenshots/creative-canvas--T-993-视口缩放只保存在本地-不改画布内容版本--8be70fe2ec62e445cbb84a8043b75c529e8f33e39bef15c0d5da767849dd14fa.png) | `23f3a61ee9d7cd098d2f-74c16b866a7ab5fac87e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-74c16b866a7ab5fac87e--322) |
| PASS | T-993 双指滚动平移、组合键缩放，节点文字仍可独立滚动 | [http://127.0.0.1:3903/canvases/beae4139-9239-4782-92df-7a4b9a550b42](http://127.0.0.1:3903/canvases/beae4139-9239-4782-92df-7a4b9a550b42) | [查看原图](screenshots/creative-canvas--T-993-双指滚动平移-组合键缩放-节点文字仍可独立滚动--fa3fde65fe73934b8fbae9a6abc2d117148496e596d02d172452e3c401e3bc1c.png) | `23f3a61ee9d7cd098d2f-9a2455f979ec9d89792b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-9a2455f979ec9d89792b--323) |
| PASS | T-993 旧版无尺寸画布可读，保存后补默认尺寸且连线不丢 | [http://127.0.0.1:3903/canvases/55b58116-00f8-44d2-babe-8cfdd997d005](http://127.0.0.1:3903/canvases/55b58116-00f8-44d2-babe-8cfdd997d005) | [查看原图](screenshots/creative-canvas--T-993-旧版无尺寸画布可读-保存后补默认尺寸且连线不丢--74c72badb4a4d49d91b363a0f2017d5f32026a8b30848c3ab5e249bd44b95aa5.png) | `23f3a61ee9d7cd098d2f-0c2be7164b5e6d6531d6` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-0c2be7164b5e6d6531d6--324) |
| PASS | T-993 当前账号图片与视频能插入画布并实际预览 | [http://127.0.0.1:3903/canvases/f5377a8b-f043-41a4-bd9c-c2a2937e529c](http://127.0.0.1:3903/canvases/f5377a8b-f043-41a4-bd9c-c2a2937e529c) | [查看原图](screenshots/creative-canvas--T-993-当前账号图片与视频能插入画布并实际预览--58505b225c5277984184906170ccec0d1131d818b06ff13582ed8bde1de1c1e9.png) | `23f3a61ee9d7cd098d2f-17b9336c087792b5462c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-17b9336c087792b5462c--325) |
| FAIL | T-994 作品素材入口、项目画布过滤与安全返回 | [http://127.0.0.1:3903/assets](http://127.0.0.1:3903/assets) | [查看原图](../t1220/run-1791693959226-51961/9fb0a9f9c848a853.png) | `23f3a61ee9d7cd098d2f-eeceae934f9613508ba9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-eeceae934f9613508ba9--326) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByRole('heading', { name: '素材中心', exact: true })
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 120000ms[22m
[2m  - waiting for getByRole('heading', { name: '素材中心', exact: true })[22m

```

| PASS | T-994 画布版本冲突时不离开并给出恢复动作 | [http://127.0.0.1:3903/canvases/fa9bf9bf-395f-41d3-baa2-97f627e745b3](http://127.0.0.1:3903/canvases/fa9bf9bf-395f-41d3-baa2-97f627e745b3) | [查看原图](screenshots/creative-canvas--T-994-画布版本冲突时不离开并给出恢复动作--e5b75faf017d44a97d9095980e80f789ad3aa072e15f9a11ab85963a9f58b780.png) | `23f3a61ee9d7cd098d2f-06e15471e2014b5b29f7` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-06e15471e2014b5b29f7--327) |
| PASS | T-994 生成结果就地保留并加入当前作品（模拟任务回执） | [http://127.0.0.1:3903/canvases/ea4463fe-9764-4144-9dc2-15e4bfa7e9e4](http://127.0.0.1:3903/canvases/ea4463fe-9764-4144-9dc2-15e4bfa7e9e4) | [查看原图](screenshots/creative-canvas--T-994-生成结果就地保留并加入当前作品-模拟任务回执--bb66e56934c72c797bd439516b8b1f88853fe4400e76b26fd8c8f48a8c77d5c7.png) | `23f3a61ee9d7cd098d2f-94eb7feef0961e85b381` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-94eb7feef0961e85b381--328) |
| PASS | T-1021 首页案例独立浏览、取消无写入，多页模板创建原画布并可重新读取 | [http://127.0.0.1:3903/canvases/c4f2803e-9ddd-40a7-bc53-bde8219fb268](http://127.0.0.1:3903/canvases/c4f2803e-9ddd-40a7-bc53-bde8219fb268) | [查看原图](screenshots/creative-canvas--T-1021-首页案例独立浏览-取消无写入-多页模板创建原画布并可重新读取--0ab2be9e557f965097deefc2793cee790d1c49b1c29412d52d8e5e93ee9c56f2.png) | `23f3a61ee9d7cd098d2f-a73e5da40497e2dd126e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-a73e5da40497e2dd126e--329) |
| PASS | T-1021 资产独立上传，选用追加原画布并冻结真实文件 | [http://127.0.0.1:3903/canvases/d833c9b6-8a38-4d8a-9929-beafa62ba199](http://127.0.0.1:3903/canvases/d833c9b6-8a38-4d8a-9929-beafa62ba199) | [查看原图](screenshots/creative-canvas--T-1021-资产独立上传-选用追加原画布并冻结真实文件--159c0b0308dae5b4ab54cfa09e11fb3accd866e4bb3b7190862a161b6b6050c6.png) | `23f3a61ee9d7cd098d2f-840c89ee9bbc88375ed1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-840c89ee9bbc88375ed1--330) |
| PASS | T-1101 缩略素材、精确连线、运行锁与重生成确认（模拟模型回执） | [http://127.0.0.1:3903/canvases/dbb32779-cbee-4319-af52-3cb88050eb57](http://127.0.0.1:3903/canvases/dbb32779-cbee-4319-af52-3cb88050eb57) | [查看原图](screenshots/creative-canvas--T-1101-缩略素材-精确连线-运行锁与重生成确认-模拟模型回执--a2f043798d904db898656f5e881ad2cad38b3201b47dbf4e0b802ab06d87f187.png) | `23f3a61ee9d7cd098d2f-5e9f5b3f91aef02174a2` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-5e9f5b3f91aef02174a2--331) |
| PASS | T-1101 三平台表格直接打开扫码弹窗，无重复刷新和下方扫码区 | [http://127.0.0.1:3903/accounts](http://127.0.0.1:3903/accounts) | [查看原图](screenshots/creative-canvas--T-1101-三平台表格直接打开扫码弹窗-无重复刷新和下方扫码区--1f05cda34b82416f6631f0fae5b7788b95c380059c5522b2babfb1ff1b4af36b.png) | `23f3a61ee9d7cd098d2f-3197831785de5363598f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-3197831785de5363598f--332) |
| PASS | T-994 作品素材入口、项目画布过滤与安全返回 | [http://127.0.0.1:3904/canvases/77e900f2-cf83-4278-937e-11b7d7984e66](http://127.0.0.1:3904/canvases/77e900f2-cf83-4278-937e-11b7d7984e66) | [查看原图](../t1220/run-1791693959226-51961/f2bf14f3042df740.png) | `23f3a61ee9d7cd098d2f-eeceae934f9613508ba9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-eeceae934f9613508ba9--335) |
| PASS | T-994 作品素材入口、项目画布过滤与安全返回 | [http://127.0.0.1:3904/canvases/1c255dc3-4d80-4085-b972-b1b163272860](http://127.0.0.1:3904/canvases/1c255dc3-4d80-4085-b972-b1b163272860) | [查看原图](screenshots/creative-canvas--T-994-作品素材入口-项目画布过滤与安全返回--697713e595e4685f89e155cc4bdf5ea0b5a66dcd543e550e13971f319a42cb20.png) | `23f3a61ee9d7cd098d2f-eeceae934f9613508ba9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fcreative-canvas.spec.ts--23f3a61ee9d7cd098d2f-eeceae934f9613508ba9--336) |

## frontend/tests/e2e/draft-ammo-media-preview.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 稿面视频素材双击与键盘均可真实预览，刷新和小窗口仍保持 | [http://127.0.0.1:3887/projects/project-a65785f2-1642](http://127.0.0.1:3887/projects/project-a65785f2-1642) | [查看原图](screenshots/draft-ammo-media-preview--稿面视频素材双击与键盘均可真实预览-刷新和小窗口仍保持--e4f25be30aee71098adba0b216729950a59f84e1775af1bf723f64ae73875e71.png) | `f676eec36554c6fe6d79-3013d162e18de07e3592` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fdraft-ammo-media-preview.spec.ts--f676eec36554c6fe6d79-3013d162e18de07e3592--64) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByRole('button', { name: '预览 编导智能体实拍.mp4' })
Expected substring: [32m"双击预览"[39m
Received string:    [31m"素材编导智能体实拍.mp4↳ 素材 · video点击阅读"[39m
Timeout: 5000ms

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for getByRole('button', { name: '预览 编导智能体实拍.mp4' })[22m
[2m    14 × locator resolved to <div tabindex="0" role="button" data-kind="asset" data-slot="draft-ammo-card" aria-label="预览 编导智能体实拍.mp4" class="w-[220px] shrink-0 cursor-pointer rounded-[10px] border border-border bg-surface px-3 py-2.5 transition-colors hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">…</div>[22m
[2m       - unexpected value "素材编导智能体实拍.mp4↳ 素材 · video点击阅读"[22m

```


## frontend/tests/e2e/experience.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the adjudication workbench on the /experience route | [http://127.0.0.1:3887/knowledge](http://127.0.0.1:3887/knowledge) | [查看原图](screenshots/experience--经验裁决台-page-renders-the-adjudication-workbench-on-the-experience-route--724bef1fc8d4839ad58a56bbc19ab847bf25a445c539c5091f196d802e475150.png) | `b64559fc4465ec32f46c-c9e4a01ada78a3a6ab2c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fexperience.spec.ts--b64559fc4465ec32f46c-c9e4a01ada78a3a6ab2c--65) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: locator('[data-slot="header-page-heading"]')
Expected substring: [32m"经验沉淀"[39m
Received string:    [31m"知识库沉淀的笔记、灵感与外部参考"[39m
Timeout: 5000ms

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="header-page-heading"]')[22m
[2m    6 × locator resolved to <div class="min-w-0 flex-1" data-slot="header-page-heading"></div>[22m
[2m      - unexpected value ""[22m
[2m    8 × locator resolved to <div data-slot="header-page-heading" class="flex min-w-0 flex-1 flex-col sr-only">…</div>[22m
[2m      - unexpected value "知识库沉淀的笔记、灵感与外部参考"[22m

```


## frontend/tests/e2e/knowledge-library.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | library-journey 1366 真实读写、整理与项目引用 | [http://127.0.0.1:3887/knowledge?item=knowledge-a65785f2-1692](http://127.0.0.1:3887/knowledge?item=knowledge-a65785f2-1692) | [查看原图](screenshots/knowledge-library--library-journey-1366-真实读写-整理与项目引用--021d9ec655d3d42291d9ff3a1732cc8f13ad328a54de18d5042efaa82b322b1b.png) | `667626e4230c44a2bab0-bf779f39a876596898c0` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fknowledge-library.spec.ts--667626e4230c44a2bab0-bf779f39a876596898c0--66) |
| PASS | library-journey 1024 真实读写、整理与项目引用 | [http://127.0.0.1:3887/knowledge?item=knowledge-a65785f2-3052](http://127.0.0.1:3887/knowledge?item=knowledge-a65785f2-3052) | [查看原图](screenshots/knowledge-library--library-journey-1024-真实读写-整理与项目引用--43f8aa03e3f8bb52abea0e39138763bcd296d3148d51607b08a5abf1df1424d9.png) | `667626e4230c44a2bab0-f63dc0db3360905efac3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fknowledge-library.spec.ts--667626e4230c44a2bab0-f63dc0db3360905efac3--67) |

## frontend/tests/e2e/new-project.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | opens from the dashboard and preserves the approved form order | [http://127.0.0.1:3887/projects/new](http://127.0.0.1:3887/projects/new) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/76074eef41102f0a-new-project--New-Project-dialog-opens-from-the-dashboard-and-preserves-the-approved-f--58cd57b25845a2dae0cf707e533bc66ff1493409be5fa38f44a3a17db6121a18.png) | `f30027fcc96d9590b2b9-6d726cf9ec8caaa3a2e3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fnew-project.spec.ts--f30027fcc96d9590b2b9-6d726cf9ec8caaa3a2e3--68) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  getByRole('dialog', { name: '新建项目' }).locator('[data-form-section]')
Expected: [32m4[39m
Received: [31m2[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for getByRole('dialog', { name: '新建项目' }).locator('[data-form-section]')[22m
[2m    14 × locator resolved to 2 elements[22m
[2m       - unexpected value "2"[22m

```

| TIMEOUT | creates and enters the new project research workspace when requested | [http://127.0.0.1:3887/projects/new](http://127.0.0.1:3887/projects/new) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/a2fb6bb86b3a2a20-new-project--New-Project-dialog-creates-and-enters-the-new-project-research-workspace--81b94cb3a924ee8f162fdaef472321a3308b5bae0f62775dbabd8d388884e216.png) | `f30027fcc96d9590b2b9-6f90ff8c8a04901b21e0` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fnew-project.spec.ts--f30027fcc96d9590b2b9-6f90ff8c8a04901b21e0--69) |

失败证据：

```text
[31mTest timeout of 30000ms exceeded.[39m
```

| FAIL | opens from the dashboard and preserves the approved form order | [http://127.0.0.1:3901/projects/new](http://127.0.0.1:3901/projects/new) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/2027cd34910df09c-new-project--New-Project-dialog-opens-from-the-dashboard-and-preserves-the-approved-f--58cd57b25845a2dae0cf707e533bc66ff1493409be5fa38f44a3a17db6121a18.png) | `f30027fcc96d9590b2b9-6d726cf9ec8caaa3a2e3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fnew-project.spec.ts--f30027fcc96d9590b2b9-6d726cf9ec8caaa3a2e3--316) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  getByRole('dialog', { name: '新建项目' }).locator('[data-form-section]')
Expected: [32m4[39m
Received: [31m2[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for getByRole('dialog', { name: '新建项目' }).locator('[data-form-section]')[22m
[2m    14 × locator resolved to 2 elements[22m
[2m       - unexpected value "2"[22m

```

| FAIL | creates and enters the new project research workspace when requested | [http://127.0.0.1:3901/](http://127.0.0.1:3901/) | [查看原图](../t1208/20261011-before-canvas-recheck/screenshots/aba5d8bfc99ab6b4-new-project--New-Project-dialog-creates-and-enters-the-new-project-research-workspace--81b94cb3a924ee8f162fdaef472321a3308b5bae0f62775dbabd8d388884e216.png) | `f30027fcc96d9590b2b9-6f90ff8c8a04901b21e0` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fnew-project.spec.ts--f30027fcc96d9590b2b9-6f90ff8c8a04901b21e0--317) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByRole('dialog', { name: '新建项目' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for getByRole('dialog', { name: '新建项目' })[22m

```

| PASS | opens from the dashboard, follows the current form contract, and creates selected formats | [http://127.0.0.1:3903/projects/project-3240daa0-721](http://127.0.0.1:3903/projects/project-3240daa0-721) | [查看原图](screenshots/new-project--New-Project-dialog-opens-from-the-dashboard-follows-the-current-form-con--9d39772d7d9342667bec4f05c65347a76eafafcdf08e44c68a692e006ec31955.png) | `f30027fcc96d9590b2b9-c0e38d85bf30c9fec284` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fnew-project.spec.ts--f30027fcc96d9590b2b9-c0e38d85bf30c9fec284--333) |
| PASS | creates and enters the new project workspace when requested | [http://127.0.0.1:3903/projects/project-3240daa0-779](http://127.0.0.1:3903/projects/project-3240daa0-779) | [查看原图](screenshots/new-project--New-Project-dialog-creates-and-enters-the-new-project-workspace-when-req--b1a5a1aa76b79897c4c1c6eb56aa08d8aa3ed3b79e975497cabf811d2b12583a.png) | `f30027fcc96d9590b2b9-ece4258bfdc42c5be84b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fnew-project.spec.ts--f30027fcc96d9590b2b9-ece4258bfdc42c5be84b--334) |

## frontend/tests/e2e/onboarding-and-small-sidebar.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 重新打开后真实回到首页，并保留新号/已有作品两条连续路径 | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/onboarding-and-small-sidebar--新手成果路径与低高度侧栏-重新打开后真实回到首页-并保留新号-已有作品两条连续路径--32965c6ce883c7907b6e118e8e6909e02c7b24bcef0ec800ce424adba1994f6e.png) | `d9613b8836b17a7105de-3b722d27bb7db20a75f4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fonboarding-and-small-sidebar.spec.ts--d9613b8836b17a7105de-3b722d27bb7db20a75f4--70) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: locator('[data-slot="onboarding-card"]')
Expected substring: [32m"绑定你的抖音号"[39m
Received string:    [31m"上手引导已完成 1 / 6结束引导将平台账号加入账号组已完成2确认创作起点选择从零开始，或先整理已有内容。历史资料可在绑定账号中显式归组。从零开始已有内容3确定账号组的内容定位先明确受众、内容方向和表达方式，后续对标、选题和项目才不会跑偏。去创建定位4添加一个对标账号在内容雷达里持续监控一个对标账号，后续可以直接从真实内容中找机会。去监控对标5从对标内容创建选题选一条对标内容完成拆解，并转成符合你账号定位的选题。去创建选题6把选题变成项目从刚创建的选题进入项目，继续完成脚本、制作、发布和复盘。去选题中心立项引导仅提供建议。你可以直接使用所有功能，或在设置中重新查看。"[39m
Timeout: 5000ms

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="onboarding-card"]')[22m
[2m    14 × locator resolved to <section aria-label="新手引导" data-slot="onboarding-card" class="mt-14 flex flex-col gap-3 rounded-card border border-brand/25 bg-brand-soft/20 p-4">…</section>[22m
[2m       - unexpected value "上手引导已完成 1 / 6结束引导将平台账号加入账号组已完成2确认创作起点选择从零开始，或先整理已有内容。历史资料可在绑定账号中显式归组。从零开始已有内容3确定账号组的内容定位先明确受众、内容方向和表达方式，后续对标、选题和项目才不会跑偏。去创建定位4添加一个对标账号在内容雷达里持续监控一个对标账号，后续可以直接从真实内容中找机会。去监控对标5从对标内容创建选题选一条对标内容完成拆解，并转成符合你账号定位的选题。去创建选题6把选题变成项目从刚创建的选题进入项目，继续完成脚本、制作、发布和复盘。去选题中心立项引导仅提供建议。你可以直接使用所有功能，或在设置中重新查看。"[22m

```

| PASS | 低高度窗口始终保留账号和用户身份 | [http://127.0.0.1:3887/settings](http://127.0.0.1:3887/settings) | [查看原图](screenshots/onboarding-and-small-sidebar--新手成果路径与低高度侧栏-低高度窗口始终保留账号和用户身份--93769460024a9a6af8b6bdba4cef7ef6b2a7a18274a6787c061b6af02fc32fd3.png) | `d9613b8836b17a7105de-a7193d0e41768ab0a6a4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fonboarding-and-small-sidebar.spec.ts--d9613b8836b17a7105de-a7193d0e41768ab0a6a4--71) |

## frontend/tests/e2e/overlay-routing.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | direct visit to /projects/new renders the new-project overlay shell | [http://127.0.0.1:3887/projects/new](http://127.0.0.1:3887/projects/new) | [查看原图](screenshots/overlay-routing--overlay-routing-direct-visit-to-projects-new-renders-the-new-project-ove--1b5812bbcb4dcae60c11bb3f45efea481be303591bed357eec769e9a78532abc.png) | `04168072137409ba112a-9fd1f1d10870da9c9fb1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Foverlay-routing.spec.ts--04168072137409ba112a-9fd1f1d10870da9c9fb1--72) |
| PASS | ?copilot=open on / opens the copilot overlay and preserves pathname | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/overlay-routing--overlay-routing-copilot-open-on-opens-the-copilot-overlay-and-preserves---b13f531eae49fe778bba55c1afbcdd46c226829073a3eb3a635c8f67df9f8049.png) | `04168072137409ba112a-7da84ce1a70e08ced86a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Foverlay-routing.spec.ts--04168072137409ba112a-7da84ce1a70e08ced86a--73) |
| PASS | pressing Back closes the copilot overlay before leaving the page | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/overlay-routing--overlay-routing-pressing-Back-closes-the-copilot-overlay-before-leaving---dcb37f6b3415445612ce576550817d543187c24a5f22f7ff9bbe80934116f324.png) | `04168072137409ba112a-dad8f109d41ef77c11e7` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Foverlay-routing.spec.ts--04168072137409ba112a-dad8f109d41ef77c11e7--74) |
| PASS | Tab focus stays inside an open overlay | [http://127.0.0.1:3887/?copilot=open](http://127.0.0.1:3887/?copilot=open) | [查看原图](screenshots/overlay-routing--overlay-routing-Tab-focus-stays-inside-an-open-overlay--d0fe832a507032f8f854a9150fa56d584ab971494bb78e1fa424a3599fbb9db8.png) | `04168072137409ba112a-f5ff83adad25db7da8dd` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Foverlay-routing.spec.ts--04168072137409ba112a-f5ff83adad25db7da8dd--75) |

## frontend/tests/e2e/platform-work-catalog.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 平台作品页按当前账号显示真实空目录和待核验能力 | [http://127.0.0.1:3887/accounts](http://127.0.0.1:3887/accounts) | [查看原图](screenshots/platform-work-catalog--平台作品页按当前账号显示真实空目录和待核验能力--e6031b558bb620c5e73ffcf019e0338f14297bfc00029cf75ed2ecc6d4cb7707.png) | `ff88aeb912d54d19c019-07fb539b46563c1a126c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fplatform-work-catalog.spec.ts--ff88aeb912d54d19c019-07fb539b46563c1a126c--76) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByTestId('platform-capability-overview')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for getByTestId('platform-capability-overview')[22m

```

| FAIL | 本地账号完成多平台目标项目与发布草稿，账号归属隔离 | [http://127.0.0.1:3887/projects/project-a65785f2-3272](http://127.0.0.1:3887/projects/project-a65785f2-3272) | [查看原图](screenshots/platform-work-catalog--本地账号完成多平台目标项目与发布草稿-账号归属隔离--2d02dff5e2ca3565bb845b998035a9e03c1300b8b405c4f763296b038d60a063.png) | `ff88aeb912d54d19c019-cfdcf5687c7b5f5352b8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fplatform-work-catalog.spec.ts--ff88aeb912d54d19c019-cfdcf5687c7b5f5352b8--77) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByText('小红书账号视频创作链验收', { exact: true }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for getByText('小红书账号视频创作链验收', { exact: true }).first()[22m

```

| TIMEOUT | 账号页绑定成功后可直接切换到对应的小红书与快手作品页 | [http://127.0.0.1:3887/accounts](http://127.0.0.1:3887/accounts) | [查看原图](screenshots/platform-work-catalog--账号页绑定成功后可直接切换到对应的小红书与快手作品页--bb3e74f6fb11dc43b8938cacc06cd80aa512f1a72fbd0f2235910ed9e154ce03.png) | `ff88aeb912d54d19c019-9d7913f6044d65d5c8a4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fplatform-work-catalog.spec.ts--ff88aeb912d54d19c019-9d7913f6044d65d5c8a4--78) |

失败证据：

```text
[31mTest timeout of 30000ms exceeded.[39m
```


## frontend/tests/e2e/production-broll-remove.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 已确认分镜剔除 B-roll 后写入新版本，刷新也不会恢复旧素材 | [http://127.0.0.1:3887/projects/project-a65785f2-3322/production](http://127.0.0.1:3887/projects/project-a65785f2-3322/production) | [查看原图](screenshots/production-broll-remove--已确认分镜剔除-B-roll-后写入新版本-刷新也不会恢复旧素材--21c4f4802932b9bacda9aa47af4bb4e0251fabffe475f9b844795f56bc30f467.png) | `90d32f0826f75e4378df-34912ade6a99810c4747` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fproduction-broll-remove.spec.ts--90d32f0826f75e4378df-34912ade6a99810c4747--79) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="confirmed-decisions-notice"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="confirmed-decisions-notice"]')[22m

```


## frontend/tests/e2e/projects.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 可在项目行新增、修改并取消发布排期 | [http://127.0.0.1:3887/projects](http://127.0.0.1:3887/projects) | [查看原图](../t1208/20261011-before-budget-recheck/screenshots/77466e2b1abf3e6d-projects--项目排期闭环-T-599-可在项目行新增-修改并取消发布排期--b964515a247e479ce0376056a684f6b1f130b6f98f3b975aede410665ee8714e.png) | `4006612928a30a3362ae-63e0b017fc277dba3b3a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fprojects.spec.ts--4006612928a30a3362ae-63e0b017fc277dba3b3a--80) |
| FAIL | 可在项目行新增、修改并取消发布排期 | [http://127.0.0.1:3901/projects](http://127.0.0.1:3901/projects) | [查看原图](../t1208/20261011-before-budget-recheck/screenshots/fa64de18d95b3fa0-projects--项目排期闭环-T-599-可在项目行新增-修改并取消发布排期--b964515a247e479ce0376056a684f6b1f130b6f98f3b975aede410665ee8714e.png) | `4006612928a30a3362ae-63e0b017fc277dba3b3a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fprojects.spec.ts--4006612928a30a3362ae-63e0b017fc277dba3b3a--318) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('main[data-page="projects"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="projects"]')[22m

```

| PASS | 可在项目行新增、修改并取消发布排期 | [http://127.0.0.1:3902/projects](http://127.0.0.1:3902/projects) | [查看原图](screenshots/projects--项目排期闭环-T-599-可在项目行新增-修改并取消发布排期--b964515a247e479ce0376056a684f6b1f130b6f98f3b975aede410665ee8714e.png) | `4006612928a30a3362ae-63e0b017fc277dba3b3a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fprojects.spec.ts--4006612928a30a3362ae-63e0b017fc277dba3b3a--319) |

## frontend/tests/e2e/publish-package-readback.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 查看发布物料优先回读完整简介与标签，刷新和小窗口仍保持 | [http://127.0.0.1:3887/projects/project-a65785f2-3398](http://127.0.0.1:3887/projects/project-a65785f2-3398) | [查看原图](screenshots/publish-package-readback--查看发布物料优先回读完整简介与标签-刷新和小窗口仍保持--f06f9404d9839b7d009c4b8da38130bfc5faa58a59eef7c4e29b99d4138ebfa2.png) | `4d98bac62d9459c5a6a9-ad96dd2c675272c67454` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fpublish-package-readback.spec.ts--4d98bac62d9459c5a6a9-ad96dd2c675272c67454--81) |

## frontend/tests/e2e/publishing-center.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 真实项目排期出现在 70/30 日历视图，旧重复列表已移除 | [http://127.0.0.1:3887/publishing?month=2099-12](http://127.0.0.1:3887/publishing?month=2099-12) | [查看原图](screenshots/publishing-center--发布中心日历主视图-T-599-真实项目排期出现在-70-30-日历视图-旧重复列表已移除--0999c4940f2590baef2d443a0b2fff6279b523ac3273823d49277a3af1536376.png) | `4f3e74964b66d244a3b5-d02911a1d5be5b1c6704` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fpublishing-center.spec.ts--4f3e74964b66d244a3b5-d02911a1d5be5b1c6704--82) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  locator('main[data-page="publishing-center"]').locator('[data-slot="publishing-center-layout"]').locator('[data-slot="publishing-calendar-region"]').locator('[data-testid="calendar-entry-row"]')
Expected: [32m1[39m
Received: [31m0[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="publishing-center"]').locator('[data-slot="publishing-center-layout"]').locator('[data-slot="publishing-calendar-region"]').locator('[data-testid="calendar-entry-row"]')[22m
[2m    14 × locator resolved to 0 elements[22m
[2m       - unexpected value "0"[22m

```


## frontend/tests/e2e/publishing-workspace.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 旧发布阶段链接进入当前项目稿面的发布区 | [http://127.0.0.1:3887/projects/project-a65785f2-3464#publish](http://127.0.0.1:3887/projects/project-a65785f2-3464#publish) | [查看原图](screenshots/publishing-workspace--旧发布阶段链接进入当前项目稿面的发布区--e14f9faa6aa9860b1411aa9aad591abd7949cb755ef0bc42f3ad9ffcdb0495f1.png) | `96482d79af88e131e91d-a71372ae3e6a2359652e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fpublishing-workspace.spec.ts--96482d79af88e131e91d-a71372ae3e6a2359652e--83) |

## frontend/tests/e2e/qwen-asr-configuration.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 选择 Qwen 后带出可直接保存的真实 provider、模型与接口 | [http://127.0.0.1:3887/settings](http://127.0.0.1:3887/settings) | [查看原图](screenshots/qwen-asr-configuration--Qwen-方言-ASR-设置预设-选择-Qwen-后带出可直接保存的真实-provider-模型与接口--9844bc973e6d7f3bc72f8336d089121bb3f471ba387c338cb24664e16e020a07.png) | `a7b16870f8e2fd2cb44c-7552c77e3cc3c4bf51db` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fqwen-asr-configuration.spec.ts--a7b16870f8e2fd2cb44c-7552c77e3cc3c4bf51db--84) |

## frontend/tests/e2e/recent-data-safety.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 已有定位进入从零前采时，正式母版和历史始终可见，搜索默认国内中文 | [http://127.0.0.1:3887/positioning](http://127.0.0.1:3887/positioning) | [查看原图](screenshots/recent-data-safety--已有定位进入从零前采时-正式母版和历史始终可见-搜索默认国内中文--82cad332dfd9a62d847ab9249828c039625e2956bc932f79a0af25fcb7a1518f.png) | `8e7a9a57a62b196b6936-eead317e609b857c2ca4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Frecent-data-safety.spec.ts--8e7a9a57a62b196b6936-eead317e609b857c2ca4--85) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByTestId('positioning-center')
Expected substring: [32m"当前定位母版"[39m
Received string:    [31m"定位中心账号的定位母版——下游的选题、评分、素材匹配与发布都以它为约束源。用 Copilot 把定位聊清楚不再填写固定六问，也不会因为资料不全卡住生成。Copilot 会先判断你是想继续深入当前账号、调整方向，还是重新定位；再结合可用作品和你的回答， 每次只补一个真正影响结果的信息。纯人设不会被强塞产品；有产品或服务时，才继续梳理产品、 人群、场景、痛点和信任证明。 随时可说“先给我一版” 未采纳前不改当前母版开始定位对话"[39m
Timeout: 5000ms

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for getByTestId('positioning-center')[22m
[2m    9 × locator resolved to <div data-slot="positioning-center" data-testid="positioning-center" class="flex h-full min-h-0 flex-col gap-4">…</div>[22m
[2m      - unexpected value "定位中心账号的定位母版——下游的选题、评分、素材匹配与发布都以它为约束源。用 Copilot 把定位聊清楚不再填写固定六问，也不会因为资料不全卡住生成。Copilot 会先判断你是想继续深入当前账号、调整方向，还是重新定位；再结合可用作品和你的回答， 每次只补一个真正影响结果的信息。纯人设不会被强塞产品；有产品或服务时，才继续梳理产品、 人群、场景、痛点和信任证明。 随时可说“先给我一版” 未采纳前不改当前母版开始定位对话"[22m

```

| FAIL | 信源确认删除后从工作台消失，并展示真实级联清理结果 | [http://127.0.0.1:3887/intelligence](http://127.0.0.1:3887/intelligence) | [查看原图](screenshots/recent-data-safety--信源确认删除后从工作台消失-并展示真实级联清理结果--df19cfb62c76ea38687dbe052b54e70325ad3a9a945cd1963a40eba3b73a233f.png) | `8e7a9a57a62b196b6936-226b8af6859976b93629` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Frecent-data-safety.spec.ts--8e7a9a57a62b196b6936-226b8af6859976b93629--86) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByTestId('radar-source-row-intelligence-source-a65785f2-3509')
Expected substring: [32m"待彻底删除信源-1791651908445"[39m
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for getByTestId('radar-source-row-intelligence-source-a65785f2-3509')[22m

```


## frontend/tests/e2e/review-history.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 手动洞察可从历史记录读回，时间友好且窄屏不溢出 | [http://127.0.0.1:3887/projects/project-a65785f2-3523/review](http://127.0.0.1:3887/projects/project-a65785f2-3523/review) | [查看原图](screenshots/review-history--项目复盘记录闭环-T-634-手动洞察可从历史记录读回-时间友好且窄屏不溢出--8d7964b579f48c1a010b6938f6ec2749c299aeae7beab9d7b5834abbbf0d800d.png) | `64d21a6f38bdb458c529-ad1e002797a4b6dd36c7` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Freview-history.spec.ts--64d21a6f38bdb458c529-ad1e002797a4b6dd36c7--87) |

## frontend/tests/e2e/search.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the global search structure on the /search route | [http://127.0.0.1:3887/search](http://127.0.0.1:3887/search) | [查看原图](screenshots/search--Global-Search-page-renders-the-global-search-structure-on-the-search-rou--c957fde88ebffe52aeec45c2d41e5d163f83345dcfe8d1453aa9d391ba26aa4b.png) | `f4a36a9939d689d57a9d-16a12204dc96e9f901a5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fsearch.spec.ts--f4a36a9939d689d57a9d-16a12204dc96e9f901a5--88) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator:  locator('main[data-page="search"]').locator('[data-slot="project-result-section"]')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="search"]').locator('[data-slot="project-result-section"]')[22m
[2m    14 × locator resolved to <div data-slot="project-result-section" class="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-3"></div>[22m
[2m       - unexpected value "hidden"[22m

```

| FAIL | URL ?q=... is reflected in the search input value | [http://127.0.0.1:3887/search?q=AI](http://127.0.0.1:3887/search?q=AI) | [查看原图](screenshots/search--Global-Search-page-URL-q-is-reflected-in-the-search-input-value--58bbfd5324006532622f7971434c5ceb027347b6e8ca94bbc06b3661c5871420.png) | `f4a36a9939d689d57a9d-45aa1522353ea5990897` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fsearch.spec.ts--f4a36a9939d689d57a9d-45aa1522353ea5990897--89) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveValue[2m([22m[32mexpected[39m[2m)[22m failed

Locator: locator('main[data-page="search"]').locator('[data-slot="search-page-input"]')
Expected: [32m"AI"[39m
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toHaveValue" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="search"]').locator('[data-slot="search-page-input"]')[22m

```


## frontend/tests/e2e/semantic-material-generation.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| TIMEOUT | 图片按确认稿需要预填多个候选，视频默认预填一个候选，点击不自动发送 | [http://127.0.0.1:3887/projects/project-a65785f2-3575](http://127.0.0.1:3887/projects/project-a65785f2-3575) | [查看原图](screenshots/semantic-material-generation--图片按确认稿需要预填多个候选-视频默认预填一个候选-点击不自动发送--3b9efd03da8d97c7de9072e52972923efe0f39f28a281d0aeb3c16c2c00c04d4.png) | `ab4ba88af7a7cf4851d3-7777bc4d99ffaf6b4a45` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fsemantic-material-generation.spec.ts--ab4ba88af7a7cf4851d3-7777bc4d99ffaf6b4a45--90) |

失败证据：

```text
[31mTest timeout of 30000ms exceeded.[39m
```


## frontend/tests/e2e/settings.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | [T-606] 模型来源状态在桌面与 390px 都可辨认且本地表单可用 | [http://127.0.0.1:3887/settings](http://127.0.0.1:3887/settings) | [查看原图](screenshots/settings--Settings-page-T-606-模型来源状态在桌面与-390px-都可辨认且本地表单可用--22d2205f0d939ec14e5d2ae054da8c50d99a139ddccb0ce38f4434469b1647c0.png) | `87418b536bb3b16b9965-1ee4cd8caf242f0696b5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fsettings.spec.ts--87418b536bb3b16b9965-1ee4cd8caf242f0696b5--91) |
| FAIL | renders the settings structure on the /settings route | [http://127.0.0.1:3887/settings](http://127.0.0.1:3887/settings) | [查看原图](screenshots/settings--Settings-page-renders-the-settings-structure-on-the-settings-route--3bbd8db718cbc889382b928e65341a5271f7da93d3867f172e612644b18c2964.png) | `87418b536bb3b16b9965-9d167bbc2a2b29b9bb07` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fsettings.spec.ts--87418b536bb3b16b9965-9d167bbc2a2b29b9bb07--92) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')
Expected: [32m"/settings"[39m
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toHaveAttribute" with timeout 5000ms[22m
[2m  - waiting for getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')[22m

```


## frontend/tests/e2e/shared-resource-lifecycle.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | TEST-T1105-RESOURCE 共享资源真实空态、刷新返回与失败重读 | [http://127.0.0.1:3887/accounts](http://127.0.0.1:3887/accounts) | [查看原图](screenshots/shared-resource-lifecycle--TEST-T1105-RESOURCE-共享资源真实空态-刷新返回与失败重读--8f261553c4e661bab936909c9e9af2a4d23e9f39db9f9ca8954f2c98788152fa.png) | `cfc5b60c2cb0888570de-9564b1608ee1f78c5ffa` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fshared-resource-lifecycle.spec.ts--cfc5b60c2cb0888570de-9564b1608ee1f78c5ffa--93) |

## frontend/tests/e2e/smoke.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | root route exposes the CreatorOS application container | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/smoke--root-route-exposes-the-CreatorOS-application-container--8d7ffd8d100176e5bee093782ce11c683c572c4d765f68aba0491155a9753e78.png) | `aa58ad17b2d44b8d86cc-1535904401b123820abf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fsmoke.spec.ts--aa58ad17b2d44b8d86cc-1535904401b123820abf--94) |

## frontend/tests/e2e/t1062-group-native-rough.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 纯组无平台账号仍可通过真实创建弹层创建项目、保存画布和打开原生剪辑 | [about:blank](about:blank) | [查看原图](screenshots/t1062-group-native-rough--T1062-账号组真实原生粗剪-纯组无平台账号仍可通过真实创建弹层创建项目-保存画布和打开原生剪辑--4eac819eeb26607479736fb2a70743e9e65625b58156aee3c4a471a88cbfb0df.png) | `a8c4891f095c8a8e2a8e-78c06f6ccaa7f5fd8b4e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-78c06f6ccaa7f5fd8b4e--95) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/manifest.json'
```

| FAIL | 同组多个账号/平台筛选保留dirty和真实native实例，公共保存始终冻结组根 | [about:blank](about:blank) | [查看原图](screenshots/t1062-group-native-rough--T1062-账号组真实原生粗剪-同组多个账号-平台筛选保留dirty和真实native实例-公共保存始终冻结组根--da2e067d5e7a1cc5664d5d98a80ac1561c4ed9900c2e896ee4518c42a36b20c2.png) | `a8c4891f095c8a8e2a8e-4a616b4b5d877c355ca2` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-4a616b4b5d877c355ca2--96) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/manifest.json'
```

| FAIL | 跨组时取消真实在途素材响应，旧组晚到结果不能回写或继续保存 | [about:blank](about:blank) | [查看原图](screenshots/t1062-group-native-rough--T1062-账号组真实原生粗剪-跨组时取消真实在途素材响应-旧组晚到结果不能回写或继续保存--1f6d86c1682165414a47a39259d8033de417e5e2e02433ed115293bcde3477d2.png) | `a8c4891f095c8a8e2a8e-ca78d653a89a51c55966` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-ca78d653a89a51c55966--97) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/manifest.json'
```

| FAIL | 真实迁组历史画布保留account出处，group归属可读写；错误组读回明确结束loading | [about:blank](about:blank) | [查看原图](screenshots/t1062-group-native-rough--T1062-账号组真实原生粗剪-真实迁组历史画布保留account出处-group归属可读写-错误组读回明确结束loading--629b3693c18235a81a1efd43ed69b6cb388457c3f6f72fd9193ab6066de45614.png) | `a8c4891f095c8a8e2a8e-408b513e0317a7efece3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-408b513e0317a7efece3--98) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/manifest.json'
```

| FAIL | 真实默认ASR与原生原声：普通AAC完整自然播放、单独核对、明确采用与保存刷新 | [about:blank](about:blank) | [查看原图](screenshots/t1062-group-native-rough--T1062-账号组真实原生粗剪-真实默认ASR与原生原声-普通AAC完整自然播放-单独核对-明确采用与保存刷新--07ae4779f1fd86c0bb501b65736511dde87233fc193b472a80920f2a9d4eb877.png) | `a8c4891f095c8a8e2a8e-d6ac7f086c19a59f1b17` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-d6ac7f086c19a59f1b17--99) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/manifest.json'
```

| FAIL | 真实默认ASR与原生原声：非零视频起点仅此项手工降级，原工程仍可保存 | [about:blank](about:blank) | [查看原图](screenshots/t1062-group-native-rough--T1062-账号组真实原生粗剪-真实默认ASR与原生原声-非零视频起点仅此项手工降级-原工程仍可保存--cf662ccde952ddbe384aa4328cf71a5eb41a95fed49b091ab968b3c1c631822c.png) | `a8c4891f095c8a8e2a8e-6dc193773c32133c3858` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-6dc193773c32133c3858--100) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/manifest.json'
```

| PASS | 真实首载组列表延迟时不发创建，根就绪后文章可创建保存刷新 | [http://127.0.0.1:3887/projects/project-a65785f2-3667/article?outputId=output-a65785f2-3684](http://127.0.0.1:3887/projects/project-a65785f2-3667/article?outputId=output-a65785f2-3684) | [查看原图](screenshots/t1062-group-native-rough--真实首载组列表延迟时不发创建-根就绪后文章可创建保存刷新--b81bbd819a32ed87f8bc6a25b8c7ad36b4386fd8d750a8bb7b6fe1bedbdb3ecd.png) | `a8c4891f095c8a8e2a8e-27798052ec77527dde65` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-27798052ec77527dde65--101) |
| PASS | 真实首次RSC同步中手动切B：旧A完成不能放行，B就绪才可创建保存刷新 | [http://127.0.0.1:3887/projects/project-a65785f2-3716/article?outputId=output-a65785f2-3737](http://127.0.0.1:3887/projects/project-a65785f2-3716/article?outputId=output-a65785f2-3737) | [查看原图](screenshots/t1062-group-native-rough--真实首次RSC同步中手动切B-旧A完成不能放行-B就绪才可创建保存刷新--53e2793e1764cbc93aebf53f0fa081267450772406974147194039b808076e54.png) | `a8c4891f095c8a8e2a8e-3a798597e406b074f466` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-3a798597e406b074f466--102) |
| FAIL | 真实首载RSC一直未交付：有界超时后显式整页重试，同B根可创建保存回读 | [http://127.0.0.1:3887/projects](http://127.0.0.1:3887/projects) | [查看原图](screenshots/t1062-group-native-rough--真实首载RSC一直未交付-有界超时后显式整页重试-同B根可创建保存回读--617178d5263b32e48635c705dcab578e16dea7f7f2a3492d9a1e03e801a550b1.png) | `a8c4891f095c8a8e2a8e-e6085f74588844d59da3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1062-group-native-rough.spec.ts--a8c4891f095c8a8e2a8e-e6085f74588844d59da3--103) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByTestId('workspace-initialization-error')
Expected substring: [32m"工作区页面打开超时，请重试。"[39m
Timeout: 20000ms
Error: element(s) not found

Call log:
[2m  - Expect "toContainText" with timeout 20000ms[22m
[2m  - waiting for getByTestId('workspace-initialization-error')[22m

```


## frontend/tests/e2e/t1069-asset-picker.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 公共全库分页与模板照片选择：后页可见、搜索和取消保留精确照片 | [http://127.0.0.1:3887/](http://127.0.0.1:3887/) | [查看原图](screenshots/t1069-asset-picker--公共全库分页与模板照片选择-后页可见-搜索和取消保留精确照片--66bd6c3d1bb661763bbd2f92b3cffe30610812a6cccb05470a658cf7925fbf6e.png) | `a844202c27c9dc804afd-b543d2def1d2dfcba95f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1069-asset-picker.spec.ts--a844202c27c9dc804afd-b543d2def1d2dfcba95f--104) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```


## frontend/tests/e2e/t1069-media-tab-session.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | 本地视频逐个导入、未保存切Tab返回、保存刷新保留原素材和工程 | [about:blank](about:blank) | [查看原图](screenshots/history-before-20261011-next-journeys/t1069-media-tab-session/t1069-original-fixture-failure.png) | `bec6dd24d6704d74c8bc-c95c18a2c57a62b37b3a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1069-media-tab-session.spec.ts--bec6dd24d6704d74c8bc-c95c18a2c57a62b37b3a--105) |

失败证据：

```text
Error: ENOENT: no such file or directory, open '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp/neutral-original-speed.mp4'
```

| PASS | 本地视频逐个导入、未保存切Tab返回、保存刷新保留原素材和工程 | [http://127.0.0.1:3893/projects/project-d425ef9d-10/production?outputId=output-d425ef9d-21](http://127.0.0.1:3893/projects/project-d425ef9d-10/production?outputId=output-d425ef9d-21) | [查看原图](screenshots/history-before-20261011-next-journeys/t1069-media-tab-session/t1069-media-tab-session--本地视频逐个导入-未保存切Tab返回-保存刷新保留原素材和工程--837b6fb71ff3834d647fafe0f06f068a9697afd57b6672c34f28d5ac15865f17.png) | `bec6dd24d6704d74c8bc-c95c18a2c57a62b37b3a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1069-media-tab-session.spec.ts--bec6dd24d6704d74c8bc-c95c18a2c57a62b37b3a--276) |
| PASS | 本地视频逐个导入、未保存切Tab返回、保存刷新保留原素材和工程 | [http://127.0.0.1:3911/projects/project-acaa509e-135/production?outputId=output-acaa509e-147](http://127.0.0.1:3911/projects/project-acaa509e-135/production?outputId=output-acaa509e-147) | [查看原图](screenshots/t1069-media-tab-session--本地视频逐个导入-未保存切Tab返回-保存刷新保留原素材和工程--837b6fb71ff3834d647fafe0f06f068a9697afd57b6672c34f28d5ac15865f17.png) | `bec6dd24d6704d74c8bc-c95c18a2c57a62b37b3a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1069-media-tab-session.spec.ts--bec6dd24d6704d74c8bc-c95c18a2c57a62b37b3a--341) |

## frontend/tests/e2e/t1070-director-editor.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 真实文章保存、指定版本刷新、同项目编导窄屏打开、NoteRelay HTML交付 | [http://127.0.0.1:3887/projects/project-a65785f2-3808/article?outputId=output-a65785f2-3820](http://127.0.0.1:3887/projects/project-a65785f2-3808/article?outputId=output-a65785f2-3820) | [查看原图](screenshots/history-before-20261011-next-journeys/t1070-director-editor/t1070-director-editor--真实文章保存-指定版本刷新-同项目编导窄屏打开-NoteRelay-HTML交付--c3cec85ec6a9d8bc65fe2355499f4dc4323150dc50591388d024f9275d0181fb.png) | `e350765340916b502f9a-1807c0969f844b2c0026` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1070-director-editor.spec.ts--e350765340916b502f9a-1807c0969f844b2c0026--106) |
| PASS | 真实图文三卡保存刷新，NoteRelay翻页与ZIP可用，旧图片入口与历史保留 | [http://127.0.0.1:3887/projects/project-a65785f2-3863/outputs/output-a65785f2-3874/image](http://127.0.0.1:3887/projects/project-a65785f2-3863/outputs/output-a65785f2-3874/image) | [查看原图](screenshots/history-before-20261011-next-journeys/t1070-director-editor/t1070-director-editor--真实图文三卡保存刷新-NoteRelay翻页与ZIP可用-旧图片入口与历史保留--0e4d38097b70cc8fee2b2e16c3ecbf71767d6e482195cc145e76fd5ee722fa85.png) | `e350765340916b502f9a-3a87c779b994624d42ef` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1070-director-editor.spec.ts--e350765340916b502f9a-3a87c779b994624d42ef--107) |
| PASS | 真实文章保存、指定版本刷新、同项目编导窄屏打开、NoteRelay HTML交付 | [http://127.0.0.1:3911/projects/project-acaa509e-220/article?outputId=output-acaa509e-232](http://127.0.0.1:3911/projects/project-acaa509e-220/article?outputId=output-acaa509e-232) | [查看原图](screenshots/t1070-director-editor--真实文章保存-指定版本刷新-同项目编导窄屏打开-NoteRelay-HTML交付--c3cec85ec6a9d8bc65fe2355499f4dc4323150dc50591388d024f9275d0181fb.png) | `e350765340916b502f9a-1807c0969f844b2c0026` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1070-director-editor.spec.ts--e350765340916b502f9a-1807c0969f844b2c0026--342) |
| PASS | 真实图文三卡保存刷新，NoteRelay翻页与ZIP可用，旧图片入口与历史保留 | [http://127.0.0.1:3911/projects/project-acaa509e-268/outputs/output-acaa509e-280/image](http://127.0.0.1:3911/projects/project-acaa509e-268/outputs/output-acaa509e-280/image) | [查看原图](screenshots/t1070-director-editor--真实图文三卡保存刷新-NoteRelay翻页与ZIP可用-旧图片入口与历史保留--0e4d38097b70cc8fee2b2e16c3ecbf71767d6e482195cc145e76fd5ee722fa85.png) | `e350765340916b502f9a-3a87c779b994624d42ef` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1070-director-editor.spec.ts--e350765340916b502f9a-3a87c779b994624d42ef--343) |

## frontend/tests/e2e/t1136-calendar-dialog-layout.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | T-1136 当前真实排期长名称的四种窗口尺寸 | [http://127.0.0.1:3887/publishing](http://127.0.0.1:3887/publishing) | [查看原图](screenshots/t1136-calendar-dialog-layout--T-1136-当前真实排期长名称的四种窗口尺寸--5c635acd663fe957652a0e9452cfab415c39e185d687f712f2b21f61d9da9178.png) | `0789b69f45c48df93765-8d46cbb69cfde0e39461` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1136-calendar-dialog-layout.spec.ts--0789b69f45c48df93765-8d46cbb69cfde0e39461--108) |
| PASS | T-1136 真实保存回读重开、目标转组重选与失败保留输入 | [http://127.0.0.1:3887/publishing](http://127.0.0.1:3887/publishing) | [查看原图](screenshots/t1136-calendar-dialog-layout--T-1136-真实保存回读重开-目标转组重选与失败保留输入--531b2c4c6e271c3ddd88a0d2ac73f90039edd82c40903ae66e685443be2e52e6.png) | `0789b69f45c48df93765-a0869a92237df750e6ab` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1136-calendar-dialog-layout.spec.ts--0789b69f45c48df93765-a0869a92237df750e6ab--109) |
| PASS | T-1136 读取中及共享反馈、参考素材弹窗仍可操作 | [http://127.0.0.1:3887/canvases/a64f6039-4dc8-4cc0-a3c1-2b0f4bd6fa86](http://127.0.0.1:3887/canvases/a64f6039-4dc8-4cc0-a3c1-2b0f4bd6fa86) | [查看原图](screenshots/t1136-calendar-dialog-layout--T-1136-读取中及共享反馈-参考素材弹窗仍可操作--67638a906124417d333ced5b81a53d8b32926c3c4a35d0cbba260208425bd44d.png) | `0789b69f45c48df93765-1fb2a504b47adb6bf2f1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1136-calendar-dialog-layout.spec.ts--0789b69f45c48df93765-1fb2a504b47adb6bf2f1--110) |

## frontend/tests/e2e/t1149-cover-aspect-group.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | T1149 共同支持画幅同步、正式保存、刷新返回及重复修改 | [http://127.0.0.1:3887/canvases/395e9542-8b03-4227-89e3-af34be8a8a06](http://127.0.0.1:3887/canvases/395e9542-8b03-4227-89e3-af34be8a8a06) | [查看原图](screenshots/t1149-cover-aspect-group--T1149-共同支持画幅同步-正式保存-刷新返回及重复修改--c3c1c42c3229c93893bba55721b07856eb545947cbc2bc02d5aaa853a68a6803.png) | `2488b20c9ad12e397088-d4ef0804d3ce6c7f23d2` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1149-cover-aspect-group.spec.ts--2488b20c9ad12e397088-d4ef0804d3ce6c7f23d2--111) |
| PASS | T1149 能力禁用、两个模式入口保引用与保存失败后公开重试 | [http://127.0.0.1:3887/canvases/ee258750-20ad-4904-8e2b-c457fefa9e4d](http://127.0.0.1:3887/canvases/ee258750-20ad-4904-8e2b-c457fefa9e4d) | [查看原图](screenshots/t1149-cover-aspect-group--T1149-能力禁用-两个模式入口保引用与保存失败后公开重试--fb0d41aaed396aec86e6fd50c105b2a3ec872c928c8ae79b2a483a32a1f89768.png) | `2488b20c9ad12e397088-fa21bc99a682f802086d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1149-cover-aspect-group.spec.ts--2488b20c9ad12e397088-fa21bc99a682f802086d--112) |

## frontend/tests/e2e/t1159-wechat-native-report.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | T1159 两微信账号从组成员进入真实0报告，刷新返回与身份拒绝 | [http://127.0.0.1:3887/accounts/works?accountId=acct-a65785f2-4266](http://127.0.0.1:3887/accounts/works?accountId=acct-a65785f2-4266) | [查看原图](screenshots/rechecks/t1159-first-run-connection-reset.png) | `10645feaadfc4eb9725d-37a520db61507269907f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1159-wechat-native-report.spec.ts--10645feaadfc4eb9725d-37a520db61507269907f--113) |

失败证据：

```text
Error: apiRequestContext.post: read ECONNRESET
Call log:
[2m  - → POST http://127.0.0.1:3887/api/v1/dispatch[22m
[2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/148.0.7778.96 Safari/537.36[22m
[2m    - accept: */*[22m
[2m    - accept-encoding: gzip,deflate,br[22m
[2m    - content-type: application/json[22m
[2m    - x-group-id: grp-a65785f2-4262[22m
[2m    - x-account-id: acct-a65785f2-4266[22m
[2m    - content-length: 123[22m
[2m    - cookie: creatoros_current_group=grp-a65785f2-4262[22m

```

| PASS | T1159 两微信账号从组成员进入真实0报告，刷新返回与身份拒绝 | [http://127.0.0.1:3898/accounts/works?accountId=acct-9afc2a54-13](http://127.0.0.1:3898/accounts/works?accountId=acct-9afc2a54-13) | [查看原图](screenshots/t1159-wechat-native-report--T1159-两微信账号从组成员进入真实0报告-刷新返回与身份拒绝--375c1f8cbc6b7a98e9047cbe1bf7f454e6f1ea7d2eca48f6bd996b99798b4258.png) | `10645feaadfc4eb9725d-37a520db61507269907f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1159-wechat-native-report.spec.ts--10645feaadfc4eb9725d-37a520db61507269907f--314) |

## frontend/tests/e2e/t954-director-review.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | T954 无发布数据的真实复盘页面可用，补采返回空结果，诊断入口不强制成功经验 | [http://127.0.0.1:3887/projects/project-a65785f2-4302/review](http://127.0.0.1:3887/projects/project-a65785f2-4302/review) | [查看原图](screenshots/rechecks/t954-original-suite-no-group.png) | `6eea6190f7b2a3d02786-4f1facc9b1626026cf85` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft954-director-review.spec.ts--6eea6190f7b2a3d02786-4f1facc9b1626026cf85--114) |

失败证据：

```text
Error: {"error":{"code":"AccountRequiredError","message":"AccountRequiredError: 平台采集作业 requires a selected account (ctx.accountId missing)","details":{}},"meta":{"requestId":"dispatch"}}

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

| FAIL | T954 无发布数据的真实复盘页面可用，补采返回空结果，诊断入口不强制成功经验 | [http://127.0.0.1:3894/projects/project-7adcb7c8-9/review](http://127.0.0.1:3894/projects/project-7adcb7c8-9/review) | [查看原图](screenshots/rechecks/t954-recheck-no-group.png) | `6eea6190f7b2a3d02786-4f1facc9b1626026cf85` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft954-director-review.spec.ts--6eea6190f7b2a3d02786-4f1facc9b1626026cf85--277) |

失败证据：

```text
Error: {"error":{"code":"AccountRequiredError","message":"AccountRequiredError: 平台采集作业 requires a selected account (ctx.accountId missing)","details":{}},"meta":{"requestId":"dispatch"}}

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

| FAIL | T954 无发布数据的真实复盘页面可用，补采返回空结果，诊断入口不强制成功经验 | [http://127.0.0.1:3895/projects/project-ba5fc099-11/review](http://127.0.0.1:3895/projects/project-ba5fc099-11/review) | [查看原图](screenshots/rechecks/t954-narrow-viewport-assertion.png) | `6eea6190f7b2a3d02786-4f1facc9b1626026cf85` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft954-director-review.spec.ts--6eea6190f7b2a3d02786-4f1facc9b1626026cf85--278) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByRole('region', { name: '流量来源' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for getByRole('region', { name: '流量来源' })[22m

```

| PASS | T954 无发布数据的真实复盘页面可用，补采返回空结果，诊断入口不强制成功经验 | [http://127.0.0.1:3896/projects/project-35f8d9cf-11/review](http://127.0.0.1:3896/projects/project-35f8d9cf-11/review) | [查看原图](screenshots/t954-director-review--T954-无发布数据的真实复盘页面可用-补采返回空结果-诊断入口不强制成功经验--0b7857560cbb6c9026f2d0fb761bd2b27daf56301e80f97871c19df9cd0952c9.png) | `6eea6190f7b2a3d02786-4f1facc9b1626026cf85` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft954-director-review.spec.ts--6eea6190f7b2a3d02786-4f1facc9b1626026cf85--279) |

## frontend/tests/e2e/web-material-read-save.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 搜索线索只能阅读全文，成功后才允许按稳定素材保存到当前项目 | [http://127.0.0.1:3887/?copilot=open&surface=project&selKind=project&selId=project-a65785f2-4330&selTitle=%E8%81%94%E7%BD%91%E7%B4%A0%E6%9D%90%E9%98%85%E8%AF%BB%E9%AA%8C%E6%94%B6](http://127.0.0.1:3887/?copilot=open&surface=project&selKind=project&selId=project-a65785f2-4330&selTitle=%E8%81%94%E7%BD%91%E7%B4%A0%E6%9D%90%E9%98%85%E8%AF%BB%E9%AA%8C%E6%94%B6) | [查看原图](screenshots/web-material-read-save--联网素材先阅读后保存-搜索线索只能阅读全文-成功后才允许按稳定素材保存到当前项目--640aa2f9223993acdcd8f883e190c92bd263dd95ceb0737c5691d8ca23f9c202.png) | `7f0461e286892a25ab19-99f23174ab217f753f6a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fweb-material-read-save.spec.ts--7f0461e286892a25ab19-99f23174ab217f753f6a--115) |

## frontend/tests/e2e/wechat-article-workbench.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 公众号文章从项目目标到手写版本、刷新回读和跨账号隔离 | [http://127.0.0.1:3887/projects/project-a65785f2-4367/article?outputId=output-a65785f2-4386](http://127.0.0.1:3887/projects/project-a65785f2-4367/article?outputId=output-a65785f2-4386) | [查看原图](screenshots/wechat-article-workbench--公众号文章从项目目标到手写版本-刷新回读和跨账号隔离--a8033e22d3ff501308bf2a0228e267b9e1a3ab967e14b71a364dd4a411a4da75.png) | `bf4a1cd0b0748cf23b48-ba8301bc8ce865d8fb04` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fwechat-article-workbench.spec.ts--bf4a1cd0b0748cf23b48-ba8301bc8ce865d8fb04--116) |
| TIMEOUT | 公众号文章经独立模型 Worker 生成候选，用户审读采纳后刷新回读 | [http://127.0.0.1:3887/projects/project-a65785f2-4452/article?outputId=output-a65785f2-4472](http://127.0.0.1:3887/projects/project-a65785f2-4452/article?outputId=output-a65785f2-4472) | [查看原图](screenshots/wechat-article-workbench--公众号文章经独立模型-Worker-生成候选-用户审读采纳后刷新回读--5071a38795708d96a9728721d253a9b5c6d72e99af17bf497ca05d1fff4e1ca3.png) | `bf4a1cd0b0748cf23b48-209b5f7d65fc4e79a89e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fwechat-article-workbench.spec.ts--bf4a1cd0b0748cf23b48-209b5f7d65fc4e79a89e--117) |

失败证据：

```text
[31mTest timeout of 120000ms exceeded.[39m
```


## frontend/tests/e2e/zz-account-isolation.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| TIMEOUT | A 号只见 A 的项目;切到 B 号后只见 B 的(无残影) | [http://127.0.0.1:3887/projects](http://127.0.0.1:3887/projects) | [查看原图](screenshots/history-before-20261011-t1221/zz-account-isolation/zz-account-isolation--双号切换端到端隔离-T-332-S6-A-号只见-A-的项目-切到-B-号后只见-B-的-无残影--ae61bc4fed138d725521281afbb0ceba25e78fddd7e92856232de6c641d5e03f.png) | `c30d334f01c06de6caf2-2d95b5b12af54537ace8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fzz-account-isolation.spec.ts--c30d334f01c06de6caf2-2d95b5b12af54537ace8--118) |

失败证据：

```text
[31mTest timeout of 30000ms exceeded.[39m
```

| FAIL | A 号只见 A 的项目;切到 B 号后只见 B 的(无残影) | [http://127.0.0.1:3912/projects](http://127.0.0.1:3912/projects) | [查看原图](../t1221/3912-fail-stable-screenshot.png) | `c30d334f01c06de6caf2-2d95b5b12af54537ace8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fzz-account-isolation.spec.ts--c30d334f01c06de6caf2-2d95b5b12af54537ace8--344) |

失败证据：

```text
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoMatchObject[2m([22m[32mexpected[39m[2m)[22m

[32m- Expected  - 1[39m
[31m+ Received  + 0[39m

[2m  Object {[22m
[32m-   "groupId": "grp_legacy_acct-7563e81c-6",[39m
[2m    "id": "project-7563e81c-12",[22m
[2m    "title": "E2E隔离甲号项目",[22m
[2m  }[22m
```

| PASS | A 号只见 A 的项目;切到 B 号后只见 B 的(无残影) | [http://127.0.0.1:3913/projects](http://127.0.0.1:3913/projects) | [查看原图](screenshots/zz-account-isolation--双号切换端到端隔离-T-332-S6-A-号只见-A-的项目-切到-B-号后只见-B-的-无残影--ae61bc4fed138d725521281afbb0ceba25e78fddd7e92856232de6c641d5e03f.png) | `c30d334f01c06de6caf2-2d95b5b12af54537ace8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Fzz-account-isolation.spec.ts--c30d334f01c06de6caf2-2d95b5b12af54537ace8--345) |

## frontend/tests/e2e/t1140-picker-low-height.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | T-1140 六种窗口完整预览、统一滚动、搜索与取消不写 | [http://127.0.0.1:3887/canvases/524d9ecf-cdb0-4e32-828c-4d31881b0c46](http://127.0.0.1:3887/canvases/524d9ecf-cdb0-4e32-828c-4d31881b0c46) | [查看原图](screenshots/t1140-picker-low-height--T-1140-六种窗口完整预览-统一滚动-搜索与取消不写--7135d4aaeced2b1be1a186c198c16f7599daa79b06bf6cc5c21359543d23d883.png) | `4d465cd2e835f006a450-34c54146f98a25d12b23` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1140-picker-low-height.spec.ts--4d465cd2e835f006a450-34c54146f98a25d12b23--119) |
| PASS | T-1140 精确选用、正式回读、刷新返回与原gallery流程 | [http://127.0.0.1:3887/canvases/ca7a391b-f845-4b34-9e71-41bbfa3cd84f](http://127.0.0.1:3887/canvases/ca7a391b-f845-4b34-9e71-41bbfa3cd84f) | [查看原图](screenshots/t1140-picker-low-height--T-1140-精确选用-正式回读-刷新返回与原gallery流程--5f867a76d0d5fd0d076d67d88d5ea18338f470bb17baba98297a567c8e7770cc.png) | `4d465cd2e835f006a450-21ae226b8aa891abca06` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1140-picker-low-height.spec.ts--4d465cd2e835f006a450-21ae226b8aa891abca06--120) |

## frontend/tests/e2e/t1207-supplemental-route-matrix.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 侧栏入口「首页」/ 显示真实主内容 | [http://127.0.0.1:3888/](http://127.0.0.1:3888/) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-首页-显示真实主内容--69be9395b71e37327a916accccc33c052512465c58211d133cd14d7c07101802.png) | `004934eeae7d0ea4287b-f1470f5b0d9b347b5b79` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f1470f5b0d9b347b5b79--121) |
| PASS | 侧栏入口「创作者总览」/overview 显示真实主内容 | [http://127.0.0.1:3888/overview](http://127.0.0.1:3888/overview) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作者总览-overview-显示真实主内容--c53bba432c8328d46eff3737057bf5471a443913c7ad79cd01eae41959f8c6cb.png) | `004934eeae7d0ea4287b-687be6bffc0f4477ae55` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-687be6bffc0f4477ae55--122) |
| FAIL | 侧栏入口「定位中心」/positioning 显示真实主内容 | [http://127.0.0.1:3888/positioning](http://127.0.0.1:3888/positioning) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-定位中心-positioning-显示真实主内容--d92fbfb232953628d7af3dd737252ff247b126410bbb035c704382a1c288cc21.png) | `004934eeae7d0ea4287b-3fc60d737042980b2942` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3fc60d737042980b2942--123) |

失败证据：

```text
Error: /positioning 主内容应可见

[2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('main').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - /positioning 主内容应可见 with timeout 5000ms[22m
[2m  - waiting for locator('main').first()[22m

```

| PASS | 侧栏入口「内容雷达」/intelligence 显示真实主内容 | [http://127.0.0.1:3888/intelligence](http://127.0.0.1:3888/intelligence) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-内容雷达-intelligence-显示真实主内容--22b68b5d27e74e0baa5ad8d5b62baec4a94466c648255ba90bdb7ccc9a797671.png) | `004934eeae7d0ea4287b-531d725bd3960b33aade` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-531d725bd3960b33aade--124) |
| FAIL | 侧栏入口「选题」/topics 显示真实主内容 | [http://127.0.0.1:3888/topics](http://127.0.0.1:3888/topics) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-选题-topics-显示真实主内容--e02514ff4b140d00a04f633fde9063f354b9bd06c0d6590b549551a339a1a157.png) | `004934eeae7d0ea4287b-690d27b4028991544aa4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-690d27b4028991544aa4--125) |

失败证据：

```text
Error: /topics 主内容应可见

[2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('main').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - /topics 主内容应可见 with timeout 5000ms[22m
[2m  - waiting for locator('main').first()[22m

```

| PASS | 侧栏入口「项目」/projects 显示真实主内容 | [http://127.0.0.1:3888/projects](http://127.0.0.1:3888/projects) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-项目-projects-显示真实主内容--442b5cce42bb2d238c226bd42d363fcb0675629927a7a766ae65d6b042f8520f.png) | `004934eeae7d0ea4287b-e683780a124832f9601f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e683780a124832f9601f--126) |
| PASS | 侧栏入口「知识库」/knowledge 显示真实主内容 | [http://127.0.0.1:3888/knowledge](http://127.0.0.1:3888/knowledge) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-知识库-knowledge-显示真实主内容--4ba458706d91e9a3e0c0d4553706bca43a03ba246abfa918f0b0d46d8b106105.png) | `004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d--127) |
| PASS | 侧栏入口「素材中心」/assets 显示真实主内容 | [http://127.0.0.1:3888/assets](http://127.0.0.1:3888/assets) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-素材中心-assets-显示真实主内容--f82146264d830c58d54987ff4f00bc529adc1d008662aadc9b0786096d914fb5.png) | `004934eeae7d0ea4287b-87e06a567997de69a4d1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-87e06a567997de69a4d1--128) |
| PASS | 侧栏入口「创作画布」/canvases 显示真实主内容 | [http://127.0.0.1:3888/canvases](http://127.0.0.1:3888/canvases) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作画布-canvases-显示真实主内容--286822878192f31a85c652705736b6dc4b58c8a706a79b1c6016091d7f70cd14.png) | `004934eeae7d0ea4287b-c42decb86b0f8bfd755d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-c42decb86b0f8bfd755d--129) |
| PASS | 侧栏入口「发布中心」/publishing 显示真实主内容 | [http://127.0.0.1:3888/publishing](http://127.0.0.1:3888/publishing) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-发布中心-publishing-显示真实主内容--5c3ddac4a603b6cf1aeaa50de5f47af4bc2ce18076d0ee565b56a44cb3827363.png) | `004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8--130) |
| PASS | 侧栏入口「运营分析」/daily-report 显示真实主内容 | [http://127.0.0.1:3888/daily-report](http://127.0.0.1:3888/daily-report) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-运营分析-daily-report-显示真实主内容--b4a54372d5165add1b533440f6d66de43fb37ecf172414eae1468698e4f4ead2.png) | `004934eeae7d0ea4287b-3ad7b42d606113be7e08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3ad7b42d606113be7e08--131) |
| PASS | 侧栏入口「自动化」/automations 显示真实主内容 | [http://127.0.0.1:3888/automations](http://127.0.0.1:3888/automations) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-自动化-automations-显示真实主内容--684aade25652ea65587dea369648be21ca31a0feb9aa898710546b992497d1a6.png) | `004934eeae7d0ea4287b-3a6ed74bb12244425a68` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3a6ed74bb12244425a68--132) |
| FAIL | 侧栏入口「设置」/settings 显示真实主内容 | [http://127.0.0.1:3888/settings](http://127.0.0.1:3888/settings) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-设置-settings-显示真实主内容--290ab6e314592bc5e17f9342c6800af1b5cbb6b64a36e8b1cb6c84d751e7cfb9.png) | `004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a--133) |

失败证据：

```text
Error: /settings 主内容应可见

[2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator:  locator('main').first()
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
[2m  - /settings 主内容应可见 with timeout 5000ms[22m
[2m  - waiting for locator('main').first()[22m
[2m    13 × locator resolved to <main data-app="creatoros" data-page="settings" data-settings-id="settings-root" class="flex flex-col gap-section-gap"></main>[22m
[2m       - unexpected value "hidden"[22m

```

| PASS | 账号管理页可以打开 | [http://127.0.0.1:3888/accounts](http://127.0.0.1:3888/accounts) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-账号管理页可以打开--464d3d9d3b89471348700f01f7bffcc80ea769d30d5901ec758470781b974b58.png) | `004934eeae7d0ea4287b-1b011beb30842b02f9bf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-1b011beb30842b02f9bf--134) |
| PASS | 当前账号的作品目录页可以打开 | [http://127.0.0.1:3888/accounts/works?accountId=acct-f5f20467-186](http://127.0.0.1:3888/accounts/works?accountId=acct-f5f20467-186) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-当前账号的作品目录页可以打开--aa623745df6c5c8b55c37b0b18b5f3a661ff867c6a645678e5f5b753bf7c3a73.png) | `004934eeae7d0ea4287b-8914979c80f32118fbd9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8914979c80f32118fbd9--135) |
| PASS | 发布中心日历子页可以打开 | [http://127.0.0.1:3888/publishing](http://127.0.0.1:3888/publishing) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-发布中心日历子页可以打开--c49eb18c5b626a51285fab2eb810d4cc77fb5716b4bae7a7ae22b37fd5ba810a.png) | `004934eeae7d0ea4287b-72f55b8042d75cf6cfb4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-72f55b8042d75cf6cfb4--136) |
| PASS | 项目「主稿面」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189](http://127.0.0.1:3888/projects/project-f5f20467-189) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-主稿面-路由显示真实内容或有效重定向--35feac8f88cea0326ab68185d7458899d99dd5394296bad5460bc2df2f546573.png) | `004934eeae7d0ea4287b-5817fd6024763db7d32f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-5817fd6024763db7d32f--137) |
| PASS | 项目「选题兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189#topic](http://127.0.0.1:3888/projects/project-f5f20467-189#topic) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-选题兼容入口-路由显示真实内容或有效重定向--6301d935e4815d93741754dd52e2ff0390c97072edf98609c1e7bae112220d94.png) | `004934eeae7d0ea4287b-a3e9de20528fbbd8b790` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a3e9de20528fbbd8b790--138) |
| PASS | 项目「计划兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189#topic](http://127.0.0.1:3888/projects/project-f5f20467-189#topic) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-计划兼容入口-路由显示真实内容或有效重定向--71e411b986c49755781f908932dd9e8f014af7d785663925cfca0fcd0f8e745d.png) | `004934eeae7d0ea4287b-8e6a3f963f11b86d97ad` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8e6a3f963f11b86d97ad--139) |
| PASS | 项目「脚本兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189#script](http://127.0.0.1:3888/projects/project-f5f20467-189#script) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-脚本兼容入口-路由显示真实内容或有效重定向--ae1d56b75019186ec4c572dfd8aefbd369c0a2430130ef2a7cb96b9d839ee604.png) | `004934eeae7d0ea4287b-855240d3a89c97574275` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-855240d3a89c97574275--140) |
| PASS | 项目「发布兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189#publish](http://127.0.0.1:3888/projects/project-f5f20467-189#publish) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-发布兼容入口-路由显示真实内容或有效重定向--2469ad1100c23cb2d9a353134e9481521171ad2a36bfaeb482c465d693c5c00d.png) | `004934eeae7d0ea4287b-4fa2aca38e46f3883838` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-4fa2aca38e46f3883838--141) |
| PASS | 项目「复盘页」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189/review](http://127.0.0.1:3888/projects/project-f5f20467-189/review) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-复盘页-路由显示真实内容或有效重定向--3ac29d68563c1998a81e26f24ec781f92fa077529670693f4f04dd31fc7410c7.png) | `004934eeae7d0ea4287b-ef3a0af1a8175dfc224b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ef3a0af1a8175dfc224b--142) |
| PASS | 项目「组合创作工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189/work](http://127.0.0.1:3888/projects/project-f5f20467-189/work) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-组合创作工作台-路由显示真实内容或有效重定向--9709f7d34241aca3c5fa2b41dcfdd922d3249991fab173b90be4acba0f8e685b.png) | `004934eeae7d0ea4287b-f7088906b3f7ed12beee` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f7088906b3f7ed12beee--143) |
| FAIL | 项目「视频剪辑工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3888/projects/project-f5f20467-189/production?outputId=output-f5f20467-218](http://127.0.0.1:3888/projects/project-f5f20467-189/production?outputId=output-f5f20467-218) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-视频剪辑工作台-路由显示真实内容或有效重定向--d35866d8dd1d661f6e1f446f8f6f55b8d0ac7b38f53ef7af8a4a4910f297a4f4.png) | `004934eeae7d0ea4287b-54a04dba81ddb46ea7f4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-54a04dba81ddb46ea7f4--144) |

失败证据：

```text
Error: /projects/project-f5f20467-189/production?outputId=output-f5f20467-218 主内容应可见

[2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('main').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - /projects/project-f5f20467-189/production?outputId=output-f5f20467-218 主内容应可见 with timeout 5000ms[22m
[2m  - waiting for locator('main').first()[22m

```

| PASS | 文章工作台读取真实隔离文章作品 | [http://127.0.0.1:3888/projects/project-f5f20467-306/article?outputId=output-f5f20467-317](http://127.0.0.1:3888/projects/project-f5f20467-306/article?outputId=output-f5f20467-317) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-文章工作台读取真实隔离文章作品--c8dd2dbb90fa682017a127b593f246bd08a22fc40798dfc57b9e7640b6be9702.png) | `004934eeae7d0ea4287b-d50f4826421787e95c08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-d50f4826421787e95c08--145) |
| PASS | 图文工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3888/projects/project-f5f20467-306/outputs/output-f5f20467-326/image](http://127.0.0.1:3888/projects/project-f5f20467-306/outputs/output-f5f20467-326/image) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文工作台按真实隔离作品-ID-打开--abf1e8dd4d3e8df58e6b311bf095918e1be9c83f721a4599571eaf2af159b858.png) | `004934eeae7d0ea4287b-a858671eb52484737af8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a858671eb52484737af8--146) |
| PASS | 图文深链按真实隔离作品 ID 打开 | [http://127.0.0.1:3888/projects/project-f5f20467-306/outputs/output-f5f20467-326/image](http://127.0.0.1:3888/projects/project-f5f20467-306/outputs/output-f5f20467-326/image) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文深链按真实隔离作品-ID-打开--913a7aca6212c7fec235c469722c4532b55da9aae0147f1ab6a626e27c76db98.png) | `004934eeae7d0ea4287b-ca1938cd81655d82de81` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ca1938cd81655d82de81--147) |
| PASS | 视频工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3888/projects/project-f5f20467-306/outputs/output-f5f20467-335/video](http://127.0.0.1:3888/projects/project-f5f20467-306/outputs/output-f5f20467-335/video) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-视频工作台按真实隔离作品-ID-打开--34f146b58bd5c0edb0341d96c3ee53ba30d398f4b326557505ac3ee9c2a9ed85.png) | `004934eeae7d0ea4287b-a41b8bde1f8353957ac3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a41b8bde1f8353957ac3--148) |
| PASS | 项目画布详情按真实隔离画布 ID 打开 | [http://127.0.0.1:3888/canvases/ae2b4618-0e33-40ae-b2ac-998ee9ea8ce5](http://127.0.0.1:3888/canvases/ae2b4618-0e33-40ae-b2ac-998ee9ea8ce5) | [查看原图](screenshots/route-matrix-initial/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目画布详情按真实隔离画布-ID-打开--7975aa336e3d72dd03daed9186663b8fdec739d24d80328101f67c1e37e69754.png) | `004934eeae7d0ea4287b-e51b77fa0bf635ea2626` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e51b77fa0bf635ea2626--149) |
| PASS | 侧栏入口「首页」/ 显示真实主内容 | [http://127.0.0.1:3889/](http://127.0.0.1:3889/) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-首页-显示真实主内容--69be9395b71e37327a916accccc33c052512465c58211d133cd14d7c07101802.png) | `004934eeae7d0ea4287b-f1470f5b0d9b347b5b79` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f1470f5b0d9b347b5b79--150) |
| PASS | 侧栏入口「创作者总览」/overview 显示真实主内容 | [http://127.0.0.1:3889/overview](http://127.0.0.1:3889/overview) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作者总览-overview-显示真实主内容--c53bba432c8328d46eff3737057bf5471a443913c7ad79cd01eae41959f8c6cb.png) | `004934eeae7d0ea4287b-687be6bffc0f4477ae55` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-687be6bffc0f4477ae55--151) |
| PASS | 侧栏入口「定位中心」/positioning 显示真实主内容 | [http://127.0.0.1:3889/positioning](http://127.0.0.1:3889/positioning) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-定位中心-positioning-显示真实主内容--d92fbfb232953628d7af3dd737252ff247b126410bbb035c704382a1c288cc21.png) | `004934eeae7d0ea4287b-3fc60d737042980b2942` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3fc60d737042980b2942--152) |
| PASS | 侧栏入口「内容雷达」/intelligence 显示真实主内容 | [http://127.0.0.1:3889/intelligence](http://127.0.0.1:3889/intelligence) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-内容雷达-intelligence-显示真实主内容--22b68b5d27e74e0baa5ad8d5b62baec4a94466c648255ba90bdb7ccc9a797671.png) | `004934eeae7d0ea4287b-531d725bd3960b33aade` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-531d725bd3960b33aade--153) |
| PASS | 侧栏入口「选题」/topics 显示真实主内容 | [http://127.0.0.1:3889/topics](http://127.0.0.1:3889/topics) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-选题-topics-显示真实主内容--e02514ff4b140d00a04f633fde9063f354b9bd06c0d6590b549551a339a1a157.png) | `004934eeae7d0ea4287b-690d27b4028991544aa4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-690d27b4028991544aa4--154) |
| PASS | 侧栏入口「项目」/projects 显示真实主内容 | [http://127.0.0.1:3889/projects](http://127.0.0.1:3889/projects) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-项目-projects-显示真实主内容--442b5cce42bb2d238c226bd42d363fcb0675629927a7a766ae65d6b042f8520f.png) | `004934eeae7d0ea4287b-e683780a124832f9601f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e683780a124832f9601f--155) |
| PASS | 侧栏入口「知识库」/knowledge 显示真实主内容 | [http://127.0.0.1:3889/knowledge](http://127.0.0.1:3889/knowledge) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-知识库-knowledge-显示真实主内容--4ba458706d91e9a3e0c0d4553706bca43a03ba246abfa918f0b0d46d8b106105.png) | `004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d--156) |
| PASS | 侧栏入口「素材中心」/assets 显示真实主内容 | [http://127.0.0.1:3889/assets](http://127.0.0.1:3889/assets) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-素材中心-assets-显示真实主内容--f82146264d830c58d54987ff4f00bc529adc1d008662aadc9b0786096d914fb5.png) | `004934eeae7d0ea4287b-87e06a567997de69a4d1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-87e06a567997de69a4d1--157) |
| PASS | 侧栏入口「创作画布」/canvases 显示真实主内容 | [http://127.0.0.1:3889/canvases](http://127.0.0.1:3889/canvases) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作画布-canvases-显示真实主内容--286822878192f31a85c652705736b6dc4b58c8a706a79b1c6016091d7f70cd14.png) | `004934eeae7d0ea4287b-c42decb86b0f8bfd755d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-c42decb86b0f8bfd755d--158) |
| PASS | 侧栏入口「发布中心」/publishing 显示真实主内容 | [http://127.0.0.1:3889/publishing](http://127.0.0.1:3889/publishing) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-发布中心-publishing-显示真实主内容--5c3ddac4a603b6cf1aeaa50de5f47af4bc2ce18076d0ee565b56a44cb3827363.png) | `004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8--159) |
| PASS | 侧栏入口「运营分析」/daily-report 显示真实主内容 | [http://127.0.0.1:3889/daily-report](http://127.0.0.1:3889/daily-report) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-运营分析-daily-report-显示真实主内容--b4a54372d5165add1b533440f6d66de43fb37ecf172414eae1468698e4f4ead2.png) | `004934eeae7d0ea4287b-3ad7b42d606113be7e08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3ad7b42d606113be7e08--160) |
| PASS | 侧栏入口「自动化」/automations 显示真实主内容 | [http://127.0.0.1:3889/automations](http://127.0.0.1:3889/automations) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-自动化-automations-显示真实主内容--684aade25652ea65587dea369648be21ca31a0feb9aa898710546b992497d1a6.png) | `004934eeae7d0ea4287b-3a6ed74bb12244425a68` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3a6ed74bb12244425a68--161) |
| PASS | 侧栏入口「设置」/settings 显示真实主内容 | [http://127.0.0.1:3889/settings](http://127.0.0.1:3889/settings) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-设置-settings-显示真实主内容--290ab6e314592bc5e17f9342c6800af1b5cbb6b64a36e8b1cb6c84d751e7cfb9.png) | `004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a--162) |
| PASS | 账号管理页可以打开 | [http://127.0.0.1:3889/accounts](http://127.0.0.1:3889/accounts) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-账号管理页可以打开--464d3d9d3b89471348700f01f7bffcc80ea769d30d5901ec758470781b974b58.png) | `004934eeae7d0ea4287b-1b011beb30842b02f9bf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-1b011beb30842b02f9bf--163) |
| PASS | 当前账号的作品目录页可以打开 | [http://127.0.0.1:3889/accounts/works?accountId=acct-4664c410-8](http://127.0.0.1:3889/accounts/works?accountId=acct-4664c410-8) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-当前账号的作品目录页可以打开--aa623745df6c5c8b55c37b0b18b5f3a661ff867c6a645678e5f5b753bf7c3a73.png) | `004934eeae7d0ea4287b-8914979c80f32118fbd9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8914979c80f32118fbd9--164) |
| PASS | 发布中心日历子页可以打开 | [http://127.0.0.1:3889/publishing](http://127.0.0.1:3889/publishing) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-发布中心日历子页可以打开--c49eb18c5b626a51285fab2eb810d4cc77fb5716b4bae7a7ae22b37fd5ba810a.png) | `004934eeae7d0ea4287b-72f55b8042d75cf6cfb4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-72f55b8042d75cf6cfb4--165) |
| PASS | 项目「主稿面」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11](http://127.0.0.1:3889/projects/project-4664c410-11) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-主稿面-路由显示真实内容或有效重定向--35feac8f88cea0326ab68185d7458899d99dd5394296bad5460bc2df2f546573.png) | `004934eeae7d0ea4287b-5817fd6024763db7d32f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-5817fd6024763db7d32f--166) |
| PASS | 项目「选题兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11#topic](http://127.0.0.1:3889/projects/project-4664c410-11#topic) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-选题兼容入口-路由显示真实内容或有效重定向--6301d935e4815d93741754dd52e2ff0390c97072edf98609c1e7bae112220d94.png) | `004934eeae7d0ea4287b-a3e9de20528fbbd8b790` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a3e9de20528fbbd8b790--167) |
| PASS | 项目「计划兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11#topic](http://127.0.0.1:3889/projects/project-4664c410-11#topic) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-计划兼容入口-路由显示真实内容或有效重定向--71e411b986c49755781f908932dd9e8f014af7d785663925cfca0fcd0f8e745d.png) | `004934eeae7d0ea4287b-8e6a3f963f11b86d97ad` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8e6a3f963f11b86d97ad--168) |
| PASS | 项目「脚本兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11#script](http://127.0.0.1:3889/projects/project-4664c410-11#script) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-脚本兼容入口-路由显示真实内容或有效重定向--ae1d56b75019186ec4c572dfd8aefbd369c0a2430130ef2a7cb96b9d839ee604.png) | `004934eeae7d0ea4287b-855240d3a89c97574275` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-855240d3a89c97574275--169) |
| PASS | 项目「发布兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11#publish](http://127.0.0.1:3889/projects/project-4664c410-11#publish) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-发布兼容入口-路由显示真实内容或有效重定向--2469ad1100c23cb2d9a353134e9481521171ad2a36bfaeb482c465d693c5c00d.png) | `004934eeae7d0ea4287b-4fa2aca38e46f3883838` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-4fa2aca38e46f3883838--170) |
| PASS | 项目「复盘页」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11/review](http://127.0.0.1:3889/projects/project-4664c410-11/review) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-复盘页-路由显示真实内容或有效重定向--3ac29d68563c1998a81e26f24ec781f92fa077529670693f4f04dd31fc7410c7.png) | `004934eeae7d0ea4287b-ef3a0af1a8175dfc224b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ef3a0af1a8175dfc224b--171) |
| PASS | 项目「组合创作工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11/work](http://127.0.0.1:3889/projects/project-4664c410-11/work) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-组合创作工作台-路由显示真实内容或有效重定向--9709f7d34241aca3c5fa2b41dcfdd922d3249991fab173b90be4acba0f8e685b.png) | `004934eeae7d0ea4287b-f7088906b3f7ed12beee` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f7088906b3f7ed12beee--172) |
| FAIL | 项目「视频剪辑工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3889/projects/project-4664c410-11/production?outputId=output-4664c410-40](http://127.0.0.1:3889/projects/project-4664c410-11/production?outputId=output-4664c410-40) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-视频剪辑工作台-路由显示真实内容或有效重定向--d35866d8dd1d661f6e1f446f8f6f55b8d0ac7b38f53ef7af8a4a4910f297a4f4.png) | `004934eeae7d0ea4287b-54a04dba81ddb46ea7f4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-54a04dba81ddb46ea7f4--173) |

失败证据：

```text
Error: /projects/project-4664c410-11/production?outputId=output-4664c410-40 页面主内容应可见

[2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[aria-label="视频剪辑工作台"]')
Expected: visible
Error: strict mode violation: locator('[aria-label="视频剪辑工作台"]') resolved to 2 elements:
    1) <section aria-label="视频剪辑工作台" class="min-w-0 space-y-3">…</section> aka getByRole('region', { name: '视频剪辑工作台' })
    2) <div data-theme="light" aria-label="视频剪辑工作台" data-density="comfortable" class="relative h-full min-h-0 w-full"></div> aka getByRole('region', { name: '视频剪辑工作台' }).getByLabel('视频剪辑工作台')

Call log:
[2m  - /projects/project-4664c410-11/production?outputId=output-4664c410-40 页面主内容应可见 with timeout 5000ms[22m
[2m  - waiting for locator('[aria-label="视频剪辑工作台"]')[22m

```

| PASS | 文章工作台读取真实隔离文章作品 | [http://127.0.0.1:3889/projects/project-4664c410-184/article?outputId=output-4664c410-195](http://127.0.0.1:3889/projects/project-4664c410-184/article?outputId=output-4664c410-195) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-文章工作台读取真实隔离文章作品--c8dd2dbb90fa682017a127b593f246bd08a22fc40798dfc57b9e7640b6be9702.png) | `004934eeae7d0ea4287b-d50f4826421787e95c08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-d50f4826421787e95c08--174) |
| PASS | 图文工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3889/projects/project-4664c410-184/outputs/output-4664c410-204/image](http://127.0.0.1:3889/projects/project-4664c410-184/outputs/output-4664c410-204/image) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文工作台按真实隔离作品-ID-打开--abf1e8dd4d3e8df58e6b311bf095918e1be9c83f721a4599571eaf2af159b858.png) | `004934eeae7d0ea4287b-a858671eb52484737af8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a858671eb52484737af8--175) |
| PASS | 图文深链按真实隔离作品 ID 打开 | [http://127.0.0.1:3889/projects/project-4664c410-184/outputs/output-4664c410-204/image](http://127.0.0.1:3889/projects/project-4664c410-184/outputs/output-4664c410-204/image) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文深链按真实隔离作品-ID-打开--913a7aca6212c7fec235c469722c4532b55da9aae0147f1ab6a626e27c76db98.png) | `004934eeae7d0ea4287b-ca1938cd81655d82de81` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ca1938cd81655d82de81--176) |
| PASS | 视频工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3889/projects/project-4664c410-184/outputs/output-4664c410-213/video](http://127.0.0.1:3889/projects/project-4664c410-184/outputs/output-4664c410-213/video) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-视频工作台按真实隔离作品-ID-打开--34f146b58bd5c0edb0341d96c3ee53ba30d398f4b326557505ac3ee9c2a9ed85.png) | `004934eeae7d0ea4287b-a41b8bde1f8353957ac3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a41b8bde1f8353957ac3--177) |
| PASS | 项目画布详情按真实隔离画布 ID 打开 | [http://127.0.0.1:3889/canvases/9cb82ccd-c1eb-4135-9bd6-a0fb8bc7b827](http://127.0.0.1:3889/canvases/9cb82ccd-c1eb-4135-9bd6-a0fb8bc7b827) | [查看原图](screenshots/route-matrix-interim/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目画布详情按真实隔离画布-ID-打开--7975aa336e3d72dd03daed9186663b8fdec739d24d80328101f67c1e37e69754.png) | `004934eeae7d0ea4287b-e51b77fa0bf635ea2626` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e51b77fa0bf635ea2626--178) |
| PASS | 侧栏入口「首页」/ 显示真实主内容 | [http://127.0.0.1:3890/](http://127.0.0.1:3890/) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-首页-显示真实主内容--69be9395b71e37327a916accccc33c052512465c58211d133cd14d7c07101802.png) | `004934eeae7d0ea4287b-f1470f5b0d9b347b5b79` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f1470f5b0d9b347b5b79--179) |
| PASS | 侧栏入口「创作者总览」/overview 显示真实主内容 | [http://127.0.0.1:3890/overview](http://127.0.0.1:3890/overview) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作者总览-overview-显示真实主内容--c53bba432c8328d46eff3737057bf5471a443913c7ad79cd01eae41959f8c6cb.png) | `004934eeae7d0ea4287b-687be6bffc0f4477ae55` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-687be6bffc0f4477ae55--180) |
| PASS | 侧栏入口「定位中心」/positioning 显示真实主内容 | [http://127.0.0.1:3890/positioning](http://127.0.0.1:3890/positioning) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-定位中心-positioning-显示真实主内容--d92fbfb232953628d7af3dd737252ff247b126410bbb035c704382a1c288cc21.png) | `004934eeae7d0ea4287b-3fc60d737042980b2942` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3fc60d737042980b2942--181) |
| PASS | 侧栏入口「内容雷达」/intelligence 显示真实主内容 | [http://127.0.0.1:3890/intelligence](http://127.0.0.1:3890/intelligence) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-内容雷达-intelligence-显示真实主内容--22b68b5d27e74e0baa5ad8d5b62baec4a94466c648255ba90bdb7ccc9a797671.png) | `004934eeae7d0ea4287b-531d725bd3960b33aade` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-531d725bd3960b33aade--182) |
| PASS | 侧栏入口「选题」/topics 显示真实主内容 | [http://127.0.0.1:3890/topics](http://127.0.0.1:3890/topics) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-选题-topics-显示真实主内容--e02514ff4b140d00a04f633fde9063f354b9bd06c0d6590b549551a339a1a157.png) | `004934eeae7d0ea4287b-690d27b4028991544aa4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-690d27b4028991544aa4--183) |
| PASS | 侧栏入口「项目」/projects 显示真实主内容 | [http://127.0.0.1:3890/projects](http://127.0.0.1:3890/projects) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-项目-projects-显示真实主内容--442b5cce42bb2d238c226bd42d363fcb0675629927a7a766ae65d6b042f8520f.png) | `004934eeae7d0ea4287b-e683780a124832f9601f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e683780a124832f9601f--184) |
| PASS | 侧栏入口「知识库」/knowledge 显示真实主内容 | [http://127.0.0.1:3890/knowledge](http://127.0.0.1:3890/knowledge) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-知识库-knowledge-显示真实主内容--4ba458706d91e9a3e0c0d4553706bca43a03ba246abfa918f0b0d46d8b106105.png) | `004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d--185) |
| PASS | 侧栏入口「素材中心」/assets 显示真实主内容 | [http://127.0.0.1:3890/assets](http://127.0.0.1:3890/assets) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-素材中心-assets-显示真实主内容--f82146264d830c58d54987ff4f00bc529adc1d008662aadc9b0786096d914fb5.png) | `004934eeae7d0ea4287b-87e06a567997de69a4d1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-87e06a567997de69a4d1--186) |
| PASS | 侧栏入口「创作画布」/canvases 显示真实主内容 | [http://127.0.0.1:3890/canvases](http://127.0.0.1:3890/canvases) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作画布-canvases-显示真实主内容--286822878192f31a85c652705736b6dc4b58c8a706a79b1c6016091d7f70cd14.png) | `004934eeae7d0ea4287b-c42decb86b0f8bfd755d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-c42decb86b0f8bfd755d--187) |
| PASS | 侧栏入口「发布中心」/publishing 显示真实主内容 | [http://127.0.0.1:3890/publishing](http://127.0.0.1:3890/publishing) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-发布中心-publishing-显示真实主内容--5c3ddac4a603b6cf1aeaa50de5f47af4bc2ce18076d0ee565b56a44cb3827363.png) | `004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8--188) |
| PASS | 侧栏入口「运营分析」/daily-report 显示真实主内容 | [http://127.0.0.1:3890/daily-report](http://127.0.0.1:3890/daily-report) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-运营分析-daily-report-显示真实主内容--b4a54372d5165add1b533440f6d66de43fb37ecf172414eae1468698e4f4ead2.png) | `004934eeae7d0ea4287b-3ad7b42d606113be7e08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3ad7b42d606113be7e08--189) |
| PASS | 侧栏入口「自动化」/automations 显示真实主内容 | [http://127.0.0.1:3890/automations](http://127.0.0.1:3890/automations) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-自动化-automations-显示真实主内容--684aade25652ea65587dea369648be21ca31a0feb9aa898710546b992497d1a6.png) | `004934eeae7d0ea4287b-3a6ed74bb12244425a68` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3a6ed74bb12244425a68--190) |
| PASS | 侧栏入口「设置」/settings 显示真实主内容 | [http://127.0.0.1:3890/settings](http://127.0.0.1:3890/settings) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-设置-settings-显示真实主内容--290ab6e314592bc5e17f9342c6800af1b5cbb6b64a36e8b1cb6c84d751e7cfb9.png) | `004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a--191) |
| PASS | 账号管理页可以打开 | [http://127.0.0.1:3890/accounts](http://127.0.0.1:3890/accounts) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-账号管理页可以打开--464d3d9d3b89471348700f01f7bffcc80ea769d30d5901ec758470781b974b58.png) | `004934eeae7d0ea4287b-1b011beb30842b02f9bf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-1b011beb30842b02f9bf--192) |
| PASS | 当前账号的作品目录页可以打开 | [http://127.0.0.1:3890/accounts/works?accountId=acct-9e88fe43-8](http://127.0.0.1:3890/accounts/works?accountId=acct-9e88fe43-8) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-当前账号的作品目录页可以打开--aa623745df6c5c8b55c37b0b18b5f3a661ff867c6a645678e5f5b753bf7c3a73.png) | `004934eeae7d0ea4287b-8914979c80f32118fbd9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8914979c80f32118fbd9--193) |
| PASS | 发布中心日历子页可以打开 | [http://127.0.0.1:3890/publishing](http://127.0.0.1:3890/publishing) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-发布中心日历子页可以打开--c49eb18c5b626a51285fab2eb810d4cc77fb5716b4bae7a7ae22b37fd5ba810a.png) | `004934eeae7d0ea4287b-72f55b8042d75cf6cfb4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-72f55b8042d75cf6cfb4--194) |
| PASS | 项目「主稿面」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11](http://127.0.0.1:3890/projects/project-9e88fe43-11) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-主稿面-路由显示真实内容或有效重定向--35feac8f88cea0326ab68185d7458899d99dd5394296bad5460bc2df2f546573.png) | `004934eeae7d0ea4287b-5817fd6024763db7d32f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-5817fd6024763db7d32f--195) |
| PASS | 项目「选题兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11#topic](http://127.0.0.1:3890/projects/project-9e88fe43-11#topic) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-选题兼容入口-路由显示真实内容或有效重定向--6301d935e4815d93741754dd52e2ff0390c97072edf98609c1e7bae112220d94.png) | `004934eeae7d0ea4287b-a3e9de20528fbbd8b790` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a3e9de20528fbbd8b790--196) |
| PASS | 项目「计划兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11#topic](http://127.0.0.1:3890/projects/project-9e88fe43-11#topic) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-计划兼容入口-路由显示真实内容或有效重定向--71e411b986c49755781f908932dd9e8f014af7d785663925cfca0fcd0f8e745d.png) | `004934eeae7d0ea4287b-8e6a3f963f11b86d97ad` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8e6a3f963f11b86d97ad--197) |
| PASS | 项目「脚本兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11#script](http://127.0.0.1:3890/projects/project-9e88fe43-11#script) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-脚本兼容入口-路由显示真实内容或有效重定向--ae1d56b75019186ec4c572dfd8aefbd369c0a2430130ef2a7cb96b9d839ee604.png) | `004934eeae7d0ea4287b-855240d3a89c97574275` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-855240d3a89c97574275--198) |
| PASS | 项目「发布兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11#publish](http://127.0.0.1:3890/projects/project-9e88fe43-11#publish) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-发布兼容入口-路由显示真实内容或有效重定向--2469ad1100c23cb2d9a353134e9481521171ad2a36bfaeb482c465d693c5c00d.png) | `004934eeae7d0ea4287b-4fa2aca38e46f3883838` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-4fa2aca38e46f3883838--199) |
| PASS | 项目「复盘页」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/review](http://127.0.0.1:3890/projects/project-9e88fe43-11/review) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-复盘页-路由显示真实内容或有效重定向--3ac29d68563c1998a81e26f24ec781f92fa077529670693f4f04dd31fc7410c7.png) | `004934eeae7d0ea4287b-ef3a0af1a8175dfc224b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ef3a0af1a8175dfc224b--200) |
| PASS | 项目「组合创作工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/work](http://127.0.0.1:3890/projects/project-9e88fe43-11/work) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-组合创作工作台-路由显示真实内容或有效重定向--9709f7d34241aca3c5fa2b41dcfdd922d3249991fab173b90be4acba0f8e685b.png) | `004934eeae7d0ea4287b-f7088906b3f7ed12beee` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f7088906b3f7ed12beee--201) |
| PASS | 项目「视频剪辑工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/production?outputId=output-9e88fe43-40](http://127.0.0.1:3890/projects/project-9e88fe43-11/production?outputId=output-9e88fe43-40) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-视频剪辑工作台-路由显示真实内容或有效重定向--d35866d8dd1d661f6e1f446f8f6f55b8d0ac7b38f53ef7af8a4a4910f297a4f4.png) | `004934eeae7d0ea4287b-54a04dba81ddb46ea7f4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-54a04dba81ddb46ea7f4--202) |
| PASS | 文章工作台读取真实隔离文章作品 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/article?outputId=output-9e88fe43-22](http://127.0.0.1:3890/projects/project-9e88fe43-11/article?outputId=output-9e88fe43-22) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-文章工作台读取真实隔离文章作品--c8dd2dbb90fa682017a127b593f246bd08a22fc40798dfc57b9e7640b6be9702.png) | `004934eeae7d0ea4287b-d50f4826421787e95c08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-d50f4826421787e95c08--203) |
| PASS | 图文工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/outputs/output-9e88fe43-31/image](http://127.0.0.1:3890/projects/project-9e88fe43-11/outputs/output-9e88fe43-31/image) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文工作台按真实隔离作品-ID-打开--abf1e8dd4d3e8df58e6b311bf095918e1be9c83f721a4599571eaf2af159b858.png) | `004934eeae7d0ea4287b-a858671eb52484737af8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a858671eb52484737af8--204) |
| PASS | 图文深链按真实隔离作品 ID 打开 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/outputs/output-9e88fe43-31/image](http://127.0.0.1:3890/projects/project-9e88fe43-11/outputs/output-9e88fe43-31/image) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文深链按真实隔离作品-ID-打开--913a7aca6212c7fec235c469722c4532b55da9aae0147f1ab6a626e27c76db98.png) | `004934eeae7d0ea4287b-ca1938cd81655d82de81` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ca1938cd81655d82de81--205) |
| PASS | 视频工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3890/projects/project-9e88fe43-11/outputs/output-9e88fe43-40/video](http://127.0.0.1:3890/projects/project-9e88fe43-11/outputs/output-9e88fe43-40/video) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-视频工作台按真实隔离作品-ID-打开--34f146b58bd5c0edb0341d96c3ee53ba30d398f4b326557505ac3ee9c2a9ed85.png) | `004934eeae7d0ea4287b-a41b8bde1f8353957ac3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a41b8bde1f8353957ac3--206) |
| PASS | 项目画布详情按真实隔离画布 ID 打开 | [http://127.0.0.1:3890/canvases/4b22129f-7c3a-459f-b2f4-4bbdfe2cf8b3](http://127.0.0.1:3890/canvases/4b22129f-7c3a-459f-b2f4-4bbdfe2cf8b3) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目画布详情按真实隔离画布-ID-打开--7975aa336e3d72dd03daed9186663b8fdec739d24d80328101f67c1e37e69754.png) | `004934eeae7d0ea4287b-e51b77fa0bf635ea2626` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e51b77fa0bf635ea2626--207) |
| PASS | 侧栏入口「首页」/ 显示真实主内容 | [http://127.0.0.1:3897/](http://127.0.0.1:3897/) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-首页-显示真实主内容--69be9395b71e37327a916accccc33c052512465c58211d133cd14d7c07101802.png) | `004934eeae7d0ea4287b-f1470f5b0d9b347b5b79` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f1470f5b0d9b347b5b79--280) |
| PASS | 侧栏入口「创作者总览」/overview 显示真实主内容 | [http://127.0.0.1:3897/overview](http://127.0.0.1:3897/overview) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作者总览-overview-显示真实主内容--c53bba432c8328d46eff3737057bf5471a443913c7ad79cd01eae41959f8c6cb.png) | `004934eeae7d0ea4287b-687be6bffc0f4477ae55` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-687be6bffc0f4477ae55--281) |
| PASS | 侧栏入口「定位中心」/positioning 显示真实主内容 | [http://127.0.0.1:3897/positioning](http://127.0.0.1:3897/positioning) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-定位中心-positioning-显示真实主内容--d92fbfb232953628d7af3dd737252ff247b126410bbb035c704382a1c288cc21.png) | `004934eeae7d0ea4287b-3fc60d737042980b2942` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3fc60d737042980b2942--282) |
| PASS | 侧栏入口「内容雷达」/intelligence 显示真实主内容 | [http://127.0.0.1:3897/intelligence](http://127.0.0.1:3897/intelligence) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-内容雷达-intelligence-显示真实主内容--22b68b5d27e74e0baa5ad8d5b62baec4a94466c648255ba90bdb7ccc9a797671.png) | `004934eeae7d0ea4287b-531d725bd3960b33aade` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-531d725bd3960b33aade--283) |
| PASS | 侧栏入口「选题」/topics 显示真实主内容 | [http://127.0.0.1:3897/topics](http://127.0.0.1:3897/topics) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-选题-topics-显示真实主内容--e02514ff4b140d00a04f633fde9063f354b9bd06c0d6590b549551a339a1a157.png) | `004934eeae7d0ea4287b-690d27b4028991544aa4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-690d27b4028991544aa4--284) |
| PASS | 侧栏入口「项目」/projects 显示真实主内容 | [http://127.0.0.1:3897/projects](http://127.0.0.1:3897/projects) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-项目-projects-显示真实主内容--442b5cce42bb2d238c226bd42d363fcb0675629927a7a766ae65d6b042f8520f.png) | `004934eeae7d0ea4287b-e683780a124832f9601f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e683780a124832f9601f--285) |
| PASS | 侧栏入口「知识库」/knowledge 显示真实主内容 | [http://127.0.0.1:3897/knowledge](http://127.0.0.1:3897/knowledge) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-知识库-knowledge-显示真实主内容--4ba458706d91e9a3e0c0d4553706bca43a03ba246abfa918f0b0d46d8b106105.png) | `004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-2ca4ee6ea87296e1d08d--286) |
| PASS | 侧栏入口「素材中心」/assets 显示真实主内容 | [http://127.0.0.1:3897/assets](http://127.0.0.1:3897/assets) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-素材中心-assets-显示真实主内容--f82146264d830c58d54987ff4f00bc529adc1d008662aadc9b0786096d914fb5.png) | `004934eeae7d0ea4287b-87e06a567997de69a4d1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-87e06a567997de69a4d1--287) |
| PASS | 侧栏入口「创作画布」/canvases 显示真实主内容 | [http://127.0.0.1:3897/canvases](http://127.0.0.1:3897/canvases) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-创作画布-canvases-显示真实主内容--286822878192f31a85c652705736b6dc4b58c8a706a79b1c6016091d7f70cd14.png) | `004934eeae7d0ea4287b-c42decb86b0f8bfd755d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-c42decb86b0f8bfd755d--288) |
| PASS | 侧栏入口「发布中心」/publishing 显示真实主内容 | [http://127.0.0.1:3897/publishing](http://127.0.0.1:3897/publishing) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-发布中心-publishing-显示真实主内容--5c3ddac4a603b6cf1aeaa50de5f47af4bc2ce18076d0ee565b56a44cb3827363.png) | `004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-b52ad0cac3b256ec7ac8--289) |
| PASS | 侧栏入口「运营分析」/daily-report 显示真实主内容 | [http://127.0.0.1:3897/daily-report](http://127.0.0.1:3897/daily-report) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-运营分析-daily-report-显示真实主内容--b4a54372d5165add1b533440f6d66de43fb37ecf172414eae1468698e4f4ead2.png) | `004934eeae7d0ea4287b-3ad7b42d606113be7e08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3ad7b42d606113be7e08--290) |
| PASS | 侧栏入口「自动化」/automations 显示真实主内容 | [http://127.0.0.1:3897/automations](http://127.0.0.1:3897/automations) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-自动化-automations-显示真实主内容--684aade25652ea65587dea369648be21ca31a0feb9aa898710546b992497d1a6.png) | `004934eeae7d0ea4287b-3a6ed74bb12244425a68` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-3a6ed74bb12244425a68--291) |
| PASS | 侧栏入口「设置」/settings 显示真实主内容 | [http://127.0.0.1:3897/settings](http://127.0.0.1:3897/settings) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-侧栏入口-设置-settings-显示真实主内容--290ab6e314592bc5e17f9342c6800af1b5cbb6b64a36e8b1cb6c84d751e7cfb9.png) | `004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-bb8a7a6b121c23d6c33a--292) |
| PASS | 账号管理页可以打开 | [http://127.0.0.1:3897/accounts](http://127.0.0.1:3897/accounts) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-账号管理页可以打开--464d3d9d3b89471348700f01f7bffcc80ea769d30d5901ec758470781b974b58.png) | `004934eeae7d0ea4287b-1b011beb30842b02f9bf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-1b011beb30842b02f9bf--293) |
| PASS | 当前账号的作品目录页可以打开 | [http://127.0.0.1:3897/accounts/works?accountId=acct-c525639a-8](http://127.0.0.1:3897/accounts/works?accountId=acct-c525639a-8) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-当前账号的作品目录页可以打开--aa623745df6c5c8b55c37b0b18b5f3a661ff867c6a645678e5f5b753bf7c3a73.png) | `004934eeae7d0ea4287b-8914979c80f32118fbd9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8914979c80f32118fbd9--294) |
| PASS | 项目快速创建路由显示真实内容 | [http://127.0.0.1:3897/projects/create](http://127.0.0.1:3897/projects/create) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目快速创建路由显示真实内容--91bc07f3296a53d3e74667c8968a8a6c74d0ad4be3ca82bcc93e88dc72c43fe5.png) | `004934eeae7d0ea4287b-ace9d2b018a1c172f4cf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ace9d2b018a1c172f4cf--295) |
| PASS | 发布中心日历子页可以打开 | [http://127.0.0.1:3897/publishing](http://127.0.0.1:3897/publishing) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-发布中心日历子页可以打开--c49eb18c5b626a51285fab2eb810d4cc77fb5716b4bae7a7ae22b37fd5ba810a.png) | `004934eeae7d0ea4287b-72f55b8042d75cf6cfb4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-72f55b8042d75cf6cfb4--296) |
| PASS | 项目「主稿面」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11](http://127.0.0.1:3897/projects/project-c525639a-11) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-主稿面-路由显示真实内容或有效重定向--35feac8f88cea0326ab68185d7458899d99dd5394296bad5460bc2df2f546573.png) | `004934eeae7d0ea4287b-5817fd6024763db7d32f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-5817fd6024763db7d32f--297) |
| PASS | 项目「选题兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11#topic](http://127.0.0.1:3897/projects/project-c525639a-11#topic) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-选题兼容入口-路由显示真实内容或有效重定向--6301d935e4815d93741754dd52e2ff0390c97072edf98609c1e7bae112220d94.png) | `004934eeae7d0ea4287b-a3e9de20528fbbd8b790` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a3e9de20528fbbd8b790--298) |
| PASS | 项目「计划兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11#topic](http://127.0.0.1:3897/projects/project-c525639a-11#topic) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-计划兼容入口-路由显示真实内容或有效重定向--71e411b986c49755781f908932dd9e8f014af7d785663925cfca0fcd0f8e745d.png) | `004934eeae7d0ea4287b-8e6a3f963f11b86d97ad` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-8e6a3f963f11b86d97ad--299) |
| PASS | 项目「脚本兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11#script](http://127.0.0.1:3897/projects/project-c525639a-11#script) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-脚本兼容入口-路由显示真实内容或有效重定向--ae1d56b75019186ec4c572dfd8aefbd369c0a2430130ef2a7cb96b9d839ee604.png) | `004934eeae7d0ea4287b-855240d3a89c97574275` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-855240d3a89c97574275--300) |
| PASS | 项目「发布兼容入口」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11#publish](http://127.0.0.1:3897/projects/project-c525639a-11#publish) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-发布兼容入口-路由显示真实内容或有效重定向--2469ad1100c23cb2d9a353134e9481521171ad2a36bfaeb482c465d693c5c00d.png) | `004934eeae7d0ea4287b-4fa2aca38e46f3883838` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-4fa2aca38e46f3883838--301) |
| PASS | 项目「复盘页」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11/review](http://127.0.0.1:3897/projects/project-c525639a-11/review) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-复盘页-路由显示真实内容或有效重定向--3ac29d68563c1998a81e26f24ec781f92fa077529670693f4f04dd31fc7410c7.png) | `004934eeae7d0ea4287b-ef3a0af1a8175dfc224b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ef3a0af1a8175dfc224b--302) |
| PASS | 项目「组合创作工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11/work](http://127.0.0.1:3897/projects/project-c525639a-11/work) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-组合创作工作台-路由显示真实内容或有效重定向--9709f7d34241aca3c5fa2b41dcfdd922d3249991fab173b90be4acba0f8e685b.png) | `004934eeae7d0ea4287b-f7088906b3f7ed12beee` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f7088906b3f7ed12beee--303) |
| PASS | 项目「视频剪辑工作台」路由显示真实内容或有效重定向 | [http://127.0.0.1:3897/projects/project-c525639a-11/production?outputId=output-c525639a-40](http://127.0.0.1:3897/projects/project-c525639a-11/production?outputId=output-c525639a-40) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目-视频剪辑工作台-路由显示真实内容或有效重定向--d35866d8dd1d661f6e1f446f8f6f55b8d0ac7b38f53ef7af8a4a4910f297a4f4.png) | `004934eeae7d0ea4287b-54a04dba81ddb46ea7f4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-54a04dba81ddb46ea7f4--304) |
| PASS | 文章工作台读取真实隔离文章作品 | [http://127.0.0.1:3897/projects/project-c525639a-11/article?outputId=output-c525639a-22](http://127.0.0.1:3897/projects/project-c525639a-11/article?outputId=output-c525639a-22) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-文章工作台读取真实隔离文章作品--c8dd2dbb90fa682017a127b593f246bd08a22fc40798dfc57b9e7640b6be9702.png) | `004934eeae7d0ea4287b-d50f4826421787e95c08` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-d50f4826421787e95c08--305) |
| PASS | 图文工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3897/projects/project-c525639a-11/outputs/output-c525639a-31/image](http://127.0.0.1:3897/projects/project-c525639a-11/outputs/output-c525639a-31/image) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文工作台按真实隔离作品-ID-打开--abf1e8dd4d3e8df58e6b311bf095918e1be9c83f721a4599571eaf2af159b858.png) | `004934eeae7d0ea4287b-a858671eb52484737af8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a858671eb52484737af8--306) |
| PASS | 图文深链按真实隔离作品 ID 打开 | [http://127.0.0.1:3897/projects/project-c525639a-11/outputs/output-c525639a-31/image](http://127.0.0.1:3897/projects/project-c525639a-11/outputs/output-c525639a-31/image) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-图文深链按真实隔离作品-ID-打开--913a7aca6212c7fec235c469722c4532b55da9aae0147f1ab6a626e27c76db98.png) | `004934eeae7d0ea4287b-ca1938cd81655d82de81` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-ca1938cd81655d82de81--307) |
| PASS | 视频工作台按真实隔离作品 ID 打开 | [http://127.0.0.1:3897/projects/project-c525639a-11/outputs/output-c525639a-40/video](http://127.0.0.1:3897/projects/project-c525639a-11/outputs/output-c525639a-40/video) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-视频工作台按真实隔离作品-ID-打开--34f146b58bd5c0edb0341d96c3ee53ba30d398f4b326557505ac3ee9c2a9ed85.png) | `004934eeae7d0ea4287b-a41b8bde1f8353957ac3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-a41b8bde1f8353957ac3--308) |
| PASS | 项目画布详情按真实隔离画布 ID 打开 | [http://127.0.0.1:3897/canvases/d419452c-5681-4394-b2cb-0c64f1af5a84](http://127.0.0.1:3897/canvases/d419452c-5681-4394-b2cb-0c64f1af5a84) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-项目画布详情按真实隔离画布-ID-打开--7975aa336e3d72dd03daed9186663b8fdec739d24d80328101f67c1e37e69754.png) | `004934eeae7d0ea4287b-e51b77fa0bf635ea2626` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e51b77fa0bf635ea2626--309) |
| PASS | 朋友圈工作台按真实隔离稿件 ID 打开 | [http://127.0.0.1:3897/projects/project-c525639a-11/moments/moments-c525639a-51](http://127.0.0.1:3897/projects/project-c525639a-11/moments/moments-c525639a-51) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-朋友圈工作台按真实隔离稿件-ID-打开--44b375af68c71865d6ffb8a22a0d089819d055392e43d4b4bae295afed99cc5b.png) | `004934eeae7d0ea4287b-926f8c289cabf8aad325` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-926f8c289cabf8aad325--310) |
| PASS | 旧入口「/login」有效回到本地首页 | [http://127.0.0.1:3897/](http://127.0.0.1:3897/) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-旧入口-login-有效回到本地首页--026358c46144bd966d9a249445555c544a76be09291036c26d8820d761d4f32c.png) | `004934eeae7d0ea4287b-fba0f66284639b385ea4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-fba0f66284639b385ea4--311) |
| PASS | 旧入口「/register」有效回到本地首页 | [http://127.0.0.1:3897/](http://127.0.0.1:3897/) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-旧入口-register-有效回到本地首页--aa319562e58591fff828a1aef2290bf5b8ce885ea8e8f4b2a2ca618c9636b8e5.png) | `004934eeae7d0ea4287b-e5035f946ac04632678e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-e5035f946ac04632678e--312) |
| PASS | 旧入口「/activate」有效回到本地首页 | [http://127.0.0.1:3897/](http://127.0.0.1:3897/) | [查看原图](screenshots/t1207-supplemental-route-matrix--T-1207-补充真实页面路由矩阵-旧入口-activate-有效回到本地首页--89395cdad7cb02b5904afeaac59609d9a4734f8ff4da22b81621bed070099e45.png) | `004934eeae7d0ea4287b-f3852e7d166522dfe97d` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fe2e%2Ft1207-supplemental-route-matrix.spec.ts--004934eeae7d0ea4287b-f3852e7d166522dfe97d--313) |

## frontend/tests/visual/all-pages.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | dashboard (/) renders the main region | [http://127.0.0.1:3891/](http://127.0.0.1:3891/) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-dashboard-renders-the-main-region--1c6acf78a4456b72f1ca9861fc04dedd524b8459312d6305ad1a90c692f9a495.png) | `e63384523d2d26cf7876-b0515e8e9868b83ed631` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-b0515e8e9868b83ed631--208) |
| FAIL | dashboard (/) matches the reference image | [http://127.0.0.1:3891/](http://127.0.0.1:3891/) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-dashboard-matches-the-reference-image--c228ef1afd921c5b2ed0aff2ab3ae591ac1ed152998b0c7d4615859a3836adbd.png) | `e63384523d2d26cf7876-c582cb46369c2a145e75` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-c582cb46369c2a145e75--209) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  110903 pixels (ratio 0.08 of all image pixels) are different.

  Snapshot: reference-dashboard.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-dashboard.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 110903 pixels (ratio 0.08 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 110903 pixels (ratio 0.08 of all image pixels) are different.[22m

```

| PASS | projects (/projects) renders the main region | [http://127.0.0.1:3891/projects](http://127.0.0.1:3891/projects) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-projects-projects-renders-the-main-region--f080f7b042f98086434cbabdaf7432633f30222a1687b85c8ea66bb1ac0c0e02.png) | `e63384523d2d26cf7876-f3e2beced0c961dafe25` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-f3e2beced0c961dafe25--210) |
| FAIL | projects (/projects) matches the reference image | [http://127.0.0.1:3891/projects](http://127.0.0.1:3891/projects) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-projects-projects-matches-the-reference-image--fff3400ed3fd22f911916b9fc953c89d9b8063425a880188fd896622e1b20682.png) | `e63384523d2d26cf7876-94e3f8c72578b194dea8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-94e3f8c72578b194dea8--211) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  97881 pixels (ratio 0.07 of all image pixels) are different.

  Snapshot: reference-projects.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-projects.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 97881 pixels (ratio 0.07 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 97881 pixels (ratio 0.07 of all image pixels) are different.[22m

```

| PASS | project-overview (/projects/ai-native-browser) renders the main region | [http://127.0.0.1:3891/projects/ai-native-browser](http://127.0.0.1:3891/projects/ai-native-browser) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-project-overview-projects-ai-native-browser-render--97e1a912ba2661b0f06af3a9e44c634ef2384de34d77b45fb69798a63763fb1a.png) | `e63384523d2d26cf7876-d1da0aa92f6bbd8dfa37` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-d1da0aa92f6bbd8dfa37--212) |
| FAIL | project-overview (/projects/ai-native-browser) matches the reference image | [http://127.0.0.1:3891/projects/ai-native-browser](http://127.0.0.1:3891/projects/ai-native-browser) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-project-overview-projects-ai-native-browser-matche--8e579ee04d5a20aa582fc1bdc9fd9e553eb17326fb5543232c0391e6c228b997.png) | `e63384523d2d26cf7876-42703063d75b86089fee` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-42703063d75b86089fee--213) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  74139 pixels (ratio 0.05 of all image pixels) are different.

  Snapshot: reference-project-overview.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-project-overview.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 74139 pixels (ratio 0.05 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 74139 pixels (ratio 0.05 of all image pixels) are different.[22m

```

| PASS | research-workspace (/projects/ai-native-browser/research) renders the main region | [http://127.0.0.1:3891/projects/ai-native-browser/research](http://127.0.0.1:3891/projects/ai-native-browser/research) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-research-workspace-projects-ai-native-browser-rese--70def1f2c7d8e6db3df03273411aaac0fe08ff0ae327594b99232f3e94b9914e.png) | `e63384523d2d26cf7876-300ed8c2c50a177e4b28` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-300ed8c2c50a177e4b28--214) |
| FAIL | research-workspace (/projects/ai-native-browser/research) matches the reference image | [http://127.0.0.1:3891/projects/ai-native-browser/research](http://127.0.0.1:3891/projects/ai-native-browser/research) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-research-workspace-projects-ai-native-browser-rese--498f336f6dd19a939945643b293a8065ff7301256fbb29e97ea23984aae166db.png) | `e63384523d2d26cf7876-f35fb10c0b9e56349bc6` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-f35fb10c0b9e56349bc6--215) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  87671 pixels (ratio 0.06 of all image pixels) are different.

  Snapshot: reference-research-workspace.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-research-workspace.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 87671 pixels (ratio 0.06 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 87671 pixels (ratio 0.06 of all image pixels) are different.[22m

```

| PASS | planning-workspace (/projects/ai-native-browser/planning) renders the main region | [http://127.0.0.1:3891/projects/ai-native-browser/planning](http://127.0.0.1:3891/projects/ai-native-browser/planning) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-planning-workspace-projects-ai-native-browser-plan--3f657ebedd2588dd452f319d56d5e8dbe98b95d260eba988ba5146b500569d92.png) | `e63384523d2d26cf7876-6d9ecf737c8bb8f271f2` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-6d9ecf737c8bb8f271f2--216) |
| FAIL | planning-workspace (/projects/ai-native-browser/planning) matches the reference image | [http://127.0.0.1:3891/projects/ai-native-browser/planning](http://127.0.0.1:3891/projects/ai-native-browser/planning) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-planning-workspace-projects-ai-native-browser-plan--94ff532652e319bd451ab7032076972592230a4d9b4b7cf305b5856fe55ed967.png) | `e63384523d2d26cf7876-763bcde5a25494f17718` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-763bcde5a25494f17718--217) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  92314 pixels (ratio 0.06 of all image pixels) are different.

  Snapshot: reference-planning-workspace.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-planning-workspace.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 92314 pixels (ratio 0.06 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 92314 pixels (ratio 0.06 of all image pixels) are different.[22m

```

| PASS | script-workspace (/projects/ai-native-browser/script) renders the main region | [http://127.0.0.1:3891/projects/ai-native-browser/script](http://127.0.0.1:3891/projects/ai-native-browser/script) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-script-workspace-projects-ai-native-browser-script--860edd9b8d9cd66e72a96ad82b479b82be0f08a5af92864a3e4e5d8d189c622e.png) | `e63384523d2d26cf7876-a64f883d8288a4688728` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-a64f883d8288a4688728--218) |
| FAIL | script-workspace (/projects/ai-native-browser/script) matches the reference image | [http://127.0.0.1:3891/projects/ai-native-browser/script](http://127.0.0.1:3891/projects/ai-native-browser/script) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-script-workspace-projects-ai-native-browser-script--c5524743e1f2b52cb1ec2d7fd1bb3c7c9c349956fcc31a07d89b0785e06a9965.png) | `e63384523d2d26cf7876-0da84f4bad7ad3284cb6` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-0da84f4bad7ad3284cb6--219) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  85271 pixels (ratio 0.06 of all image pixels) are different.

  Snapshot: reference-script-workspace.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-script-workspace.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 85271 pixels (ratio 0.06 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 85271 pixels (ratio 0.06 of all image pixels) are different.[22m

```

| PASS | publishing-workspace (/projects/ai-native-browser/publishing) renders the main region | [http://127.0.0.1:3891/projects/ai-native-browser/publishing](http://127.0.0.1:3891/projects/ai-native-browser/publishing) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-publishing-workspace-projects-ai-native-browser-pu--3e8d33af5b84688a6d4512df3012df1e6c08f634d3f25858dd01d5898f9c6b86.png) | `e63384523d2d26cf7876-af0f755de244f1d215dc` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-af0f755de244f1d215dc--220) |
| FAIL | publishing-workspace (/projects/ai-native-browser/publishing) matches the reference image | [http://127.0.0.1:3891/projects/ai-native-browser/publishing](http://127.0.0.1:3891/projects/ai-native-browser/publishing) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-publishing-workspace-projects-ai-native-browser-pu--fe8c38b0d7d66af25aad1313c7fe3f9dc430512fac3edb0b3497839cd3efc77e.png) | `e63384523d2d26cf7876-80f9efb9da096c413fa5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-80f9efb9da096c413fa5--221) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  168476 pixels (ratio 0.11 of all image pixels) are different.

  Snapshot: reference-publishing-workspace.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-publishing-workspace.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 168476 pixels (ratio 0.11 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 168476 pixels (ratio 0.11 of all image pixels) are different.[22m

```

| PASS | analytics-review (/projects/ai-native-browser/review) renders the main region | [http://127.0.0.1:3891/projects/ai-native-browser/review](http://127.0.0.1:3891/projects/ai-native-browser/review) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-analytics-review-projects-ai-native-browser-review--87d9adbc0f500b18c48ed87cf4ebb1cd32b839ba3c7087e2d30aec1676d2d5dd.png) | `e63384523d2d26cf7876-5c9dc845f7fed2f00397` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-5c9dc845f7fed2f00397--222) |
| FAIL | analytics-review (/projects/ai-native-browser/review) matches the reference image | [http://127.0.0.1:3891/projects/ai-native-browser/review](http://127.0.0.1:3891/projects/ai-native-browser/review) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-analytics-review-projects-ai-native-browser-review--61404a3b0aa94f749e41f97eefa9cd4e5536185f5f39bcd238ec0665d9e257b8.png) | `e63384523d2d26cf7876-3cc9d53c7a86ef131afd` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-3cc9d53c7a86ef131afd--223) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  106828 pixels (ratio 0.07 of all image pixels) are different.

  Snapshot: reference-analytics-review.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-analytics-review.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 106828 pixels (ratio 0.07 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 106828 pixels (ratio 0.07 of all image pixels) are different.[22m

```

| PASS | knowledge (/knowledge) renders the main region | [http://127.0.0.1:3891/knowledge](http://127.0.0.1:3891/knowledge) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-knowledge-knowledge-renders-the-main-region--940ddf83ce90bae5d3e31ec9cffcd7b145cfad123568d19d845f2fabbe6c020e.png) | `e63384523d2d26cf7876-84ce60e9f49f7793d2d1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-84ce60e9f49f7793d2d1--224) |
| FAIL | knowledge (/knowledge) matches the reference image | [http://127.0.0.1:3891/knowledge](http://127.0.0.1:3891/knowledge) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-knowledge-knowledge-matches-the-reference-image--e381c2953ab9f48377fc39e0b9ffa3b8b1cf70853d670d1a3fbfe5d966aa2f5f.png) | `e63384523d2d26cf7876-9a049737885cd32d27f9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-9a049737885cd32d27f9--225) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  73657 pixels (ratio 0.05 of all image pixels) are different.

  Snapshot: reference-knowledge.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-knowledge.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 73657 pixels (ratio 0.05 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 73657 pixels (ratio 0.05 of all image pixels) are different.[22m

```

| PASS | assets (/assets) renders the main region | [http://127.0.0.1:3891/assets](http://127.0.0.1:3891/assets) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-assets-assets-renders-the-main-region--56d283bd810df54fff912180834bd71d9e63be81d691a99ecbe5b8d519733dd1.png) | `e63384523d2d26cf7876-07b72ac65b439eda385b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-07b72ac65b439eda385b--226) |
| FAIL | assets (/assets) matches the reference image | [http://127.0.0.1:3891/assets](http://127.0.0.1:3891/assets) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-assets-assets-matches-the-reference-image--8178f7ba76dc61087a1bdb22df688b1f3d711cf4e3307c6c1304a0d1f922fdfa.png) | `e63384523d2d26cf7876-0b5401231e2becc0fb45` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-0b5401231e2becc0fb45--227) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  286683 pixels (ratio 0.19 of all image pixels) are different.

  Snapshot: reference-assets.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-assets.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 286683 pixels (ratio 0.19 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 286683 pixels (ratio 0.19 of all image pixels) are different.[22m

```

| PASS | publishing-center (/publishing) renders the main region | [http://127.0.0.1:3891/publishing](http://127.0.0.1:3891/publishing) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-publishing-center-publishing-renders-the-main-regi--6e25ee6ec8dd4a26eb3588e09d4a24682c300404dc4563498abdc9c165fae7fa.png) | `e63384523d2d26cf7876-e6a02b99c1a06dae470c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-e6a02b99c1a06dae470c--228) |
| FAIL | publishing-center (/publishing) matches the reference image | [http://127.0.0.1:3891/publishing](http://127.0.0.1:3891/publishing) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-publishing-center-publishing-matches-the-reference--5e02ed3a3eccce427c5c4ced1d69e7351b78614eaec07931648f416d9af45c11.png) | `e63384523d2d26cf7876-bad7308103ee1281488e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-bad7308103ee1281488e--229) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  111472 pixels (ratio 0.08 of all image pixels) are different.

  Snapshot: reference-publishing-center.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-publishing-center.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 111472 pixels (ratio 0.08 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 111472 pixels (ratio 0.08 of all image pixels) are different.[22m

```

| PASS | experience (/experience) renders the main region | [http://127.0.0.1:3891/experience](http://127.0.0.1:3891/experience) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-experience-experience-renders-the-main-region--9da27454e28af56419f80ed533ab9528334bcfbaefae01f4d3acfc7fc179f260.png) | `e63384523d2d26cf7876-ddf9713e2b9c63029948` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-ddf9713e2b9c63029948--230) |
| FAIL | experience (/experience) matches the reference image | [http://127.0.0.1:3891/experience](http://127.0.0.1:3891/experience) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-experience-experience-matches-the-reference-image--edbc5a50e2651fe4e7d69e45a3af2dab30f7cf32cf6ff645a0ce9c101bb80988.png) | `e63384523d2d26cf7876-a9339107148d4cf00c2f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-a9339107148d4cf00c2f--231) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  83384 pixels (ratio 0.06 of all image pixels) are different.

  Snapshot: reference-experience.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-experience.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 83384 pixels (ratio 0.06 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 83384 pixels (ratio 0.06 of all image pixels) are different.[22m

```

| PASS | search (/search) renders the main region | [http://127.0.0.1:3891/search](http://127.0.0.1:3891/search) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-search-search-renders-the-main-region--da368312cd2a95259b8e92fd50a5ef3608d28db308804e5a39c5774f82bfd1be.png) | `e63384523d2d26cf7876-1ea211ceb0f33d7bf06b` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-1ea211ceb0f33d7bf06b--232) |
| FAIL | search (/search) matches the reference image | [http://127.0.0.1:3891/search](http://127.0.0.1:3891/search) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-search-search-matches-the-reference-image--cb7f758fb079cde08da239750fff3b37609b3f4d3788f5624d2d9bc0a23c187a.png) | `e63384523d2d26cf7876-b42999792dd702d23643` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-b42999792dd702d23643--233) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  185629 pixels (ratio 0.12 of all image pixels) are different.

  Snapshot: reference-search.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-search.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 185629 pixels (ratio 0.12 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 185629 pixels (ratio 0.12 of all image pixels) are different.[22m

```

| FAIL | settings (/settings) renders the main region | [http://127.0.0.1:3891/settings](http://127.0.0.1:3891/settings) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-settings-settings-renders-the-main-region--bd8cd239dac8a7c20ac7b7a1bbd3b27cf8b6e7f69915cacb4e1bcc1a8fc5d4af.png) | `e63384523d2d26cf7876-41a8ecd00253b2dfe9c7` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-41a8ecd00253b2dfe9c7--234) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator:  locator('main[data-app="creatoros"]')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-app="creatoros"]')[22m
[2m    13 × locator resolved to <main data-app="creatoros" data-page="settings" data-settings-id="settings-root" class="flex flex-col gap-section-gap"></main>[22m
[2m       - unexpected value "hidden"[22m

```

| FAIL | settings (/settings) matches the reference image | [http://127.0.0.1:3891/settings](http://127.0.0.1:3891/settings) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-settings-settings-matches-the-reference-image--42838c2626c95ec752b17246203504a929c8af10c79eab757e2c1679c5929a68.png) | `e63384523d2d26cf7876-862275567e7a5fd2a655` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-862275567e7a5fd2a655--235) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator:  locator('main[data-app="creatoros"]')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-app="creatoros"]')[22m
[2m    13 × locator resolved to <main data-app="creatoros" data-page="settings" data-settings-id="settings-root" class="flex flex-col gap-section-gap"></main>[22m
[2m       - unexpected value "hidden"[22m

```

| PASS | new-project-overlay (/projects/new) renders the main region | [http://127.0.0.1:3891/projects/new](http://127.0.0.1:3891/projects/new) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-new-project-overlay-projects-new-renders-the-main---b46c0a1454d1c757b11b4a6367acc1a499e7a27aba5a6c9a991362d709c879f0.png) | `e63384523d2d26cf7876-67784deaa6253f6c988a` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-67784deaa6253f6c988a--236) |
| FAIL | new-project-overlay (/projects/new) matches the reference image | [http://127.0.0.1:3891/projects/new](http://127.0.0.1:3891/projects/new) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-new-project-overlay-projects-new-matches-the-refer--1bd9d295316d9c1ea01d6566490fe07b43cec9be6a294ff4854c5e259ac6c90d.png) | `e63384523d2d26cf7876-4f39cdfb91757044887f` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-4f39cdfb91757044887f--237) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  869582 pixels (ratio 0.56 of all image pixels) are different.

  Snapshot: reference-new-project-overlay.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-new-project-overlay.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 869582 pixels (ratio 0.56 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 869582 pixels (ratio 0.56 of all image pixels) are different.[22m

```

| PASS | ai-copilot-overlay (/?copilot=open) renders the main region | [http://127.0.0.1:3891/?copilot=open](http://127.0.0.1:3891/?copilot=open) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-ai-copilot-overlay-copilot-open-renders-the-main-r--38d39b49f883d716b8a6c3ae23722d8ec12b9fee8de830d51b9d4d0af062bdeb.png) | `e63384523d2d26cf7876-90668a094c9aaa9d99f8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-90668a094c9aaa9d99f8--238) |
| FAIL | ai-copilot-overlay (/?copilot=open) matches the reference image | [http://127.0.0.1:3891/?copilot=open](http://127.0.0.1:3891/?copilot=open) | [查看原图](screenshots/all-pages--Visual-matrix-Task-26-ai-copilot-overlay-copilot-open-matches-the-refere--e507a5cdb2d4d6473f8614114754ea530e34c6368ed7416b72f82fa3c632811c.png) | `e63384523d2d26cf7876-0f3b775121199fc42799` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fall-pages.spec.ts--e63384523d2d26cf7876-0f3b775121199fc42799--239) |

失败证据：

```text
Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

  270834 pixels (ratio 0.18 of all image pixels) are different.

  Snapshot: reference-ai-copilot-overlay.png

Call log:
[2m  - Expect "toHaveScreenshot(reference-ai-copilot-overlay.png)" with timeout 5000ms[22m
[2m    - verifying given screenshot expectation[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - 270834 pixels (ratio 0.18 of all image pixels) are different.[22m
[2m  - waiting 100ms before taking screenshot[22m
[2m  - taking page screenshot[22m
[2m    - disabled all CSS animations[22m
[2m  - waiting for fonts to load...[22m
[2m  - fonts loaded[22m
[2m  - captured a stable screenshot[22m
[2m  - 270834 pixels (ratio 0.18 of all image pixels) are different.[22m

```


## frontend/tests/visual/pages/ai-copilot.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the centered dialog on the home route | [http://127.0.0.1:3891/?copilot=open](http://127.0.0.1:3891/?copilot=open) | [查看原图](screenshots/ai-copilot--AI-Copilot-dialog-visual-renders-the-centered-dialog-on-the-home-route--44c62e32369cb341c224b2649bb32c5461ef0915a3028f624f953bce1deec87a.png) | `28fb1c55d3320343a241-38b19dd11df599353866` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fai-copilot.spec.ts--28fb1c55d3320343a241-38b19dd11df599353866--240) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByRole('dialog')
Expected substring: [32m"你的个人创作 Copilot"[39m
Received string:    [31m"AI 助手AI 助手描述你的目标，我来帮你规划下一步新对话历史记录未关联项目 · 输入 @ 引用一个项目在画布中打开描述你的目标，我来帮你规划下一步试试「基于最近评论出 5 个选题」，或用下方推荐指令开聊。添加文件或图片也可拖到这里；图片识别效果取决于当前模型分析机会生成脚本寻找素材生成图片素材生成视频素材生成封面发布复盘⌘/Ctrl ↩ 发送 · Enter 换行清空生成按 Esc 关闭 · ↑↓ 切换 · Enter 执行"[39m
Timeout: 5000ms

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for getByRole('dialog')[22m
[2m    14 × locator resolved to <div role="dialog" tabindex="-1" aria-modal="true" aria-label="AI 助手" data-slot="overlay-panel" data-overlay-panel="copilot" class="relative z-10 flex max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] flex-none flex-col gap-3 overflow-hidden rounded-2xl bg-surface p-6 text-foreground shadow-2xl focus:outline-none">…</div>[22m
[2m       - unexpected value "AI 助手AI 助手描述你的目标，我来帮你规划下一步新对话历史记录未关联项目 · 输入 @ 引用一个项目在画布中打开描述你的目标，我来帮你规划下一步试试「基于最近评论出 5 个选题」，或用下方推荐指令开聊。添加文件或图片也可拖到这里；图片识别效果取决于当前模型分析机会生成脚本寻找素材生成图片素材生成视频素材生成封面发布复盘⌘/Ctrl ↩ 发送 · Enter 换行清空生成按 Esc 关闭 · ↑↓ 切换 · Enter 执行"[22m

```


## frontend/tests/visual/pages/analytics-review.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the analytics review structure on the /projects/:projectId/review route | [http://127.0.0.1:3891/projects/project-podcast-launch/review](http://127.0.0.1:3891/projects/project-podcast-launch/review) | [查看原图](screenshots/analytics-review--Analytics-Review-page-renders-the-analytics-review-structure-on-the-proj--760d2711e0efff5be687c26e6540ffd88a3a94687f54cfdbf833467c2beb9a0b.png) | `5845c0740f3c8ad28d95-12dd4969627bec187e38` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fanalytics-review.spec.ts--5845c0740f3c8ad28d95-12dd4969627bec187e38--241) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  locator('[data-slot="header-stage-stepper"] li')
Expected: [32m6[39m
Received: [31m2[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="header-stage-stepper"] li')[22m
[2m    14 × locator resolved to 2 elements[22m
[2m       - unexpected value "2"[22m

```


## frontend/tests/visual/pages/assets.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the assets structure on the /assets route | [http://127.0.0.1:3891/assets](http://127.0.0.1:3891/assets) | [查看原图](screenshots/assets--Assets-Center-page-renders-the-assets-structure-on-the-assets-route--5f6852924a91f5d46ea4784bbc2a7ddd577b194c23d95263e6c94d7af9b783b6.png) | `3ca8bcbc0a4850866990-69fde517b3ad618b5237` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fassets.spec.ts--3ca8bcbc0a4850866990-69fde517b3ad618b5237--242) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  locator('main[data-page="assets"]')
Expected: [32m1[39m
Received: [31m0[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="assets"]')[22m
[2m    14 × locator resolved to 0 elements[22m
[2m       - unexpected value "0"[22m

```


## frontend/tests/visual/pages/dashboard.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the action-queue structure on the root route | [http://127.0.0.1:3891/](http://127.0.0.1:3891/) | [查看原图](screenshots/dashboard--今日台-page-renders-the-action-queue-structure-on-the-root-route--70a0f63646586326b9054f3fc183dcb4042ed4ed53c1ba28bf6c87080da3a249.png) | `08752b806088b402ee77-f2c07842ceda70adfa03` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fdashboard.spec.ts--08752b806088b402ee77-f2c07842ceda70adfa03--243) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="today-queue"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="today-queue"]')[22m

```


## frontend/tests/visual/pages/experience.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the adjudication workbench on the /experience route | [http://127.0.0.1:3891/experience](http://127.0.0.1:3891/experience) | [查看原图](screenshots/experience--经验裁决台-page-renders-the-adjudication-workbench-on-the-experience-route--31ea7d9931066ebdeac74e85ba704662f1e317634154e0cd0719863828d55b32.png) | `aa75ce3727329a3caff4-68d02abff100af42ad0c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fexperience.spec.ts--aa75ce3727329a3caff4-68d02abff100af42ad0c--244) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed

Locator: locator('[data-slot="header-page-heading"]')
Expected substring: [32m"经验沉淀"[39m
Received string:    [31m""[39m
Timeout: 5000ms

Call log:
[2m  - Expect "toContainText" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="header-page-heading"]')[22m
[2m    14 × locator resolved to <div class="min-w-0 flex-1" data-slot="header-page-heading"></div>[22m
[2m       - unexpected value ""[22m

```


## frontend/tests/visual/pages/intelligence-dark.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | 窄桌面单栏、宽桌面三栏，暗色侧栏取主题 token | [http://127.0.0.1:3891/intelligence](http://127.0.0.1:3891/intelligence) | [查看原图](screenshots/intelligence-dark--T-520-内容雷达暗色与响应式结构-窄桌面单栏-宽桌面三栏-暗色侧栏取主题-token--7252798dd5d6e5dc864cd0e478fb34f320ff501a2a522c75aa786133af4e8e09.png) | `2867fbe2375a67059685-054dcaceb0a207286b39` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fintelligence-dark.spec.ts--2867fbe2375a67059685-054dcaceb0a207286b39--245) |
| PASS | 来源弹窗可滚动、选项换行，关键操作不依赖 hover | [http://127.0.0.1:3891/intelligence](http://127.0.0.1:3891/intelligence) | [查看原图](screenshots/intelligence-dark--T-520-内容雷达暗色与响应式结构-来源弹窗可滚动-选项换行-关键操作不依赖-hover--fd53d0b48413881e37a05f346dda18b36a8e53d9d083256c41ee121094798da3.png) | `2867fbe2375a67059685-cdc1e93977e48e96dfe3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fintelligence-dark.spec.ts--2867fbe2375a67059685-cdc1e93977e48e96dfe3--246) |
| PASS | 最小桌面宽度仍能看到并操作两个筛选和排序 | [http://127.0.0.1:3891/intelligence](http://127.0.0.1:3891/intelligence) | [查看原图](screenshots/intelligence-dark--T-622-内容雷达筛选排序真机布局-最小桌面宽度仍能看到并操作两个筛选和排序--4f62dad3d77a9067c5e776737ec315227b9f4e620261da2f6c92056f114f1506.png) | `2867fbe2375a67059685-d63be6762a54ca8df7a4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fintelligence-dark.spec.ts--2867fbe2375a67059685-d63be6762a54ca8df7a4--247) |

## frontend/tests/visual/pages/knowledge.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the knowledge structure on the /knowledge route | [http://127.0.0.1:3891/knowledge](http://127.0.0.1:3891/knowledge) | [查看原图](screenshots/knowledge--Knowledge-Memory-page-renders-the-knowledge-structure-on-the-knowledge-r--6e8b4b45568e0fa6f4f0b1e482d68d29ccdea2046064d5b73fc4978a10197960.png) | `486fbb919734504a83c7-e2455cceb299cd7a8401` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fknowledge.spec.ts--486fbb919734504a83c7-e2455cceb299cd7a8401--248) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed

Locator:  locator('main[data-page="knowledge"]')
Expected: [32m1[39m
Received: [31m0[39m
Timeout:  5000ms

Call log:
[2m  - Expect "toHaveCount" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="knowledge"]')[22m
[2m    14 × locator resolved to 0 elements[22m
[2m       - unexpected value "0"[22m

```


## frontend/tests/visual/pages/new-project-overlay.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the centered dialog on the /projects/new route | [http://127.0.0.1:3891/projects/new](http://127.0.0.1:3891/projects/new) | [查看原图](screenshots/new-project-overlay--New-Project-overlay-visual-renders-the-centered-dialog-on-the-projects-n--7f1a0143e79c83d90b11d9273f268352dffc9db6035942118df1c75ac2e4fb6a.png) | `cdf8d96ff0f0354eb3ea-e776a5b65f350776c2a5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fnew-project-overlay.spec.ts--cdf8d96ff0f0354eb3ea-e776a5b65f350776c2a5--249) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-testid="new-project-platform"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-testid="new-project-platform"]')[22m

```


## frontend/tests/visual/pages/planning.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the planning workspace structure on the /projects/:projectId/planning route | [http://127.0.0.1:3891/projects/project-ainativebrowser#topic](http://127.0.0.1:3891/projects/project-ainativebrowser#topic) | [查看原图](screenshots/planning--Planning-Workspace-page-renders-the-planning-workspace-structure-on-the---98283a3568b658da663d7858a6078ac2d65beecd8d7789a8464917ef7b492131.png) | `f8cfcf2db64f7909e0f4-163824a128add2abd2e8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fplanning.spec.ts--f8cfcf2db64f7909e0f4-163824a128add2abd2e8--250) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="app-top-header"]').getByRole('button', { name: /进入下一步:脚本撰写/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="app-top-header"]').getByRole('button', { name: /进入下一步:脚本撰写/ })[22m

```


## frontend/tests/visual/pages/project-overview.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the project overview structure on the /projects/:projectId route | [http://127.0.0.1:3891/projects/project-ainativebrowser](http://127.0.0.1:3891/projects/project-ainativebrowser) | [查看原图](screenshots/project-overview--Project-Overview-page-renders-the-project-overview-structure-on-the-proj--e5298a89801de88a2600cdd073f7aef6f67f8bad72a9cbbebd429b46fa670262.png) | `4ac99b6fcdaedef03bac-854dd39dd6bf6f3b2401` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fproject-overview.spec.ts--4ac99b6fcdaedef03bac-854dd39dd6bf6f3b2401--251) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByRole('heading', { name: /AI Native Browser 深度解析/, level: 1 })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for getByRole('heading', { name: /AI Native Browser 深度解析/, level: 1 })[22m

```


## frontend/tests/visual/pages/projects.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the projects structure on the /projects route | [http://127.0.0.1:3891/projects](http://127.0.0.1:3891/projects) | [查看原图](../t1208/20261011-before-budget-recheck/screenshots/47bced0f749f14ba-projects--Projects-page-renders-the-projects-structure-on-the-projects-route--77992f0b5dc6fabfacda239bbd9353e1bbd14a5bf97743cb1091f8a31ca9a749.png) | `64da6a2a1195bf8d4630-154c16becb295f2f1bbd` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fprojects.spec.ts--64da6a2a1195bf8d4630-154c16becb295f2f1bbd--252) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="app-top-header"]').getByRole('button', { name: '筛选项目' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="app-top-header"]').getByRole('button', { name: '筛选项目' })[22m

```


## frontend/tests/visual/pages/publishing-center.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the publishing center structure on the /publishing route | [http://127.0.0.1:3891/publishing](http://127.0.0.1:3891/publishing) | [查看原图](screenshots/publishing-center--Publishing-Center-page-renders-the-publishing-center-structure-on-the-pu--334a0d240a8d44e234b6f82885f09da1cebc7a835476eb60edc22524e55f6216.png) | `039546c8f0ec20a3f27b-2fa2cc55cab19ccd83b4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fpublishing-center.spec.ts--039546c8f0ec20a3f27b-2fa2cc55cab19ccd83b4--253) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('main[data-page="publishing-center"]').locator('[data-slot="content-type-tabs"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="publishing-center"]').locator('[data-slot="content-type-tabs"]')[22m

```


## frontend/tests/visual/pages/publishing-workspace.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the publishing workspace structure on the /projects/:projectId/publishing route | [http://127.0.0.1:3891/projects/project-ainativebrowser#publish](http://127.0.0.1:3891/projects/project-ainativebrowser#publish) | [查看原图](screenshots/publishing-workspace--Publishing-Workspace-page-renders-the-publishing-workspace-structure-on---9b780ce699a5714bf953ea9865c4b2aaf74606a3bcb05ed1afc242492bbe9859.png) | `071504da32e44d1f8ae6-322b18ca0537553c3984` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fpublishing-workspace.spec.ts--071504da32e44d1f8ae6-322b18ca0537553c3984--254) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="app-top-header"]').getByRole('button', { name: /查看数据/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="app-top-header"]').getByRole('button', { name: /查看数据/ })[22m

```


## frontend/tests/visual/pages/research.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the research workspace structure on the /projects/:projectId/research route | [http://127.0.0.1:3891/projects/project-ainativebrowser#topic](http://127.0.0.1:3891/projects/project-ainativebrowser#topic) | [查看原图](screenshots/research--Research-Workspace-page-renders-the-research-workspace-structure-on-the---dfb85255f4e8396a67428dfc31d8e865b256334f3343797d76f8f6c1d21bee77.png) | `c0258ca7683e14b83393-c8ef5c408deb4b2bcc5c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fresearch.spec.ts--c0258ca7683e14b83393-c8ef5c408deb4b2bcc5c--255) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="app-top-header"]').getByRole('button', { name: /进入下一步:策划构思/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="app-top-header"]').getByRole('button', { name: /进入下一步:策划构思/ })[22m

```


## frontend/tests/visual/pages/script.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the script workspace structure on the /projects/:projectId/script route | [http://127.0.0.1:3891/projects/project-ainativebrowser#script](http://127.0.0.1:3891/projects/project-ainativebrowser#script) | [查看原图](screenshots/script--Script-Workspace-page-renders-the-script-workspace-structure-on-the-proj--483f2a859978b96d9ce9280b5be1e5f388d4b00b0fcaf0e22e334a82857342a6.png) | `218f11ee2f19ca4695b9-10f44b74cbb3e6a383c8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fscript.spec.ts--218f11ee2f19ca4695b9-10f44b74cbb3e6a383c8--256) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: locator('[data-slot="app-top-header"]').getByRole('button', { name: /进入下一步:拍摄制作/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('[data-slot="app-top-header"]').getByRole('button', { name: /进入下一步:拍摄制作/ })[22m

```


## frontend/tests/visual/pages/search.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the global search structure on the /search route | [http://127.0.0.1:3891/search](http://127.0.0.1:3891/search) | [查看原图](screenshots/search--Global-Search-page-renders-the-global-search-structure-on-the-search-rou--4220a045dec21155780da3c7011253574d351f5d9b6952a87946596b1a34ec29.png) | `46061a80166742056f87-1d0ca41f47552c85feb5` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fsearch.spec.ts--46061a80166742056f87-1d0ca41f47552c85feb5--257) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator:  locator('main[data-page="search"]').locator('[data-slot="project-result-section"]')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
[2m  - Expect "toBeVisible" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="search"]').locator('[data-slot="project-result-section"]')[22m
[2m    14 × locator resolved to <div data-slot="project-result-section" class="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-3"></div>[22m
[2m       - unexpected value "hidden"[22m

```

| FAIL | URL ?q=... is reflected in the search input value | [http://127.0.0.1:3891/search?q=AI](http://127.0.0.1:3891/search?q=AI) | [查看原图](screenshots/search--Global-Search-page-URL-q-is-reflected-in-the-search-input-value--00320e2d5b00d4e893b625313982f5ceb4c7cc6c06876373d46bc631e0560d3c.png) | `46061a80166742056f87-39c67a46bae4d339d917` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fsearch.spec.ts--46061a80166742056f87-39c67a46bae4d339d917--258) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveValue[2m([22m[32mexpected[39m[2m)[22m failed

Locator: locator('main[data-page="search"]').locator('[data-slot="search-page-input"]')
Expected: [32m"AI"[39m
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toHaveValue" with timeout 5000ms[22m
[2m  - waiting for locator('main[data-page="search"]').locator('[data-slot="search-page-input"]')[22m

```


## frontend/tests/visual/pages/settings.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| FAIL | renders the settings structure on the /settings route | [http://127.0.0.1:3891/settings](http://127.0.0.1:3891/settings) | [查看原图](screenshots/settings--Settings-page-renders-the-settings-structure-on-the-settings-route--4b5fa63afb60846c1db241591f2d272fc5827b46b713fff0d5b076b732701f48.png) | `1c39bb2c189c4131152c-70b31086f0a6414fdf6e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Fvisual%2Fpages%2Fsettings.spec.ts--1c39bb2c189c4131152c-70b31086f0a6414fdf6e--259) |

失败证据：

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed

Locator: getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')
Expected: [32m"/settings"[39m
Timeout: 5000ms
Error: element(s) not found

Call log:
[2m  - Expect "toHaveAttribute" with timeout 5000ms[22m
[2m  - waiting for getByRole('navigation', { name: '主要导航' }).locator('[aria-current="page"]')[22m

```


## frontend/tests/accessibility/all-pages.spec.ts

| 状态 | 用例 | URL | 截图 | Test ID | 历史运行记录 |
|---|---|---|---|---|---|
| PASS | dashboard (/) has a single h1 and all controls are named | [http://127.0.0.1:3892/](http://127.0.0.1:3892/) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-dashboard-has-a-single-h1-and-all-controls---58dd16c9c2f00bd6cb2b21b6bb3fabb71b807cf0c2d1f9f58779b1d3d1927b9d.png) | `d9c4c0f61b73d0d5a1d9-73c4d270ed4f245faa89` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-73c4d270ed4f245faa89--260) |
| PASS | projects (/projects) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects](http://127.0.0.1:3892/projects) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-projects-projects-has-a-single-h1-and-all-c--bc0c3b2f6b25999c53406ed3b9515cbc322893ce83c30b5c4cf043622b1dfd62.png) | `d9c4c0f61b73d0d5a1d9-85fe79011ac2900b75c8` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-85fe79011ac2900b75c8--261) |
| PASS | project-overview (/projects/ai-native-browser) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/ai-native-browser](http://127.0.0.1:3892/projects/ai-native-browser) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-project-overview-projects-ai-native-browser--0c1716c89d47123b67a3fed57f578c7591809ab1a77d311473879e586422304d.png) | `d9c4c0f61b73d0d5a1d9-8c6ad7e28c012e0e9370` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-8c6ad7e28c012e0e9370--262) |
| PASS | research-workspace (/projects/ai-native-browser/research) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/ai-native-browser/research](http://127.0.0.1:3892/projects/ai-native-browser/research) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-research-workspace-projects-ai-native-brows--b46da0448af0e4a00f3a4c003ecbbd0e40fe70f5b748d3ef7f35cb0460677051.png) | `d9c4c0f61b73d0d5a1d9-f9c2e3ecba6587b5e5c4` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-f9c2e3ecba6587b5e5c4--263) |
| PASS | planning-workspace (/projects/ai-native-browser/planning) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/ai-native-browser/planning](http://127.0.0.1:3892/projects/ai-native-browser/planning) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-planning-workspace-projects-ai-native-brows--a01a736abec4780601113ea9a55b75207f897e4ee92d697441cc3d038b648077.png) | `d9c4c0f61b73d0d5a1d9-d7b3cde4e8456a0f96ad` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-d7b3cde4e8456a0f96ad--264) |
| PASS | script-workspace (/projects/ai-native-browser/script) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/ai-native-browser/script](http://127.0.0.1:3892/projects/ai-native-browser/script) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-script-workspace-projects-ai-native-browser--5e4d8475ff1209582c8007d17fd67fc938071517c264c5f451e631b03b009fb1.png) | `d9c4c0f61b73d0d5a1d9-261fc20e9e5547e21a67` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-261fc20e9e5547e21a67--265) |
| PASS | publishing-workspace (/projects/ai-native-browser/publishing) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/ai-native-browser/publishing](http://127.0.0.1:3892/projects/ai-native-browser/publishing) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-publishing-workspace-projects-ai-native-bro--9b62ddac137a6e0b3f120478be000abd533c417216cc0b087e5eb5831870ea50.png) | `d9c4c0f61b73d0d5a1d9-8d642b05e9afe3d6df8c` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-8d642b05e9afe3d6df8c--266) |
| PASS | analytics-review (/projects/ai-native-browser/review) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/ai-native-browser/review](http://127.0.0.1:3892/projects/ai-native-browser/review) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-analytics-review-projects-ai-native-browser--8794907f8ba9a6c28be8775e50f393caef7921850956e786dd9746e31cec3828.png) | `d9c4c0f61b73d0d5a1d9-9b0d81ed70bbaca5c01e` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-9b0d81ed70bbaca5c01e--267) |
| PASS | knowledge (/knowledge) has a single h1 and all controls are named | [http://127.0.0.1:3892/knowledge](http://127.0.0.1:3892/knowledge) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-knowledge-knowledge-has-a-single-h1-and-all--319d9bff7236c155253fa25345d8d8429a264d5057d525cd129e23d6d98439e1.png) | `d9c4c0f61b73d0d5a1d9-beb5204ac7a45770c954` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-beb5204ac7a45770c954--268) |
| PASS | assets (/assets) has a single h1 and all controls are named | [http://127.0.0.1:3892/assets](http://127.0.0.1:3892/assets) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-assets-assets-has-a-single-h1-and-all-contr--e909119edf45f8e28163c252502cc4354a8f940bec1b4cd8c2a032e460b4570d.png) | `d9c4c0f61b73d0d5a1d9-6324b21dfb08e6811364` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-6324b21dfb08e6811364--269) |
| PASS | publishing-center (/publishing) has a single h1 and all controls are named | [http://127.0.0.1:3892/publishing](http://127.0.0.1:3892/publishing) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-publishing-center-publishing-has-a-single-h--4ab01b19ef59f98696c1099a4bb8110527b4c14946b8e8fa0d62ae400a1ad4ce.png) | `d9c4c0f61b73d0d5a1d9-c333bbf87ceeb5c83ba1` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-c333bbf87ceeb5c83ba1--270) |
| PASS | experience (/experience) has a single h1 and all controls are named | [http://127.0.0.1:3892/experience](http://127.0.0.1:3892/experience) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-experience-experience-has-a-single-h1-and-a--667f5de36e90b7aa217c9540d4f5e1a6cb30feb9096febdeaba27f56850ecd70.png) | `d9c4c0f61b73d0d5a1d9-2a16ac3b63dd47fbc9a9` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-2a16ac3b63dd47fbc9a9--271) |
| PASS | search (/search) has a single h1 and all controls are named | [http://127.0.0.1:3892/search](http://127.0.0.1:3892/search) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-search-search-has-a-single-h1-and-all-contr--060c4e0bc258bc9a4245fe03cfbecf7a119dc1d6a9b15435801bc601ecb46e3b.png) | `d9c4c0f61b73d0d5a1d9-2f914b56a71dca167acf` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-2f914b56a71dca167acf--272) |
| PASS | settings (/settings) has a single h1 and all controls are named | [http://127.0.0.1:3892/settings](http://127.0.0.1:3892/settings) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-settings-settings-has-a-single-h1-and-all-c--f3a5ae7f3476105d8d3e7ba6a136d8ad7d17b539231f94d2cc8dfc4910012ac0.png) | `d9c4c0f61b73d0d5a1d9-00c19154462a95d559d3` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-00c19154462a95d559d3--273) |
| PASS | new-project-overlay (/projects/new) has a single h1 and all controls are named | [http://127.0.0.1:3892/projects/new](http://127.0.0.1:3892/projects/new) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-new-project-overlay-projects-new-has-a-sing--ba463a5b2faaf02f83a73498a705ecb4b90cc5bf111627042cc23148d611ef9d.png) | `d9c4c0f61b73d0d5a1d9-cc9c9a26f6136eeaff74` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-cc9c9a26f6136eeaff74--274) |
| PASS | ai-copilot-overlay (/?copilot=open) has a single h1 and all controls are named | [http://127.0.0.1:3892/?copilot=open](http://127.0.0.1:3892/?copilot=open) | [查看原图](screenshots/all-pages--Accessibility-matrix-Task-26-ai-copilot-overlay-copilot-open-has-a-singl--6cc55038611c5c6e90e8be718806c6ed126bbafa1666d1622d05d503e04e3bd9.png) | `d9c4c0f61b73d0d5a1d9-61b57ca79955e158a998` | [查看记录](E2E-GALLERY.html#record-frontend%2Ftests%2Faccessibility%2Fall-pages.spec.ts--d9c4c0f61b73d0d5a1d9-61b57ca79955e158a998--275) |
