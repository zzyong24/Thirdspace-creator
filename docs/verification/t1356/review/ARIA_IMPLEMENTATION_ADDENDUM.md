# FR1356-7 无障碍名称落实的窄增补

2026-10-19 Root读实现裁定：保`dashboard-recent-plays`稳定内部标识，中文只作可读名称。现HorizontalBarsChart的slot同时生成data-slot/svg/axis和aria-label，没有独立可读名。原两文件实现把中文传slot，会使内部选择器随文案变化；不以此交付。

必要新增写集仅`frontend/src/components/analytics/horizontal-bars-chart.tsx`：可选`ariaLabel?:string`，figure使用`aria-label={ariaLabel??slot}`，默认不变。原DashboardTrendCard仅小红书传“近期作品累计浏览”，slot永远保`dashboard-recent-plays`。不改图形/数值/自然日/排序/单位/生命周期，不改其它调用者。

真实现有DashboardTrendCard小红书0用例同时断言中文figure名和稳定slot/svg/axis，原中文slot方案产生消费者RED。原其它平台图卡回归保默认。曾试加primitive重复单测的首失败日志`aria-independent-red.txt`原样保留，随后按Root收口删除该冗余测试，不用其代替消费者RED或宣称新业务缺陷。最终只用现消费者测试与既有primitive保护。

这是FR7已审目的的实现合同纠正，不改R3原SPEC/原评审字节，也不是新视觉方向；独立实现/合同复核另存，不伪造第四轮SPEC。
