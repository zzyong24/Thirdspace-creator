# T-991 Windows 构建内存耗尽

来源：T990双端构建run34932675118，候选7e27960364a5bae392f8a07d73f4f765119e670b。Windows job104264011297在“构建并接入 Windows production closure(T-675)”失败。

日志：Next源码编译90秒成功，进入Running TypeScript后，V8 Scavenge约2031MB/Mark-Compact约2036MB，报JavaScript heap out of memory，Next worker exit134。尚未生成setup.exe，不能宣称Windows安装后有业务错误或签名失败。

当前只登记诊断，未修改冻结脚本，未重新触发。独立修复应核对CI机器可用内存、Next类型检查worker继承的堆上限和并发，给构建子进程明确而有限的内存预算及可观测输出；不能跳过类型检查，不能把构建NODE_OPTIONS带入安装后的安全运行环境。先做有界复现/回归，再按授权提交候选、重跑Windows和必要交叉验证。

代码落点：tools/windows-closure-rat/build-production-closure.mjs 的 Next adapter production build；.github/workflows/desktop-release.yml 的Windows closure步骤。是否另有类型错误需在内存问题解决后按真实输出判断，当前不能推断。

用户已明确授权修复并验证Windows。本次退出打包冻结，按构建可靠性修复执行：仅对Next构建及其类型检查子进程提供有限堆预算，打印机器/堆配置信息，保持类型错误失败和Windows真实安装/启动/卸载闸；修复提交后冻结新候选并重跑Windows，不改产品功能，不关闭任何检查。

```mermaid
flowchart LR
 A[读取构建机器可用内存] --> B[为Next和类型检查分配有限堆预算]
 B --> C[编译与类型检查]
 C --> D[组装安装包]
 D --> E[Windows真实安装与启动验证]
```

## 实现与已发生验证

- Next 16.2.9 的类型检查使用 `Worker`，`isolatedMemory:false`、`numWorkers:1`、`maxRetries:0`，保留 NODE_OPTIONS 堆配置。
- 仅 Next 构建步骤附加预算；7 GiB 主机提供 4 GiB 堆，16 GiB 主机上限 6 GiB；容器约束优先，至少保留 2 GiB 和 40% 给其他进程及 native 内存。不修改全局 process.env。
- 红测真实执行：新模块缺失导致测试失败，证据 `/tmp/t991-red.log`；修复后真实 Next Worker 探针（两种旧堆参数写法）及闭包回归 15/15。探针只读取 V8 上限，不伪造 Windows 真机验收。
- 打包四项基础测试 42/42。Windows 正式构建、安装、启动、卸载仍待实际流水线结果。
