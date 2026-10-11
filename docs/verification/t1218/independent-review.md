# T1218 新建项目 E2E 合同前置独评

2026-10-11，已先读 T1218 Task Packet/SPEC，再只读原测试、当前表单/创建协调器/公共合同，以及 3901 targeted-output 中两例 error-context、trace 和首例失败截图。没有启动 Next、运行浏览器测试或修改代码。**范围 PASS**，实测 GREEN 待发生。

## 当场事实与当前合同

- 首例 trace 实际持续解析出两段，截图展示“作品主题”、文章/图文/视频多选、默认视频、描述及禁用的创建按钮；`new-project-form.tsx` 只为 name/brief 标记 `data-form-section`。`work-type-fields.tsx` 及创建协调器按用户选择生成 article/image/video 独立作品。旧四段、orientation/creation-mode 和“竖屏 9:16”断言不是当前新建表单合同。
- 第二例 trace 在 `dialog.toBeVisible` 的 5000ms 退出；error-context 只有“正在打开工作区”，没有证明当前表单 selector 错误或产品创建失败。必须长观察复测；不能提前把这例定性为 selector 故障或签成功。
- 当前 `NewProjectDialog` 使用 includeWorkType/advancedOpen，创建后默认路由至实际 `/projects/{id}`。公开 `projects.get` 和 `projects.outputs.list` 均有真实合同，可在原精确 group 下回读结果，不需要私有数据库。

## 允许的测试修改

仅 `frontend/tests/e2e/new-project.spec.ts`：每例经正常公共 `accountGroups.create` 建独立组，明确 cookie/localStorage 选择该真实组并核当前选择；不要复用前例组或伪造组行。保留原首页链接打开、真实 URL、对话框可见、关闭和成功标题断言；精确段顺序改为 `[name,brief]`，主题定位为 `dialog.getByRole('textbox',{name:'作品主题',exact:true})`，形式定位为 dialog 内以 `/^文章 /`、`/^图文 /`、`/^视频 /` 命名的真实 checkbox。

验证空主题不能创建、作品形式确实可多选及切换，随后每例都走真实 UI 创建与正常公共 get 回读：真实 project ID/title/group 与所选作品内容类型相符。不能只把四段删为两段就结束，也不能把后端直接创建代替 UI submit。原导航 regex `/projects/[^/]+` 也会匹配 `/projects/new`，必须明确排除 `new` 或绑定真实创建 ID，再核工作台和对话框消失，避免假成功。

新组路径不代签旧单账号兼容：原失败证据保持，T1217 独立验证 legacy 归属，不拿新 fixture 掩盖旧公共问题。不改产品、合同、权限、截图基线、skip 或结果断言。

T1208 诊断配置仅覆盖测试默认 timeout0 与 expect120000，spread 保留原数据库、网络隔离、重试等配置；无外层 test cap 不等于产品 deadline 被取消，原显式更长 test 预算仍保留。必要 await 应有真实完成条件和至少两分钟观察，取消有效，不以 sleep 代替就绪。最终需实际隔离浏览器两例及逐例截图/公开回读、类型和 diff 检查；本次不预签。
