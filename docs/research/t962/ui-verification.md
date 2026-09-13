# T-962 页面与主题验证

使用独立开发模式、数据库 `/tmp/creatoros-t962-ui/db` 与媒体/工作区；`CREATOROS_DISABLE_BACKGROUND_DRIVERS=1`，未改真实账号和数据。通过正式 accounts.create 创建“布局验证账号”，页面经正式 scheduledJobs.create/update 保存，再刷新确认评论开关仍关闭。

- ThemeSync 初始回归缺模块 RED → 系统浅深切换、手动浅色不被覆盖 GREEN。
- 设置打开前后：系统浅色，根 class.dark=false；打开真实 /settings 后仍false。CDP切系统深色、等待change后true，再切浅色false。
- 雷达编辑原缺按钮 RED → 表单保存不修改目标/source GREEN。
- 统一同步复杂旧cron编辑死锁 RED → 可保存且归一两小时 GREEN。
- 统一同步四个开关，关闭评论后保存、刷新再开编辑，aria-checked=false。
- 迁移后旧任务隐藏，未迁移任务保留管理入口，server page测试PASS。
- 分享页保存控件位于图片上方；390px无横向溢出，原下方大段说明已删除。

本验证使用隔离开发实例，不等于已更新用户安装包或已执行真实抖音采集。外部RedFox付费查询尚无当前配置密钥，独立worker与HTTP协议fixture验证另记。

补充实测：
- 内容雷达经真实编辑弹窗修改描述、保存、刷新后重开，描述保留；三行任务都有编辑入口，见 automations.png。
- 独立数据服务页面用测试密钥保存、刷新、删除；刷新后密码输入为空，页面不回显密钥。仅隔离库测试，无远程请求，见 redfox-settings.png。
- PNG 实际下载为2160×3280，二维码解码为 https://buy.aitongban.cloud/。
