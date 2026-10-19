# T1294 存量界面及默认路由独立复核

结论：已观察的设置、充值入口及助手布局可继续沿用现有视觉方向；默认来源、只读投影、原 revision CAS 与 Codex 缓存的当前接线未发现新的确定阻断。发现的两个 hook 问题已有 Root 当场红绿回归并修复。**本报告不代表 Codex 聊天完成，也不代表 T1294 整体通过。** 原公共新对话仍有真实 `WORKER_EXECUTION_INTERRUPTED` 失败，交另一路诊断。

本轮仅写本目录；生产、测试、控制面及原失败证据均未修改，没有启动服务、模型、充值或重发任务。当前源码 SHA、证据 SHA 见 `SOURCE_BINDING.json`、`VISUAL_EVIDENCE.json`。后续改变相应源码须重新核对绑定。

## 审查方法与独立性

依据项目内 oil-ui-pro 0.10.0、UI_RULES 对已有界面做一轮审查，不打分，不探索新品牌方案。审查者未编写本轮 UI 生产候选、默认策略或缓存实现；曾执行本轮浏览器验收，复用了任务历史和浏览器上下文。因此是独立于这些实现作者的复核，**不是无历史上下文的盲测视觉评审**。本人编写的 search 候选完全排除在本次独立源码评审之外。

阶段为已获初审 PASS 的 T1294 BUILD 验收；技能与项目流程版本同为 3.29.0。本子任务不改变看板状态、不另行代签 Gate。

## 实图判断

已实际查看 prepared-7a28 的默认模型设置、图片混合来源、真实 CAS 冲突、RedFox 掩码、充值未配置错误、助手桌面、390 窄窗、CSS zoom 失败图、聊天失败图，以及 CSS 640×450 / DSF2 的原滚动证明。逐图路径与 SHA 保存在视觉清单中。

- 页面延续原白底、紫色品牌、正文及语义错误样式，复用原表单、按钮、弹层和工作台；没有借此次简化删掉其它工作台内容。
- 四个主要来源入口易于比较；图片保持一个选择入口，同时保留理解与生成/编辑的真实用途状态。已保存来源和草稿选择分开表达，CAS 冲突出现在原位置并保留草稿。
- RedFox 已移到模型设置，保存后显示掩码，重开与删除沿原接口。截图没有展示已有秘密。右上角充值入口存在，未配置时有真实错误及模型设置入口，没有假余额或成功提示。
- 助手已去画布入口和重复检查横条；官方未配置时仍保留真实“文本：未配置 / 模型设置”，不能为了截图干净而隐藏该错误。
- 窄窗内容可在原弹层内部滚动，没有观察到横向溢出。短窗口允许滚动到达操作，不要求所有内容无滚动同屏。

有三项可选改进，不要求扩大本轮范围：来源行重复的“当前使用”及 `0/44` 用途计数偏技术，可减少重复而保留准确状态；充值“权益配置同步尚未启用”接近内部开关措辞，可按真实合同改为更易懂的原因；助手双重标题和空态说明占用较多短窗高度，可在后续减少重复文案。它们均不能作为阻断合法任务的新质量门。

## 200% 布局证据的准确含义

原 `html { zoom: 2 }` 不改变 CSS viewport，不等价于桌面页面缩放。其助手截图确实裁切，原图及原失败原样保留。初始机械用例通过不构成视觉 PASS。

补充观察采用 `innerWidth=640 / innerHeight=450 / devicePixelRatio=2 / htmlZoom=1`，物理截图 1280×900，用于等效小 CSS 视口布局检查。初始发送按钮 bottom=564.5 超出 450，原几何记录仍标 FAIL。沿原内部滚动后，标题、输入、发送、关闭均完整在 viewport：发送 y=352.5、bottom=388.5；输入 y=152.5、bottom=204.5；标题与关闭仍留在顶部。documentScrollWidth=640，无横溢。这个结果证明原滚动可以到达控件，**没有证明初始无滚动同屏，也没有真机 OS 缩放证明**。没有因该检查修改生产 CSS。Root 的 revision2 用例将按此准确语义另跑，不把候选当已跑结果。

