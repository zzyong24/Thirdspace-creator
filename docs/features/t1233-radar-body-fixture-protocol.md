# T1233 校准雷达正文模型替身并验证正文真实贯通

用户要求持续真实验证并及时修复明确缺口。T1231 3919原立项E2E实际1/1 PASS、exit0，组内项目ID/标题、幂等、刷新与两类归属拒绝均通过；原结果不改写。root实际查看三张当场截图后发现雷达“我的改写稿”显示旧分析JSON（hook/structureSteps/coreClaims等），该用例没有验证纯正文文本贯通，不能签可直接使用的AI正文。来源是本地模型替身，不能先判定真实供应商或产品语义判断失败。

证据：`docs/verification/t1231/browser-3919/test-output/` 的 `radar-ready-1536x1024.png`、同轮scope JSON及原日志。当前原test的localhost OpenAI替身按旧提示词片段分支选择响应，未命中时返回分析JSON；T1229修复保持模型替身整段不动，T1231也未变更。正式完整正文新路径不应由旧关键词决定fixture的响应族，更不能在产品中通过删JSON或猜业务词给测试洗绿。

当前BUILD只读准入：核当前实际rewrite-only消费者、公开detail的正文schema、项目brief证据种子schema和原替身HTTP响应协议，提出精确一文件测试修订候选。写集仅本SPEC及 `docs/verification/t1233/**`；主控制面由root。修订前独立复核，不改原test/model/mock/product/context/guard，不读取用户库或重新请求3919。

候选原则：只为本地完整正文协议fixture返回确定中性正文，按真实HTTP请求stream字段选择标准JSON或有限SSE传输，拒绝本例不应出现的结构化response_format，不能用提示词词表/全文匹配猜任务类型。保所有旧源/账号/positioning/预览/项目ID标题同幂等/刷新/两类404及原test title/TestID；新增公开schema解析的完整正文相等、实际雷达编辑框同正文、确认后同项目brief证据正文及来源引用不丢。断言原task/transform/项目身份未另开，记录fixture实际调用次数及最小协议字段，不输出prompt/密钥。若当前测试确有多个不同语义任务，先以真实endpoint/task/账本只读证明并按已冻结协议划定响应边界，不能臆定全部调用同族。

截图要展示真实编辑正文和项目中真实稿面/来源证据，不以拼接text或CSS可见但屏幕外元素代签画面。旧3919三图及PASS行字节/状态保全后，才能新轮单Next/worker、retry0、fresh DB/media/auth运行原全程；有限请求/观察至少120秒，保更长原期限与真实退出码。记录source/HEAD冻结。真实模型、真实上游认证与正文创作质量仍另验；这条只证明确定fixture正文经真实本地服务贯通，不能代签AI质量。

```mermaid
flowchart LR
 A[本地协议替身返回确定正文] --> B[真实Worker与预览正文]
 B --> C[雷达编辑框同正文]
 C --> D[确认及同项目证据种子]
 D --> E[公开回读与实际可见截图]
```

## 2026-10-11 只读诊断后的精确实施候选（待独立评审）

`docs/verification/t1233/diagnosis-and-candidate.md` 已证明公开preview严格body不允许strategyBacked；服务默认rewrite_only，专用worker仅一次普通generateText，持久包装拒绝stream。SDK入口事实不等于HTTP非stream：独立复核已确认resolver→Pi doGenerate仍用models.stream，实际安装pi-ai 0.80.7 wire发送stream:true。固定同两段中性正文按请求stream机械字段返回有限标准SSE（assistant content delta、finish_reason=stop及[DONE]）或标准JSON completion envelope，不按prompt关键字、业务名或消息全文猜任务。真实本例预期stream:true且无response_format、calls=1；保存最小协议观察，不因合法stream=true拒绝，也不修改产品或假返回业务成功。

唯一拟写源码是 `frontend/tests/e2e/content-radar-one-click-project.spec.ts`。保当前T1231全部旧title/TestID、账号初始化/信源/定位/逐字稿/预览/metadata、项目同ID幂等、四个scope镜像、纯组promote header、两类404与刷新。新增已核real preview变换ID与taskID的同实体读回，公共detail outputSnapshot窄化并用真实rewrite-only正文schema解析，核完整contentText、sourceSnapshotId/真实转录hash/非空templateVersion；真实雷达textarea value同正文。确认后的同项目briefDetail.contentRadarEvidence经projects.get schema解析，核rewrite_only seed完整正文/快照/hash/模板及来源引用；刷新后二次同ID公共seed与真实TipTap编辑器正文一致。准确断言已有seed显示，不宣称建正式脚本artifact/version。

截雷达正文textarea和项目 `[data-slot="script-prosemirror"]` 时必须真实scrollIntoView并toBeInViewport，正文逐段与固定fixture一致且实际上屏；保现有三图1536×1024/1024×720尺寸，可增加独立正文图而不覆盖3919。将真实调用计数、协议字段、同transform/task/project身份与body/seed相等结果写最小附件，不输出prompt/密钥。公开只有一次文本模型调用的源码事实应由实际fixture调用计数再次核证，异常原样保留，不延时重发或放宽期望。

353号旧3919 PASS共享PNG已经按字节保存 `docs/verification/t1233/before-3920/`，索引只换该行图片引用，状态/ID/顺序及其他字段同。独评通过后root正式更新Packet单文件write_set，再实施、静态检查、独评源码，然后全部产品/test冻结，单Next3920、fresh根、worker1/retry0运行原完整case，真实退出码必须保存。当前无测试/产品写入准入。

### Round 1 前置失败与协议纠正

`docs/verification/t1233/scope-independent-review.md` 原FAIL完整保留；原 `diagnosis-and-candidate.md` 中从SDK入口推导HTTP非stream的段落已被本节明确否定，不能作为实施依据。采用真实wire字段返回标准有限SSE，避免将stream=true请求依赖JSON兼容响应当正式协议验收；实际Pi消费者已支持OpenAI SSE。此纠正只在测试替身传输层，不改模型职责、runtime、账本、原任务期限或公共API。完整生成正文直接由模型fixture提供；不写产品JSON清洗/关键词语义判断。新正式候选必须Round 2独评后才准写原测试。
