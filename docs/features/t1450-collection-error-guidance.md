# 采集失败提示与登录证据一致

用户要求解决视频号多次扫码后仍被要求重绑。T1449修复旧登录等待恢复；本任务消除另一处已确认误导：scheduled-collection-runner将普通export/xlsx异常解释成可能登录过期并建议重扫，且self.metrics/comments/self.detail固定显示抖音。定向诊断已证实当前月明Verse登录有效，实际报表失败尚未解决。

范围：只改runner既有人话文案与回归。不新建公共operation、数据表或凭据，不改变状态分类、采集、身份判断、预算或重试。跨平台共有source名称使用账号作品数据、作品评论、作品明细数据，不从错误字符串猜账号平台。

验收：非登录export/xlsx/格式错误仍落failed，提示查看原任务详情并重试，无登录过期/重扫码推断；结构化未登录判定仍落needs_reconnect并明确账号管理扫码引导；成功、普通错误及incomplete结果使用中性数据名称，真实items/终态/保留数据不变。先通过runner公共入口RED→GREEN，跑runner、scheduled flywheel及公众号/视频号既有原生报表链、backend类型、timeout-policy与boundary回归。真机诊断不能冒充报表同步成功，安装版生效另记正式交付证据。
