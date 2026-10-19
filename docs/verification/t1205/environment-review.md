# T1205 本地依赖环境只读复核

结论：PASS（仅恢复后的本机 sharp 环境及实际 sidecar app 布局运行时加载；新包构建/安装仍待）。

已核 package-local.log：固定入口在 ensureSharpNative/T225b 真实失败exit1，原失败未覆盖。sharp-rebuild.log 的退出成功不足以证明原生安装；其后 sharp-require-first.log 确实仍缺 .node。libvips 使用现有缓存且 integrity passed；恢复后实际 root sharp0.32.6 build/Release/sharp-darwin-arm64v8.node 存在243816字节。

host smoke 实日志0.32.6、Node25.9.0、PNG103bytes→95bytes、8×8；实际已装配 sidecar/server.app 布局 smoke 同版本真实8×8/95bytes。未组装 binaries 裸Node的dyld/libnode失败日志保留，不能以host成功掩盖该失败，也不能将裸Node失败推为实际app布局失败。新包仍须走原固定入口，不删除ensureSharpNative或更改检查标准。

本次git只见BACKLOG/events与T1205 SPEC控制记录，未见产品/构建脚本/锁文件/测试改动。审计未修改上述文件或Git、未执行安装。环境恢复成功不代签包、真人功能或全局Gate。

时间：2026-10-10T21:50:37.090729+08:00。

- `package-local.log`：`96414f0063b31e2d8f46ca7610bad5da718d20e5974dc6586b98471d825131bd`
- `sharp-rebuild.log`：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `sharp-require-first.log`：`a20226187044aa7145658315ac7becc295aeea870be0f445e17b4416a45bb4ae`
- `sharp-libvips.log`：`a7487a38f9185f9ccba59bb764271e38fbb25094ea97f22e038dbd671f4fea79`
- `sharp-prebuild.log`：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `sharp-host-smoke.log`：`1a40cbe707a5b151fe01080ddbdfc74e10328ca774a390a2c22b3fdaecbf057b`
- `sharp-shipped-node-smoke.log`：`f33ac420385d8e662c29b88b0871adaeae741c5e82a371e575efdc077548f340`
- `sharp-shipped-layout-smoke.log`：`2da7d49879f9a10f8c17592bf71347e47afb4174f9f7a284fc98a13dce1b0d15`
