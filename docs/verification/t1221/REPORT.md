当前状态：3913 实际单例/typecheck/eslint均通过，独立窄链PASS；原3912及两轮类型失败保留。全功能与稳定树全局对账尚待，T1221不代签全系统或安装包。

# T-1221 双账号组切换 E2E 实测报告

## 结论

本轮单用例实际执行结果为 **FAIL（1/1）**，按 0 retry 保留，没有改测试或重跑。账号登记、按 account-only 创建两个项目、按真实成员关系定位两组、首访自动进入 A、UI 切 B、UI 回 A、刷新及三阶段组/账号镜像断言均通过。失败发生在最后的公开 `projects.get` 回读断言：请求都返回 200，A 项目的 ID 和标题正确，但响应没有 `groupId` 字段。

进一步检查已确认这是测试期望与当前公开 DTO 契约不一致：`projects.get` 返回 `projectResource`，而 [projectResource](../../../contract/src/resources/projects.ts) 没有 `groupId` 字段。`projects.get` 的输入由真实 `x-group-id` 作用域发出，响应也只回公开资源字段。现有证据**不能证明产品隔离失效**；UI 切换隔离与指定组作用域的正向读取已观察到，跨组拒绝没有在这次测试中验证。当前应作为测试合同偏差处理，不能登记为已证实的产品故障，也不能把本轮记为通过。

## 执行配置与真实结果

- 命令：

  ```sh
  CREATOROS_TEST_PORT=3912 \
  PLAYWRIGHT_HTML_OUTPUT_DIR=/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1221/browser-report \
  pnpm exec playwright test --project=e2e --workers=1 --retries=0 \
    --config=../docs/verification/t1208/budget-recheck.config.ts \
    --output=/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1221/browser-output \
    tests/e2e/zz-account-isolation.spec.ts
  ```

- Playwright `.last-run.json`：`failed`，唯一失败 test ID 为 `c30d334f01c06de6caf2-2d95b5b12af54537ace8`。服务端使用 config 配置的全新 PGlite 临时数据根 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-playwright-dLnxnX`、scheduler disabled；单 worker、0 retry。没有访问用户数据库或真实平台账号。
- 自动场景索引为 `status=failed`、`acceptanceStatus=review`、`retry=0`、外部网络尝试 `[]`，截图成功，最终 URL 为 `http://127.0.0.1:3912/projects`。失败截图 hook 正常写入，没有吞掉测试错误。
- 服务日志中两次 `projects.get` 都是 HTTP 200。Playwright trace 保存了各自完整 JSON 响应：
  - A 组 `grp_legacy_acct-7563e81c-6` scope，返回 `project-7563e81c-12` / `E2E隔离甲号项目`；
  - B 组 `grp_legacy_acct-7563e81c-9` scope，返回 `project-7563e81c-23` / `E2E隔离乙号项目`。
  DTO 两条都没有 `groupId`。发送时 `x-group-id` 分别为对应组 ID，trace 网络记录可查；B 请求的 Cookie 仍是当前 A 组，但公共 `x-group-id` 请求头为 B，和契约中的组 header 优先规则一致。
- 原测试要求 `readA/readB` 同时包含 `groupId`，因此 A 的 ID/title 正确后仍在这一字段失败。第二条 B 资源请求已完成并返回 200；断言在检查 B 返回对象前即中止，trace 中可核实其返回 ID/title。

## 截图与报告

- [3912 最终失败状态的自动截图](3912-fail-stable-screenshot.png)
- [阶段截图：首次 A 组](browser-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/group-a-initial.png)
- [阶段截图：切换 B 组](browser-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/group-b-after-switch.png)
- [阶段截图：返回 A 并刷新](browser-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/group-a-return-reload.png)
- [原始失败截图](browser-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/test-failed-1.png)
- [完整 Playwright trace](browser-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/trace.zip)、[error context](browser-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/error-context.md)、[HTML 报告](browser-report/index.html)、[完整服务与测试日志](browser.log)。
- 本次执行前旧 timeout 行及其 189,166 字节截图已归档；旧截图校验值、索引行原文及基线见 [`before/`](before/)。live scenario index 中旧行仍保留并指向归档副本，新失败行另附在后，没有覆盖旧原图。

## 测试合同下一步

`ProjectResource` 未声明 `groupId`，所以 `projects.get` 正向回读适合断言原项目 ID/title；若需验证组权限拒绝，可单独按 T-1221 SPEC 的可选强化项设计一个真实跨组 `projects.get` 负例，并独立评审。当前只报告该建议，不在本轮更改测试、SPEC、产品或控制面。

本轮起止 HEAD 均为 `9fde2af65605fa5b3fd643290fa7bac999cc683c`；测试文件不计入的 3,762 个已跟踪产品源文件树哈希起止相同，均为 `8696a656e010a05ba73bf0fd5d7539b811820764dd000ac903f6a627ed64cf29`。没有修改产品代码或测试，没有提交代码。运行结束后 3912 已无监听进程。


主Agent后续处理：首轮新增groupId字段断言是主Agent错误假设，公开ProjectResource不承诺此字段；独评已确认校准范围。当前测试改为真实projectResource.parse与原ID/title断言，新增两次另一真实组的publicget严格404/OwnershipError，保所有旧UI无残影、原公共账号/项目创建、组镜像/账号清空、A返回/reload和三阶段图。eslint-final.log对应实际exit0；新E2E待T1217产品稳定窗口，不预签通过。


最终typecheck首轮真实exit2：测试误用包根未export的projectResource/ProjectResource；两条TS2724保留typecheck-final.log。已改为同一个公开ENDPOINTS[projects.get].response.parse及unknown请求返回，不改schema/产品，继续等待实际复验。

