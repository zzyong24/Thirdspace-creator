
## 2026-10-02 正常迁移与共享整合证据

0115–0124 原在途工作保持，正式追加 0125 画布谱系合并，随后 0126 朋友圈候选。原正常 createDb 的画布 11 族与朋友圈 15 族共享重跑合计 **26 PASS**，证据 `docs/research/evidence/t1042/normal-migrations-125-126-shared.log`。同名索引指向其他表的前置 guard有当场红测及修后绿；正式 SQL 未改变，历史数据及 hash/time 回执保留。真实 PG、实际验收库重启、画布公开业务／AI绑定／UI／物料仍未完成，当前不是任务完成或全 Gate PASS。

### 0127 并入后的原正常迁移复核

并发重型 PGlite 5 文件运行出现 3 个默认 5 秒超时及隔离测试清理的级联异常（92 PASS/3 FAIL/2 unhandled），保存 `normal-migration-127-concurrent-fail.log`，不宣称该次全绿。单独串行、明确 45 秒预算复跑原迁移文件，11 PASS，没有更改断言/迁移守卫；保存 `normal-migration-127-serial.log`。实际本地验收旧 124 数据库正常启动升级，四类原稿和引用保留；PG 并发与实包尚未通过。

### 2026-10-02 交付文件名与生命周期修复

实际成片精确file下载名仅“.mp4”，发现原extForFileName返回扩展名被当完整文件名。首个mock无扩展storage key测试误未覆盖（1通过32跳过，不计红）；校正为有扩展key，原service真实1失败32跳过后两条普通/精确下载路径修复，原Assets33项通过。实际公共下载名已保留完整对象名，不仅扩展名。

预览组件lint7错误清至0，保留大工程手动缓存；解析库编译推断隔离仅窄hook采用React官方use-no-memo机制，未取消频繁时钟更新下的原缓存。异步hydrate最初被初始缓存写覆盖导致2实际失败，增加hydrated写守卫，5文件40通过且lint0。新增材料GET迟到守卫另按T1045验证，不外推完整门。

Canvas34文件候选独立审发现paid-job规格门和原OmniHi文生模式能力回归后，修复再窄PASS合入；正常125不再改，pnpm frozen-lockfile正式依赖安装成功。原Canvas/root装配、UI与公共链继续，不能以34局部/65worker夹具测试记全面完成。当前boundary仍报原Copilot两条新增SDK违规，保留全局失败；尚未解除或冒绿。


## 2026-10-02 Canvas39b 正式整包合入（仍在验收）

独立39文件冻结SHA `fdab20535c7ef7e89a11d30468db1e18ff2625c6541b42d645aefd26886375d3`，原shared基值与合后candidate均39/39一致。实际画布路由、原无限画布组件、原Pi受控read/propose工具、Materials宿主carry与原严格候选投影均装配。确认后选择历史确切generation/file，进入原WorkMaterials/source:null；旧Global聊天定义/hash恢复保持。

独立22 UI＋2原公共Worker＋9 host/scope＋2新增carry PASS；原chat广测仍与baseline同26 FAIL，未记整体全绿。root正式worker build exit0（保留旧CJS import.meta warnings），真实shared四组件22 PASS；原公共transport/原正式Worker/隔离PGlite/隔离LocalFs两项2 PASS。新集成test helper初版端口泛型与列表类型报错，root用原endpoint.response严格parse和独立callList校准，只修改fixture类型，不改生产合同；此后全文frontend tsc exit0，原2公共fixtures再2 PASS。供应商是本机HTTP/SSE夹具，未修改用户凭据、未声称真模型供应商识别或整项完成。

步骤scope只补本次实际leaf root、原chat渲染、原Work两文件与已有promptregistry的物理路径，context-compile T1042 当场通过。仍需真实画布浏览器、最低窗口、键盘及Work完整采用旅程。
