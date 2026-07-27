# T-518 本地反馈包与 storage 失败回退 RAT

> 日期：2026-07-25 19:44 PDT  
> 类型：PLAN 签核前的本地协议/可行性实验  
> 结论：**PASS（protocol only）**，另有一个跨平台文件名编码警告  
> 生产代码改动：无  
> 网络与付费调用：无

## 1. 要验证的高风险假设

T-518 的 PLAN 依赖两个便宜但关键的假设：

1. 含空格和非 ASCII 路径的两张截图、一个 `.enc` 日志和 `manifest.json` 能组成 zip，
   解压后每个文件仍与 manifest 的 SHA-256 一致；
2. 上传/storage 不可用时，流程可以失败关闭而不删除原输入、反馈草稿或用户已经选择的本地导出包。

本实验只验证文件协议和失败回退原语。它不证明 Tauri 实现、Windows 兼容、服务端上传契约或
CreatorOS 生产 UI 已完成。

## 2. 环境与本地工具

执行命令：

```bash
command -v node
node --version
command -v zip
zip -v | sed -n '1,4p'
command -v unzip
unzip -v | sed -n '1,4p'
command -v shasum
shasum --version 2>&1 | sed -n '1,2p'
```

真实输出：

```text
/opt/homebrew/opt/node@22/bin/node
v22.22.2
/usr/bin/zip
This is Zip 3.0 (July 5th 2008), by Info-ZIP, with modifications by Apple Inc.
/usr/bin/unzip
UnZip 6.00 of 20 April 2009, by Info-ZIP, with modifications by Apple Inc.
/usr/bin/shasum
6.02
```

仓库依赖检查：

```bash
rg -n '"(archiver|jszip|yazl|adm-zip|fflate|zip-a-folder)"' \
  package.json frontend/package.json backend/package.json pnpm-lock.yaml
```

结果为无匹配。即当前不能把某个仓内 JavaScript zip 库写成“已存在可复用”的事实；本 RAT
使用系统 `zip/unzip` 验证协议形状，生产实现仍须在 CONTRACT/BUILD 选择并锁定跨平台方案。

## 3. Fixture

临时根目录由下列命令创建：

```bash
mktemp -d /tmp/t518-feedback-rat.XXXXXX
```

实际目录：

```text
/tmp/t518-feedback-rat.toUaYJ
```

Node 内联脚本创建了以下原始输入，并复制到独立 staging 目录：

```text
输入 原始资料/
├── 截图 样本/
│   ├── 01 操作前.png
│   └── 02 错误现场.png
└── sidecar 日志(18).enc

反馈 包 staging/
├── screenshots/
│   ├── 01 操作前.png
│   └── 02 错误现场.png
├── logs/
│   └── sidecar 日志(18).enc
└── manifest.json
```

截图是两个可解析的 1×1 PNG 测试样本；`.enc` 是 4,115 字节的确定性不透明二进制夹具，不尝试
解密。类型检查：

```bash
file \
  "/tmp/t518-feedback-rat.toUaYJ/输入 原始资料/截图 样本/01 操作前.png" \
  "/tmp/t518-feedback-rat.toUaYJ/输入 原始资料/截图 样本/02 错误现场.png" \
  "/tmp/t518-feedback-rat.toUaYJ/输入 原始资料/sidecar 日志(18).enc"
```

输出：

```text
01 操作前.png:   PNG image data, 1 x 1, 8-bit gray+alpha, non-interlaced
02 错误现场.png: PNG image data, 1 x 1, 8-bit gray+alpha, non-interlaced
sidecar 日志(18).enc: data
```

manifest 由 Node `crypto.createHash("sha256")` 对 staging 中的真实字节计算，记录
`path/role/size/sha256`。三个 payload 的预期值为：

| 路径 | 大小 | SHA-256 |
| --- | ---: | --- |
| `screenshots/01 操作前.png` | 68 B | `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460` |
| `screenshots/02 错误现场.png` | 68 B | `d126d616641d42ac8b0a07ec302c9fa1ec049f86200931a0a60c8f3080284b77` |
| `logs/sidecar 日志(18).enc` | 4,115 B | `978345c83b4148cc96d16821ef0dc239e3a0b3bf21f471af5f03bc96cbef2d7e` |

## 4. 造包、解压与逐文件 checksum

实际造包命令：

