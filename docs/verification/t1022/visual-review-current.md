# T-1022 当前页面视觉检查

2026-10-05。按项目 oil-ui-pro 0.10.0 做一轮独立视觉检查；独立检查者只读取 UI_RULES 与十张真实浏览器截图，未改代码、未访问数据、未用评分代替判断。下列修正由主 Agent 落实，后续截图和操作由主 Agent 复查，不能称为第二轮独立评审。

## 独立检查的结论与落实

| 观察 | 当前落实 | 验证限制 |
|---|---|---|
| 原首页丰富布局、品牌色及带日期/数值坐标的图已保留；播放和阅读分开 | 保持问候、五指标、三列六区块与侧栏底部组选单 | 未重新选择视觉方向 |
| 空图需要具体原因和可操作入口，最近发布空卡没有说明 | 首页图区分未绑定、公众号不参与视频趋势、缺少相邻日采集；提供账号与采集状态入口。发布空卡提供发布中心入口 | 空态不补虚构折线 |
| 指标缺少单位、图旁缺少数据时刻 | 指标标注次、条、期、人；粉丝明确未去重。趋势与比较注明真实采集时刻或下表逐账号时刻 | 指标截图使用受控样本，不能证明平台采集 |
| 筛选解释、日期及覆盖说明重复，挤压图表 | 移除重复筛选底文与总览重复范围，保留筛选状态和一处覆盖说明 | 未调整既有全局主题 |
| 单内容的标题在发布行与比较行重复，遮蔽实际账号 | 单内容标题集中展示，比较行保留平台和实际账号；发布版本保留真实标题，不再人为附加平台尾缀 | 多内容仍保留各内容归属 |
| 旧公众号复盘截图的筛选状态与文件名不一致 | 撤回旧 review-article-filter-final.png 的当前证据用途；重新打开明确公众号参数，检查 aria-pressed 和具体账号后取证 | 旧文件仅作历史，不声称其选中公众号 |
| 开发环境浮层可能遮挡画面 | 先修启动日志根因，截图保留实际开发环境，不用遮罩或 CSS 删除错误 | 开发模式不等同安装版 |

## 操作复查

真实浏览器在1366×900和1024×768通过18个文案检查点。最小窗口中折叠组选单曾无法打开；补齐真实 DOM 触发器后可切组。冲突提示曾暴露 HttpTransport 文本；沿用现有错误文案处理后显示可理解的版本冲突说明并保留输入。日志分别见 logs/collapsed-switcher-red.log、logs/collapsed-and-event-green.log、logs/error-copy-red.log、logs/error-copy-green.log 和 logs/journey-final-green.log。

独立检查未提供1280宽、原生200%和安装版的完整证据，不能推断这些已通过。启动修复接入并重启后，主 Agent 已实际查看 home-after-startup.png、home-chart-after-startup.png、overview-after-startup.png、analytics-after-startup.png、review-article-after-startup.png、publishing-after-startup.png、publishing-expanded-after-startup.png、publishing-records-after-startup.png、home-douyin-minimum-after-startup.png、empty-chart-minimum-after-startup.png 和 home-1280-after-startup.png；确认原版布局、图表坐标、单位、缺失原因、公众号筛选及无整页横滚。截图数值来自受控样本。原生200%快捷键尝试未观察到浏览器实际缩放，仍不能算PASS。此处不冒充用户已确认生产版体验。