## 默认策略、保存和冻结

`model-routing-defaults.ts` 优先保留完整已存 choices；仅在没有完整选择且服务端 legacy 明确 codex 时保留旧文本/理解/生图 Codex，其余默认官方。没有按许可证、已有 Key、模型名称或浏览器缓存推断选择，没有 GET 自动 PUT 或删 Key。

settings GET、通用新任务根和聊天新任务根均复用此策略。通用根有 trustedRoute 时首先返回原冻结路由；新根才冻结当前完整 map/revision。聊天按实际 text/vision 主用途冻结，使用同一真实快照取得 requestedModel；没有以占位模型 ID 伪造冷启动 ready。

设置保存先检查原 expectedRevision；只有本次新切入 Codex 的具体 family 才做真实检查。外部检查在原数据库写锁外完成，之后进入原偏好锁再次读取 revision 并 CAS。并发窗口在检查期间保存时，旧请求仍被最终 CAS 拒绝，不覆盖其它窗口。生产 projection 端口已实际装配；兼容旧单测构造的可选注入不等于生产绕过检查。

## peek、缓存、取消及新提交

普通统一来源投影使用 `purpose=peek`；没有状态缓存时准确显示 unverified，不创建 Worker 探针。显式设置切换使用 force check；实际提交使用 read：成功且含真实 defaultModelId 的结果可复用，失败缓存会再次实际核验。旧专用 engines API 为兼容入口保留，不把它误写成全部调用端都已 peek。

缓存按真实 userId 及宿主文件/受控环境代际隔离，合并同代同用户的在途读；响应 schema 解析、复制返回，不把 secrets/raw RPC 当缓存值。一个观察者取消只移除自身；最后一个取消才中止该在途检查；取消或旧代迟到结果不写入新代成功缓存。stop 拒绝观察者并等待 IO 清理。跨进程只持久化选择，没有编造跨重启 verified 记录：重启无缓存仍由一次实际提交握手取得身份，Worker 仍有最终认证/能力校验。

先前失败缓存导致无法显式新提交的问题：Root `codex-recovery-admission-red.log` 当场 4 FAIL / 21 skipped，修后对应两文件 86 PASS。当前 hook 只对 Codex、unavailable、四个既定可恢复观察码允许 canSubmit；available/textAvailable 仍 false，原错误仍展示。版本不支持等确定失败保持阻止；允许点击不等于模型成功或绕过后端冻结。

先前冷窗口 focus 隐式导入旧浏览器 Codex 偏好的问题：Root `cold-focus-default-red.log` 当场 1 FAIL / 25 skipped，修后 `cold-focus-default-green.log` 三文件 90 PASS。当前 hook 已不订阅旧 assistantEngine store，也不读旧偏好；routing 尚未 ready 时仅用服务端 legacy 或 pi 占位，focus 只刷新统一来源 GET，不进入旧 localStorage→initialize PATCH。显式旧 writeAssistantEngine API 原功能保留。本次阅读未发现其它生产旧订阅消费者。

## 验证归属和保留失败

Root 日志还包括默认策略 9 PASS、缓存及公共接线两文件 21 PASS；这是读取到的当场日志，非本审查者重跑。详见绑定清单，不回填过去证据。原浏览器 10 例为 9 PASS / 1 FAIL，真实 Codex 对话未得到可读 assistant 文本。原 CSSzoom2 及 initial geometry FAIL 亦保持。

本目录两次独立 harness 尝试分别在模块解析、Vitest 新版 it 参数签名阶段失败，均 **0 个测试被执行**；文件和日志保留，只作为测试准备失败，不称 RED、不计入通过数。Root 接管正式公共 hook 测试后未继续重复造测。

没有验证所有模型配置展开、键盘 Tab/Esc 焦点闭环、reduce-motion、真实原生 App/OS 缩放或新的完整聊天成功。截图中的开发 Next Issues 标识不是正式包视觉证据。本报告没有修改或停止 Root 的服务，也不声明其进程已清理。