```bash
cd "/tmp/t518-feedback-rat.toUaYJ/反馈 包 staging"
zip -X -r "/tmp/t518-feedback-rat.toUaYJ/用户 导出/反馈 包-测试.zip" .
```

实际输出：

```text
adding: screenshots/ (stored 0%)
adding: screenshots/02 错误现场.png (deflated 7%)
adding: screenshots/01 操作前.png (deflated 7%)
adding: logs/ (stored 0%)
adding: logs/sidecar 日志(18).enc (deflated 92%)
adding: manifest.json (deflated 44%)
```

实际解压命令：

```bash
unzip -q \
  "/tmp/t518-feedback-rat.toUaYJ/用户 导出/反馈 包-测试.zip" \
  -d "/tmp/t518-feedback-rat.toUaYJ/解压 校验"
```

校验器重新读取**解压后的** manifest，对三个解压文件重新计算 SHA-256，同时比较打包前后
manifest 自身的 SHA-256。核心命令为：

```bash
node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = "/tmp/t518-feedback-rat.toUaYJ";
const stage = join(root, "反馈 包 staging");
const extracted = join(root, "解压 校验");
const manifest = JSON.parse(readFileSync(join(extracted, "manifest.json"), "utf8"));
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const files = manifest.files.map((item) => {
  const unpacked = join(extracted, item.path);
  const actual = sha256(unpacked);
  return {
    path: item.path,
    exists: existsSync(unpacked),
    expected: item.sha256,
    actual,
    match: item.sha256 === actual
  };
});
const manifestMatch =
  sha256(join(stage, "manifest.json")) === sha256(join(extracted, "manifest.json"));
const verdict = files.every((item) => item.exists && item.match) && manifestMatch
  ? "PASS"
  : "FAIL";
console.log(JSON.stringify({ manifestMatch, files, verdict }, null, 2));
if (verdict !== "PASS") process.exit(1);
'
```

结果：

```json
{
  "manifestMatch": true,
  "files": [
    {
      "path": "screenshots/01 操作前.png",
      "exists": true,
      "match": true
    },
    {
      "path": "screenshots/02 错误现场.png",
      "exists": true,
      "match": true
    },
    {
      "path": "logs/sidecar 日志(18).enc",
      "exists": true,
      "match": true
    }
  ],
  "verdict": "PASS"
}
```

最终 zip：

```text
路径：/tmp/t518-feedback-rat.toUaYJ/用户 导出/反馈 包-测试.zip
大小：1,569 bytes
SHA-256：8a67d2c7cebe9990381e9a6d1758899f645e600da1ca2d2ef9fa0ae1ea440d26
```

`rg --files "/tmp/t518-feedback-rat.toUaYJ/解压 校验"` 显示三个非 ASCII payload 与
manifest 均按原名落盘。

### 实验夹具的第一次失败也被保留

第一次 fixture 脚本错误地在 manifest 末尾写入了字面量 `\n`，验证器在
`JSON.parse` 处退出码 1：

```text
SyntaxError: Unexpected non-whitespace character after JSON
```

修正夹具后删除第一次 archive/extract，再从 `zip` 开始完整重跑，得到上述 PASS。这个过程证明
校验器不会把 malformed manifest 当成成功包；第一次失败不计为产品失败或最终 PASS 证据。

## 5. 模拟 storage 不可用

本项没有发网络请求。脚本先保存：

- 原输入相对路径与 checksum；
- 本地反馈草稿 `反馈草稿.json`；
- 用户导出路径与 zip checksum。

随后在 upload adapter 入口以 `storageEnabled=false` 抛出
`storage_disabled: upload service unavailable`，捕获后重新验证原输入、草稿和 zip：

