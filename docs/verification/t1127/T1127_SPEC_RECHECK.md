# T1127 SPEC Round 2 独立复核

结论：**PASS**。REV-001 已销账，产品仍未修改。

正式验证命令现于frontend typecheck后运行`node docs/verification/t1127/run-chart-visual.mjs`。runner通过esbuild真实导入当前ChartFrame与React，不复制组件SVG；从当前`.next`产物中要求唯一实际全局CSS。它使用同一合成数据在真实Chrome的1366/900视口生成PNG，断言轴、日期、summary、单点和null不连线，并在浏览器离屏canvas中解码同一PNG读取实际像素。after还要求non-scaling-stroke、round、6px、title及5–7px圆形像素。路由全部abort，0模型、平台操作与数据库写，采证前后四个源SHA保持。

`humanViewed=false`明确自动采证不能代替root实际看图；该人工证据仍是实施验收项。baseline native decode实际exit0、11.480秒，仅证明当前旧组件的before采证入口可运行，不代签after实现。

首次PIL缺失属于T1128验证依赖，不是产品RED。runner没有安装或引入全局PIL，只改用同一Chrome内建canvas读取同一PNG；原失败保留。
