# SPEC Review — current

- Task: T-1075
- Verdict: PASS
- Round: 1/3 (initial)
- Spec receipt: bf880eafe1d4
- Review receipt: 73a6052db08f

## 当前有效问题

当前无未销账问题。

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1075",
  "cycle": 1,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "PASS",
  "summary": "首次完整独立前置评审 T-1075，结论 PASS、无 finding；只准入本 SPEC 的固定8产品/测试路径与已列控制面，不录入正式审核状态、不签实现/测试/安装/全功能验收。审核时间 2026-10-08T04:44:27.601790+00:00。MAIN=/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator；SPEC docs/features/t1075-installed-ai-observation-gaps.md SHA256=bf880eafe1d4434d1d7448a280d718c92237d09d6c08dfcd8935ec854f363f19。constitution_path 从原T-1074 REVIEW读取为 docs/产品定位.md，实际SHA256=86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800，与原绑定一致。\n\n真实证据已逐项只读核对：ai-task-b64dd921-391 的实际assistant消息actualEngine=pi；system.read assets.get返回active完整素材DTO，但没有tagTarget。模型两次asset.tag分别猜原afile ID与updatedAt作expectedVersion，原propose均返回no_evidence、sideEffect:none，失败不补记PASS。ai-task-b64dd921-401为grp-58776bff-101纯组accountId:null的asset.generate，原task awaiting_confirmation/runtime succeeded；唯一generated_asset读回与pending assets.get对应，canvas.generations.material.get确为unverifiable。原下载receipt记录HTTP200、PNG1024×1024、1824488字节、ffprobe/fullDecode exit0；本审仅核既有本地文件长度/SHA与probe日志，未运行网络/解码/App/业务操作，图像SHA=0ccdb849e106162ef260901f93da5904872a3680417b075c42202027bf54374f。原422取消终态已读为cancelled，仅绑定旁证，不扩大任务。\n\n实现可行性与边界：窄只读prepare端口可在原production composition注入已存在assetTagProposalAdoption，只有固定assets.get+active+实际asset.tag owner时增加tagTarget；原public DTO及冻结schema/tool版本、generic text/window协议保持。原prepare仅SELECT/原锁读取、digest含素材id/updatedAt/currentFileId/status与标签关系，不写业务。A原DTO→prepare原target→B原DTO完整deepEqual；任一素材/文件元数据变化明确冲突且零候选/业务写，pending跳过active标签读取，缺port不得猜版本。标签关系变化由原owner提案/采纳再核版本拒绝旧观察，完整锁读/来源/同source唯一回执不减。\n\n纯组证明修复仅把executionTasks查询补workspaceFilter+userId+原account精确身份：NULL用isNull，真实account用eq；空串不得通过truthiness/默认值当NULL。原business ownerId/kind/status、bindAssetExecution的冻结输入/call/provider身份、settled/resultRef/startedAttempt、精确receipt/file/checksum、pending/active确认检查全部保留。Canvas selector仍从原冻结sourceContext读原task/result/link，不查当前素材猜文件，不改业务或补历史事实。原account、纯组NULL、组内实际account正例及跨组/用户/account、空串混用、错误task/result、篡改call/file负例均已写入SPEC验收；现有两测试文件可沿真实原execution→file commit→candidate→selector落测，无需新owner或新写集。\n\n最小验收链清晰：先真实RED后GREEN，标签完整assets.get→原target→正式候选/采纳/读回且元数据并发冲突零写、pending不新增拒绝、旧版本拒绝与来源幂等；生图保留原account旅程和完整证明拒绝，新增纯组真实owner链。生产和真实Pi/安装证据必须分别记录；401沿原attempt/link/任务恢复，先精确文件核验后由用户保留/放画布，未知先查原ID，禁止另建已付费生成。root/prompt共享文件由root唯一writer串行，与T-1074本轮严格目录ID和提示修复分别SHA绑定。新规格不改变旧冻结tool描述/schema/version，不修改真实创作内容或model写权限。\n\n当前未知/待实测：T-1075产品修复尚未由本审执行，要求的RED/GREEN、真实标签Pi候选采纳、原401新包后的精确selector读回/保留/放画布、打包/新鲜备份/签名/镜像/安装均未代签。原391/401失败、401 pending、未confirm/adopt未重生成、原下载PIL unavailable初次夹具失败、全局37错误/1告警与原2后端类型错误/7边界/缺timeout入口、T-1074全功能和原生UI pending继续保留。\n\n固定8路径当前SHA256（T-1075实施前快照，含T-1074当前串行改动，不将这些快照称作T-1075已实现）：\n{\n  \"backend/src/application/chat/assistant-system-root.ts\": \"5a55431ed3e06aec648fca2264b73b2f01b4fc56abadd89a97e096a2bb4fc769\",\n  \"backend/src/application/chat/assistant-system-root.integration.test.ts\": \"5ed50d15abee52a4a9b3bdfc508cbdb6da8d081854cb5ab2ec9031bde868aeba\",\n  \"backend/src/modules/ai-runtime/assistant-functional-prompt.ts\": \"15a0b366c14018ad1de5cb9ea362ce6e1d0d7549036fdbe018f4eb2daecf015a\",\n  \"backend/src/modules/ai-runtime/assistant-functional-prompt.test.ts\": \"0ee77c627878a4eb7655ddf9f42834e2b8b385a9e02532fbb649802b7f0505cf\",\n  \"frontend/src/server/persistence-client.ts\": \"4fdb19a2268a5faad298b67173193642098ddac7968d17f093377d8ef322e4f7\",\n  \"backend/src/modules/ai/execution-candidate.service.ts\": \"91af34a7f2a716fc3c642c289998dc84196573efec904dfc66e9e7ddd2dd3b2c\",\n  \"backend/src/modules/creative-canvas/creative-canvas-result-proof.test.ts\": \"d86b71d0de4e6c590ebcf44d90c6ef33a23c940c9aceb517f54c791c75349765\",\n  \"backend/src/modules/creative-canvas/creative-canvas-material-selector.test.ts\": \"7d5159242dec8cc3d6b73a2062ad226c5dd71c637af169e99a6c043b6c5e8325\"\n}\n\n只读原owner/架构/审核模板SHA256：\n{\n  \"backend/src/modules/taxonomy/asset-tag-proposal.service.ts\": \"281c0eb93e3934bee407ca3a50e07987cb0209b48da0f00895b6ecca14ffd080\",\n  \"backend/src/modules/execution/asset-execution-binding.ts\": \"2e9b56a66886be35f897ac5969f60544f54c557d429a97abf58b0afb51e567a8\",\n  \"backend/src/workspace-scope.ts\": \"4dfabca2c21f96efb2cddde6f77b00cfe9f18a7e4b2f3ec92471f15fc361a712\",\n  \"backend/src/modules/creative-canvas/creative-canvas.service.ts\": \"05ad48a6fb712491871e764c9d12984c269b0591c16b585ec77f2cfa56129539\",\n  \"backend/src/modules/ai/ai.service.ts\": \"41012e7d05770c40fa7f5daad49276a982feae285ab3d49e23ea48c53ed2d995\",\n  \"orchestrator/SYSTEM_ARCHITECTURE.md\": \"3efbb0394b8bcc9eb3c9ad7e8c9364df51e336006b862e02ac71fd6c9327971e\",\n  \"orchestrator/process/reviewctl.mjs\": \"11c21887c01550e18a06ebfb1c190710bea994763c422203b11f5f72310e7ace\",\n  \"docs/features/t1074-ai-system-operations.review.md\": \"c04f9bab2cd0d7386778470888bf578ea5cfb946b4b02d23fbcc030e72a0351a\"\n}\n\n关键原始证据SHA256，根目录=/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1074-installed：\n{\n  \"full-ai-material-task-first.stdout.json\": \"60cd260b70049ae1e8dd869804e7a8d084c2216e8b86ecb63da90b96b05c904d\",\n  \"full-ai-material-messages-read.stdout.json\": \"e9a8b0c40a2016b8d65b6bf0da0ec99f9867cf7008681c104d914fcc34ee0faf\",\n  \"full-image-task-first.stdout.json\": \"5a2f39be1d3dc49711fb20c99274b0254e90fe815ddb4cbbacc3d74064648d53\",\n  \"full-image-results-read.stdout.json\": \"2a730b4c3aa363b2b69b67e685b6ecb9a1af13c6af4032551365bac3cad07fbc\",\n  \"full-image-material-read.stdout.json\": \"3daca7abdb6018384384974bce4894a74555948918658924c2ac02d6e6ed2c12\",\n  \"full-image-asset-read.stdout.json\": \"599899db05590a3a79b9c23d6e360adc227478cab72d897b5aaf320a04753495\",\n  \"full-image-candidate-download.receipt.json\": \"1bfbf5dfdf37fc36fc85b1e2f59c74aeeaf22abbcaa87c67a1971873b4c29a30\",\n  \"full-image-candidate-probe.json\": \"26e5b859852e108a7288bfc2f5d51f953979eb976bfb0ac26967f9cccfee10e9\",\n  \"full-image-candidate-decode.log\": \"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\n  \"full-image-candidate-1024.png\": \"0ccdb849e106162ef260901f93da5904872a3680417b075c42202027bf54374f\",\n  \"full-ai-cancel-get-final.stdout.json\": \"f61497d8f0be9c1635bfc0dd0209b86a1756ae80fe6cdbddcca283f4d18d3f3b\"\n}",
  "spec_path": "docs/features/t1075-installed-ai-observation-gaps.md",
  "spec_sha256": "bf880eafe1d4434d1d7448a280d718c92237d09d6c08dfcd8935ec854f363f19",
  "constitution_path": "docs/产品定位.md",
  "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
  "review_path": "docs/features/t1075-installed-ai-observation-gaps.review.md",
  "review_mode": "subagent",
  "model": "inherited-codex-model-unreported",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "5500d1363d78e93ba450a50f50d7f21c0dbde7e5cce0fe1f50b07d0ffe754c00",
  "open_findings": [],
  "resolved_findings": [],
  "receipt": "73a6052db08f"
}
```
