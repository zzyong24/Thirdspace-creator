# T1108 HTTP helper 预算说明窄复审

**PASS，0 findings。** 当前 SPEC SHA256 `eb800589add497ec7e7815a4dc9e38a63e4fe79ecc3245da84ac36cf4e83e6b7`，宪法 `docs/产品定位.md` SHA256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。这是原 lineage 的 recheck，不重新扩大产品范围。

独立全文逆向核验：移除唯一新增句“同文件共用dispatch/upload HTTP helper原SDK默认30秒，提高到120秒，原请求/断言不变，其它旧case直接请求不改。”后，SHA256精确恢复initial `f01abc0ccaf07dda7ab8576c4d1913c11f3f6d1a18c8acfaa383aab038c522e1`。其它功能、权限、精确三路径写集、默认参考/legacy设计与frontend-journey-contract/v2均不变。

真实已安装依赖 Playwright1.60.0 的 coreBundle 定义 `DEFAULT_PLAYWRIGHT_TIMEOUT = 3e4`；请求客户端按TimeoutSettings消化未显式timeout的请求选项。这是公共测试HTTP消费者，不是1200ms debounce或5000ms轮询间隔。依赖源码 `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/lib/coreBundle.js` SHA256 `f74353fcb8e406756a70a6af0dfc4a5069acd577e35ec9d923ccf36ac009c2f5`。原188c的共享dispatch与upload start/PUT/complete均未显式120秒；新说明允许仅共享helper的这些HTTP请求提高到120秒，不能顺带改其它旧case直接请求或生产期限。T1101两例的正观察显式120秒、外层覆盖完整串行预算与清理，既有更长预算不缩短。

本次只校准规范落实，未运行任何新测试或网络。产品/组件先行只读核查未发现必修项；当前canvas-editor SHA256 `716551060482e62c578596870778d4eb57465b2a04ce0f86ec652d8631dbe4e7`，原组件测试加6例 SHA256 `1fd99888d634aea9b43162bffc0004c39021c406f64df9716d8d76ffe2397daa`，原17例正文独立逆比完全保留。已有unit-red实际19 PASS/4 FAIL及unit-green23 PASS只属于组件层；公共当前运行、截图/最终sourceHashes尚未齐，不代签UI、完整Gate、安装或父任务。
