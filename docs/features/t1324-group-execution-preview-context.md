# 恢复纯账号组执行预览的请求归属

当前仅登记待审，不含生产/测试START。用户全功能恢复授权与Root本轮裁决覆盖原U16真实缺陷。原固定包0e1dc6228、media group20、project6366/output6377、video.decisions6433与render6661已形成真实决策及2,584,733B MP4候选；原预览URL `/api/v1/local/execution-preview/ai-task-e80980cf-6661/final.mp4` 在原组cookie/header请求和Range bytes=0-4095下返回404。原视频duration在120秒保持0，未采纳；观察器实际exit130不等于后台任务取消。原件见T1316 U16-preview-diagnosis，不补拍旧源/请求。

初步源码线索：preview route已import readRequestGroupId，但resolveRequestContext仅传session/account两实参。后续须只读完整追route→resolveRequestContext→preview runtime→file/owner门，再锁定最小route及独立组合测试W。GET、Range、两种原合法cookie/header归属、跨scope拒绝全部保原；当前无显式HEAD，Next自动HEAD须新包真实验证，直调GET(HEAD Request)不代签框架行为。不新增HEAD入口、不扫改其它路由。原完整生成/渲染/HTTP404作为改前现场，另需新owned公共受控RED及修后权限/Range完整源链；仅mock context/readVideo不足。不得因任务号另造付费模型、绕预览盲采纳、改原产物或伪scope。

## 已核真实请求与文件边界

`readRequestAccountId`/`readRequestGroupId`各自保header优先、cookie兜底；x-group-id及creatoros_current_group只是选择，真实resolveRequestContext先核本地/会话用户、账号owned active，再verifyGroupSelection核真实owned组及所选账号membership。原读路由失效session回落本地用户、异常到401的既有语义保持，不借本任务新增写路由严格模式或改account cookie策略。组header与cookie冲突沿既有header优先；账号选到外组仍由真实组合校验拒绝，不能补造ctx。

persistence executionPreviewRuntime只把ctx/task/path交原executionService.previewArtifact；后者原AiService.getTask所有权/exec.*命名空间、awaiting_confirmation、同task实际结果manifest白名单、video MIME全部先验，再从该task out读取。sandbox拒绝非法task/path、绝对路径/逃逸/NUL/敏感文件、symlink/目录/缺失。修复不改以上任何服务/文件守卫，不读取任意绝对文件、不允许manifest外文件。

## 候选精确写集与验证

生产候选W仅 `frontend/src/app/api/v1/local/execution-preview/[taskId]/[...artifact]/route.ts`，沿既有readRequestGroupId将原真实group选择带入原resolver。独立完整组合测试候选W为新增 `frontend/src/server/__module_integration__/group-execution-preview.persistence-client.test.ts`，及own runtime/result；现存parseRange route.test.ts仅只读回归。最终范围/lock经Root独审后才实施。

原U16现场完整source→真实AI决策→用户确认→真实确定性render→真实HTTP404可作为改前公共失败证据，不另付费重造任务。新受控前RED用独立owned DB/media/workspaces和真实public合法任务/生产执行服务产生待采纳video manifest/文件，再调用真实route/resolver/runtime/file全链；不得mock context或readVideo充完整主证，不直接捏manifest/假原生HTML。供应商边界可受控，不读现役用户库/不接旧candidate重放。所有实际测试/config/fixture/源/worker在run前完整锁SHA，未命中目标先列fixture失败。

修后至少：纯G/header与纯G/cookie分别GET200/原bytes；合法G+filter与legacy账号原行为；header优先和组合membership正确；同owned跨G、跨user、不属主账号/组、无真实task/非exec/非待采纳/非video/非manifest拒；合法closed/open/suffix Range206及精确Content-Range/Length，非法Range416并保private/no-store/inline MIME。path编码/路径逃逸、目录、symlink及缺失仍原拒。读前后完整原task/results/业务DTO不变，0采纳/0模型重发。单独parseRange/helper只能辅助。

同新不可变包必须实际Next GET与自动HEAD，cookie自然video请求、显式header+Range及播放器加载/播放；HEAD状态/相应headers和空body以框架实际响应为准，不为测试新增HEAD handler。只有真实可预览后，原合法用户采纳/资产读回/下载及解码按U16本来功能完成，不能用后端文件存在替代公共入口。旧6661原件/未采纳状态保持，新包如无法合法复用不得复制DB/篡改来源，由Root选择必要合法新fixture；不默认多次AI收费。

请求/正执行/探针最少120000ms，保更长原预算，test3600000ms/hook180000ms/外层86400s、单worker/retry0/own cache。生产/类型/边界与最终统一timeout Gate真实执行或准确引用；不build worker/dist、不安装、不改两controller。最终失败/命令/原状态/资源/源SHA完整保留，公共新包验收与实现局部结果分列，不写整体任务PASS。
