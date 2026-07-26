# T-519 文档抽取最小 RAT（PDF / DOCX / Markdown）

> 日期：2026-07-25  
> 范围：只验证现有确定性抽取器与现有 runner 的最小可行性，不修改生产代码，不代表 T-519 的刷新、重启、版本与文件夹合同已经通过。  
> 结论：**格式抽取 RAT 通过；真实持久化/冷重启未验证，必须留到 CONTRACT / BUILD Gate。**

## 1. 本次要回答的问题

1. 当前安装的 `pdf-parse`、`mammoth` 与 `TextDecoder` 能否离线读取带文本层 PDF、DOCX、Markdown？
2. 损坏 PDF / DOCX 是否会明确失败，而不是返回伪造内容？
3. 现有 `material-extract-runner` 是否已经把成功、空文本、损坏、未支持格式分成诚实状态？
4. 本轮没有证明什么，后续必须在哪些 Gate 补齐？

## 2. 环境与依赖

执行命令：

```bash
node --version
pnpm --version
pnpm --dir frontend list mammoth pdf-parse --depth 0
```

真实结果：

```text
Node.js v22.22.2
pnpm 10.32.1
mammoth 1.12.0
pdf-parse 2.4.5
```

注意：仓库根 `package.json` 要求 `node >=25 <26`，`frontend` 要求 `node >=24`。本机实际为 Node 22，所以本结果只能作为早期可行性证据；合并前必须在项目支持的 Node 25 环境重跑。

## 3. 真实格式样本 RAT

### 3.1 方法

执行的入口命令：

```bash
pnpm --dir frontend exec node --input-type=module
```

在该进程内运行一次性离线 harness（临时目录前缀 `t519-document-rat-`，结束后删除），其动作如下：

1. 直接写入一个合法的最小 PDF 1.4：单页、Helvetica、内容流为 `T519 PDF text layer OK`；
2. 写入最小 OOXML 结构（`[Content_Types].xml`、`_rels/.rels`、`word/document.xml`），用系统 `/usr/bin/zip -q -X -r` 生成 `sample.docx`；
3. 写入 UTF-8 Markdown：标题与中文正文；
4. 用与现有组合根相同的调用方式抽取：

```js
const parser = new PDFParse({ data: bytes });
const pdfText = (await parser.getText()).text;

const { value: docxText } = await mammoth.extractRawText({
  buffer: Buffer.from(bytes),
});

const markdownText = new TextDecoder("utf-8").decode(bytes);
```

5. 再分别传入 `not a pdf`、`not a docx` 与非法 UTF-8 字节 `[0xff, 0x61]`，记录真实分类；
6. 所有样本只在系统临时目录生成，未联网、未调用模型、未写入业务数据库。

### 3.2 真实输出

```json
{
  "success": {
    "pdf": "T519 PDF text layer OK\n\n-- 1 of 1 --",
    "docx": "T519 DOCX text OK",
    "markdown": "# T519 Markdown\n\n正文 OK。"
  },
  "failure": {
    "corruptPdf": "InvalidPDFException: Invalid PDF structure.",
    "corruptDocx": "Error: Can't find end of central directory : is this a zip file ?"
  },
  "edge": {
    "malformedUtf8": "�a",
    "codePoints": [65533, 97]
  }
}
```

### 3.3 分类结论

| 输入 | 真实结果 | 当前应归类 |
|---|---|---|
| 带文本层 PDF | 抽到目标文本；`pdf-parse` 另外附带页分隔标记 | 成功候选，runner 应写 `done` |
| 合法 DOCX | 抽到目标文本 | 成功候选，runner 应写 `done` |
| UTF-8 Markdown | 原文解码成功 | 成功候选，runner 应写 `done` |
| 损坏 PDF | `InvalidPDFException` | 抽取失败，runner 应写 `failed` |
| 损坏 DOCX | ZIP 中央目录错误 | 抽取失败，runner 应写 `failed` |
| 非法 UTF-8 Markdown | 默认 `TextDecoder` 不抛错，使用 `U+FFFD` 替换 | **当前会被当作成功候选；不能说“严格 UTF-8 校验通过”** |

## 4. 现有 runner 回归

执行命令：

