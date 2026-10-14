# T1274 最后代表族真实走查

2026-10-14，独立隔离作品 `output-5e3e4e95-61`，组 `grp-8a2fadb0-6`，项目 `project-8a2fadb0-8`，共享私有开发服务 `http://127.0.0.1:3919`。只写本证据目录，没有生产或控制面修改，没有调用模型/ASR，没有重发粗剪或触碰并行粗剪作品。使用已加载 product-to-code-orchestrator、oil-ui-pro、Playwright 指引。本轮不做审美打分，不签全产品或全局 Gate。

## 结果与边界

| 代表族 | 当场结果 | 口径 |
|---|---|---|
| UI 批量错误和保稿 | 8 条行号诊断、无 apply、输入完整保留、正式 DTO 不变；200%另一次7条诊断末项可滚动到达 | 真实 UI→公共 propose；不同错误数来自已采纳前后主轨 gap 不同 |
| 原样可选缺失媒体 | 浏览器对 B 音轨真实下载路径注入404，两次命中；警告可见、候选可播放/完整解码；公共采纳 rev3→4保完整保护集合 | **受控网络故障注入**，不是实际后端文件丢失；未删用户文件/数据库/效果 |
| 原生浏览器200% | Chrome 设置“网页缩放”选择200%；正常、候选播放、返回焦点可用 | 独立临时profile，CSS zoom=1、visualViewport.scale=1、DPR=2，非CSS/CDP缩放 |
| UI真实CAS冲突 | 原UI apply1次，真实409；并发合法save rev4→5，旧候选不写，原稿保留 | 受控HTTP发送窗口，不是先save后前端预检，也不是模型dirty |
| CAS只读恢复 | 同原Chrome会话/同request核对后receipt仍null，候选仍锁定，不能编辑/丢弃 | **FAIL恢复闭环**，已登记主流程T1285；原失败保留，未点重试 |
| 发送准备中新dirty | 原生工程名第一次修改真实save rev5→6；准备读取响应期间第二次普通修改；原响应放行后不发chat POST，原话/新dirty保留 | 原生元数据手工dirty代表族，非时间轴片段改动、非模型执行中dirty；保险拦截0次 |

## 夹具与正式写边界

`fixture.cjs` 使用公开 createOutput 创建独立作品，复制现有 rich plan 的完整场景/字幕/效果/独立音轨/媒体引用，移除不能跨作品直接写入的 nativeSources/sourceTranscripts 后公开保存；两媒体分别真实 prepare→probe→adopt（addWholeClip=false）获得本作品合法来源，到 revision3。没有伪造来源或转录。

`source201-before.json` 与 `source201-after.json` 完整相同且 revision6；原 source19、speech output721 及并行作品没有任何本轮修改请求。所有本轮正式写仅指向新 output61：夹具建立、缺失媒体候选采纳、并发合法保存与第一次dirty准备保存。`fixture-dispatch.jsonl`、`browser-dispatch.json`、`zoom-dispatch.json`、`dirty-dispatch.json`保留实际请求。

## 错误与缺失媒体

真实UI读取文字，把V1标题改为未知V999，并追加未知轨道/无归属行。响应8条错误逐条保留行号；UI显示“没有可采纳的改动”，原textarea与提交前完全相同，没有采纳按钮路径。截图`batch-errors.png`与`batch-errors-aria.txt`保留；多错误由面板滚动承载，不声称一屏同时显示所有项。

随后修正输入，仅移除主轨gap，保B源独立音轨原样。`family-media-b / asset-94c2affe-277 / afile-94c2affe-281`的下载URL仍由真实公共服务返回，仅此浏览器context对实际blob路径返回404；同素材在真实后端仍存在。原生初载提示“1个素材暂未读到”；真实候选预览提示“原有素材‘B源音频’暂不可用，预览已跳过该元素，工程仍保留原引用”。预览画面与控制条可达，普通点击播放，MP4完整解码exit0。

