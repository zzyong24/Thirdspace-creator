# T1295 实际浏览器、原生内核及公共视频链结果

结论：当前正式 CSP 的专用 WASM 许可已在实际 HTTP 页面中生效，JS eval/Function 仍被拒；标准系统 Chrome 的真实 native 模块、合法音画预览和导出通过；原公开上传→制作→采纳→下载链也已取得可解码且非黑、非静音的实际产物。**这不代表安装包或原生 App 验收完成。** bundled Chromium 的软件 GPU 路径仍有真实黑片 FAIL，保留且未冒充修复。

只写本目录及本代理唯一临时目录。未修改 Main 生产/正式测试/控制面，未调用模型、充值或原用户任务，未操作原生 App。Root 当前62653服务已通知可关闭换 fresh DB；本代理没有停止 Root 服务。

## 真实执行与保留失败

| 执行目录 | 实际结果 | 含义 |
|---|---|---|
| baseline-78fb7751d626 | exit1，1 FAIL | 精确 HEAD 原策略，页面 WASM CompileError；eval/Function 均拒绝，未创建公共任务 |
| current-c553b3b99da6 | exit1，1 FAIL / 1未运行 | 初版自建原生夹具缺 scene.bookmarks，真实 React filter 错误；保留，按原 schema 补 `[]` |
| current-299f98874253 | exit1，1 FAIL / 1未运行 | 测试导出链接无文字、不可点击；真实导出已返回，修夹具链接，未改产品 |
| current-220daba9b615 | exit1，1 FAIL / 1未运行 | bundled Chromium 原生导出是真黑片，非黑断言拒绝通过 |
| current-71f3bd521021 | exit0，1 PASS，59.6秒 | 独立公共 V1 原片制作完整链，通过下载、解码、画面与音频检查 |
| current-4a708c952f96 | exit0，1 PASS，2.5秒 | 系统 Chrome/Metal 原生预览及导出通过，第一次 GPU 对照 |
| current-ebeccb70a24e | exit1，1 FAIL，1.4秒 | 同诊断夹具 bundled Chromium/SwiftShader 再现黑片；输入及 H264 解码支持正常 |
| current-d25e2dbf227b | exit0，1 PASS，2.1秒 | 标准系统 Chrome，移除额外 WebGPU flag 后仍通过 |
| baseline-0ce566e24f53 | exit1，1 FAIL，396毫秒 | 同标准 Chrome、精确原 HEAD CSP 再现 WASM 拒绝；JS负例仍成立 |
| current-4880c2e38c31 | exit0，1 PASS，1.7秒 | 最终候选字节，标准 Chrome 无额外 GPU flag；真实 native 音画通过，并显式 browser.close、PID/端口闭合 |

每轮使用新 evidence 和新 UID/nonce 临时目录，不覆盖旧结果；retry0、worker1。不同轮不是对原业务 unknown 重发；前面 native 失败轮均未进入公共业务，公共链只实际创建一次。

## CSP 正负例是真实页面代码

baseline 从 `git show HEAD:frontend/scripts/desktop/desktop-csp.mjs` 的准确原字节读取，未回改生产。current 从当前正式 owner 直接 import，再经 `desktopReleaseHeaders({CREATOROS_DESKTOP:'1',CREATOROS_SIDECAR_SIGNING_REQUIRED:'1'})` 核同一值。每轮实际 HTTP response 带完整 header；测试读取并严格相等。

页面自己的 `/probe.js` 调用 WebAssembly.compile/instantiate 并执行 `answer()===42`，不是8字节空模块。页面自己的 eval 与 Function 分别记录 `EvalError`；自动化只读取结果，不通过 CDP 动态求值证明 CSP。原策略中 WASM 抛 CompileError，当前策略返回42；JS动态求值在两者都拒绝。其它 directive 不由本代理修改。

本轮服务是隔离随机 loopback 的验证载体，不冒充生产 release Next 或最终安装包。其 native.js/native.css 直接读取正式 public 字节，native.js 与 canonical SHA 相等。公共 preview HTML 来自真实业务接口，代理只把62653同源 origin机械改为验证 origin，并只 relay GET /api 媒体读；该 preview 确实在同 release CSP 下播放。Root 原开发 Next 自身没有 release CSP，不拿它冒证据。

## 真实 native 与黑片对照

最终 current-4880 的 module import 在页面脚本内完成，实际内嵌 WASM 初始化后，调用正式 mount、version31 load、context、seek、export。夹具只含本轮自生成2秒640×360/24fps H264+880Hz AAC片；owner、mediaId、File与文档绑定一致。document tick使用内核真实120000 ticks/秒，片段 duration/sourceDuration=240000，trimStart/trimEnd=0。scene.bookmarks 及 main/overlay/audio 结构按真实归档 schema。没有换假模块、改内核或复用旧素材/原ID。

