# T1237 设置窄窗口分类栏挤压内容与裁切

用户要求逐功能实测截图并及时修复明显问题。root在2026-10-11实际查看3921的390×844昵称保存图及RedFox保存图：设置左侧分类占约176px，右侧正文扣除padding后仅约135px，账户标题逐词换行、账户基本值被裁切，RedFox说明过度竖长。这两个操作例实际PASS不能当作视觉可用性PASS。

原证据已字节保全至 `docs/verification/t1232/before-next-settings-run/visible-copy/`，文件名分别包含 `nickname-saved-390`、`redfox-saved-390`。原公开保存/读回断言与旧PASS不改，原图不覆盖、不修图。当前源怀疑为 `settings-interactive-region.tsx` 的SettingsDialog横向Tabs固定侧栏，先读真实class及通用Dialog/Tabs组件再确定精确候选；不凭截图尺寸推定全部CSS。

按已安装oil-ui-pro 0.10.0、账号组UI_RULES保原品牌、tokens、桌面双栏、分类及权限。窄窗口应给实际表单完整可读宽度，分类仍由可访问真实tab选择，容纳七类而不裁按钮文字；键盘、隐藏panel、关闭/Escape、深链、保存位置和错误草稿保留。不得删分类功能或隐藏失败提示以装满屏。

当前只准本SPEC与 `docs/verification/t1237/**` 只读诊断和候选，不授权源/test或额外Next。后续需独立精确scope与正式绑定；如只涉及既有Dialog响应式布局则限定该现有产品文件。新增必要E2E以真实DOM几何、可见文字和实际点击/键盘判断，不能只断言新增class来镜像实现。原settings4283逐字不改；390、683、桌面1536实图和操作确认分类、保存反馈完整，宽窄不发生横向内容裁切，所有有限执行/等待至少120秒，单Next/fresh根/worker1/retry0，原ID图先保全。

本任务不改服务、模型配置归属、Skill权限、存储或其他已确认视觉方向。实际截图问题已确认，但尚无产品修复或浏览器GREEN；不代签原生App或全功能。系统Gate按实际结果记录。

精确候选见 `docs/verification/t1237/diagnosis-and-candidate.md`：仅改现 `settings-interactive-region.tsx` 中Dialog主体/nav/button/panels的响应式class。小于640px顶部两列分类、640–767px三列分类，正文全宽且独立纵滚；768px及以上恢复原176px左栏和正文24px边距。保现真实button的tab state、click/role/aria/data、七分类、hidden mounted、深链和关闭逻辑，不换Radix Tabs、不添加JS视口判断或另一份表单。

必要测试候选为新 `frontend/tests/e2e/settings-responsive-layout.spec.ts`：先原产品390px真实几何RED，原图/trace保全；修后390/683/1536的几何和实际操作GREEN。核分类文字完整、正文/卡/输入/按钮边界与横向无裁切、账户标题可读、真实分类click及Tab/Enter/Escape、hiddenpanel、深链、未保存昵称草稿切类返回保留、桌面原左栏。只读打开与编辑未提交中性草稿，不新增密钥写入或RedFox上游；原完整settings4283继续负责真实保存/结果回读，不能由只读新例代签保存反馈。若卡固有宽度造成真实新FAIL，先保失败并提出精确额外写点，不以overflow-x-hidden遮内容洗绿。新spec和单产品仍需正式绑定，当前只有docs准入。

```mermaid
flowchart LR
 A[窄窗口选择设置分类] --> B[正文获得完整可读宽度]
 B --> C[真实编辑与保存结果可见]
 C --> D[桌面保持原双栏]
```

## 纯样式验证适用纠正

独评与技能v3-4-build/13-tdd均明确纯样式不制造失败测试。本候选仅一个文件的响应式class，交互/状态/数据逻辑不改，故以上“先新增布局E2E RED”的拟定顺序被替代为：保3921及3923旧390真实图片作为视觉缺陷基线→最小class修复→新390/683/1536实际几何/交互smoke和原设置保存复验。未发生布局E2E RED，不能把旧图或纯样式前置检查补拍为RED PASS。现有密度/模型/Skill确定性状态bug仍各保实际RED要求。若需要新增JS/state/数据行为，另行精确范围复评并先真实RED。
