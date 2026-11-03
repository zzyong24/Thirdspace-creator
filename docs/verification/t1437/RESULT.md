# T-1437 飞书模型折扣与价格表更新完成

用户确认折扣见USER_CONFIRMATION.json；公开目录来源见omnihi-public-price-source.json。新表均已实际写入并回读。

- [体验与快速上手](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe)
- [正式版下载与安装](https://my.feishu.cn/wiki/QY1owmFUjit7VgkpmQ1chGPCnTR)

两表包含6个新文本型号的9行输入/输出分档与13行缓存分档，所有价格保留目录原币种及计费单位。文本折扣为4.5/4.2/4.2/6.5/6.5/6折；Image 2没有折扣，不调整当前价格，其他媒体计费未改。网页报价不是原厂价的替代定义，正文明确原价指所列服务目录报价，最终使用及结算以应用和实时账单为准。

实际回读：
- trial：revision 188，9行输入输出＋13行缓存逐格一致；原资源15项全部原样保留。
- guide：revision 226，9行输入输出＋13行缓存逐格一致；原资源13项全部原样保留。

全部62项十进制金额计算经独立Fraction有理数复算精确通过；来源、币种、阈值、折扣标签和图片不调价文字均实际断言通过。verify-readback.py为只读回验；publish-prices.py为一次性写入记录，不应重复执行。

Growth仅只读：本地充值页仍是旧13项原价展示，真实官方后台要求登录。没有改其前端、服务器计费或钱包，未取得后台已同步或扣费已生效证据；本结果仅签两篇飞书价格说明。原资源、安装包、分享权限均未改。整篇含体验码快照仅存/tmp，仓库只存资源元数据、报价计算和操作回执。

控制审计：pmem sync成功；quick reconcile 0错误、2项既有范围外看板警告（文件大小及T-1420长行）；git diff --check通过。未声称额外全产品验证。
