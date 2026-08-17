# T-864 BUILD 验证：image2-edit multipart 数量参数字符串化

## 用户可见结论

问题不是 `n=1` 超出范围，而是图片编辑使用 `multipart/form-data`；标准 `FormData` 的普通字段只能编码为文本。原适配器显式执行 `form.append("n", "1")`，所以上游最终看到的必然是字符串，并被严格整数校验以 HTTP 400 拒绝。

本次将图片编辑请求中的可选 `n` 完全省略。CreatorOS 的该链路只消费一张结果图，OpenAI 图片编辑公开契约将 `n` 标为可选，官方 multipart 示例也不发送 `n`。纯文生图仍走 JSON，并继续发送真正的数字 `n: 1`。

官方契约：<https://developers.openai.com/api/reference/resources/images/methods/edit>

## TDD 证据

### RED

命令：

```bash
pnpm --dir ai-worker exec vitest run src/runtime/multimodal-openai-images.test.ts
```

结果：`1 failed | 11 passed`。新增 T-864 断言要求编辑请求不存在 `n`，实际仍存在字符串字段，失败值为 `true`。

### GREEN

同一命令结果：`12 passed`。

测试同时把 `FormData` 交给 Node 的真实 `Request` 序列化器，确认最终 multipart wire body：

- `Content-Type` 含自动生成的 multipart boundary；
- 不存在 `name="n"`；
- `image`、`prompt`、`model`、`size` 保持原协议；
- 纯文生图 JSON 仍严格等于数字 `n: 1`；
- 未知设置字段不透传。

## 回归范围

- `ai-worker` OpenAI images + multimodal factory：`22 passed`；
- `backend` cover runner + multimodal resolver：`43 passed`；
- `ai-worker` typecheck：通过；
- `boundary-scan`：无新增，保持基线 5；
- `semantic-boundary-scan`：通过；
- `git diff --check`：通过。

## 同类参数审计

`ai-worker/src/runtime` 全部 `FormData.append` 已扫描。除了本次删除的 `n`，剩余字段为文件或本来就属于文本的 `model`、`prompt`、`size`、`language`；没有其他数值语义字段被 multipart 字符串化。OpenAI images 适配器只白名单读取 `settings.size`，无效尺寸被省略，`n` 与未知设置不会从配置透传。

## 明确未做

- 未调用真实计费生图；
- 未自动重试任何可能计费的图片编辑 POST；
- 未修改用户项目、素材或既有生成记录；
- 未打包、安装、推送或发布。
