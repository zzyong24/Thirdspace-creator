# T-926 本地打包失败记录

候选 cc75de0f08656289011b1e575f934660cd2038e8，复用干净 detached 工作树 /tmp/creatoros-t918-package。版本四处均为 1.1.0，git status 与 diff 检查干净；相对 origin/main 新增文本高置信密钥特征扫描无命中。

固定入口 CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local 退出 1。生产编译、TypeScript、Pi依赖闭包、混淆与隔离sidecar启动/首页200/浏览器hydration通过；Tauri release-fast 编译及本地ad-hoc签名已完成。额外 codesign --verify --deep --strict 对 bundle/macos/CreatorOS.app 退出 0。

失败步骤：bundle_dmg.sh。原始日志只报告 failed to bundle project / error running bundle_dmg.sh，没有可靠的内部原因。现场磁盘余量约609MiB，只是线索，不能断言ENOSPC。bundle/dmg 目录没有最终DMG，Downloads旧DMG没有被本次更新。日志 /tmp/t926-package.log；阶段报告临时工作树 frontend/src-tauri/target/runtime-reports/build-timings.package.json。

按 packaging-creatoros-release 技能失败即停止；未改产品代码/构建脚本洗绿，未安装/公证/推送/发布。用户暂缓业务自动测试及四项独立打包vitest继续有效，不记测试PASS。需要退出冻结，确认独立排查/修复后重新开始打包。
