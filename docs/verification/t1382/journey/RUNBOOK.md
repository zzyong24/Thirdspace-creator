# T-1382 报告生成与收据操作建议

这份说明只准备运行方式。本阶段不启动服务、不打开浏览器、不复制或迁移数据库、不生成验收报告，不执行 taskctl complete。

运行前由外部操作者提交本次合约、控制脚本与被监视实现文件，检查 watched_paths 干净；既有无关脏文件须保全。真实运行的 HEAD、整份 PAGE_SPEC.md 的 SHA-256 前12位，必须与每个 witness、run.json 对上。关闭已装 CreatorOS 后由运行器核对源库没有持有者；它不会杀用户 App。任何前置失败停止，不能改登录依赖、绕过守卫或造素材继续。

先检查磁盘，再只运行一个明确的红测。红测在 J03 的真实 projects.ensure 请求上 abort，下一条正常的成功断言必须自然失败。只有 red-sentinel.json 证实请求已阻断、PW 真失败且有 error、witness 标记指定 check fail 的 run，才可作为红测；启动失败或缺数据不算。以下命令仅供以后外部执行：

```bash
df -h /System/Volumes/Data
node docs/verification/t1382/control/run-journeys.mjs --red
```

记下这一次输出的唯一 red run 目录。然后通过临时环境变量指定它，实际正式绿测命令保持无参数，与 allowlist 和报告完全一致：

```bash
T1382_JOURNEY_RED_REF=docs/verification/t1382/journey/runs/<真实red-run-id> node docs/verification/t1382/control/run-journeys.mjs
```

每次 green 新建唯一 runs 子目录；十条旅程×两窗共20例都完整通过才有报告资格。`refresh/back/repeat/empty/error` 各条件必须有两窗证据。真实失败保留在原 run，runner-inspection.json 记录缺口；不手改为 PASS、不删失败记录、不用最后一次成功覆盖它。当前面板缺父任务控制的静态发现很可能让 J08 真失败，必须按实际结果修产品或保留未完成，不能缩掉该用例。

运行器先结束自己启动的进程组，再删除私有数据库副本并核对源库前后摘要一致；这些安全证据全部成立后才检查报告资格。Playwright 输出、截图、readback、operations、witness、隔离日志和源库完整性摘要留在本次证据目录。原账号库从不交给开发栈直接打开，模型/平台/调度隔离不能仅凭浏览器 route 自证。

显式生成报告是另一步：输入已发生的 green 和 red 工件，先只读检查，再按需签发。没有完整20例和全部证据时生成器拒绝签发，不写半份 PASS。

```bash
node docs/verification/t1382/control/generate-report.mjs --run-dir docs/verification/t1382/journey/runs/<真实green-run-id> --red-ref docs/verification/t1382/journey/runs/<真实red-run-id> --check
node docs/verification/t1382/control/generate-report.mjs --run-dir docs/verification/t1382/journey/runs/<真实green-run-id> --red-ref docs/verification/t1382/journey/runs/<真实red-run-id> --report
```

正式路径固定为 `docs/verification/t1382/control/FRONTEND_REPORT.md`，其中包含唯一的 frontend-validation JSON 块。可见文案保存于同一 green run 的 VISIBLE_COPY.json，并绑定SHA-256；后续 default runner 和 taskctl 重执行均不得改这两个旧工件。生成器采用 wx 拒绝覆盖；需要签发新报告时，维护者先明确归档旧报告和旧收据，再选择新的真实运行，不能自动删除历史。

后续获得完成授权后，taskctl 才使用该正式报告。其内部先读取报告，然后实际执行 allowlist 的无参命令并再次验证旧 visible copy SHA。运行器从旧报告取真实 red_ref，在新的唯一目录重走20例并只检查；不重写正式报告。最终任务状态与收据只由 taskctl 落下，本阶段不运行下面这条命令：

```bash
node orchestrator/process/taskctl.mjs complete T-1382 --evidence docs/verification/t1382/control/FRONTEND_REPORT.md
```

报告通过范围仅为本合约十条UI路径，不把真实供应商生成、助手模型提案、外部采集、隔离PG迁移、完整纯组worker或安装版重启的既有缺证据改为通过。没有用户亲手体验确认时 experience 保持 not-requested。

C1 交付与冻结说明：本机 `.git/info/exclude` 第24行忽略整个 `docs/verification/`，不只是 journey。外部整合者须按其已有提交授权，显式纳入下面控制文件以及测试/config/allowlist；不要强制加入 runs 下的账号截图、逐字稿、读回或追踪文件。运行器额外用 `git ls-tree --full-tree -r --name-only HEAD` 检查监视文件，避免忽略文件被误认为干净。

