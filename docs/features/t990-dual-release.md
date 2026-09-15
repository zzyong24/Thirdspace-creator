# T-990 V1.2 双端流水线

用户在T988本机安装验证后明确要求跑双端流水线，指Windows和macOS。纳入当前已提交的采集拆分、错峰、封面恢复、常用页面/首页性能与技术话术修复；版本维持1.2.0。

使用干净隔离候选，保留主工作区未提交内容；核对origin/main及候选差异、四处版本、基本安全检查与官方四项打包测试。普通合并或快进同步main，不强推；从main触发desktop-release.yml only=all。构建中冻结代码，失败保存原始日志并停止，不修改规则洗绿、不无效重试。

```mermaid
flowchart LR
 A[已验证修复] --> B[冻结候选与打包预检]
 B --> C[Windows 构建与安装验证]
 B --> D[Mac 构建与签名公证]
 C --> E[核验并下载安装包]
 D --> E
```

验收绑定同一候选SHA及run：Mac签名/公证/staple/Gatekeeper/镜像内应用及启动；Windows安装/启动/卸载。下载真实产物与SHA256；Windows未签名沿用既有接受边界。不创建tag/GitHub Release，不改Growth/Activity下载或生产配置。全局历史工件漂移T916和范围外T989已在T988记明，不能宣称全仓所有检查通过。

本次结果：候选7e27960364a5bae392f8a07d73f4f765119e670b已同步main，run34932675118完成；Mac通过签名公证/引导/启动并下载安装包，Windows类型检查堆耗尽exit134，无exe；详见[验收记录](../verification/t990-dual-release.md)，待T991独立修复。
