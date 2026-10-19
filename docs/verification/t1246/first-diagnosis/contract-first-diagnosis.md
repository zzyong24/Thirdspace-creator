# T1246 Contract 首轮失败只读归因

候选：533224f334c43cdb81a344424e420cad93784dd1。真实首轮 `unit-first/contract.json` SHA256：2d9c6fe4783e5052d76d3d9251673ac39129be31285c6dddae7ad43acc7e3c07。读取 JSON 的76个真实 testResults：74文件通过、2文件失败；499例，456通过、43失败、0跳过。顶层 numTotalTestSuites=132 是 Vitest 的嵌套 suite 数，不误称132文件。未修改产品/测试/断言，未重跑测试。本报告仅写 /tmp，具体模型标识 unknown/inherited。

## 根因

43个失败属于一个合同清单未同步缺陷：已有 T1199 公开只读资格 operation `accounts.collectionPlanReadiness` 已真实进入 registry，但原合同测试穷尽列表仍少这一路由；endpoint-bootstrap 又把旧表面总数404作为每个entry启动的固定门。

- `contract/tests/registry.test.ts:508`：真实 extra 数组仅 `GET /accounts/:accountId/collection-plan-readiness`。其“每个SPEC路由恰一次”和“每个id唯一”两个既有测试均通过，未发现重复注册。
- `contract/tests/endpoint-bootstrap.test.mjs:61`：42个真实首入 entry 子进程均在同一 `Object.keys(root.ENDPOINTS).length !== 404` 门抛“registry surface changed”；不是42种不同初始化缺陷。前面的真实 import 已进入 registry，后面的 canvas operation 与 stdout sentinel 在这些失败中还未完成，因此不能因根因清楚直接标启动PASS。
- 唯一已证 extra 与旧穷尽404表一致意味着表面应计405；本报告不重跑 import 取新运行count，也不靠单独改404洗绿。后续应把经确认的精确路由同步到穷尽清单，并保重复、唯一、未知路由与各entry真实初始化断言。

## 新接口来源与确认范围

真实定义 `contract/src/operations/platform-accounts.ts:19`，键 getAccountCollectionPlanReadiness；id accounts.collectionPlanReadiness，GET，路径 /accounts/:accountId/collection-plan-readiness，params.accountId沿已有 id schema，无新query/body，response为 accountCollectionPlanReadinessResource。DTO严格键 accountId/platform/status/collectAvailable(boolean|null)/planEvidence(verified|missing|unknown)，不含secretReference/cookie/path/当前登录结论。

T1199 SPEC“实际诊断与服务合同”明确逐字规定该公开只读operation、路径、DTO、user/group/member归属、纯组读取、归档不读凭据、能力未知null/证据未知unknown以及真实读取失败不伪装missing。末段记录用户要求修复其他已绑定媒体任务不可见，必要只读资格合同在确认实现范围内，禁止真实用户组自动创建/启用/运行。`docs/verification/t1199/spec-review.md` 独立确认上述合同；`spec-review-cli-amendment.md` 独立确认 CLI READ 和 group matrix，保未知/写权限拒绝。当前 SPEC SHA256：a1cf0ae4040368d289117784ccaf5cb81c9d8199fe97c1926fb85cf775b4e05a。这是已有来源记录，不是本轮临时扩大合同或新授权。

真实引入 commit `ff3946f58c4123caecfc5ec643051da52ae11a6f`（2026-10-10，修复账号组多平台定时任务展示并整体重设计知识库）对该operation文件加入5行/删1行；本次 git show 限定检查表明没有同时更新上述两个registry测试。三源文件与当前canonical字节均完全相同：

| 文件 | 冻结SHA256 |
|---|---|
| contract/src/operations/platform-accounts.ts | 9850f85ea46942297d31223d4fdd3180434b0a75aa3668a0bab8b01ca258825f |
| contract/tests/registry.test.ts | a26b8120063bded2b489ca198564a5ddbcbee9ec7d8ab73aacc8be913cd94d7d |
| contract/tests/endpoint-bootstrap.test.mjs | d789ae86ae7344452ebdbd7e554658f808ed81840c8628ad48496a71e83aea2e |

不是T1246来源复制时漏了该接口，也没有证据表明Codex branch另注册重复接口。T1199历史 contract.log.gz只实跑CLI/scope 2文件12例；RESULTS.md也如实只声明该聚焦范围，不能拿它代签全registry/bootstrap。

## 实际服务与消费闭包

- operation通过原 platformAccountOperations进入总 ENDPOINTS；契约cli-policy明确READ、workspace-operation-scope明确group，未变成write或external。
- backend/src/modules/platform-account/platform-account.transport.ts:22/44唯一注册 owner，调用 `PlatformAccountService.getCollectionPlanReadiness` 并返回原 requestId envelope。
- service.ts:164先 repoFor(ctx).getAccount 验用户，再 accountGroupService.forAccount 验成员和显式ctx.groupId；后续证据port传已验目标accountId与真实membership.version，而非全局选择账号。归档不调用collectionPlanEvidence；capability缺失null，证据port缺失unknown，throw不捕为missing。
- frontend/src/features/automations/automations-page.tsx:97对真实member读取该operation；island沿 planEvidence/collectAvailable 决定用户主动创建资格，保已有任务。backend collection-plan-readiness.test.ts的5例覆盖实际transport返回、跨user/group/无组零proof、missing/unknown/read失败、archived、同组甲读乙冻结proof。

以上源码闭包不是本轮backend执行PASS，backend首轮仍由实际日志决定；此处仅支持该路由是有需求/归属/消费者的合法来源，不能删除产品接口掩盖测试失败。

## 首轮后拟集中修复的最小写集

仅 `contract/tests/registry.test.ts` 与 `contract/tests/endpoint-bootstrap.test.mjs`：把已经确认的这一个GET路径纳入精确清单，并校准实际批准表面的总数/一致性；保 exhaustive extras、恰一次、id唯一、defineEndpoint引用兼容、canvas id/read和所有42entry独立子进程及sentinel断言。不得删expect、放宽所有未知endpoint、只改数字不核清单、移除合法operation或修改owner。必要需求/验收记录由ROOT集中更新T1246首轮问题与写集，不改T1199历史真实PASS范围。

修后独立保存红/绿与完整contract回归；原43失败仍为首轮FAIL，不能用后来绿覆盖。

## 实际失败 case IDs

下列从真实JSON提取，原消息/栈留unit-first/contract.log/json。结构化副本 /tmp/t1246-contract-first-cases.json 保全部43个ID。

- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes index.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes endpoints.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/account-groups.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/ai.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/analytics.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/articles.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/artifacts.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/assets.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/auth.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/benchmark.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/calibration.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/candidate.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/content-calendar.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/creative-canvas.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/creative-results.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/execution.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/favorites-folder.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/graphic-posts.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/ingestion.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/intelligence.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/knowledge.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/learnings.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/material-links.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/notifications.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/pages.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/platform-accounts.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/platform-collection.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/positioning.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/production.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/projects.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/publishing.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/review-gate.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/reviews.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/scheduling.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/search.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/settings.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/taxonomy.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/topic-attribution.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/trend-source.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/visual-templates.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/work-compositions.ts before the public registry
- `endpoint-bootstrap.test.mjs` — contract module initialization from every real entry initializes operations/work-sources.ts before the public registry
- `registry.test.ts` — endpoint registry registers no routes outside SPEC §13
