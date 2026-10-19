# T1254 私有PNPM版本元数据工具独评

31c69e5d精确metadata-only工具静态通过，19输入与1803当前Node/NPM实现全核无漂移。未运行网络查询、安装或新PNPM。原两源确实声明pnpm12.6.0、Node>=22.22.2、project2.1.0和lock9.0，不能静态假定该registry版本存在。

```mermaid
flowchart LR
 A[原归档真实manager字段] --> B[当前已核Node与NPM]
 B --> C[owned空配置与单次registry view]
 C --> D[真实metadata或404原失败]
 D --> E[后续固定安装及新实现另独审]
```

4.86M完整入口预算与393f终止/close生命周期保留；无fallback、无downloaded CLI执行。仅私有空npmrc/cache/tmp可写，HOME原值。实际执行由ROOT精确准入，成功metadata不代两build和交付/公共/App通过。
