# CreatorOS购买页静态展示源

本目录保存2026-11-01按用户要求部署的CreatorOS购买页展示候选，线上根目录为`/var/www/creatoros-buy`。既有Growth工作区的大量未提交修改未参与发布。

- `creatoros/index.html`：CreatorOS专属静态页面，含可直接抓取的标题、介绍和14张真实截图。
- `products/creatoros.json`：原线上配置，只更改展示、SEO与产品FAQ。套餐、价格、接口、下载与客服保留原值。
- `assets/screenshots.css` / `assets/screenshots.js`：独立截图样式和键盘预览支持。
- `assets/store.js`：原线上共享交易脚本的完整只读快照，不部署覆盖此共享文件。
- `shots/wechat-qr.jpg`：原客服二维码的未修改快照，用于本地预览，不覆盖线上现有文件。
- 真实截图来源为上层`website/shots/real/`，部署到两个站点各自的`shots/real/`。
- `robots.txt` / `sitemap.xml`：购买站抓取入口，只为CreatorOS建立产品和图片站点地图。
- `nginx-creatoros-buy.conf`：保留原CSP、API和Moving配置，CreatorOS精确路由改为专属HTML，增加robots/sitemap精确静态路由。

发布时上传上述明确展示文件与新图片，比较已读回线上文件的SHA256，备份后替换，执行`nginx -t`再reload。不得rsync删除整个购买站，不部署Moving、交易JS、旧共享CSS、下载包或API。官网通用部署脚本已排除此`buy/`目录。
