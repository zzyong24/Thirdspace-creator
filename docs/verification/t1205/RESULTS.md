# T1205 环境恢复实际结果

原冻结ff3946f5基本预检45例通过，固定package-local实际exit1，前端生产编译成功但sharp0.32.6缺原生文件，旧安装未替换。已退出打包冻结；原失败完整保留。

pnpm rebuild sharp exit0无输出但没有产物，随后require仍exit1，不能称恢复成功。按已有包自身脚本执行node install/libvips，实际使用缓存8.14.5 darwin-arm64v8 vendor且完整性校验通过；node ../prebuild-install/bin.js --runtime napi exit0，实际生成sharp-darwin-arm64v8.node。主Node25真实PNG编码及16×16→8×8缩放成功，103→95字节，sharp0.32.6。

直接执行binaries目录的裸Node副本exit134，dyld相对目录不完整，原失败保留。实际已组装sidecar/server.app/Contents/MacOS/creatoros-server在原目录，不加DYLD环境覆盖，同一模块真实8×8/95字节成功exit0。此仅随包Node布局加载根依赖，尚不是新包完成/安装/全功能通过；最终sidecar复制仍需原ensureSharpNative和完整固定构建验收。

没有产品、构建脚本、版本、锁文件、权限配置或测试改动，无备份、无用户数据写、无模型/采集。Git控制变更仅本任务BACKLOG/SPEC/事件及本报告。之前完整reconcile29ERROR/0WARN保持，T1204已登记，非本次环境恢复范围；本任务不签父T1199/T1200完成。
