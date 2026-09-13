# T-963 更新本机安装包

用户明确要求更新安装包。范围为已提交T-962的本地macOS版本，候选3ec60d26，沿用当前1.1.0；不进行网络发布。

进入SHIP：产品代码冻结，以独立干净worktree构建，保留工作区未提交的其他任务。运行官方打包四项测试及desktop:package-local，核验版本、安全、DMG及签名，安装前退出旧程序并快照本地数据库，正式入口安装后核对真实启动和候选身份。任何构建失败保留日志，不在打包期改产品/构建/测试。

日报仍为网页预览，本包包含统一增量同步、RedFox独立密钥与助手方法、主题与自动化布局修复。真实付费接口效果不属于打包成功证据。

## 本轮结果

- 冻结候选：3ec60d26，独立干净worktree `/Users/zyongzhu/Workbase/Thirdspace-creator-t963-package`。构建前后status空、diff --check通过。四处版本均1.1.0；相对origin/main提交及文件清单已核验，凭据文件名及私钥/token模式扫描无命中。未推送。
- 打包四项基础测试42项通过；固定入口 `CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local` 成功。生产编译、类型检查、真实sidecar ready、GET / 200及browser hydration通过；最终app TLS自包含通过。未修改冻结代码或构建断言。
- DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`，445658417字节。SHA-256：`2decad8708307ee0202f29473df8f058409f32196f8a42c5e60699b5d5cc9853`。hdiutil verify VALID，codesign --verify --deep --strict通过。仅本地ad-hoc签名，未Apple公证。
- 旧应用正常退出后，备份至 `/Users/zyongzhu/.creatoros/backups/t963-20260913/app-data`；1811个数据库文件逐一SHA-256与源一致，并保留配置/密钥。不清库、不覆盖恢复数据、不删除媒体。
- 正式安装入口installAndLaunchLocalMacApp安装到 `/Applications/CreatorOS.app`，PID48827；sidecar PID48950，端口63483。已安装主程序SHA-256为`fba53472c9f4dd21f7210e1ee5fb1007d17c750f006c8ee2afdf5be16023f18e`，与本轮attestation一致，安装版签名验证通过。
- 安装后首页、自动化、设置HTTP均200，分别72836/49313/457365字节，无Application error；自动化页包含作品自动同步。此为基本启动检查，不宣称真实付费模型/RedFox查询或长期定时采集已验收。
- 未创建tag、Release、公开上传、远程升级或生产放量。全局既有reconcile233项及T-962所列债务保留T-916，未伪记全仓绿。