## 校准后 3913 实测（2026-10-11）

**T1221 当前校准用例通过（1/1，0 retry）；3912 历史 FAIL 仍作为独立历史结果保留。** 本次复跑没有修改产品或测试源码。精确 ESLint 实际 exit 0，完整 frontend `tsc --noEmit` 实际 exit 0，日志分别为 [`eslint-3913.log`](eslint-3913.log) 与 [`typecheck-3913.log`](typecheck-3913.log)。旧 `typecheck-final.log` 和 `typecheck-final-public-endpoint.log` 的失败记录没有覆盖。

- 实际命令：

  ```sh
  CREATOROS_TEST_PORT=3913 \
  PLAYWRIGHT_HTML_OUTPUT_DIR=/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1221/browser-final-report \
  pnpm --dir frontend exec playwright test --project=e2e --workers=1 --retries=0 \
    --config=../docs/verification/t1208/budget-recheck.config.ts \
    --output=/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1221/browser-final-output \
    tests/e2e/zz-account-isolation.spec.ts
  ```

- Playwright 进程实际 exit 0；`.last-run.json` 为 `passed`、`failedTests=[]`，唯一测试运行 6.4 秒，整个 runner 33.9 秒。独立 PGlite 数据根为 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-playwright-V5C1K2`。Next 首次首页请求包含开发编译约 21.2 秒；已按批准的 120 秒诊断预算完成，没有通过改 timeout/retry/断言提速。完整输出在 [`browser-final-3913.log`](browser-final-3913.log)，HTML 报告在 [`browser-final-report/index.html`](browser-final-report/index.html)，原始导出包在 [`browser-final-report-export.zip`](browser-final-report-export.zip)。
- 真实公共链路建立两个账号并通过原 `x-account-id` 方式创建项目；完整读取账号组成员后唯一识别 A/B。UI 首访显示 A 项目且无 B；切换 B 后显示 B 且无 A，并核当前组 localStorage/cookie 镜像以及当前账号清空；UI 返回 A、刷新后再次只显示 A。三阶段图均为真实浏览器截图： [A 初始](browser-final-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/group-a-initial.png)、[切到 B](browser-final-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/group-b-after-switch.png)、[回 A 并刷新](browser-final-output/e2e-zz-account-isolation-双-0cfe0-只见-A-的项目-切到-B-号后只见-B-的-无残影--e2e/group-a-return-reload.png)。
- 两次正常公共 `projects.get` 回读了原 A/B 项目 ID 与标题；将 A 项目放到 B 组、B 项目放到 A 组的请求分别严格返回 HTTP 404 和 `OwnershipError`。从 Playwright HTML 报告原 ZIP entry `c30d334f01c06de6caf2.json` 提取并保存的回读附件为 [`public-readback-3913.json`](public-readback-3913.json)，原导出 ZIP 与附件 SHA 见 [`public-readback-extraction-3913.json`](public-readback-extraction-3913.json)。
- 自动场景索引新增 `http://127.0.0.1:3913/projects` 的 PASS 行，截图状态 `captured`、`pageClosedBeforeCapture=false`、`screenshotError=null`、`externalNetworkAttempts=[]`、`errors=[]`。稳定 ID 自动截图对应本次 PASS。为保持 3912 的 FAIL 证据，复跑前已把其稳定图原字节复制成 [`3912-fail-stable-screenshot.png`](3912-fail-stable-screenshot.png)（SHA-256 `6bf5fc3d781b2200410cba0f84ddd5818096d1fbf7a76df4edd56b2809a3f769`），并把旧 3912 FAIL 行在 scenario-index、case index 与 gallery 中改指向此副本；原 T1207 timeout 行仍指向既有历史归档。没有覆盖 3912 trace、日志、阶段图、HTML 或旧 FAIL 记录。
- T1217 的五个产品源文件本轮前后 SHA-256 逐一一致，见 [`t1217-product-hashes-3913-before.txt`](t1217-product-hashes-3913-before.txt) 与 [`t1217-product-hashes-3913-after.txt`](t1217-product-hashes-3913-after.txt)。3913 用例结束后端口无监听进程。该通过仅覆盖本报告所列的隔离组切换和公共读写旅程，不代表平台真人扫码、采集/发布或全功能安装版验收。


公开endpoint类型校准最终使用真实包根 ENDPOINTS.getProject.response.parse；第二次错误以operation ID索引的类型失败也保留typecheck-final-public-endpoint.log。当前3913真实tsc/lint及公共链通过，不将两次主Agent测试代码错误当产品缺陷或掩盖原历史。
- 当前可点击截图总览为 [Gallery](../t1207/E2E-GALLERY.html)，逐条链接见 [Markdown 索引](../t1207/E2E-CASE-INDEX.md)。按原生成脚本保留历史重跑：345条运行记录、224个不同 Test ID，状态为251 PASS、86 FAIL、8 TIMEOUT；重复 Test ID 是不同运行，不是独立用例去重结果，也不构成全功能 GREEN。图库中的3912 FAIL仍链接至独立旧图，3913 PASS链接至本次自动截图。

- 3913 本轮产物有4个 PNG 文件路径（A 初始、B、A 刷新三阶段图，加 Playwright HTML 报告附件）；按 SHA 去重后是 **3 张不同画面**。报告附件、scenario index 自动截图与“A 返回并刷新”阶段图 SHA 相同；`3912-fail-stable-screenshot.png` 是旧 FAIL 图副本，不计为本轮新图。
