# T-1238 前端及知识公共接口证据

2026-10-11 在专属工作树执行，全部 `--retry=0 --testTimeout=120000 --hookTimeout=120000`。未改界面实现文件，迁移测试到后端偏好合同。

- `old-contract-red.txt`：旧测试实际 16FAIL/4PASS。旧浏览器偏好被当成真相、缺少后端偏好 mock、旧知识 modelFor 注入与新增错误类型 mock 不完整均保留。
- `frontend-44-pass.txt`：7文件44PASS：引擎 Hook 11、设置卡3、模型区域6、后端偏好前端客户端3、旧 classify/distill 路由8、新四公共路由13。
- 设置覆盖后端真实成功/失败响应所触发的状态变化、保存期间不激活未保存值、失败保留原值与重试、多实例、刷新/跨账户、旧缓存迁移 compare-write、严格模式、旧异步回写拒绝。Codex 隐藏文本/图片配置卡，Pi 切回保原配置，ASR/视频仍展示，状态及图片能力失败如实呈现。
- 四个实际 HTTP handler 和实际知识 runner 在隔离 port 下执行，断言宿主 `resolveModelSpec` 零调用，保留当前真实 ID、active 过滤、空输入零任务、401/404先拒绝、原父任务/执行任务/unknown 回执。这里的后端和生成服务是 fixture，不能当成真实账户公共 E2E。
- `settings-20-pass.txt` 是设置3文件20PASS的单独运行，不与最终44相加。
- `shared-response-fixture-failure.txt` 保留第一次多实例测试重复消费同一 Response 的 1FAIL/13PASS；改为每次新 Response 后通过。
- `old-error-message-expectation-failure.txt` 保留旧 distill 断言原始凭据错误、接口原有安全人话化的 1FAIL/20PASS；仅按当前真实合同迁移期望，未改变产品错误实现。
- `first-command-no-package.txt` 是首次包名错误，没有运行测试，不能计为红测。
- `backend-types-observed-failure.txt` 是本轮唯一获授权后端类型检查的 exit2，观测到其他代理分工的图片规格、工具 effect 和视觉审核测试仓库参数错误。相关 owner 已收到原错误；此日志不能替代之后主线程的最终复验。

这些测试使用实际 React 组件/Hook 与 route handler，服务返回来自隔离 mock；没有打开实际浏览器，也没有执行实际公共设置 PATCH/GET。后者由主线程单独留证。

## 账号组与原任务预检接续

- `knowledge-group-before-21-pass.txt`：接续前实际3文件21PASS。主侧实现已经修改，本轮不能倒签新增前置产品红测。
- `group-preflight-33-pass.txt`：4文件33PASS：旧 classify/distill8、新四route21、实际组合根预检4。此次 `retry=0`，test/hook180秒，单Worker。与先前44有重叠，不相加。
- 四个原route使用 original `readRequestGroupId` / `readRequestAccountId`，只mock Context结果。group-only的 `x-group-id` 实际传到Context且账号null；跨组OwnershipError先拒绝，领域reader/提交/API全0；`rejectInvalidToken:true`保持。此边界测试证明实际HTTP header传递和拒绝后的停止，不冒称真实数据库组成员验证。
- `codex-frozen-preflight.integration.test.ts` 使用临时PGlite与临时媒体根；实际组合根/public PATCH→GET/原aiTask创建/冻结runtime，观察factory创建的原adapter，不替换其callback。daily实际反查原job_run和context，asset两类实际读取原asset/file，归因原adapter经原scheduledFlywheel.run与原lease/payload预检。四例均先冻Codex再切当前Pi、无text/imagekey，resolver spy0；没有启动实际模型/浏览器/发布。原service和Skill/候选权不替换。
- `group-null-fixture-failure.txt`：首次新header断言及旧路由断言错误期望缺失token为undefined，实际parser返回null，10FAIL/22PASS；改断言null，未改身份逻辑。
- `retired-job-fixture-failure.txt`：首次归因夹具创建已退役self.detail，被原公共service诚实拒绝，1FAIL/32PASS；改用当前合法self.metrics，未绕开退役门。

本次新增文件后的单次完整前端 `tsc --noEmit` 实际exit0，原空日志 `frontend-preflight-types.txt` 与结果 `frontend-preflight-types-result.json` 保留。限定写集 `git diff --check` exit0。
