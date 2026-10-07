# T-1071 四路径前端实施结果

按完整 SPEC 与 PASS[REV:a53e25bf48df] 实施。先写四测试并真实跑 RED，收到主会话“基线完成，可立即改已审四产品路径”后才修改产品。此代理未操作浏览器、用户 App、打包、提交、后台或主控制面。

产品 diff 限定四文件：

- StageChatWrapper 仅无栏早返回增加 active===undefined，显式 active 的持久宿主保留同祖先与同编辑器容器；普通未传 active 稿面仍原透传。
- ProjectStageStepper 工作面 Link 加 prefetch=false，真实 href 与可达性/高亮不变。
- AccountSwitcher 的 /accounts Link 加 prefetch=false，切组与前台离开守卫不变。
- AccountManagerPage 把 groups 读放进原 Promise.all；账号与组拒绝照旧向外抛，能力失败保留局部降级，可选方法默认与 viewModel 路径保留；客户端刷新未改。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 四测试 RED-before-fix，retry=0 | exit 1；5 FAIL / 30 PASS：2 生命周期、1 串行读取、2 预取 | red-before-fix.log / .result.json |
| 同四测试 GREEN，retry=0 | exit 0；4文件35例全部通过 | green-after-fix.log / .result.json |
| LED-047 原 check 命令，retry=0 | exit 0；8文件162例全部通过 | led-047-regression.log / .result.json |
| frontend typecheck | exit 0；next typegen 与 tsc --noEmit | frontend-typecheck.log / .result.json |
| git diff --check 与新增文件 whitespace check | git diff --check exit 0；新文件 no-index exit 1、无 whitespace 输出（正常文件差异）；独立逐行空白检查 exit 0 | diff-check.log / .result.json |

生命周期测试覆盖初始 active=true→false→true 与 false→true→false→true，同 key 的有状态子组件 DOM、控制句柄与未保存稿保留，最终卸载仅一次；普通稿面无栏结构保持直接透传。并行读取测试以未完成 Promise 保证三个请求在任一完成前都启动，并覆盖能力拒绝、账号拒绝、组拒绝、空结果、缺可选方法、viewModel 和无会话。Link 桩显式捕获 prefetch，保留实际 href、高亮、阶段门禁与账号菜单键盘打开，既有切组/取消/过期回写用例继续通过。

完整产品与测试补丁见 implementation.patch；源码 HEAD、八文件 SHA256、实际命令、耗时与 exit 汇总见 frontend-implementation.result.json。未运行全仓检查，也不代签真实原生状态、前后点击性能、视觉或安装版验收；这些由主会话使用已保存浏览器基线继续验收。
