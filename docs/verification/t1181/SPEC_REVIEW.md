# T1181 精确补充 SPEC 独立初审

结论：**PASS，限定当前新私有探针的菜单导航与证据路径校准**，findings=[]。新驱动尚未写入或执行，完整公共旅程未通过，原 MP4 可见性超时根因仍 UNKNOWN。

当前 SPEC SHA `d55a9e58b5a6967bd3b72b192e5710d5cf5d0fb01716f4c566e319e12aaeea34`；产品定位 SHA `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。本次最后 Git 读 HEAD `b34447aaf7836e7798d4bd37c262eff2357aaf7d`，第三轮真实诊断记录仍绑定 `335b1b5e055b1c8cb0935fe7f512409532236592`，不将后续控制/测试提交冒作当时运行字节。适用流程为 stage4-build 维护初审，技能与项目版本均3.29.0；全部实际读路径/SHA见 READ_SET.json。

第三轮原 receipt 实际 exit1/139.96299762499984秒，实际 log SHA `1893a8476b6de189c056c0289faabe8ae6189d810f5334620aea4c113db44f7f`与收据所记值一致；失败明确为原driver70:52的 `a[href="/accounts"]` click等待120000ms。failure.json保存两媒体create→PUT→complete均200，group冻结为本轮A、account=null；两个File PUT观测都available=false、bytes/SHA=null，不能当0或假称已取得请求体。

四张实际1280×720图（PNG上传、MP4上传、A组、failure）已看：两种媒体真实卡片及右侧预览可见；原PNG与MP4上传图的完成提示可见。failure观测的公开列表存在两文件，刷新保两精确文件名；公开get/fileDownloadUrl/GET的下载200/size/SHA与本轮中性原文件实算完全相等：PNG178字节 `0dd2d6f81631af889719ef0b4c9d46943db1448ec3a5340a17c7274a0774e46f`，MP42936字节 `36a6d275f2c41ae55a3a6c03c29ee21def57b6250b26bae7464d8d88bb255574`。归档receipt/JSON/driver/PNG与私有原件逐字相等，log.gz解压逐字相等。这里只确认第三轮保存的已执行片段，整轮仍FAIL、最终result不存在，第二组和返回尚未执行。

真实 AccountSwitcher 165–174行提供 `account-switcher-trigger`，绑定Link位于未展开的DropdownMenuContent，DropdownMenuItem asChild的名称为“账号组与绑定账号”、href=/accounts；原Radix Content/Item/Portal封装支持真实menuitem路径。两个组件字节均与335b Git对象相等。将原driver30/70/75行三处导航改为触发器→精确菜单项→原URL等待，符合真实消费者，不能直接改URL、force点击或伪造scope代替UI。

当前SPEC还明确全部新私有输出统一 `t1181-upload-list-navigation-corrected-` 前缀：随机root、逐文件JSON/PNG、A/B/返回、failure JSON/PNG、sidecar log、final result，预先核不存在，保JSON/log的wx。原诊断driver58/65/80/82/85行使用旧硬编码输出，直接复用会EEXIST或覆盖原PNG；本次审读提示后，正式initial落盘前当前SPEC已明确必要路径隔离，原诊断driver及所有原证据冻结。新路径隔离仅实现既有保真要求，不增加产品或业务范围。

原素材文件名、上传顺序/200/冻结scope、Buffer存在时strict bytes/SHA、两媒体无条件公开exact-file下载、刷新、第二组公开空库/UI不混入、返回A、pageerror/运行时/清理与所有120000ms预算必须原样保留。范围只有新私有driver及对应控制/当场证据；产品、测试、SDK/config、权限/owner/工作区守卫、模型/平台/真实数据和原生App不改。新轮须fresh data/auth与新随机宿主握手，不重发前轮未知写。

新轮即使通过也仅证明该条真实隔离旅程。前轮T1180 MP4可见性等待FAIL及根因UNKNOWN保留；第三轮插入公共读/观测改变时序，不足以推断前轮原因或已修产品。本审不签T1179/T1180/T1181完成、canonical/完整Gate、工程导入、native/真用户安装或全功能、真实平台/模型/扫码与微信研究恢复。仅写本私有目录，未运行任何执行或改仓库/旧证据。
