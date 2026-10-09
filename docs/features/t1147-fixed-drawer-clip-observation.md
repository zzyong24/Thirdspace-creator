# T1147 核对固定素材抽屉的可见范围观察

用户要求发现问题及时建task修复。当前真实Chrome17:36:31–17:39:44 UTC，192.674秒exit1；field六视口完整预览/取消不写PASS。正式exact选用/保存/刷新/返回，以及gallery1366、1024、683、390×900预览均已走过；390×450在whole检查120秒false，失败原图显示固定抽屉的完整横图可见。未走完512及末尾一次错误重试，不签整轮。7路径前后字节相同；此次worker正常清理不代签T1144原成功流程原因已解决。原命令/图/trace与源码保留。

现观察函数无条件取所有overflow祖先的交集，会把已经固定到viewport的drawer上层画布overflow-hidden仍作为clip。CSS规范明确定位元素不被其与containing block之间祖先overflow裁切；不能直接删全部裁切检查。资料：[W3C CSS22 overflow](https://www.w3.org/TR/CSS22/visufx.html)、[W3C fixed containing block](https://www.w3.org/TR/css-position-3/)。实际是否存在transform/filter/contain等建立固定包含块的祖先，还需保computed style当场验证；有此情况保原保守检查，不跳过真实clip。

仅在T1140已授权测试观察写集校准paint：保已选img/object-contain/实际解码、viewport、drawer及内部overflow所有边界；当真正fixed祖先以上无建立fixed containing block的样式时，才排除被定位规则跨过的外层overflow，并把全部实际祖先样式/跳过边界保存进观察。测试不能修改产品、CSS/React状态，不能缩预算/force点击或删左右媒体/写后读/owner断言。一次整体0retry原旅程复验并查看图；持续失败先取几何真值再另审产品。
