# T-1046 清洁复建产物差异核查

最终归档 SHA-256 `ad5a2b874a2b50ab10fca522a271b5c929f383af5c9e40bdf1c3f4feb45360a6` 与 freeze 行为文件一致；6个 bridge/Core/command/test 文件逐字节对照通过。没有遗漏最终 NativeOperationError/Command/bridge 改动。

实际问题是构建启动运行时不同：交付及同树重复构建使用 `bun x vite build --config vite.embedded.config.ts`，Vite bin 的 Node shebang 生成 `index-qIbIhzgy.js`；ROOT清洁复建使用 `bun ../../node_modules/vite/bin/vite.js build --config vite.embedded.config.ts`，Vite运行于Bun，生成 `index-DpYe8P5g.js`。

已在相同 freeze 源码、相同已安装锁依赖树直接用Bun重跑后精准得到 `index-DpYe8P5g.js`，index.html及另外7份产物与ROOT实际fresh目录逐字节相同。没有修改 root 或行为源。

完整JS经Prettier babel格式化后的diff仅两段构建器生成代码：
- vite-plugin-wasm/dist/wasm-helper.js:48 使用 `wasmHelper.toString()`，Bun将其中 `throw new Error` 转写为 `throw Error`。
- vite/dist/node/chunks/dep-Dm0c1Wj2.js:45528 使用 `preload.toString()`，Bun将 `!!r` 转为 `r`、`new Error` 转为 `Error`，后续minifier局部变量名相应变化。

完整差异 `/tmp/t1046-ui-work/fresh-build.diff`；同freeze依赖树Bun复建实际日志 `/tmp/t1046-ui-work/upstream-native-bun-runtime-build.log`。两份minifiedJS长度分别1770122/1770112字节。业务与原生粗剪类无差异。

建议发布/复建规范统一使用直接Bun CLI命令，采用ROOT清洁复建的Dp产物并更新manifest。原“同安装依赖树重复build PASS”不能替代clean/fresh PASS；它仅证明相同Node shebang路径重复结果一致。ROOT的clean/fresh测试为真实另一次证据。