UI返回仍可见警告且保“已预览，待采纳”，随后明确点击公共采纳。读回 revision4 的目标scene完整等于候选，overlay/audio、非目标scene、mediaRefs、nativeSources与采用前逐字段相同；缺失音轨引用没有删掉，效果没有移除。证据`apply-response.json`、`after-apply.json`及`missing-media-*`。本轮只覆盖原样可选音频404，有安全主视频/字幕画面，不推广401/403/500、无安全主画面或所有missing族。

## 浏览器原生200%

在自建临时Chrome profile通过真实 `chrome://settings/appearance` 的“网页缩放”下拉选择200%，不是修改产品DOM。初始直接写profile的default_zoom_level未生效，未计PASS；最终由设置UI成功选择，并保存实际选中200%截图。

实际窗口 outer1366×900、页面inner683×406、DPR2、visualViewport.scale1、documentElement CSS zoom1、html宽683。原生设置、正常画面、候选、返回焦点截图已实际逐张查看。需要页面正常纵向滚动，候选内播放器仍完整处于slot；Enter返回后焦点回预览钮。

Playwright fullPage在原生zoom下生成了只含左上部分的裁切截图，属于截图工具边界，未把它当界面全貌。保留这些原文件；最终证据为`*-full-surface.png`，仅用CDP Page.captureScreenshot读取整个实际表面，**没有调用任何CDP scale/viewport仿真**。`zoom200-candidate-scrolled-full-surface.png`可见完整候选及控制条，`zoom200-return-full-surface.png`可见焦点环，`chrome-zoom200-setting-full-surface.png`可见原生200%选项。未推广到安装App或全部控件。

## CAS原失败与只读恢复缺口

在同独立作品生成/预览一个未采纳的gap候选。在原UI apply HTTP发送边界暂缓原body/requestId，公开合法save仅推进工程名与版本4→5，再释放同一个apply。真实服务返回409：制作方案已更新，当前版本为5；输入已保留。原请求 `79622981-9257-4545-a849-e0230a081b4a` 只发1次，receipt=null，最终正式plan完整等于并发save结果，输入和候选保留。暂停边界有120秒保护并finally释放。

随后关闭并由原临时Chrome profile `--restore-last-session` 恢复原tab/sessionStorage，没有手工注入缓存。点击“核对原采纳结果”仅发原receipt.get，仍为null；正式版本5大于候选base4，但界面仍提示原请求未查到回执，丢弃/备份还原/编辑保持禁用。没有点“重试原采纳请求”，没有新增apply。这是实际恢复缺口，已报告T1285，不能写成CAS完整恢复PASS。原profile仍保留以便修后使用同request核对；后续dirty独立浏览器把版本推进至6，不改变原CAS request或原失败。

## 新dirty阻止发送

普通双击原生“剪辑工程名称”进入编辑，输入第一次名称并Enter；填写编导原话后点发送。真实公开save完成且版本5→6，放行原save响应，仅在随后的prepare真实get响应返回边界暂停；此时原生仍可交互，再普通双击工程名输入第二次名称并Enter，释放原真实get响应。

系统提示“稿件尚未准备好；本轮尚未发送，原话、目标和附件已保留”，聊天原话完整保持，页面显示未保存修改。存储仅第一次名称，当前原生仍为第二次名称。真实save1次，chat POST尝试0，防误模型调用的路由保险没有命中；因此不是靠abort模型请求制造PASS。120秒保护已清理，浏览器正常关闭。不是后台setState，也没有替换业务响应。最初直接fill只读工程名等待120秒失败，纠正为正常双击进入编辑后完成；原失败发生在任何发送/写请求前，不是产品错误或重复业务请求。

全部浏览器已正常关闭，原CAS临时profile保留供修后复验；所有截图实际查看。报告未称真人识别、人工听审、模型发送中竞争、全部缩放组合或产品PASS。
