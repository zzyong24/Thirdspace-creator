# T1178 打包资源回归

当前shared与Windows配置已经同时携带单个runtime tar和第三方声明文件，源于65781a81；旧测试只期待tar，因此当场原LED006完整检查42 PASS / 1 FAIL、退出1。本轮仅校准第一例名称与两个固定精确资源列表，并补shared也禁止展开sidecar目录的断言。其它五例字节不变，产品配置、安装hook、构建及发布流程、预算均未改。

原LED006完整命令现43 PASS、退出0、2.156秒；精确资源文件6 PASS、退出0。边界、语义及orphan退出0，既有5项边界基线和100项orphan警告保留。原RED与retry x2、当场GREEN、正式SPEC及精确实施独评分别保留；独评仅局部PASS。

```mermaid
flowchart LR
 A[单个runtime压缩包] --> C[精确两项资源]
 B[第三方声明文件] --> C
 C --> D[禁止展开runtime目录的保护保留]
```

实际收据日志及源文件SHA在本目录。完整canonical另共同收尾，不代签Windows真机安装、原生启动或全功能；运行时不变，不重打相同产品包。T1015整体及其它原失败保留。
