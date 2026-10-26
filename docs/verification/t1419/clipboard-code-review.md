# T1419 剪贴板专项独立代码审核

2026-10-26；只读独立会话，继承宿主模型（homogeneous），未核实具体型号；未实现本轮产品修复。HEAD `839d7f280282a0ae93bee79bcc9cdddb4dfff2ac`。本轮只写本文件，未运行测试、业务、系统剪贴板、浏览器或安装；审核绑定下方当前未提交文件字节。

## 结论

**静态实现范围 PASS：没有发现可证实的 blocker/major/P2 产品缺陷。** 当前用户手势内提交、保存后交付与原下载分支的实现符合本轮 SPEC。下述首轮指出的直接负向证据与前端类型检查收据已在追加复核中补齐，修复范围代码复核 PASS；全工作区类型检查与新版安装一次点击复制/系统剪贴板回读仍不由本报告代签。

## 实现核对

1. `writePreparedClipboard` 在首个 await 前完成 ClipboardItem 构造及 navigator.clipboard.write。prepare 通过 `Promise.resolve().then(prepare)` 推迟到 microtask；它不会在注册写入前执行异步保存。所有MIME表示共享同一 prepared Promise，不会因富文本/纯文本双表示重复保存或导出。顺序为 text/html→text/plain，图片为 image/png；子数据Promise验证 Blob 与精确MIME。
2. 同步构造/write抛错转为 writing 的拒绝；每个子数据Promise挂拒绝处理，最后 allSettled 同时接管 prepare、子数据与 writing。正常平台对拒绝数据产生的写失败及真正权限拒绝都有返回路径，调用组件也有 catch，不见未订阅子数据导致的悬空 rejected Promise。allSettled 会等原prepare任务结束才返回失败；没有因此新增无限重试或更改原任务预算。本轮未动态验证浏览器拒绝分支，不把静态分析说成实测。
3. NoteRelay 保留 prepareDelivery 结果检查、原 native handle、alive、投影/布局完整digest，原生 export 后再次核对；只有这些成功才构造可兑现数据。正文、HTML、图片复制改走Promise，原纯文本无ClipboardItem兼容分支继续 writeText。MIME与下载输入约束未放松。
4. Doocs 将原保存→正式稿回读/版本→原生snapshot→正文/布局核对→export-html→当前value/savedDocument/原handle核对封装为prepare，复制的HTML/纯文本均在该prepare成功后生成。窄化的 rendered.html/bindings 以返回对象保存，不使用类型断言跳过原运行检查。原 zip分支仍等待相同prepare，保留精确图片绑定、下载限制、版本manifest和交付前指纹核对。
5. 图文配文原save完整版本读回流程保留，save失败或组件卸载会拒绝；成功后才读取当前已确认稿构造text/plain。无ClipboardItem时沿用原writeText能力，不增加权限或读剪贴板。相邻Provider兼容改动已由上一份provider-code-review审核，本轮不重新扩范围。
6. 没有增加 clipboard-read、改系统权限、自动采纳或发布，也没有在失败时回退复制旧内容或提前显示成功。

## 测试与证据边界

- `clipboard-red.log` 是筛选执行：2失败、12跳过；失败命中“点击当下必须已调用write”。不能称14项无skip红测。`clipboard-green-first.log` 留有2失败/45通过，涉及既有测试尚按同步Blob读取等新协议适配；没有删除该失败记录。
- `clipboard-green.log` 实际3文件49项通过。新增NoteRelay成功/失败两分支检查write在点击返回前调用、prepare未兑现时无Blob、失败无原生export与交付；Doocs与图文新增用例分别覆盖真实宿主prepare延迟保存及其后数据兑现。测试用fake ClipboardItem/write，不等于WKWebView或系统剪贴板实测。
- **待补验收证据（非声称已复现的产品缺陷）**：新增剪贴板路径尚未直接覆盖“保存/原生export等待时改稿或卸载，已登记ClipboardItem的全部数据Promise拒绝、零内容兑现”。已有同类用例点击的是HTML/ZIP下载，不能原样代替新Promise链的负向。还未见“不订阅数据而直接reject的write/同步throw的ClipboardItem或write”测试证明无unhandled rejection、错误与busy正常收束。建议在现有组件或helper公开接口补最小必要用例，属于本次已审SPEC边界，不增新产品门。
- `clipboard-typecheck-rerun.log` 读取时只有next typegen成功文本；本报告未取得进程退出码/closed收据，因此没有把该轮类型检查判为已通过。记录文件SHA仅绑定本次读到的字节，后续自然结束可另补正式执行收据。
- 新包安装、切风格后首次点击复制、系统剪贴板HTML/PNG/文本内容和失败不覆盖原剪贴板均需原入口真实复验，不由静态代码PASS替代。

## 首轮文件SHA256绑定（保留原审核快照）

