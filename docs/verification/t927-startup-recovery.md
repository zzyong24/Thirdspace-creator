# T-927 安装后解压失败恢复

用户报 sidecar.extracting-34309 中 fontkit shapers/index.js 无法展开。初查可用空间仅546MiB；安装内tar展开载荷1183.2MiB、34211条，gzip完整性通过，报错条目可完整读取3236字节。原加密日志解密只含Rust顶层failed to unpack，没有底层errno，不能冒充已记录ENOSPC。

仅删除本轮临时打包工作树中的 frontend/.next 和 frontend/src-tauri/sidecar（已有DMG、打包应用均保留），磁盘恢复约5.2GiB。未删除用户runtime、媒体、数据库、账号或日志。原失败进程34309经SIGTERM停止后重新打开同一/Applications/CreatorOS.app，新PID36554，sidecar PID37018。

解压完成标记与已安装tar摘要一致：5940a17f74cc978bed17b6db05ceb7f1800d3e3ae341bc32644d63fb1a4fab4d。新加密日志sidecar-2026-09-08-3.log.enc解密显示2026-09-08T10:40:01Z Ready、自动化driver启动；localhost:59932监听，GET / HTTP200。同一应用在腾空间后启动成功，支持空间不足为主要线索，不声称捕获确切errno。

已安装tar与交付构建tar 5a5691ae863c4c378031d5fb40aa18c2d6174ecfba06dae55044e65d8bcb9fb1 不一致；本次没有替换安装应用。新日志另有CLIENT_CONFIG_ACCESS_CHANGED和未选账号AccountRequiredError，未据启动恢复宣称AI/业务全功能通过。没有进行业务测试或修改产品代码。本次日志密钥仅在内存中用于开发者支持解密，没有输出或保存密钥/完整明文日志。