```bash
git add frontend/tests/e2e/t1382-unified-intake-journeys.spec.ts frontend/playwright.t1382.config.ts orchestrator/process/reconcile.config.json
git add -f docs/verification/t1382/control/PAGE_SPEC.md docs/verification/t1382/control/run-journeys.mjs docs/verification/t1382/control/generate-report.mjs docs/verification/t1382/control/supervise-journeys.mjs docs/verification/t1382/journey/RUNBOOK.md
# 按外部已有授权提交上述材料；本 C1 会话没有执行 add、commit 或 taskctl。
# 提交后再执行前文 RED → GREEN → --check → --report 顺序；不要在报告生成后切换 HEAD。
```

数据与运行边界：

- 首次真实运行前已装 App 必须退出；脚本只检查占用，不结束用户 App。`lsof`/`ps` 无法完成检查即退出。另有任务独占锁和端口3441、Next dev锁检查，拒绝复用现有服务。
- 源库逐文件内容摘要在复制前、复制完成、运行结束核对；复制品启动前也核对相同摘要。开发栈只打开本轮私有 PGlite，所有 UI 写入、迁移、补稿、模型来源选择都发生在副本。
- 只构造子进程环境白名单，显式 `DATABASE_URL=""`、空 `CODEX_HOME`，使用实际 Worker 依赖中的 bundled Codex 执行 `login status`；输出必须包含 `Not logged in`。不读取或修改 `.env`、真实 Codex 登录和任何密钥。Next 环境合并关闭，OS 另拒绝读取 `.env`。
- 平台/Web/浏览器池目录、媒体默认根、备份、临时目录与本地文件授权记录指向本次私有目录。副本的旧媒体绝对路径不会被悄悄改写；OS写入限制会拒绝访问那些目录。本套旅程没有素材上传/媒体导出步骤，不冒称这些链路已验证。
- `CREATOROS_DISABLE_BACKGROUND_DRIVERS=1` 与 `CREATOROS_DISABLE_SCHEDULER=1` 同时设置，但当前源码的准备恢复队列与 Worker 未被这两个开关全部覆盖。安全保证来自整个 Next/浏览器后代继承的 OS 隔离：网络默认拒绝，仅允许 `127.0.0.1:3441`；拒绝真实应用数据和认证目录读取；文件写入仅限私有根、本次证据、Next缓存和Worker构建目录。不能扩大到 `localhost:*`，否则可能接通本机代理。
- OS探针必须在保留地址及非应用loopback端口取得明确 `EPERM/EACCES`；普通超时或连接拒绝不算隔离成功。本阶段尚未执行这些探针，也未验证本机Seatbelt配置能否正常启动浏览器。前置失败保留日志并停止，不删除隔离规则继续跑。
- 测试先从公开列表选择有真实素材的账号组；缺真实素材、可升级选题或可补稿来源均保留前置失败，不生成种子数据。每个用例只在副本中通过公开设置服务将文本模型来源选为 Codex，保留该配置动作证据；与实际供应商生成成功无关。
- 运行后 TERM → 等待 → KILL 自有进程组/已确认后代，并核对本轮私有目录无占用才删副本。独立监督进程覆盖复制、同步哈希、真实旅程及清理；`watchdog.json` 必须记录正常释放才能签发报告。进程观察失败或身份不明会保留副本并失败，绝不按进程名杀用户进程。轮询仍存在短命父进程脱离窗口，已用私有目录占用与独立监督补查；不声称数学证明所有后代均被捕获。

预算：动作、请求和有限观察均至少120秒；单例上限900秒；20例串行最坏5小时，Playwright全局6小时，Next冷启动10分钟。独立外层总预算22,920,000ms（6小时22分钟），包括清理2分钟与额外10分钟；这不是实际耗时承诺。C1实际执行的静态命令均低于15分钟。外部完整旅程按上限预算运行，不套用短于内部串行预算的15分钟总超时。

当前静态限制：项目准备缺父任务暂停/恢复/取消 UI，J08先取得未登录错误、120秒原任务稳定观察及刷新/返回证据，再检查这些真实控件；不得删除控制断言来换绿。红测只是证明旅程能发现真实请求失败，不追认历史修复曾做过红测。只有外部真实结果交回后，才能判定哪些失败属于产品、环境或测试适配问题。
