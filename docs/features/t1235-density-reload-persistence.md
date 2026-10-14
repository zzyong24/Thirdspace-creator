# T1235 修复外观密度关闭设置后刷新未恢复

用户要求持续全功能验证并及时修复明显问题。3921 设置七例中的第5外观用例自然 FAIL，当前整轮仍继续，其最终退出码尚待保存。root 实际读取失败 trace：刷新 `/accounts` 后 `locator('html')` 期待 data-density=compact，实际无该属性，120000毫秒观察结束；html 的 data-theme=light 正常。先前真实UI选择紧凑及localStorage相等已通过，不把两个 aborted/ECONNRESET 日志猜作根因。

原证据目录为 `docs/verification/t1232/browser-3921/test-output/e2e-settings-Settings-page-T-1232-外观主题与密度按本地消费者持久并返回刷新-e2e/`，包含 trace.zip、test-failed-1.png 和 error-context.md；原 settings.spec.ts SHA `4283e507e25ad9270a6f7fcb41ae2bca7e64d209ba45838a40efc12909648e13` 不改。失败保留，不能把断言挪到重开外观页后掩盖全局恢复缺口。

源码当前只有设置页的 SystemSettingsCard 调 applyDensity；layout 首帧脚本与全局 ThemeSync 只恢复主题，没有恢复 `creatoros.settings.density`。此偏好已有 comfortable/compact 两种真实合法值，不改变 IA、密度样式、持久服务、默认用户数据或公开契约。

最小候选两个现有产品文件：

- `frontend/src/app/layout.tsx`：已有首帧外观脚本读取相同密度 key，仅合法 comfortable/compact 写入 data-density；无值、非法值或无法访问localStorage保持现有默认布局，不注入任意存储字符串。主题与handshake首帧脚本行为不回归。
- `frontend/src/components/shell/theme-sync.tsx`：全局挂载恢复合法密度，并订阅该 key 的真实 storage 变化，和主题同步共用既有生命周期清理；不要求先进入设置分类才能生效。缺值/非法值采用上述明确默认边界，不能让另一个浏览器标签清空存储后继续残留旧compact。已选紧凑在同窗口直接应用的设置逻辑保留，不改设置按钮或新增保存。

空值/非法值/读取异常均恢复既有 comfortable，首帧及挂载统一明确设置 data-density=comfortable，不回写 localStorage。需要证明此前残留compact被恢复到默认、未知值不影响主题、不改变用户已有合法偏好，不把本地偏好改成后端/组归属。

测试只改现有 `frontend/src/components/shell/theme-sync.test.tsx`、`frontend/src/components/shell/pre-hydration-scripts.test.tsx`；先真实 RED，再最小产品修改。核合法compact/comfortable首帧与挂载、storage切换/删除/非法值/访问异常、主题system/light/dark与清理不回归。公共 GREEN 使用未修改的原外观用例，单Next/fresh根/worker1/retry0，最短两分钟并保更长预算；原失败图片/索引必须字节归档后才能复跑同Test ID，不自动重试。桌面1536和390px真实保存后的图片由原用例产生；root看图并按oil-ui-pro现有基线验证，不做新视觉方向。

当前仅本SPEC与 `docs/verification/t1235/**` 文档准入，待独立精确评审后root绑定测试/产品；3921完整自然终态与清理前不得修改任何源、再开Next或重型Gate。收尾运行相关原组件回归、frontend类型/边界与公共原用例，保真实错误，不冒称原生App或全功能通过。

```mermaid
flowchart LR
 A[设置选择紧凑并持久] --> B[关闭设置到其他页]
 B --> C[刷新时首帧恢复密度]
 C --> D[全局挂载与其他标签同步]
```
