# T1223 截图总览记录身份修复

本次修复让图库把“历史运行记录数”和按 Test ID 去重后的“独立用例数”分开显示；每条历史记录保留原状态、标题、URL、retry、错误信息和截图路径，并拥有由完整 spec、Test ID、原索引行号生成的稳定唯一锚点。Markdown 索引逐条链接到对应图库记录和原图。原图库 CSS、颜色 token 与卡片布局和 HEAD 完全相同。

## TDD 与验证

- RED：用临时目录复制修复前的真实生成器（SHA256 `eb268273912e0a5a60d57f9266802707d624eb99be95fdc6303a2b241062c2a3`），输入同一 Test ID 的 3912 FAIL、3913 PASS 两条历史记录。旧生成器实际生成两个相同 `id="case-c30d334f01c06de6caf2-2d95b5b12af54537ace8"` 的 article，摘要显示 `2 cases / 1 spec`，未区分独立用例；新契约断言以 exit 1 暴露两处问题。详见 [red-baseline.log](red-baseline.log) 与 [red-baseline.json](red-baseline.json)。
- GREEN：`node docs/verification/t1207/generate-gallery.mjs` exit 0，生成 345 条历史运行记录、224 个独立用例、67 个 spec，见 [generation.log](generation.log)。
- 验证：`node docs/verification/t1223/verify.mjs` exit 0。两条同 ID、不同状态 fixture 和完整原索引都在隔离临时目录重复生成，HTML 与 Markdown 字节一致；逐条核对输出身份、状态、标题、URL、retry、错误证据、Test ID、截图路径和缺图状态，并确认 345 个历史截图文件均存在、每个 article ID 唯一。原索引 SHA256 前后保持 `2a8039180fb68b992ffdb5ce9664a40f076c8bd8eec1562b420f7428f38b2769`。完整结果见 [verify-output.log](verify-output.log) 和 [verification-result.json](verification-result.json)。
- 原 3912 FAIL 与 3913 PASS 分别有唯一锚点、原图路径和 Markdown 记录链接；本地浏览器中逐个点击缩略图，确认打开的是对应原图。
- 用 Playwright 打开本地 `file://` 报告页检查 1024×768 和 1536×960 两种视口并截图；94 条资源请求全是本地 `file://`，没有外网请求：[1024px](gallery-1024.png)、[1536px](gallery-1536.png)。这只是图库页面验收，不代表再次运行了产品 E2E。
- `git diff --check` exit 0。

## 当前历史结果

图库仍展示全部历史运行：251 PASS、86 FAIL、8 TIMEOUT，共 345 条记录和 224 个独立 Test ID。重复 Test ID 的多次运行没有被合并或过滤；这些历史状态不代表全功能通过。

生成器 SHA256：`84cd7d994ace92b4404cf7050e69ecd74c8849314fb40bc3b088e499194c8535`。派生图库 SHA256：`ca84446cece867083ff29bbf3dd7a8f06cf662f298fa75479a3c297fd601b866`。派生 Markdown SHA256：`11c82fd355f90385ee2b7ac3ee7dbeba71d1ed1db46fecbd522be342da921941`。