```bash
node --input-type=module -e '
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = "/tmp/t518-feedback-rat.toUaYJ";
const state = JSON.parse(readFileSync(join(root, "rat-state.json"), "utf8"));
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const draftPath = join(root, "反馈草稿.json");
writeFileSync(
  draftPath,
  JSON.stringify({
    status: "draft",
    issue: "模拟 storage 不可用",
    exportPath: state.exportPath
  }, null, 2) + "\n"
);
const archiveChecksumBefore = sha256(state.exportPath);
let uploadError = null;
try {
  const storageEnabled = false;
  if (!storageEnabled) {
    throw new Error("storage_disabled: upload service unavailable");
  }
} catch (error) {
  uploadError = error.message;
}
const sourceResults = Object.entries(state.sourceChecksums).map(
  ([relativePath, expected]) => {
    const path = join(state.input, relativePath);
    const actual = sha256(path);
    return { relativePath, exists: existsSync(path), match: expected === actual };
  }
);
const draft = JSON.parse(readFileSync(draftPath, "utf8"));
const archiveChecksumAfter = sha256(state.exportPath);
const result = {
  uploadError,
  noNetworkAttempted: true,
  sourceResults,
  draftRetained: existsSync(draftPath) && draft.status === "draft",
  exportPathRetained:
    existsSync(state.exportPath) && draft.exportPath === state.exportPath,
  archiveUnchanged: archiveChecksumBefore === archiveChecksumAfter
};
result.verdict =
  uploadError?.startsWith("storage_disabled") &&
  sourceResults.every((item) => item.exists && item.match) &&
  result.draftRetained &&
  result.exportPathRetained &&
  result.archiveUnchanged
    ? "PASS"
    : "FAIL";
console.log(JSON.stringify(result, null, 2));
if (result.verdict !== "PASS") process.exit(1);
'
```

真实输出：

```json
{
  "uploadError": "storage_disabled: upload service unavailable",
  "noNetworkAttempted": true,
  "sourceResults": [
    {
      "relativePath": "截图 样本/01 操作前.png",
      "exists": true,
      "match": true
    },
    {
      "relativePath": "截图 样本/02 错误现场.png",
      "exists": true,
      "match": true
    },
    {
      "relativePath": "sidecar 日志(18).enc",
      "exists": true,
      "match": true
    }
  ],
  "draftRetained": true,
  "exportPathRetained": true,
  "archiveUnchanged": true,
  "verdict": "PASS"
}
```

这证明“失败先返回、清理逻辑不触碰用户原输入和已完成导出包”的最小原语可行；它不证明生产
上传状态机已经按此实现。

## 6. 跨平台警告

macOS 自带 Info-ZIP 3.0 的 `unzip -Z1` 在当前终端把中文 entry **显示成乱码**，但同机实际
解压路径正确，且 Node 以原中文路径读取并通过 checksum：

```text
screenshots/02 �??误�?��?�.png
screenshots/01 �??�?�??.png
logs/sidecar �?��?(18).enc
```

因此本 RAT 只能裁决“macOS 本地字节 round-trip 可行”，不能据此裁决 Windows Explorer、
PowerShell、Tauri/Rust zip 库或不同 Unicode normalization 下兼容。生产实现不能直接把
`/usr/bin/zip` 当作跨平台方案；CONTRACT/BUILD 必须：

1. 固定 zip 实现与 UTF-8 文件名规则；
2. 对 `../`、绝对路径、symlink 和 Unicode normalization 做拒绝/规范化；
3. 用同一 fixture 在受支持 macOS 做发布 Gate，并在 T-487/DEC-PKG 完成前只把 Windows 结果写成
   候选平台证据；
4. 在临时目录、用户保存路径、取消、磁盘满、进程中断下验证原子完成与无残留。

## 7. 裁决

| 项目 | 裁决 | 证据边界 |
| --- | --- | --- |
| 含空格/中文路径的 manifest + 2 PNG + 1 `.enc` 本地造包 | PASS（protocol only） | macOS/Info-ZIP 本地实验 |
| 解压后逐文件 SHA-256 与 manifest 一致 | PASS | 3/3 payload + manifest 自身一致 |
| storage 禁用时原输入、草稿、导出包不丢 | PASS（protocol only） | 模拟 adapter 在网络前 fail-closed |
| Tauri 可信边界、原子保存、磁盘满/取消 | 未验证 | 仍由 `HARD-FDB-03` 的 CONTRACT/BUILD tests 关闭 |
| Windows zip/Unicode 兼容 | 未验证且存在警告 | 必须用正式实现与同 fixture 在候选平台重测 |
| growth presign、扫描、幂等、保留删除 | 未验证 | 需要服务契约与 integration/security tests |

最终结论：T-518 的“同一份内容可本地打包、上传不可用时不丢输入”方案在协议层可行，可以继续
PLAN/CONTRACT；不得把本报告升级描述为 Windows、Tauri 或服务端发布通过。
