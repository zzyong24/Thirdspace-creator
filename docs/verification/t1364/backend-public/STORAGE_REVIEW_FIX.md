# 实现独审：私有错误与归属未知的窄修

原完整公共04六例及其28文件SHA保留不变。本追加修复只处理独审定位的错误输出，不能把下列两例负族筛选通过写成当前八例全链重跑。

大白话：目录坏了或文件坏了，只告诉调用者“诊断存储暂不可用”；不能把私有路径、文件片段带出来。读不到当前归属就保留未知，不冒充“已经转组”。

## 当场RED与GREEN

- `storage-error-red-02.log`：真实CLI SDK→HTTP→Next adapter→正式dispatch/backend，两例均FAIL。缺根的ENOENT带出完整合成私有路径；坏marker带出`T1364_PRIV`片段。真实退出码见`STORAGE_RED_TOOL_META.json`，没有把准备错误计为RED。
- `scope-unverified-red-01.log`：合成backend port的临时读取失败被错误写成SCOPE_CHANGED/failed，预期SCOPE_UNVERIFIED/unknown，真实1FAIL。
- `storage-error-green-01.log`：同两HTTP负族2PASS，另外原6例筛选跳过。校验响应和服务端日志均无私有路径/片段、坏marker字节保留、同键重放不二启，launch=0。
- `storage-backend-green-01.log`：新service与原host lifecycle全30PASS，包含已证真实scope变化、缓存拒绝、临时scope读失败UNKNOWN、停止释放、取消提交点及损坏原件保护。

## 最小实现边界

仅`createWechatNavigationDiagnosis`返回的`diagnose`和`assertCachedScope`包固定安全错误边界。合法typed权限/归属/校验错误与本能力固定协议保留；fs/JSON等未知异常统一返回`WECHAT_NAVIGATION_STORAGE_UNAVAILABLE`，不公开底层message/stack/details。不改全局dispatch旧op错误映射。

scope hash真正不同，或明确ownership/active/platform归属失效，才记SCOPE_CHANGED；临时storage/read失败记SCOPE_UNVERIFIED/unknown、停止后续动作、隔离证据。缓存当前scope未核实则固定拒绝，既不返回旧图也不新启动。

相对公共04只变三文件：新service、其unit、公共测试文件；worker四文件及其168PASS复用，未触原采集实体、profile或用户库。

## 补齐真实门退出码

`timeout-observed-final-meta.json`记录本次`node tools/timeout-policy/verify.mjs`的真实subprocess.returncode=0，原stdout/stderr见同名前缀log；不是从没有fail字样补写PASS。只重跑本任务适用timeout门，未扩大到旧全量模型/UI/真人采集门。

新的boundary/semantic/orphan各命令的真实exit0见`storage-gates-meta.json`，仍保基线5、orphan100warnings。首次新增HTTP测试的unknown类型属性访问TS18046原件保留于`storage-frontend-types.log`；后改等价toHaveProperty断言，最新frontend types实际exit0，等价断言后的同两HTTP负族2PASS/6筛选skip见`storage-error-green-02.log`；两项真实exit0见`storage-frontend-final-meta.json`。backend types实际exit0保在`storage-types-meta.json`（该文件中的首次frontend exit2为已修历史，不抹除）。

最终准确清单见`SOURCE_FREEZE_STORAGE_FIX.json`，与public04旧`SOURCE_FREEZE.json`分开保留。本轮仍未真实平台导航、未打包、未commit或改中央任务状态。
