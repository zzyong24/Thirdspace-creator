# T1295 正式V3原生工作台实际闭环

结论：正式V3唯一用例 **1 PASS / exit0 / retry0 / worker1**，实际UI执行5.9秒、整轮7.1秒。完整证据在 `docs/verification/t1295/browser/runs/current-2b1dae7b2e71/`。本轮没有再跑V1/V2，也未重发任何原任务。

使用Root明确授权的59136 existing-owned服务，沿用原marker/DB，不冒fresh；执行前4188份源码/测试与11个normal bundles逐项SHA核同，执行后均无漂移。execution-worker为f65897ce…、诊断tap不存在。正式测试SHA b9076cfa…，与Root应用和typecheck通过的字节相同。本代理生产/正式测试/控制面0写。

## 一次真实导出与采用

本轮新组 `grp-0d74a350-152`、project `project-0d74a350-154`、output `output-0d74a350-165`。新clip经公开两阶段上传，source asset `asset-0d74a350-173`、精确file `afile-0d74a350-177`；mediaId `f4d1f949-c0bd-4f2f-833f-3d6984f1b298`。合法31版原生document只引用该真实媒体，metadata.id为本output。没有手工伪造nativeSources或probe。

从真实项目制作页打开既有VideoReferenceWorkbench，已实际看见彩色原片预览及当前时间轴，留图 `v3-native-workbench.png`。**只点一次**“导出当前场景 MP4”，组件真实执行native handle.export并保存同一冻结snapshot。原save requestId `f936f826-f91e-43a5-8403-41e504fd096a`，expectedRevision=1；公开get的revision=2，完整nativeDocument与本次原save请求体逐项相等，mediaRefs仍是同一精确文件。下载的是实际原生导出blob。

随后**只点一次**“采用为作品成片”。真实UI写回执全部HTTP200：upload create/complete、materialLink、recording→editing→rendering三个相邻状态、唯一productions.exports.create、唯一exports.complete、ready。原export `export-0d74a350-217`、最终asset `asset-0d74a350-205`。公开getProduction为ready，getOutput.primaryAssetId与原exports.complete.resultAssetId一致。采用后工程document/revision未变，checkpoint.pending=null。

这条真实V3链没有backend native render任务；公共preview/render/execution.confirm调用数均为0，未伪造task身份。模型、聊天POST、资金与外部来源护栏的拒绝列表为空；测试没有发模型或充值请求。

## 实际音画及文件同一性

原生下载与公开primaryAsset再次下载均为203930B，SHA256完全相同：

`6e0534c0501128d5275e8f17d199adb721afe140c310fdc5ccbcc424b9594393`

视频H264、640×360、24fps、48帧、2.000000秒；音轨AAC、44100Hz、2.089796秒。原内核AAC尾长如实保留，不裁音、不写成精确2秒。两个文件均经ffmpeg全流解码；0.5秒画面非暗比例0.99999566、音频RMS0.12229783。实际成片登记完成截图 `v3-native-adopted-ready.png` 已查看，页面明确显示export ready；再次替换仍有原确认门。

## 关闭与适用边界

owned browser已显式close，browserConnected=false；driver PID97127、静态服务worker PID97128均退出，自有随机端口不再监听。只清理本代理UID/task/nonce/hash一致的唯一临时源副本561082B；所有失败、截图、原回执和MP4保留。Root59136服务未关闭，用户App未操作。

本例验证Chrome中的真实工作台→原生导出→同snapshot保存→公开采用成片→精确下载；页面本身是owned开发Next，不能冒正式release响应头。release CSP正负例已有独立HTTP测试；V2后端公共成片另有正式1PASS。当前三个消费者已有各自实际证据，但正式安装包/WebKit/原用户工程仍待用户验收。旧bundled Chromium/SwiftShader黑片FAIL保留，Metal正例不代签软件GPU或无GPU机器。

`V3_ACTUAL_BINDING.json`包含所有实际ID、原UI请求/回执、音画数值、源码后核、关闭事实及逐文件SHA。候选阶段原NOT-RUN文件保持历史原样，本报告是新增当场执行结果，不回填过去的PASS。
