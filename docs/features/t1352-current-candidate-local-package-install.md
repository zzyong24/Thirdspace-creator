# T1352 本轮候选本地打包安装

沿用户已明确“把新的安装包安装好，旧版卸载和清理”授权，以及Root本轮最终安装裁定；只本机ad-hoc包，不push、tag、Release、生产配置或外部发布。不改变产品/服务/视觉/构建入口。产品五任务T1345/1346/1347/1348/1350自己的真实功能与视觉合同先完成，再进入冻结打包。T1349既有窄项目列表布局及T1351源码风险不冒已修；新旧全局收据债按T1353与原审计分别保留。

以本轮已提交精确HEAD的clean候选为唯一源码；主树foreign不得进入。按packaging-creatoros-release预检clean/diff/四处版本一致、origin/main实际diff与secret检查、四项固定打包基本测试。最终源身份在运行记录写精确SHA，不把带foreign开发测试当同候选通过。

T7独立clone/no-hardlinks/no-checkout/dissociate后checkout精确SHA；从干净managed候选复制完整六根node_modules，再offline frozen-lockfile重链，核所有@creatoros realpath属于新source、shim无旧前缀及native addon闭包。不复制74b绝对workspace链接。旧target仅独立缓存副本，不外置CARGO_TARGET_DIR或改构建入口；按现支持TMPDIR落T7。唯一构建为CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local，避免入口自动pkill安装。失败保日志即停止冻结，不在包装期间修任何产品/测试/脚本/文档来洗绿。

保74b原始DMG/App证据与用户全部数据库/账号/激活/设置/项目/素材/日志。新包核SHA/codesign/hdiutil与只读挂载、同卷安全暂存比对；临退出再查公开活动任务与未保存提示，无活跃业务才正常退出旧App，不强杀。替换后正常启动，同源主进程/sidecar tar/runtime stamp/服务入口实际验证，观察至少120秒，重读该App路径PID及原生windowId，只截该窗口。新包公共核心入口做必要烟测，不冒全部旧功能或真人扫码。成功才删暂存和旧App备份/本轮核准旧产物，保最新包及数据；更广删除先精确列清单给Root复核。

本项为已授权SHIP运维，无产品改动不虚造TDD。使用taskctl start/complete留事件；最终交付准确产物路径、SHA、验证与安装结果及全局审计保留状态，不声称公证或全局全绿。

```mermaid
flowchart LR
 A[五项功能与实图通过] --> B[干净精确源码冻结]
 B --> C[基本预检与固定入口产包]
 C --> D[核包并安全暂存]
 D --> E[正常退出旧版并替换]
 E --> F[新App同源启动与窗口实图]
 F --> G[核准清理旧版]
```
