# 章节 A:安装激活 + 授权 + 账号体系(多抖音号切换)

> 日期:2026-07-26
> 任务:T-528 新用户 0→1 标杆路线 · 功能域盘点分章
> 方法:只读代码盘点(subagent),每条断言附 `file:line`;无证据处标 ⚠️未验证
> 对照:产品宪法 [docs/产品定位.md](../../产品定位.md) §7 记「身份、激活、首启 = 部分实现」「多抖音号 = 部分实现、发布阻断」

核心结论:**登录/注册已下线(单机免登录),桌面态唯一「门」是激活码激活;账号体系以「抖音号」为工作区隔离单位,靠扫码绑定 + 侧栏切号。**

---

## A-1 桌面激活 / 授权(路由 `/activate` · 入口=layout 门自动弹入,非手点)

- **如何到达(新用户第一步)**:不是用户主动点的。桌面壳启动 → sidecar 拉起 Next → 访问任意 `(creator)` 页 → layout 授权门判未激活 → 自动 `redirect("/activate")`。证据:`frontend/src/app/(creator)/layout.tsx:105-107`(`if (!(await isActivationAllowed())) redirect("/activate")`)。
- **页面/组件主文件**:`frontend/src/app/activate/page.tsx:27`(Server Component)+ `frontend/src/app/activate/activate-form.tsx:42`(客户端表单)。
- **首次进入(空态)小白看到什么**:一张卡,标题「激活 CreatorOS」+ 副标「首次使用请输入激活码。激活将绑定本机(一机一码),年卡到期前可离线使用。」+「激活码」输入框 +「激活」按钮。到期场景标题变「授权已过期」。证据:`page.tsx:49-66`。
  - 底部「联系授权方」链接**按激活码所属渠道运行时下发**;无渠道缓存时降级为纯文案「请联系你的授权方获取激活码」,不渲染任何链接(SPEC §7 红线,防代理码用户看到官方定价页)。证据:`page.tsx:67-85`。
- **主路径**:
  1. 输入激活码点「激活」。表单从 DOM(FormData)读码,不信 React state(autofill 不触发 onChange)。证据:`activate-form.tsx:52-53`。
  2. 桌面壳分支:走 **Tauri IPC `license_activate`**(Rust 侧验签 + 防重放 + 防回拨,前端只拿 `GateDecision`)。证据:`activate-form.tsx:37-40,62-68`;Rust `frontend/src-tauri/src/license.rs:2216`,注册于 `frontend/src-tauri/src/lib.rs:1252`。
  3. `decision.licensed=true` → **整包 relaunch**(`@tauri-apps/plugin-process`),让 Rust 壳下轮启动重跑 verdict 重签 licensed token。证据:`activate-form.tsx:69-82`。
  4. 失败 → 内联透传可读 message(已过期 / 已被其他设备使用 / 网络错 / 码无效)。证据:`activate-form.tsx:65-66,104-107`。
  5. web/dev 分支:沿用 `POST /api/v1/activate`(web 无激活门)。证据:`activate-form.tsx:93-111`。
- **关键前置依赖**:
  - 桌面壳判据唯一 = `CREATOROS_DESKTOP === "1"`(Rust spawn sidecar 时注入)。证据:`frontend/src/server/activation/is-desktop.ts:10-14` + `lib.rs:1608,1719`。
  - 激活门本体 `isActivationAllowed`:dev 豁免(`NODE_ENV≠production && CREATOROS_DEV_MODE=1`),否则读 `CREATOROS_VERDICT_MODE === "licensed"`。证据:`frontend/src/lib/activation-gate.server.ts:41-46`。
- **常驻授权心跳(运行时二次门)**:`frontend/src/components/shell/license-heartbeat-bridge.tsx:28`,挂在 `(creator)/layout.tsx:159`。Rust 心跳(内测 60min / 买断 30 天,`license.rs:1975 startup_license_task`、`lib.rs:1492`)每轮广播 `creatoros://license-decision`;桥收到 `licensed=false`(内测到期/离线超宽限/吊销)→ 立即 `router.replace("/activate")`。证据:`license-heartbeat-bridge.tsx:38-46`。买断码 fail-open,离线不锁(`license.rs:50-51,174`)。
- **产出 & 衔接**:激活成功 → relaunch → 门放行 → 进 `(creator)` 主应用 → 落到首页 onboarding 引导(下一步「绑定抖音号」)。
- **⚠️ 未实现 / 需真机**:
  - Rust 公钥曾是占位(`license.rs:34` TODO),**已于 2026-07-17 填真钥**(`license.rs:288` 注释「真钥已填」),配对 L1s activation-manager。
  - 激活码端到端(真实向 L1s 签名服务验签)属**需真机 + 需服务端在线**验证路径;本轮**未跑真机激活**,⚠️未验证真实激活码走通。
  - **安装器阶段激活不存在**:未见 installer 阶段 materialize 激活脚本(grep 无命中);激活发生在**首次运行时**输码,非安装时。
