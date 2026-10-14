# T1276修复与验收记录

原真实公共RED：T1274 E2E source.prepare请求120000ms超时，ACK未知。独立SPEC初评packet与reviewctl实际收据保留；taskctl start后仅sourcePorts.createTask tx分支改为复用既有workReviewAiFor(tx)，其createTransactionalTaskRuntimeResolver读取同tx设置/Skill/原authority，不更改类型/Skill/权限/预算。根巨大persistence-client前置dirty仍保留，不整体提交。

新纯组公共集成测试已写，尚未运行；不冒充TDD红测。原隔离request状态公开回读尚待执行，不能签reserved或无task。UI/预览/MP4未完成。

context-plan/context-compile首轮因新任务缺progress绑定而拒绝，原失败日志保留。沿已知T1026非法写集阻止全局generate的登记方式，只增T1276 pending元数据及更新T1274具体写集；未改任何已有step status/lease，未制造完成或PASS。

独立只读实现复核（spec_review）：未找到确定新增错误；source factory为build完成后延迟调用，无TDZ；设置/Skill overlay均同tx，authority只读既有加密file store，不捕获根Settings repo；偏好默认null→pi与原根resolver一致。恢复脚本已独立复核先get原ID且仅reserved/null接续、queued/运行中不prepare、不retry；source采用body/key发前持久记录。新增pure-group集成测试仍未运行，原HTTP120秒超时仍唯一完整链RED。

reviewctl全局audit当场exit1，仅报既有T1255宪法漂移/T1021等旧receipt问题，未报T1274/T1276；不将本任务收据PASS当全局PASS。

新纯组公共测试首轮当场FAIL：fixture上传后未建立项目素材关联，在readMediaFile前置保护拒绝（11s）；未触达所修事务resolver，不当目标RED。保留public-source-group-fixture-failure.txt，补既有createMaterialLink公共调用与真实关联，随后再验原链。生产守卫不放宽。

纯组真实公共测试补公共素材关联后实际exit0/1PASS，31.46s；tests9.86s，真实ffmpeg生成→组prepare ACK→ffprobe与原SHA→同ID prepare同task→采纳→错文件/跨组拒绝。日志public-source-group-green.txt与SHA receipt。未替换模型或probe，原超时请求的状态与页面/导出仍待回读验证。

原任务恢复取证：公开get确认同requestId reserved/taskId=null后，原body/原ID接续prepare在原120秒预算内ACK；实际probe succeeded、taskId ai-task-351b7345-6，SHA一致、raw durationTicks36864/timebase1/12288=3秒，native120000精确换算。原source采用请求body和requestId在首次发送前保存至original-source-request.json，再运行只重放原采纳回执；真实旅程已进入MD候选和实际浏览器编码。完整读回见original-source-probe-readback.json、t1274/browser/original-source-readback.json。来源任务恢复不等于完整剪辑验收。

末轮实际公共偏好冻结回归：public-source-preference-freeze.txt exit0，1PASS/21.81s。真实patchPreferences Codex→source prepare，公开getTask确认modelKey=codex及groupId；再改偏好Pi，同原IDprepare仍返回原任务/原Codex快照。真实ffmpeg/probe/SHA/采纳、异冻结文件和跨组拒绝保持。media.probe为无文本Skill任务，不虚构非空Skill overlay证据。共享组合根仅stage source tx一处既有factory复用，其它前置dirty未提交；本轮类型/build/timeout和最终对账还未完成，不签任务complete。
