# T1138 核对共享素材弹窗走查未命中原生模式选择控件

用户要求发现问题及时创建任务。T1136 当前Chrome原完整3例在2026-10-09T15:52:10.389753Z至15:55:46.946182Z真实exit1、216.536800秒、0retry：前两例PASS；第三例等待 `inspector.getByLabel("模式",{exact:true})` 120秒失败，尚未进入参考选择器，不代表素材弹窗已通过或产品控件不存在。

实际失败截图和DOM快照均显示节点设置中有 `combobox "模式"`，选项为文生图/参考图生图。当前原label包裹整个select，文本还含所有option；精确文本label定位不同于控件可访问名。只将该测试定位校准为原生 `getByRole("combobox",{name:"模式",exact:true})`，仍选择image_to_image。后续必须实际打开参考图库、等待左右图片加载、核尺寸及取消无写；不能改产品、删断言、伪造数据或把前两PASS代签第三条。

原始日志、测试字节、trace留在本机私有证据目录；仓库记录原命令时间/exit/sourceSHA及脱敏日志，签名blob URL的查询不提交。runner只机械遮蔽签名URL查询，原rawSHA保留，成功写入仍由正式公共链验收。修复承接T1136精确测试/runner允许写集，不增加产品路径。

```mermaid
flowchart LR
 A[当前DOM 模式下拉] --> B[按combobox和可访问名定位]
 B --> C[原真实素材弹窗操作]
 C --> D[预览 尺寸 取消无写]
```