- **归档小结**:桌面态首启被 layout 门弹到 `/activate` 输一次激活码,经 Rust IPC 验签 + 一机一码绑定 + relaunch 放行;web/dev 永不触发此门。

---

## A-2 登录 / 注册(路由 `/login`、`/register` · 均已下线)

- **如何到达**:直接访问 → **无条件 `redirect("/")`**。证据:`frontend/src/app/login/page.tsx:6-8`、`frontend/src/app/register/page.tsx:5-7`。
- **主文件**:`login/page.tsx`(8 行纯 redirect)、`register/page.tsx`(8 行纯 redirect)。表单组件 `login/login-form.tsx:32`、`register/register-form.tsx` 仍在仓但**不被页面渲染**。
- **小白看到什么**:看不到登录页,直接被送回首页。**产品打开即用**,以本机主用户直通(`request-context.server.ts`:无 session token → 本机主用户)。
- **核实「单机免登录」**:✅ 属实。侧栏用户卡 `UserProfileCard` 是**纯展示 div,不挂任何登出/切用户菜单**(原名 UserProfileMenu「名不副实」)。证据:`sidebar.tsx:446-499`。`/api/v1/auth/logout`、`/login`、`/register` route 与表单**保留给脚本/curl/未来多用户或 web 形态**,非当前 UI 主路径。证据:`login/page.tsx:4-5`、`register/page.tsx:3-4`。
- **⚠️ 说明**:`(creator)/layout.tsx:96-100` 仍有 `if (!session) redirect("/login?from=…)` 的 session 门,但单机下 `resolveSession` 恒以本机主用户直通,故实际不会走到 `/login`(而 `/login` 又 redirect 回首页,不死循环,语义是「永不需要登录」)。登录/注册表单为**保留态,非活路径**。
- **归档小结**:单机免登录——登录/注册页已下线只做 redirect,新用户不经任何账号登录,打开即以本机主用户进入。

---

## A-3 账号体系 + 多抖音号切换(路由 `/accounts` · 入口=侧栏账号切换器 + onboarding 第一步)

- **如何到达**:三条入口:
  1. 首页 onboarding 引导**第一步「绑定你的抖音号」CTA → `/accounts`**(`onboarding-steps.ts:113-118`);
  2. 侧栏左下账号切换器下拉底部「绑定新抖音号」→ `/accounts`(`account-switcher.tsx:318-322`);
  3. 0 号守卫整页引导「去绑定抖音号」→ `/accounts`(`zero-account-guidance.tsx:61-67`)。
- **主文件**:路由 `frontend/src/app/(creator)/accounts/page.tsx:21`;视图 `frontend/src/features/platform-account/account-manager-view.tsx:22`;交互岛 `account-manager-interactive-region.tsx:95`(`CreateAccountForm`)、`:201`(`AccountRow`);切换器 `frontend/src/components/shell/account-switcher.tsx:105` + 纯逻辑 `account-switcher-logic.ts:32`。
- **首次进入(空态)小白看到什么**:`/accounts` 页 =「绑定抖音号」卡(单一主按钮「扫码绑定新抖音号」)+「我的抖音号」列表,空列表显「还没有绑定抖音号。点上方『扫码绑定新抖音号』即可。」证据:`account-manager-view.tsx:37-51`。若停在需要账号的创作页,整页被 `ZeroAccountGuidance` 替换成「先绑定一个抖音号,再开始创作」+「去绑定抖音号」。证据:`zero-account-guidance.tsx:41-77`。
- **绑号主路径**:
  1. 点「扫码绑定新抖音号」(`account-manager-interactive-region.tsx:156-164`,`data-testid=bind-douyin-scan`)。
  2. 调 `client.loginDouyin({ body: { forceNew: true } })` → **后端弹本机 Chrome(headed)出二维码让用户扫码**(全新空 profile 必出码,不复用旧号)。证据:`:107-115` + 注释 `:84-88,169-176`。
  3. `res.loggedIn=true` → 后端按 `secUid` upsert(命中已有号=更新昵称/ID、无则新增)+ 占位号合并 → `notifyAccountsChanged()` 广播 + `router.refresh()` 读回真实号。证据:`:116-125`。
  4. 超时/未扫 → 明确提示「未检测到登录,请重试(需在弹出的 Chrome 窗口内扫码)」,**不写假号**。证据:`:126-132`。
  5. 账号行 `AccountRow`:显真实昵称 + 抖音号 ID(若已回填)+「隐藏」;隐藏走 `client.archiveAccount`(status→archived,可逆,永不硬删),非末号须逐字键入「我已确认隐藏该账户」二次确认,**末号禁隐藏**。证据:`:201-329,45,267-278`。
