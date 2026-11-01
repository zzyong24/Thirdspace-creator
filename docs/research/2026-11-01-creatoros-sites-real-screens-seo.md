# CreatorOS 两站真实截图与SEO核对（2026-11-01）

## 用户授权与素材

用户要求官网与购买页使用本次14张真实截图，并明确无需脱敏。覆盖首页、创作者总览、定位、雷达、选题、项目、脚本、知识库、素材、创作画布、发布日历、运营分析、自动化和模型设置。截图中的账号、内容、数据按原样公开；未另外读取私人产品数据。

使用cwebp无损编码并保留ICC色彩信息，不裁切、不打码、不重绘。ffmpeg将原PNG与输出WebP解码为相同RGBA格式，14张逐像素SHA256全部一致。原始9898955字节，WebP4510272字节。文件、尺寸、原图/输出SHA256与像素摘要见第三轮image-manifest.json。

## 部署现状与边界

官网为/var/www/creatoros/index.html；购买站为/var/www/creatoros-buy，CreatorOS与Moving原来共享根index.html与assets/store.js。为避免对Moving设置错误的CreatorOS canonical，使用CreatorOS专属静态HTML，只有/creatoros/改为该文件。Moving、共享交易JS、现有CSS、API与CSP不修改。

购买站产品配置只修改seo、hero、details与新增产品FAQ；commerce、downloads、downloadSection、support逐字段深度相等。真实图库写在HTML中，配置图库为空数组以避免共享JS重复插入；图片放大沿用原逻辑，仅附加独立键盘支持。两站在CreatorOS项目中保留可审查静态候选，Growth的大量既有未提交内容不参与此次发布。

## SEO依据与实现

- [Google SEO入门指南](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)：采用清晰且与实际内容一致的页面标题、描述、主标题与可抓取链接。官网面向功能了解，购买页面向购买与下载，各自使用独立canonical。
- [Google图片SEO指南](https://developers.google.com/search/docs/appearance/google-images)：真实图片放在HTML的img元素中，使用描述性文件名、alt与邻近功能说明；附加图片sitemap、明确尺寸与延迟加载。原图全部保留完整内容。
- [Google JavaScript SEO基础](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)：购买页在HTML响应中直接提供产品标题、说明和14张截图，避免主要产品内容仅在执行脚本后出现；交易交互继续由原脚本处理。

两站增加robots、sitemap、Open Graph和Twitter分享元信息及SoftwareApplication微数据。购买页不注入内联脚本，不放宽CSP；没有伪造评分、价格或规模，没有新增隐形关键词、排名承诺或无来源的能力。

## 验证口径

浏览器以真实公开展示与本次授权素材验证，不提交订单、不兑换或消耗真实码。检查两个视口、完整截图集合、鼠标/键盘放大与关闭、版本切换、购买方案切换、领取入口、刷新、缺图与横向溢出。静态检查验证两站canonical、H1、软件微数据、全部图片与原交易配置。SEO配置与可抓取性可以当场验证，搜索引擎后续实际收录与排名不作为本次可承诺结果。