最终 native MP4为203930 bytes，视频48帧、24fps、2.000000秒，音轨AAC/44100Hz/2.089796秒；完整解码通过，0.5秒画面非暗比例0.99999566，音频RMS0.12229783。native AAC尾长如实保留，不裁原音，不声称音轨精确2秒。真实原生画布截图已看，显示合成彩色画面。

黑片不是输入损坏或已证明的H264不支持：原clip ffmpeg解码非暗比例1，浏览器HTMLVideo抽帧非暗比例1，VideoDecoder.isConfigSupported(H264)=true。相同文档/媒体在系统Chrome的Apple M2 Pro ANGLE Metal下成功；bundled Chromium的SwiftShader/SwANGLE下仍导出黑画面，SystemInfo显示GPU compositing/webgl/webgpu为软件不可用。两份环境证据、MP4和黑片断言保留。

准确边界：当前证据支持“软件GPU环境相关”，**没有证明具体 native 代码行是根因，也没有证明该软件路径已修复**。归档内 `gpu-renderer.ts` 仅把 initializeGpu 成败记入 gpuAvailable；`native-controller.ts` load设置degraded，`canvas-renderer.ts` 仍经 wasm-compositor提交帧，后者持有实际输出canvas/纹理。若要修这一路，需要先对这些实际owner与wasm内部纹理上传建立更窄证据并追加SPEC/独审；本轮不扩生产写集、不跳过黑片断言。标准Chrome通过也不代签WebKit/Tauri或无GPU机器。

## 公共制作真实回执

本轮独占对象：group `grp-b606c51c-393`、project `project-b606c51c-395`、output `output-b606c51c-406`。source上传/complete、materialLink、deterministic prepare/get均成功，probe.fileDigest与本轮生成clip SHA一致，hasAudio=true。保存的是既有合法 V1 纯原片族，没有伪装成V3原生文档。editor.get与preview/render/confirm之后原plan和revision仍相等。

原任务 `ai-task-b606c51c-441`，原requestId `7da2268b-ddd2-4107-857e-6902e4abb129`，原attempt `production-render-e73ae56f8c8e71c9e4446bf3770d2998be25e4bf119ff59db1eb9c2f68ab1322`。等待原任务达到awaiting_confirmation，读取同任务execution，再由原confirm采纳，随后下载实际asset；没有重发或更换任务。public-state.pending=null。manifest.visualReview真实为skipped/未配置视觉模型，确定性布局校验完成；没有为了验收启动新模型。

公共MP4为822308 bytes，视频H264/640×360/24fps/48帧/2.000000秒，AAC/48000Hz音轨2.000000秒；完整ffmpeg解码通过，画面非暗比例0.99958767、音频RMS0.08866851。实际preview视频ready、播放currentTime>0.1及截图均已取得，图像已看，不以HTTP200单独签制作成功。

## 资源、候选和剩余验收

`RESOURCE_CLOSURE.json`核全部10轮driver/worker PID均退出，全部owned监听端口关闭；最终记录的Chrome及renderer/GPU/network/audio等8个PID全部退出，browserConnected=false。仅删除已关闭、UID/task/nonce/hash一致的10个本代理临时目录中可再生source副本，共约5.6MB；原失败与全部证据产物保留。Root Next和用户App未触碰。

Root可审阅并应用唯一正式测试镜像 `mirror/frontend/tests/e2e/t1295-desktop-csp-wasm-video.spec.ts`。精确候选SHA、当前CSP/native/source与所有结果digests见 `DELIVERY_BINDING.json`。正式用例须带显式source/evidence/owned服务binding；推荐系统Chrome并绑定真实GPU/codec证据。尚未运行复制后的正式文件，当前全部实际结果来自同目录镜像，不代签正式测试落地。

正式复制前 Root 还需加安全发现 guard：只有三个 `T1295_SOURCE_ROOT`、`T1295_EVIDENCE_ROOT`、`T1295_SERVICE_BINDING` 同时显式存在才进入初始化/执行；普通 Playwright 发现只登记 skip，不在顶层读取路径或访问实例。正式文件可静态 import `test/expect`；所有 realpath/readFile/assert/server 创建需在 enabled 分支或其 beforeAll 内。只调用 `test.skip()` 后继续顶层初始化不足以闭合这个问题。此 guard 由 Root 应用及新fresh绑定正式路径复验，不冒称本代理现镜像已具备该 guard。

本轮 CSP/native 每轮 SHA 均有当场绑定且前后相同；公共业务运行使用已获授权的旧62653 owned实例，其原T1294 service binding不是这次 Worker 重建后的完整重新冻结。DELIVERY中的当前 Worker SHA仅为交付时只读快照，不能当成dispatch瞬间bundle精确身份。公共成功回执与产物真实有效，但正式字节闭合须由Root新fresh服务的正式两例复验补齐。

安装包真实release header、用户App的原制作场景及用户最终自验仍待Root打包安装流程完成；原生App自动化未执行。
