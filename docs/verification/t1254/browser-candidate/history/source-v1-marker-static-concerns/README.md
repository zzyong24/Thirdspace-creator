# T1254 新两包之后的公开浏览器验收候选

此目录当前只有来源盘点、静态语法检查和两个新候选 body。未list、未做proper types、未启动浏览器/Next/Worker/PG，不是验收PASS。

|需求|真实操作与结果判断|证据|
|---|---|---|
|原生包仍可打开|真实Next项目文章页面→创建/保存手写稿→展开现有Doocs组件→真实Vue/CodeMirror|1366/390截图、完整trace|
|加载的是新产物|页面实际请求native.js/native.css及所有依赖，逐响应字节SHA对新完整manifest|逐资源path/status/SHA；不以只有entry下载代签图|
|编辑未坏|用户真实fill CodeMirror，不注入候选/改DB→点击原保存正文与排版|公开articles.get精确正文和nativeLayout，刷新再读|
|本地宿主导入仍通|真实file input选择原文章测试1px PNG→现有onImport→输出当前归属→createUpload/PUT/complete/material link→原保存|精确assetId/fileId，公开下载字节SHA与原PNG相同；不mock业务或importMedia|
|完整对应源码|公开原download路径实际200/本地最终URL/字节SHA与新sourceArchiveSHA吻合|archive长度/SHA/链接href|
|范围|每body创建自己的组/项目/稿件，网络仅同origin；不调用模型、云图床、平台登录或App|拒外网与独立证据|

执行前必须先有：两实际build/完整graph和provenance→精确交付文件清单双审并复制→新clean candidate commit→11实际Worker bundle→新DMG receipt与45安全检查→fresh owned fixture与新浏览器工具封印/独审。该spec本身不证明这些已发生，环境仅是receiver声明；runner必须实际核完整SHA/权限/进程归属与有限外层。不能直接给当前开发服务地址跑此候选。

runner使用新的自有profile/数据库/媒体目录与服务器，不改变原170/54、111/59/49/38的分母；这两body单独统计。沿现有T1246新工具的真实Node/Chrome/源码/安装闭包与进程cleanup，配置retry0、workers1、request/action/navigation/expect>=120000、trace on、PNG实际保存。每body声明72000000ms，外层覆盖2body+各启动/hook与owned清理完整余量，monotonic60s分段不溢出。原task期限未修改；本例是手写/上传，没有AI任务。

required环境：CREATOROS_T1254_SERVED_NATIVE_SOURCE_SHA256（新archive64hex），CREATOROS_T1254_NATIVE_MANIFEST_PATH（owned clone中封存的新reference-editors/manifest.json），CREATOROS_T1246_FROZEN_CANDIDATE（40hex）和CREATOROS_T1246_PACKAGE_SHA256（64hex）。runner要证明文件/字节/版本归属，不以这些字符串本身作证明。

已核消费者：frontend/features/article/doocs-article-editor现有编辑按钮和onImport链；reference-editor-media原create/PUT/complete/link；native.js现有插入图片按钮、aria-label选择图片文件、image/* input；原公众号文章e2e公开创建/保存/刷新/下载入口。候选仍需独审完整body、proper types和真实--list之后才能执行，当前selectors未在新包浏览器实证，遇到失败保原日志不改阈值或伪造PASS。

旧t1053 doocs-public-final-probe是jsdom候选历史，不能签真实浏览器；native源码下载不代签static CSP/原bridge，其完整静态图由T1254实际delivery Gate单独核验。用户明确暂不授权Automation Mode/App原生验收，继续保持未完成。