| 路径 | SHA256 |
|---|---|
| `frontend/src/features/reference-editors/write-prepared-clipboard.ts` | `3ea461d29941b656b7b3bf1eb3bf7c5b2cfee827a3cc11042a60416a58104b1e` |
| `frontend/src/features/reference-editors/noterelay/noterelay-editor.tsx` | `92ff2ca3437d192741b4b14823d8d8ad79d5bb543794ce63cddbe11d4b5793bb` |
| `frontend/src/features/reference-editors/noterelay/noterelay-editor.test.tsx` | `9817eccf5b6a72eca67a1346a2ac0dfdf06078e66393326f4ed988d5afdcaf66` |
| `frontend/src/features/article/doocs-article-editor.tsx` | `aacb4fdd9a06a3e22795a437f524fc3d7eaa5dcffe74ca0a49054bd24f22ae7c` |
| `frontend/src/features/article/doocs-article-editor.test.tsx` | `c88a6bcaa48e6002c91fa936c8ff7cc423b5d5d120309b78358ead7f0cd26a3f` |
| `frontend/src/features/projects/graphic-post-workbench.tsx` | `e2c7c065ff19be8a7ffbca07dfb042317d0337dd6cb9f837ff174810273d7613` |
| `frontend/src/features/projects/graphic-post-workbench.test.tsx` | `675834877d1b78af891d457b227fe4437d1feed89d8520d9020da4ede35f90e3` |
| `docs/features/t1419-article-workbench-style-restoration.md` | `e38e89860dd26f6ee9ba151bbde7400625dd704ce506def64abaa08c9bd52563` |
| `docs/verification/t1419/clipboard-red.log` | `fcbe6392aaf064037b4f7ec0cee83918615691c21701bb7be9a2c1d59ded53db` |
| `docs/verification/t1419/clipboard-green-first.log` | `0659981fdf5e70b1c5a15adc06e239bb025cfbd79332fafc9d5fd47896318c7b` |
| `docs/verification/t1419/clipboard-green.log` | `28904fed3d04b00cdcbe81669c2ec3c7d9e64d43ee176a00c17f3c1960f94b15` |
| `docs/verification/t1419/clipboard-typecheck-rerun.log` | `d194836fdb7301327cebf61c0ef6f58e07b4fdfecb926461248316937abce86e` |

## 负向补证复核（2026-10-26）

本轮只读核新增六项 NoteRelay 实际组件用例及父会话自然结束的运行收据，未重跑测试或操作剪贴板。首轮提及的测试/前端类型检查证据缺口已闭合；没有新增代码发现，修复范围 PASS。前文“待补”描述为首轮历史状态，以本节为当前补证结论。

- 改稿、换账号、卸载三族：实际点击组件复制按钮后取得已登记的 ClipboardItem text/html 数据 Promise，在原保存尚未完成时 rerender 当前稿、切真实账号上下文/owner，或卸载组件；然后兑现原保存并要求原数据 Promise 因“稿件已改变”拒绝，且零原生export、无复制成功提示。不是沿用下载按钮的断言；另一MIME表示来自同一个prepared失败，代码静态核实不会独立交付。
- 异步write拒绝、write同步throw、ClipboardItem构造同步throw三族：stub均不订阅数据，prepare另返回保存失败，组件最终显示原“保存尚未确认”错误，零export、无成功提示。helper子Promise显式catch和allSettled都保留；本轮日志没有悬空Promise报错。这组证明双重失败且浏览器不订阅数据时的收束，不冒充真实系统权限面板或“保存成功但OS拒绝”的安装实测。
- `clipboard-green-negative.log`：原组件完整3文件55项通过；`clipboard-checks.receipt.json` 绑定原命令与execSession50500、exitCode0。较前49项新增六项，未将两轮重复结果相加。
- 同一收据记录 `pnpm -C frontend typecheck`、execSession42476、exitCode0，补齐首轮仅有typegen日志而无退出收据的缺口。收据的 installedCopyAcceptance 仍为 pending。
- 全工作区typecheck尚在主线程执行，本报告不推断其终态。原WKWebView首次复制、系统HTML/图片/文本回读仍待新包验收；真实失败与原红测记录保留。

### 补证字节绑定与漂移检查

| 路径 | SHA256 | 说明 |
|---|---|---|
| `frontend/src/features/reference-editors/write-prepared-clipboard.ts` | `3ea461d29941b656b7b3bf1eb3bf7c5b2cfee827a3cc11042a60416a58104b1e` | 首轮已审字节保持 |
| `frontend/src/features/reference-editors/noterelay/noterelay-editor.tsx` | `92ff2ca3437d192741b4b14823d8d8ad79d5bb543794ce63cddbe11d4b5793bb` | 首轮已审字节保持 |
| `frontend/src/features/article/doocs-article-editor.tsx` | `aacb4fdd9a06a3e22795a437f524fc3d7eaa5dcffe74ca0a49054bd24f22ae7c` | 首轮已审字节保持 |
| `frontend/src/features/projects/graphic-post-workbench.tsx` | `e2c7c065ff19be8a7ffbca07dfb042317d0337dd6cb9f837ff174810273d7613` | 首轮已审字节保持 |
| `frontend/src/features/reference-editors/noterelay/noterelay-editor.test.tsx` | `9817eccf5b6a72eca67a1346a2ac0dfdf06078e66393326f4ed988d5afdcaf66` | 首轮已审字节保持 |
| `docs/verification/t1419/clipboard-green-negative.log` | `1d6d022edf9e7c4329af1c6df1c95fc064ea5b672d3fbc6f283e10d59e597afd` | 新增补证或完成日志 |
| `docs/verification/t1419/clipboard-checks.receipt.json` | `d7d3dcc2df141b2f1502007fffef17134b734d51da671cbba235a67fee3b0463` | 新增补证或完成日志 |
| `docs/verification/t1419/clipboard-typecheck-rerun.log` | `d194836fdb7301327cebf61c0ef6f58e07b4fdfecb926461248316937abce86e` | 首轮已审字节保持 |
