# T1356 原引导写回校准的有限只读合同判断

结论：findings=[]。在保留全部真实写请求记录并逐请求执行下列精确校验的前提下，允许这一个既有引导op与当前私有seed的精确派生body，符合真实消费者；不是允许任意onboarding写、不是产品修改，也不能将整页改称0写。本次不改产品/测试/流程，不执行请求；正式04的1FAIL1PASS与原失败证据保留。

## 当场事实与来源

formal04@1a9de37e41312c87217c7c5f0e40fcfc2d3c2180原SAFE_SUMMARY为exit1：normal失败，minimum通过。normal已完成27业务点（包括真实SQL失败与恢复123）后在mutations=[]发现7次settings.onboarding.group.patch；minimum共享同一私有fixture，引导已被前一视口初始化，完整28点通过。不能要求每窗固定7写，也不能以minimum成功覆盖normal原FAIL。

我已逐项核ONBOARDING_PATCH_OBSERVED_SAFE.json的7条实际请求。onboarding-data.ts:185–191先读真实项目/成员信号，deriveGuidedSteps取done项；发现新增完成项或origin变化时明确saveWorkspaceOnboarding({completedSteps,origin:state.origin??null})。这是原OnboardingCard装配的持久里程碑写，不是新groupOverview摘要或采集端口写。该源SHA71aa69ae…f6dee5，与本次摘要补数无生产差异。group派生不借成员的旧账号偏好；saveGroupOnboarding仍检查当前workspace，backend仍按真实user/group授权。

## 允许集合必须逐场景精确匹配

目标ID仅取本次经root/owner/nonce/user校验的seed.scenarios对应groupId，不能按历史硬编码组或仅ID前缀允许。

| scenario | completedSteps（原顺序） | origin | 合成事实依据 |
|---|---|---|---|
| primary | [import-account, confirm-origin] | existing | 有当前成员及真实合法旧发布导入项目 |
| transferA | [confirm-origin] | existing | 转出后无当前成员，保原组旧发布项目；不能误补import-account |
| ksOutside / browseZero / latestUnavailable / noMetric / transferB | [import-account] | null | 有当前成员，无本组imported项目 |

每条允许记录必须同时满足：id严格等于settings.onboarding.group.patch；input.params只含groupId且等于上述本轮真实ID；body只含completedSteps和origin、深相等于该组上表精确值；不得额外允许hidden/collapsed/fresh/其它完成项/重复step或任何额外键。不存在的组、filler组、initial空组、其它op或其它body都落unexpected并保持0。若捕获实际发送的scope，应只记安全ID并核x-group-id与params一致，不输出Cookie/环境/正文。不能仅因为op同名就过滤掉。

保留原完整mutation账本，另列allowedOnboardingWrites与unexpectedMutations；允许项也是实在的写，不在日志中删除或改称GET。收尾继续要求unexpectedMutations=[]，非此单op的写保持拒绝。次数可因共享fixture/已持久偏好而为0或出现相同的幂等派生请求；不能硬要求每窗7次，也不能仅统计总数不校验每条结构。应保原响应/失败记录，不把发出请求当持久成功。

## 不减的合同

- 真实数值、归属/日期/旧发布保护、pending=0、原A/B终态和SQL前门/恢复断言全部保持，不能用此写回解释或跳过其它失败。
- UI前完整初始化后的baseline仍要求collection14、AI0、计划19的本次实值，末尾全对象相等；不能将此单op白名单扩成采集/计划/AI变化例外。
- AC1356-3的“读取0业务写”继续约束新增membership/collection摘要读取不迁移/改写历史。必须区分该后端只读保证与整页既有OnboardingCard保存偏好：整页有原引导写，不能报告0 mutation/全只读。PAGE_SPEC本来禁止新采集/假Project/Publication；此例外不授权这些操作，也不接触真实用户库。
- 原formal04 normal因为过宽的0整页写断言而失败，原件保留；此报告只校准观察器允许集合，不回填原PASS，不改既有产品逻辑。新增测试校准应按控制者原流程freeze并真实跑完整T1356后再报告结果。

## 限制与SHA

此报告只审核上述有限校准，不审阅其它导航实现、不代签下一轮E2E/strict/安装。原始trace只留本机，报告不复制用户正文或凭据。

- `frontend/src/features/onboarding/onboarding-data.ts`：`71aa69ae8fa0479043799d9f6b20a190ff9a196bc725b89450319240f6e5dee5`
- `frontend/src/features/onboarding/onboarding-steps.ts`：`fc2035cedfd7bef52a9a60adb6c3b2f96e9b955cdc8488534ba1c7c127a33b07`
- `contract/src/resources/settings.ts`：`ca908ee2cff4ac2c3f838f5f8a986c9f7d7237197c4799f7542f4d12d97f0739`
- `docs/verification/t1356/harness/seed-collected-dashboard.mts`：`e9ecee3bac3ce6f9d3a5faed8df8f08d5c3c93f5e64c9b44ad24fca7583c97df`
- `frontend/tests/e2e/t1356-collected-metrics.spec.ts`：`1786ae378ae5d1f55ded05610088b57dbca37da5c9e3de26a89897e58dfa52cc`
- `docs/verification/t1356/review/ONBOARDING_PATCH_OBSERVED_SAFE.json`：`a8f3b009ae372ccf672e84a319c8e43ee5d370ceaa4d1f7458c1525c515ea0c8`
- `docs/verification/t1356/candidate-attempt04/SAFE_SUMMARY.json`：`91b55b00b998f1c7634115e45b0399cdc9b81893983120a55216292af87f4d91`

审阅时间：2026-10-18T19:22:09.517517+00:00。


## 最终测试diff复核

已只读核控制者最终test-only diff，`t1356-collected-metrics.spec.ts` SHA `1786ae378ae5d1f55ded05610088b57dbca37da5c9e3de26a89897e58dfa52cc`：原mutations总账保留所有已知非GET操作ID，新onboardingWrites保实际input；末尾其它op过滤后仍要求空，允许单op记录数与原账对应，每条须命中本seed7组Map并对params+body完整deepEqual，额外query/param/body键和不符步骤值都会失败。origin/步骤映射与上表及7条原trace一致，未硬要求每窗7写。witness边界现明确原引导写单独记录，不再冒整页0写。

此diff仅增加账本和精确允许集合，未删除/移动pending、数值、原A/B、SQL或计数基线断言；没有新增请求或产品改动。有限findings继续=[]，可进入控制者已授权的test-only冻结及完整真实执行；不把本静态复核或前轮minimum PASS冒下一轮全通过。
