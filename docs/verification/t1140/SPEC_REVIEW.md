# T-1140 正式 SPEC 独立首轮评审

- 审查时间：2026-10-09T16:23:30Z
- 结论：**CHANGES_REQUIRED（正式记录预期为 CONCERNS）**
- SPEC SHA256：`f061a76fe8f9398a07be555f26849c5a4a1010482ce80c6adb1bddfa61fa1fa7`
- constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- UI_RULES SHA256：`a19d209281fe1a51463c7c2b8a063c3fa117d53679762f33d8c9637004bc8d76`
- oil-ui-pro SHA256：`a623059117b5afdeaf437a6ac0944040ba666b0847e520cfe4fa42cc1ea1cec2`
- modules SHA256：`d859f5d49e3330ca115e9304e1ac9f3b3e715a06ec17ddc29422054c34811ee9`
- 当前 AssetPicker SHA256：`ab1b7323dc1947c6352b0ead2a0e2747b9d371406c30a641b4fbceaf831c04f3`

## 总体判断

产品方向合理且足够窄：只重排 field 弹窗空间，不改 gallery、媒体下载、精确 file、owner、搜索分页、确认单在途或业务语义。`object-contain`、身份、不可用原因和“无预览仍可合法选择”均被保留；`showIdentity=false` 只允许删真正无内容的卡片文字容器，不会删除错误或即时动作。该设计没有以裁切、缩字或隐藏预览掩盖问题。

实际查看的 683×450 图证实低高度下图库缩略图与右侧预览只能显示主体上缘，而底部操作仍可见。源码也吻合：field 在 `md` 前上下堆叠，图库与 aside 各自滚动，候选媒体固定 `h-48`。因此修复对象与根因方向成立。

当前仍有两个正式准入缺口，产品不得开始修改。

## REV-001：T-1140 尚未进入正式模块边界

SPEC 列出了产品、E2E、runner、证据和控制写集，也列出完整验证族，但当前 `modules.config.json` 没有 T-1140 条目。没有机械写集和 `verify_commands`，无法阻止实现越过唯一产品路径，也无法保证真实 Chrome、原组件/source/media、LED-047、类型与静态门按已确认预算执行。

修订要求：正式 record/start 前增加 T-1140 模块，产品写集仅 `frontend/src/components/media/asset-picker.tsx`；测试、runner、SPEC/review/证据与必要控制文件逐项列明；验证命令落实 SPEC 的真实 Chrome、原组件与 source/media 回归、LED-047、frontend type、boundary/semantic/orphan/diff、timeout、pmem 和 reconcile，保持 0 retry 与不少于 120 秒的既有预算。

## REV-002：低高度验收没有覆盖正式最小窗口的 200% 等效高度

SPEC 明确宿主最小窗口是 1024×680，并以压力视口验证低高度，但五个视口最低高度仍是 450。若按 SPEC 所称的 200% 等效 CSS 空间，1024×680 对应约 512×340。390×450 更窄，却没有覆盖更关键的 340 高度；因此可能在标题、筛选、正文主滚动区和固定 footer 总高度超过可用空间时仍通过全部计划验证。

修订要求：在真实 Chrome 视口中加入 512×340，或加入更严格且说明等价关系的 `height <= 340` 代表视口；核正文唯一滚动区可达完整预览、标题/搜索/筛选和 footer 不互相遮挡、确认按钮可见、键盘焦点可达。若产品正式支持策略并不要求 200% 下覆盖宿主最小窗口，SPEC 必须明确真实来源与限制，不能继续把 683×450称为该边界的充分代表。

## 其余边界

- T1136 full/strict 尚未闭合时不得修改 watched AssetPicker，SPEC 已明确这一点。
- 当前未运行任何 T1140 测试或浏览器旅程，也没有产品实现；本评审不补拍 RED/GREEN 或视觉 PASS。
- T1135 HOLD、原39项全局欠债、原生安装、视频导入、模型与平台操作均不属于本轮可签范围。

两项 finding 都是原验收目标的机械闭环，不扩展产品功能。完成后可按冻结字段提交 recheck。