```bash
pnpm --filter @creatoros/backend exec vitest run \
  src/modules/ai-runtime/material-extract-runner.test.ts
```

真实结果：

```text
Test Files  1 passed (1)
Tests      13 passed (13)
Duration   177ms
```

这 13 个测试覆盖：

- MIME / 扩展名分派：PDF、DOCX、Markdown / TXT 与旧 `.doc` / 未知类型；
- 正常抽全文后请求写入 `extractStatus: done`；
- 未支持格式请求写入 `unsupported`；
- 抽取异常或空文本请求写入 `failed`，不会假装成功；
- 未配置摘要模型时仍保留已经抽取的全文；
- 超长摘要输入会截断，但全文写入请求保持完整；
- `assetId` 缺失会明确失败。

这里的“写入”是注入端口的 mock 调用断言，不是 PGlite / PostgreSQL 真库落盘证明。

## 5. 本轮没有验证的内容

以下项目明确记为 **NOT VERIFIED**，不能写成 PASS：

1. `KnowledgeFolder`、`KnowledgeDocument`、`KnowledgeDocumentVersion` 尚未实现，本轮没有验证目录树和版本对象；
2. 没有把抽取结果写入真实 PGlite / PostgreSQL 后关闭进程、重新启动并读取；
3. 没有验证修改原文件后的 refresh 是否生成新版本、旧引用是否仍固定到旧版本；
4. 没有验证应用冷重启后文件夹树、当前版本、历史版本与抽取状态是否一致；
5. 没有验证扫描 PDF（无文本层）、加密 PDF、复杂排版 PDF、批注 / 表格、损坏 OOXML 关系、超大文档；
6. 没有验证 Windows 发行包中的 parser 与字体 / 路径差异；
7. 没有在项目要求的 Node 25 上重跑；
8. 没有验证 Markdown 的编码策略。当前 `TextDecoder("utf-8")` 会静默插入替换字符，而不是严格失败。

## 6. CONTRACT / BUILD 硬 Gate

### CONTRACT Gate

- 明确唯一真相：原始字节、当前抽取状态与当前全文由 Assets / AssetFile 持有；知识文档版本只能引用文件并记录不可变快照，不复制第二份可变状态；
- 明确 `done / failed / unsupported / no_text`（若采用）的状态机与 API 错误码；
- 明确 refresh 的幂等键、版本号、旧引用固定规则和并发冲突处理；
- 明确 Markdown 编码策略：严格拒绝非法 UTF-8，或允许替换字符但必须在 UI 显示警告；禁止静默当作无损成功；
- 明确扫描 PDF 与旧 `.doc` 均不在 T-519 首期解析范围，不能隐藏调用 OCR 或外部服务。

### BUILD Gate

- 在仓库提交最小 PDF / DOCX / Markdown 固定 fixture，直接测试生产组合根的 extractor，而不是复制一份测试实现；
- 在 Node 25 重跑格式测试，并在正式支持的 macOS 发行路径跑一次；
- 使用真实数据库与对象存储端口完成“上传 → 抽取 → 落盘 → 关闭 → 冷启动 → 读取”；
- 完成“修改源文件 → refresh → 新版本 → 旧引用仍读旧版本”的集成测试；
- 覆盖扫描 PDF、加密 / 损坏 PDF、损坏 DOCX、非法 UTF-8 Markdown，并逐项断言诚实状态；
- 对接近 20 MB 上限的 PDF / DOCX 测量峰值内存、耗时与失败清理；不得只验证小样本；
- Windows 只可记候选平台证据；在项目正式支持范围变更前，不把一次 Windows 本机通过冒充正式发布 Gate。

## 7. 最终判断

现有依赖足以支撑 T-519 首期的“带文本层 PDF + DOCX + Markdown”确定性抽取，损坏 PDF / DOCX 也能形成明确异常。现有 runner 的 13 个单测证明了诚实状态映射。

但是，本 RAT **没有证明 refresh、版本、真实落盘和冷重启**。这些能力必须在 CONTRACT 中写成单一数据真相与状态机，并在 BUILD 中用真实数据库 / 存储和正式 Node 版本完成端到端验证后，T-519 才能进入完成态。
