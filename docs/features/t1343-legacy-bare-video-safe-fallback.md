# T1343：恢复合法单原片裸参数渲染的安全承接

## 当前已发生事实

这是用户已授权的功能修复范围，Root于2026-10-18明确要求落实；当前只有SPEC/证据与设计候选，未实现。0953候选保持其真实验收状态，不声称包含后续修复。

原执行800与本轮原task69的公共输入为合法video.render props：talkingHead.file与正duration具备，clips在合同中可省略，captions为空；executor完成真实输入物化及ffprobe/解码后，template.ts的assertVideoLayoutSafety在483–487对无显式clips/无字幕硬拒，报“横屏无主视觉时间窗缺少可溯字幕…”。这不是已证文件损坏或权限错误。原两个任务终态与原裸参数FAIL保留，绝不重发。显式clips任务200/953/1630成功只能覆盖显式clip族，不能替裸族通过。

B已核旧HTML/音轨可沿legacy单文件0..duration承接；新质量门对裸族漏掉现有安全contain路径。旧父提交无该硬门是源码依据；没有找到裸族旧实际成功receipt，必须保持缺证，不能补造旧PASS。原证据请引用media-final-two/runtime/closeout/FINAL_MEDIA_HISTORY.json及原69/800输入/结果；最终索引逐SHA记录。

## 最小实现边界（提交独立评审输入）

优先仅生产 `backend/src/modules/execution/video-render/template.ts`：由一个机械helper判断非空真实主file、finite正duration、当前无其它活动主视觉且无非空字幕时，可沿现有原片contain安全布局承接；guard、初始主画面状态/位置、各时间段box与相邻段去重使用同条件。不能只删throw而留下黑舞台、重复层或错误时间线。程序不选择语义/人物/字幕，不造字幕、不抬质量阈值。需在helper标记SEMANTIC_BOUNDARY_ALLOW其机械安全归属。

已有字幕的文字舞台/右栏、显式多clips、portrait、visualOnly既有语义保留；visualOnly不凭空创建或调度主轨。无有效主file、非法duration、物化/解码损坏、权限错误仍准确拒绝。不能更改合同schema、worker/AI路由、存储归属、权限、渲染期限或其它剪辑语义。

精确拟写测试：`backend/src/modules/execution/video-render/template.test.ts`、`backend/src/modules/execution/video-render/executor.test.ts`；新公共主链 `frontend/src/server/__module_integration__/legacy-bare-video-render.persistence-client.test.ts`，沿真实createPersistenceClient/service/executor/ffmpeg/公开预览与确认读回，不mock目标布局结果、业务终态或媒体。仅外部模型能力保持实际未配置、零供应商，不用视觉模型补语义。新增测试/监督资料限定 `docs/verification/t1343/runtime/**`，原0953媒体/任务原件只读。

## TDD与验收

先锁未改生产源及公共输入。原69/800是实际缺陷证据，但不能冒本次新公共RED；新的受控公共链应以相同合法裸族真实失败命中该门，保存原task/attempt/error/calls/媒体及cleanup。随后最小实现、同链GREEN，完整成功输出可预览、确认落正式asset/output、下载并ffprobe/ffmpeg解码；0真实供应商。

Root已精确授权本任务至多两个全新确定性render根：一次当前公共RED、一次修后公共GREEN；任何新未知/装配失败保原并停止自动新增，确需更多需给具体原因再由Root裁决。原69/800绝不重发/重签。GREEN结束须保存新fixture专用0600key及已关闭source/完整树与PID证据，以后续固定包副本仅读UI核验；不为formal repeat再创建render。key不进git/日志，仅stdin/env或已核解码路径。

保护覆盖裸族有声/无声、原比例contain与局部visual前后gap、字幕legacy、显式多clips、portrait、visualOnly、无主轨及坏输入；边界/孤儿/超时/语义门与完整相关类型按实际delta执行，不重跑40功能/56路由或供应商模型。原正执行和请求至少120秒并保更长期限；外层必须覆盖队列/启动/测试串行及清理，原任务持久deadline不续期。预算与真实具体test fixture在packet前锁实，不虚填PASS。

最终新包只对受影响bare/显式主视觉/原预览消费者和T1342最小入口做必要真实0模型UI验证，其它已完成证据逐消费者机械归因复用。1316报告交付完成与媒体全功能通过继续分列。
