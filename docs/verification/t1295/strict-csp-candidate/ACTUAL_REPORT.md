# T1295 双视口严格 CSP 当场报告

正式命令真实 exit 0；Chrome 的 desktop（1536×1024）与 compact（640×450）各 1 PASS、retry 0。运行 Main HEAD `6f75509fc715045035559d622c3fc9ffd932e16f`，正式 runner/config 与候选冻结摘要完全一致。正式 spec 与固定 CSP/native 输入运行前后摘要相同。历史候选 NOT_RUN、原黑片及所有 V1/V2/V3 证据未覆盖。

```bash
node docs/verification/t1295/run-strict-csp.cjs . docs/verification/t1295/browser/v3-native-ui-candidate/owned-normal-binding.json
```

实际原始结果：`docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/summary.json`。两个 child invocation 各有独占 evidenceRoot；desktop 用例 1.4 秒（Playwright 2.7 秒），compact 用例 1.4 秒（Playwright 2.4 秒）。每次确切选中正式 page-origin 一例，没有启动公共 V1/V2/V3，没有创建业务数据或模型任务。

| 当场核验 | desktop | compact |
| --- | --- | --- |
| 真实 HTTP release CSP 下 page-origin WASM answer | 42 | 42 |
| page-origin eval / Function | 均 EvalError，2 条 CSP violation | 均 EvalError，2 条 CSP violation |
| native load / seek | version31 / tick60000，无 native errors | version31 / tick60000，无 native errors |
| 实际导出并完整解码 | 203930B，H264 640×360，24fps / 48帧 / 2秒 | 同规格 203930B |
| AAC 音轨 | 44100Hz，2.089796秒，RMS 0.122297831 | 同左 |
| 0.5秒解码帧非暗像素比例 | 0.999995660 | 0.999995660 |
| 退出与关闭 | driver/worker/8 Chrome PID 均退出、63606端口关闭 | driver/worker/8 Chrome PID 均退出、63648端口关闭 |

AAC 时长如实包含编码 padding，未冒称精确 2 秒。两个 MP4 容器摘要不同，实际解码帧 RGB 摘要相同；各原文件摘要完整保存在 ACTUAL_BINDING，不要求跨导出容器字节相等。

已实际查看两个 `native-preview.png` 及 compact 的 `native-export-frame.png`：原生界面呈现彩色测试素材、媒体项和 clip 时间轴，导出帧确有彩色内容。desktop 全页截图 1536×1024；compact 全页截图 640×890，来自配置的 640×450 CSS viewport，保留正常滚动，不是 html CSS zoom，也不代签所有编辑控件同屏或完整响应式 UX。

![desktop 原生预览](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/desktop/native-preview.png)

![compact 原生预览（全页含滚动区域）](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1295/browser/runs/strict-csp-b36a4d60c398dd07/compact/native-preview.png)

两个正式 afterAll 均记录 browserConnected=false、serverListening=false、serverClosed=true。runner 进一步真实核对所有原 PID/监听端口已退出，再按 UID/task/nonce/sourceRoot/源片摘要校验删除两个独占临时目录，共 1,122,164B。原证据全部保留。两次网络记录均只有静态 GET，`/api/` 为 0。未启动 Next，未关闭或操作用户 App，未提交模型/资金请求；旧 owned marker 仅用于真实归属约束，不冒充 worker/DB 新验收。

本报告仅覆盖 Chrome 与正式 release CSP 字节的静态原生音画链，不证明 WebKit、安装包或 SwiftShader。原 SwiftShader 黑片失败、原 CSS zoom 失败、完整公共 V1/V2/V3 报告均保持原结论；frontend-validation 控制收据和最终任务状态由 Root 单独办理。
