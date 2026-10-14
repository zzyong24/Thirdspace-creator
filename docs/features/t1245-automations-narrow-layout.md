# T1245 修复自动化窄窗口筛选挤出与任务查看不便

用户要求继续全面验证并及时修复明显bug。3938公共自动化runNow/真实缺绑定等待/同ID/错组旅程PASS，但root亲看390×844原PNG：账号筛选超过面板右边，快速创建卡标题逐字挤列；当前截图未把原作业滚动到视口，不能据其签窄任务操作可达。原PASS/PNG/trace完整保留。

先按oil-ui-pro0.10存量最小修复路径盘点正式tokens、父布局、筛选/快速创建/JobRow/运行Dialog消费者。保持品牌、原全部功能和1366桌面布局，修窄窗控件可达与对象标题可读，不删除快速创建/筛选/历史/扫码，不改业务归属、runNow、轮询、API或共享导航。若根因确实在全局shell或超出单页面可安全修复，先写明确诊断和范围，再独评，不暗改其它页面。

诊断阶段仅SPEC及docs/verification/t1245/**；准确CSS/测试新增候选经独评和绑定后实施。原3938 PASS不改成FAIL，新增视觉缺陷单独记录。新验收仍fresh正式组/媒体账号/无binding作业、真实UI唯一runNow、原ID读回、桌面/900/390；截图前把原任务与主操作真实滚动到可见范围，测量筛选、标题、任务按钮/扫码/弹层边界，保旧全部断言。共享config不变，SDK/action/request/expect120秒、有限命令project与独立driver覆盖清理，单Next/worker1/retry0。不是测试安装版或小红书扫码成功。

```mermaid
flowchart LR
 A[原390真实截图发现挤出] --> B[正式布局与tokens定位]
 B --> C[独评最小响应式修复]
 C --> D[同原作业实际操作与几何]
 D --> E[新原图加到验收页]
```

## 原trace的动态诊断更正

独立只读原3938 trace发现：setViewportSize后约70.803ms即开始screenshot，Sidebar实际matchMedia自动折叠有200ms宽度过渡，原图约150px栏不能判稳定侧栏宽度或跨页shell缺陷。当前shell已有min-w-0/Radix block-w-full，稳定w-16为64px；不改全局shell。新候选须先等真实稳定宽度再测控件/任务几何、滚原job到视口留图。CSS候选暂不实施；先原产品+新覆盖单次公共3939，稳定布局若PASS只修验收截图流程，不能为瞬态旧图强加产品CSS；稳定布局若实际RED，再按已独评精确CSS候选修/GREEN。原PASS/原图不改，仍不签3938窄扫码。

## 3939 当场稳定 RED 与选择的修复

原产品d353ca/测试748976单次3939自然exit1，36.656秒；稳定侧栏64px后Radix viewport clientWidth326/scrollWidth530，真实原失败PNG仍见账号select向右挤出。故只选择已独评CSS候选1904和1924两个筛选区hunk，改label/select可收缩与窄窗纵排、账号长文本换行；不动快捷卡、job或运行Dialog，因为稳定新图尚未证明它们需要改。保全部原断言，3940另目录复验。

该轮HEAD及3652非dist声明文件前后相同，但11个ai-worker/dist文件被正式predev build重建，冻结布尔值false原样保留；不冒签全读集冻结或其它历史任务成功。

## 3940 当场第二个稳定 RED

仅筛选修复后3940自然exit1/35.837秒，3663读集及HEAD前后完全相同；390筛选、快捷卡、原job三按钮和原run Dialog已过且留4张新图，900筛选/快捷/原job也过。到900运行标题Text Range与真实关闭按钮重叠断言FAIL，原PNG可见末尾长名称顶到关闭按钮。只再选独评候选1334标题header hunk，保关闭区、图标不可压缩及标题自然换行。未选quick-card/job/status/error其它候选hunk；全部测试断言继续不动，3941新目录复验。

## 当前最终验收事实

3941全部公共链与三视口几何PASS/53.994秒，但仅tsconfig原记录895→4a6漂移、整体freeze=false不改。后续3942保存当前完整895配置字节，同96c88产品/748976测试、新fresh数据单次重验自然exit0/34.566秒，3663声明及HEAD一致、服务自然清理；3视口12原图/完整同runAIexecution原值/错组404全到达，独立复核PASS。仅隔离UI和授权等待，不验真人扫码/采集/模型/安装版。图库本地浏览器打开及54张图解码、五条原PASS/FAIL实际打开均exit0；原失败不覆盖。

正式test eslint/type/diff本轮0；产品旧11lint诊断与原d353逐条相同（T1203）；超时verify动态168PASS，22静态FAIL/exit1保留。先前全局reconcile本轮自然24错误均有历史原文归类，不签全功能全绿。重大收尾/提交、打包、安装及缺失正式UI旅程Gate仍待完成，未补拍历史Gate。
