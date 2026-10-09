# T-1110 身份候选与私有失败图语义独立审查

结论：指定 OA 身份候选未发现具体阻断项，可以由 root 继续实际 RED、串行应用与回归。收窄后的私有失败图方案在描述的语义下也没有新增权限或工具边界违反；它尚是设计，不代签保存器实现或真人结果。本审查仅写 `/tmp`、只读代码与日志，未操作浏览器或真实账号、未修改共享树。评审模式 homogeneous inherited。

## 1. OA 身份候选

对象：`/tmp/t1110-identity-candidate-uq24h68g/combined.patch`。独立实读 SHA256 为 `14b4840ad41311e9e34a138ab556e022bb6e2e784867f8989cbdd589fe813fd6`，与 root 指定值一致。候选只改两 source TS 和其测试的预算/诊断，未改服务契约、稳定 ID DOM 校验或共享 guard。针对当前产品树执行 `git apply --check production.patch` 返回 0，没有应用文件。

预算核算与真实串行消费者吻合。`completionWaitMs` 每层有 10000 ms 结算余量，不能把它当成另一段身份观察预算。

| 项目 | 毫秒 | 真实消费者 |
|---|---:|---|
| 单次 launch guard | 370000 | 120000 系统浏览器 + 120000 fallback + 120000 清理 + 10000 |
| startup | 1120000 | 三段 370000（原排队/启动/锁重试预算）+ 10000 |
| 初始主页 goto | 120000 | source.withProfile 的主页导航，单独计入 |
| OA identity reader | 1080000 | 设置入口观察 480000 → 设置页 goto 120000 → AppID/名称观察 480000 |
| Video identity reader | 600000 | 普通首页 goto 120000 → 稳定 ID/名称观察 480000 |
| 最后清理及外层余量 | 130000 | 120000 + 10000 |
| OA login/readIdentity 默认总额 | **2450000** | 1120000 + 120000 + 1080000 + 130000 |
| Video login/readIdentity 默认总额 | **1970000** | 1120000 + 120000 + 600000 + 130000 |
| OA collect 默认总额 | **4850000** | OA 上述默认额 + 2 × 10 × 120000 |
| Video collect 默认总额 | **5570000** | Video 上述默认额 + 3 × 10 × 120000 |

这些是没有较早父边界时的 source 默认外层预算，不是替 nativeReports 原持久任务续期。`withProfile` 继续冻结 `end = min(原绝对 deadline, 本次 localEnd)`，所有内层请求沿原剩余时间取值；backend collector 的 startedAt + 30 分钟原期限仍存在。显式较早 timeout/deadline 不因 reader 默认变大而延长。两观察串行执行、设置页导航在中间，没有新增并发读、循环任务或重发。预算数组描述内置 reader，不承诺覆盖任意注入 reader。

错误分段合理：OA 首段观察耗尽使用固定 `ENTRY_NOT_READY`，设置页 AppID/名称观察耗尽使用固定 `FIELDS_NOT_READY`；视频号仍为 `IDENTITY_MISSING`。中文错误仍为原普通未就绪文本；两个固定枚举进入 worker 内部诊断，不传入口 query/message/cause，也不把分析页无字段推断为会话失效。原真实稳定 ID、平台及 expected identity 校验未改，字段缺失仍不能成功。candidate 测试实际调用 public source 与内置 DOM reader，验证两个 goto、请求预算 `[480000, undefined, 480000]`、分段 code、query 不外传、取消/期限后不导航设置页或晚读字段。

公开链消费也未产生新 auth 语义：collector `reasonOf` 对这两个未公开 code 归普通 `EXPORT_FAILED`，仅真实 `LOGIN_REQUIRED` 才 needsAuth；绑定服务仍归原 `ACCOUNT_BINDING_FAILED`，不公开新诊断契约。调用 source 的宿主端口没有新增 code 参数或能力声明。

候选目录实读日志分别显示 tests-only baseline **11 failed / 69 passed**、实现候选 **80 passed**。这些仅是该隔离候选目录的日志事实，不是 root 当前树 TDD、Gate 或真实微信证据；未独立重跑或推断空 type 日志等于成功。真实 OA 链路与 QA p5 journey 当前结果不由本审查签署。

## 2. 收窄后的私有失败图语义

接受 root 的具体收窄：取消任意 async sink，改为可信 factory 的 `privateFailureImageDir` 与 worker 自有保存器，默认关闭；root 仅显式配置本机私有目录。维持当前已核本人身份的视频号、typed prepare SECTION_MISSING、既有 Page 顶层 viewport 的一次取图；当前官方报表 origin/path 和明确 isLoggedOut 前后复核，路径变化、明确掉登录或检测异常则跳过。没有隐藏 iframe 操作、导航、重选、重发或第二浏览器所有者。

图片按敏感私有工件处理；root 已撤回“未知 UI 绝无 QR”的绝对承诺，这一撤回符合事实。既往 identity 校验不保证当前全部 UI 内容，但在已授权本人页面的本机排障中，只读捕获敏感内容不扩展公开权限。不新增未知 UI 词表，不以诊断是否取得阻断正常采集；任何截图跳过/失败都保原错误和五字段诊断。hash 只标识字节，不代表脱敏；图片、内容与路径不进入 public DTO、DB、业务报告、日志、Git、上传、分享或模型工具输入。

文件边界也合理：目录 0700、文件 0600、随机不含 ID 的 filename；晚截图 bytes 不保存。异步 write 带原 signal 并在 finally 清理临时文件；同步 rename 前后复核原 signal/end，后检已到期则 unlink。原绝对期限与取消不得转成截图的新执行窗口；诊断保存失败不遮盖原原因、不提交报告、不释放 lease。

**正确保证是“取消/到期后及时清理、永不公共或业务晚提交”，不是“已进入 OS 的 I/O 可以瞬间撤回”。** 同步 rename 临界区不会让 JS 信号处理器并发进入，但 wall-clock deadline 仍需 rename 后复核；不夸称本地文件系统完成时刻与信号派发能完全原子化。finally 必须在异步 write 实际结算后执行，不能只在外层 race 结束时先删临时名而放任 write 稍后重新产生文件；已由 root 的“自有 writer + signal + finally”语义覆盖，实际候选仍须对此有合成回归。清理失败应保持私有 pending cleanup 并重试原清理，不能打印路径或改变采集原原因。止停所有权仍由原 guard/backend/onStopped 真实证明，不由图像保存器拥有。

此方案属于已授权内部排障，无需因未知 UI 的假设另建用户审批；不声称已经实现或真人通过。共享 guard 的预检 await 在启动 race 前、source finally close 使用原协议等既有限制仍存在；本次预算修正和图片设计都没有修复或验收它们。
