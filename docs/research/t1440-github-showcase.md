# GitHub产品首页参考与实现取舍

2026-11-06，T1440。参考 https://github.com/milind-soni/OpenMausBot ，已读取公开首页及原始README并查看真实浏览器。借鉴简短定位、产品入口、真实大图、功能图文分组、技术后置的信息顺序，不复制品牌、文案或截图。GitHub连接器当前不可用，使用既有gh登录读取API和ego-browser看实际页面。

GitHub官方Markdown API文档：https://docs.github.com/en/rest/markdown/markdown 。使用实际GFM渲染检查HTML保留情况。附件机制：https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files 。本轮不创建无关Issue或外部附件，用仓库内GIF作为9秒无声预览，点击进入既有官网87秒完整有声播放器；同时提供MP4直链，不把视频URL冒充图片src或承诺任意HTML video标签均保留。

仓库API实查visibility为PUBLIC，原README私有仓说法已过时；LICENSE是专有软件许可，首页据此区分“源码可查看”与商业使用授权，不改变许可或可见性。截图复用用户已授权公开的14图中的7张，GIF仅从已公开的官方视频35–44秒截取。保留深浅色提交活动图及既有自动更新工作流，移到工程区折叠展示。
