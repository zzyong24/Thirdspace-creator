# V1.2 流水线稳定性与速度审查

本轮候选：33dad57a69334dc0bbda8d50dc40b99585acac06。运行：https://github.com/zzyong24/Thirdspace-creator/actions/runs/34793812788 。仅审查，未更改workflow。

## 已有事实

- 历史运行32232852628：Windows打包792秒，production closure组装292秒，安装与页面验证48秒，安装期runtime冒烟29秒。
- 历史双端运行32205733343：Windows打包830秒、closure322秒；Mac打包756秒、clean Runtime Image270秒、真实页面启动22秒。
- 当前Mac在Developer ID与公证凭据步骤失败：Apple认证HTTP401。签名/公证验证不可用时不上传正式Mac安装包是正确行为。
- 当前有pnpm缓存、Rust缓存、Mac完整clean runtime精确缓存。没有Next编译缓存；Windows没有对应的clean runtime缓存。完整runtime缓存键含全部源码，因此代码变化即失效。
- package.mjs已生成build-timings.package.json，workflow没有将该阶段耗时文件上传。

## 建议顺序

1. **先补诊断与快速失败。** 安装依赖前验证签名、公证凭据；失败时始终上传脱敏阶段耗时、版本/ABI/缓存摘要。对密码失效、配置错误不重试。
2. **复用编译缓存。** 增加Next编译缓存，按平台、架构、锁文件及编译工具版本隔离；冷/热构建对照时间与产物运行验证，避免仅凭命中率认定有效。
3. **分离稳定运行依赖和业务代码。** Chromium/FFmpeg/Node/原生依赖按固定版本和哈希缓存，业务bundle每次重新编译；Windows优先验证收益。保留当前平台、ABI、公钥、产品配置与签名校验，不放宽完整runtime缓存键来冒用旧业务代码。
4. **固定工具链并显式升级。** 当前Node25、Rust stable和latest runner会漂移；固定验证过的具体版本/runner大版本，在单独升级变更中更新。降低ABI变化造成的随机失配与缓存失效。
5. **压缩与重试有边界。** DMG/EXE已经压缩，安装包artifact可设compression-level:0，先测CPU与上传大小。FFmpeg下载已有3次重试，不重复叠加；只对网络瞬时错误做有限退避，不能重跑整个签名/打包链来掩盖确定性故障。

保留fail-fast:false，让单端故障不取消另一端；保留原生安装、主页面加载、卸载清理。以上历史数字不等于承诺节省时间；优化前后应以同一提交、相同工具链的冷/热构建对照验证。

本轮新增诊断：Windows在运行预算检查失败：runtime4145>3500、core2121>1500；该检查发生在约398秒组装后。后续应生成按目录/依赖归属的文件增量报告，区分应剔除的重复/开发资源与真实业务增长，再决定压缩布局；不能直接抬阈值。Mac凭据更新后重跑仍401，说明预检应提供Secret名称、更新时间与Apple响应类别，而不泄露内容。
