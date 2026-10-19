# T-1205 本地主目录 sharp 原生依赖恢复

2026-10-10，ff3946f58c4123caecfc5ec643051da52ae11a6f main 干净冻结，四个打包基本文件45例通过，固定 `pnpm -C frontend desktop:package-local` 实际失败exit1。生产前端编译成功后build-sidecar的ensureSharpNative拒绝根sharp@0.32.6缺build/Release/*.node，未替换旧安装，旧DMG仍在。原日志为私有t1199-20261010/package-local.log，不覆盖为成功。

已退出打包冻结流程。用户既有“有问题建task及时修复”、本地无备份构建与安装授权继续适用；此为本机未跟踪依赖环境恢复，不是产品/构建脚本修复。已读实际sharp包及ensureSharpNative消费者：仅运行现存锁定sharp0.32.6自己的libvips/prebuild安装脚本，或精确pnpm rebuild该包。不得更新版本、锁文件、pnpm脚本权限配置、构建自检、产品或测试；不得从不明下载站取得库，不复制其它用户凭据或读连接文件。若标准依赖恢复失败，保真实原因后停止该路线，不删除检查。

验收实际require sharp0.32.6完成小型无用户内容PNG编码/缩放，及已装配随包Node的实际同模块加载。检查Git仅本任务控制/证据变化；环境完成后由taskctl记录，再提交控制记录。重新核干净main及版本、45例基本预检后重进原固定打包入口。新包hdiutil、SHA、安装/原生首页加载与公开CLI版本/资格读回另记录；不备份、不推送/tag/公开发布，不完成未覆盖的T1199/T1200或全局29项问题。