- **多号切换(侧栏切换器)**:
  1. 挂载拉 `client.listAccounts({ platform: "douyin" })`,归一「当前号」走纯逻辑 `resolveCurrentAccount`(无 current→自动选第一个 active;stored 失效→清除回落)。证据:`account-switcher.tsx:122-153`、`account-switcher-logic.ts:32-50`。
  2. 下拉列 active 号,点选切号 → 写 `localStorage['creatoros:current-account']` + 镜像服务端 cookie(`syncCurrentAccountCookie`)+ 广播 `accountsChanged` + `router.refresh()`。后续请求由 http-transport 自动带 `x-account-id` header,server 验属主后按号过滤。证据:`account-switcher.tsx:92-103,185-192`。
  3. **仅当有进行中前台操作(AI 生成中/表单提交中)才弹确认**「有进行中的操作,切号会离开当前页面」,否则默认直切。证据:`account-switcher.tsx:194-206,337-382`。
- **核实「切号=切整个工作区,知识库独立/模型配置共享」**:✅ 代码印证。
  - 切号=切整个工作区:`account-switcher.tsx:16-25` 明写 [T-332 S4],`router.refresh()` 覆盖 RSC + 事件覆盖 island 内旧号态。
  - 知识库独立(per-account 隔离):`zero-account-guidance.tsx:58-59`「工作区按抖音号完全隔离:定位、选题、项目、知识库、素材、发布数据都归属于具体账号」。
  - 模型配置共享(user 级):`zero-account-guidance.tsx:20-21` 把 `/settings` 列入 0 号白名单并注「模型配置等 user 级共享配置(C-01 裁决:模型配置共享)」。
- **关键前置依赖**:必须先有 ≥1 个 active 抖音号,否则所有 per-account 创作页被 0 号守卫替换成绑定引导(白名单 `/accounts`、`/settings`、`/activate`、`/login` 及首页 `/` 放行)。证据:`(creator)/layout.tsx:120-141`、`zero-account-guidance.tsx:18-38`。绑号本身依赖后端 headed 扫码链(本机 Chrome + 抖音网页登录)。
- **产出 & 衔接**:绑成功 → onboarding 第一步 done、解锁后续步(配文本模型 → 确认起点 fresh/existing → existing 走后台数据初始化 → 定位 → 首个项目)。证据:`onboarding-steps.ts:111-176`。切号则整个下游工作区按新号重取。
- **⚠️ 未实现 / 需真机**:
  - **真扫码端到端(DATA-2)真机待验**:交互层明确标注「headed 扫码端到端卡真机」「真机待验」。证据:`account-manager-interactive-region.tsx:20,88`。⚠️未验证真机扫码走通。
  - 抖音号 ID(externalId)**若契约未随行带则不显(不造假)**;粉丝数暂无按号聚合 metric,不显。证据:`:231-234,19-20`。
  - `listAccounts` 客户端返回类型有已知缺口,靠 `as unknown` 断言取列表(工程 workaround)。证据:`account-switcher.tsx:122-131`。
- **归档小结**:账号体系以「抖音号」为工作区隔离单位——`/accounts` 弹本机 Chrome 扫码绑号(upsert 去重),侧栏切换器一键切号即切整个工作区(知识库/项目 per-account 独立、模型配置 user 级共享),0 号则全局引导先绑号。

---

## 跨子域关键事实(供路线文档串联)

1. **新用户真实 0→1 首启链**:桌面壳启动 →(未激活)`/activate` 输激活码 IPC 验签 relaunch → 进主应用首页 → onboarding 第一步「绑定抖音号」→ `/accounts` 扫码 → 配文本模型 → 确认起点 →(有存量)后台数据初始化 → 定位 → 首个项目。
2. **三道门层次**:① `(creator)/layout.tsx:96` session 门(单机恒过)→ ② `:105` 激活门(仅桌面态拦)→ ③ `:140` 0 号引导守卫(非安全门,fail-open)。运行时另有 ④ 心跳桥即时踢回激活页。
3. **web/dev 全程不被授权卡**:`isActivationAllowed` 与 `isDesktopRuntime` 双短路,心跳桥封装内 `isDesktopRuntimeClient()` 返回 null 零副作用。
