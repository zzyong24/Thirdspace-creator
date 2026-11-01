# 官网与购买页真实截图及SEO交付

2026-11-01 已上线官网 `https://creatoros.aitongban.cloud/` 与购买页 `https://buy.aitongban.cloud/creatoros/`。用户明确授权公开提供的14张截图，无需脱敏，记录 DEC-143402。

## 实际改动

- 两站均展示14张真实界面截图，保留原始账号、内容与指标。PNG无损转WebP；逐张解码RGBA哈希一致，无裁切、打码或重绘。总量9,898,955字节降至4,510,272字节，完整清单见 image-manifest.json。
- 官网首屏、六个功能节点及完整截图画廊使用对应真实界面；购买页首屏与画廊同源。补充说明文字、等比展示、鼠标/键盘放大、手机横向查看原图细节及焦点恢复。
- 两站分别设置有区分的标题、描述、唯一H1、canonical、OG/Twitter图片和SoftwareApplication结构化数据；关键介绍及截图预渲染到HTML，补充robots与图片sitemap。围绕AI自媒体创作、选题、脚本、图文、封面、多平台内容运营与复盘组织真实能力文案，不编造评级或用户量。不承诺索引时间与搜索排名。
- 保留此前v1.2.0/v1.3.0版本命名、多平台介绍及旧顶部Mac验收包下载区移除。
- 购买页改为独立静态HTML，原共享交易JS/CSS、价格与购买/兑换配置、下载配置、支持配置及Moving页面保持原值；新增同源截图样式/键盘增强脚本。CSP与API安全配置保持原值。

## 验证证据

- website-tests.log：8/8通过。timeout-policy.log：项目超时策略验证命令通过，包含其实际执行的静态与回归检查，不代表桌面产品全量验收。
- local-verified.log：本地两站真实浏览器验证通过。
- frontend-report.md、browser-observations.json、visible-copy.json：线上两站，1440×1000与390×844，各14张截图及正确比例；无破图/整页横向溢出；鼠标/键盘预览与Escape、官网版本切换与方向键、刷新；购买页两套餐切换与领取入口通过，未创建订单或兑换。四张PNG记录对应视口。
- production-before.log保留旧线上缺少真实截图与SEO的证据；静态内容不补拍TDD红测。layout-before-fix.json及local-scroll-before-fix.log保留本地图片比例/滚动问题，修复后验证通过；production-image-wait-before-fix.log保留一次验收脚本10秒等待全部原图超时，随后显式延长验收等待并验证通过。正常页面仍使用懒加载。
- http-verification.json：HTTPS回读37个展示文件与部署候选SHA256逐字节一致；两站及robots/sitemap均200，Moving响应保持不变。
- 正式前端门通过7项后置条件，pmem同步已执行；quick/read-only reconcile为0 error / 2 warning（范围外既有看板超30KB与T-1420长行）。quick为控制面对账，不等同全量项目执行检查。taskctl已重新执行线上浏览器验收并完成任务，正式收据PASS:d06dc0a289c2，输出见task-complete.log。

## 部署边界与回滚

部署38个文件（含Nginx展示页精确路由），发布前核对旧文件哈希并备份，Nginx配置检查通过后reload；42个受保护文件未变，共享交易静态文件与Moving哈希未变。详见deployment.json与deploy-manifest-initial.json。

原始备份：`/var/backups/creatoros-t1434/r3-20261101T142833Z`。后续清理历史隐私示意说明时仅原子替换官网HTML，替换前版本另存该目录的`index-before-copy-cleanup.html`，见copy-cleanup-deployment.json；deploy-manifest.json记录最终候选哈希。

源码位于当前CreatorOS仓库的website/buy，未改动已有未提交内容的Thirdspace-growth目录。仅本地提交源码和证据，未推送GitHub。
