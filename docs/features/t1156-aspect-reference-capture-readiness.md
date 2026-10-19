# T1156 补齐画幅截图前参考缩略图已加载观察

T1149 当前完整Chrome80.556852秒exit0，两例真实领域流程PASS。根实际查看八图，`group-before-900.png` 仍为预览暂不可用，`group-after-900.png` 已显示同一原图；前一采证只等能力，未等参考URL和图片解码，不能签参考预览视觉PASS。原绿色运行、观察、可见文案及八图已冻结私有 `t1149-current-green-frozen`，不改原件。

大白话：改比例前后需要看到同一张已加载的参考图，截图拍得早不能替代这一点。

```mermaid
flowchart LR
 A[原图实际查看发现未加载] --> B[保原图与真实绿色流程]
 B --> C[在有参考的采证点等实际img解码]
 C --> D[原读写旅程复验并重看八图]
```

仅T1149自有E2E capture增加明确的referenceExpected参数。在四张group-before/after及mode-rejected截图前，以该panel实际“参考图片”按钮里的img等待naturalWidth=内置竖图实际宽度、naturalHeight=实际高度与complete=true；具体宽高来自已使用的正式上传内置PNG。模板用途及合法文生图保存错误状态不要求不存在的参考图。不依赖通用文字消失、不写固定sleep，不force或删除原读写/引用/画幅/版本/刷新返回断言，120秒/0retry不变。

若实际图片在期限内仍不加载，保FAIL并核公开文件链，产品修复再补精确SPEC独评。本次不改产品、不猜素材丢失原因，不签客户端/模型/平台或原生下拉键盘。原完整公共旅程及八图重看通过后关闭。
