# T1182 剩余一次真实上传按钮控制实验：独立 SPEC 初审

结论：**PASS，限当前精确研究 SPEC 的一次控制实验准入**，findings=[]。不签实验结果、原超时根因或研究恢复。

当前 SPEC SHA `c1f94d403e482b06ebf08c488bf5f221186d9e28989b1acad43f59bc1d2d1569`，研究卡 SHA `57dbba6853af1fde62ce62bd9c9ac5d359b2580dbf0eff8914e9db3724038836`，产品定位 SHA `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`；当前 Git HEAD `b34447aaf7836e7798d4bd37c262eff2357aaf7d`。维护流程 stage4-build/3.29.0适用。所有实际路径/SHA、原收据与归档比较见 READ_SET.json。

第四轮真实原收据仍exit1/138.76938770897686秒，log SHA `e9bcef9a81ea18802b0a58e5a857919a68654adb486a592c74831e19abb62c7b`匹配，driver59:56精确MP4文件名可见性等待120000ms超时。failure SHA `9b3164e4150f841d35590ded26a35d7e8ca7b75af2ad6e0974c5750e2560978f`与研究卡相符；MP4公开列表有两文件、DOM仅PNG、exactMatches=[]。图已实际查看，完成提示和PNG卡片存在；没有原disabled属性记录，浅色样式不能补判布尔值。原三段200和落盘回执不等于列表已经刷新，原根因保持UNKNOWN。

真实 AssetUploadButton 的 pending只禁按钮，hidden input/onChange/handleFile没有pending拒绝；原私有driver55行直接setInputFiles，确绕过正常按钮的可操作条件。setUploadStatus后立即调用router.refresh，真实/assets Server client经list重建VM，画廊消费props；该调用与toast没有可供当前probe使用的“已完成画廊更新”凭据。本控制因此有明确区分目的，但尚不能证明曾发生并发刷新或产品缺陷。

新私有driver仅复制冻结 `e43e384bfe254ec16ac5945649adfac657ad3073b025567905fae1fb8deddf51` 的当前驱动，所有root/观察JSON/PNG/failure/sidecar/final使用新前缀并预核不存在，保wx与旧证据字节。每个文件先保存真实isDisabled、注册120秒filechooser监听，再真实按钮click（默认actionability、120秒、无force/evaluate），随后await实际chooser并setFiles；不能先await尚未触发的chooser再click。最终原两文件可见后用明确120秒有限等待enabled并保存属性，不能固定sleep或直接注入隐藏input取代真实UI。新driver实查尚不存在，实施后应另核其保存观察和错误/清理行为。

原toast/精确文件名、create→PUT→complete/200/group无account、存在Buffer时strict bytes/SHA与缺失false/null、两媒体无条件公开get/fileDownloadUrl/GET严格size/SHA、刷新、真实菜单第二纯组公开空库/UI无混入、返回A、pageerror/运行时/清理和全部120000ms预算保留。没有product/tests/SDK/config/guard/owner改动；只用随包Node/fullChromium、fresh随机data/auth及已知中性PNG/MP4，不碰真实用户/模型/平台/native。

Research Gate真实observe为exit2，日志`RESEARCH_REQUIRED`，实际research_observation与research_open绑定T-1181/T-1182及当前卡，BACKLOG T-1181⏸；重复taskctl block实际exit1因已经暂停，原失败保留，非伪造0。当前卡researching/max_experiments2，已有冻结隐藏注入观测1，只允许剩余控制2，之后不再同族重跑；以往全部日志仍保留，不称历史总共只执行一次。失败须记录并保研究暂停，成功只证明这条正常UI旅程，不能补签旧超时机制已证实。

实际reconcile.config两个`t1182-real-upload-*` verify keys均未注册；源码resume消费者要求validated、现证据SHA、有效key及真实检查。SPEC/研究卡明确恢复前另行闭合，当前不得手写validated或绕恢复门；这是未准入研究恢复，而非阻止本次有界实验。源冻结的其它独立检查由根代理负责，不在此代签。

本审不签T1179/T1180/T1181/T1182完成、完整旅程/canonical/Gate、工程导入、原生App/Windows/真用户安装、全功能或微信研究恢复。仅读/私有报告写，未运行任何测试/实验/门/服务/产品CLI/DB/模型/浏览器，未修改仓库、任务或旧证据。
