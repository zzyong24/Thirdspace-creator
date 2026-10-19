# T-1254 只读盘点

两份真实请求默认均为30,000ms。原生源与静态固定源的 shared `fetch.ts` SHA完全相同（a46fe6…），与两份压缩产物同逻辑。计时覆盖完整响应体；0直传setTimeout而非无限等待，直接provider六处调用均未给timeout，动态formCustom可给用户配置，不能伪称穷尽所有用户值。

当前原生host上传先走 `host.importMedia` 并返回，不走旧providers；独立static页面又有connect-src none。已打包旧cloud分支仍是交付的政策缺口，不能豁免，也不能启图床、改CSP或把helper慢请求叫当前宿主上传链。

原生对应源包含完整shared源码、两Vite配置和构建/核验脚本，能作为两种产物的同源依据。现build-reference-editors只构建native；当前manifest仅hash native395文件，static的来源/新产物闭包必须正式补入精确合同或独立可复现收据。固定a7源不可覆盖；任何fork要交完整对应源/patch，并更新native来源副本、输出/import graph、SHA256和manifest/交付descriptor，原历史build证明不能冒签新源码。

完整路径/SHA、实际caller和待评最小一致性写集见 `DOOCS_CONTRACT_INVENTORY.json`。本轮只有归档读取与/tmp复制，没有构建、测试、网络、真实用户设置读取或生产/SPEC修改。
