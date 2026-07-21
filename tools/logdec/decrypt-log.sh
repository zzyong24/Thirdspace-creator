#!/usr/bin/env bash
# CreatorOS 日志解密工具 (T-455)
# 用法:
#   ./decrypt-log.sh --key <私钥文件> <sidecar.log.enc> [<sidecar.log(2).enc> ...]
#   ./decrypt-log.sh --key <私钥文件> --dir <目录>      # 解密目录里所有 .enc
# 输出:每份 xxx.enc → xxx.log(去掉 .enc 后缀,同目录)。已存在的 .log 跳过除非 --force。
# 密钥:开发机专用私钥 (docs/support-toolkit.md 指路);仅限支持排障,不进 IM / 不进 git。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDEC="${SCRIPT_DIR}/creatoros-logdec.exe"

KEY=""
DIR=""
FORCE=0
FILES=()

usage() {
  cat <<EOF
CreatorOS 日志解密工具 (T-455)

用法:
  $0 --key <私钥文件> <文件1.enc> [<文件2.enc> ...]
  $0 --key <私钥文件> --dir <目录>
  $0 --key <私钥文件> --dir <目录> --force

参数:
  --key <path>   私钥文件路径 (raw 32B url-safe base64;放本机开发者控制的位置)
  --dir <path>   解密目录里所有 *.enc(递归)
  --force        覆盖已有 .log 输出
  -h, --help     显示本帮助

示例:
  $0 --key ~/.creatoros/log-privkey.key /path/to/wechat/2026-07/sidecar.log.enc
  $0 --key ~/.creatoros/log-privkey.key --dir "/c/Users/foo/Documents/WeChat Files/xxx/FileStorage/File/2026-07"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key)   KEY="$2"; shift 2 ;;
    --dir)   DIR="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; FILES+=("$@"); break ;;
    -*)      echo "未知参数: $1" >&2; usage; exit 2 ;;
    *)       FILES+=("$1"); shift ;;
  esac
done

if [[ -z "$KEY" ]]; then
  echo "错误: 必须指定 --key <私钥文件>" >&2
  usage
  exit 2
fi

if [[ ! -f "$KEY" ]]; then
  echo "错误: 私钥文件不存在: $KEY" >&2
  exit 2
fi

if [[ ! -x "$LOGDEC" ]]; then
  echo "错误: 找不到 logdec 二进制: $LOGDEC" >&2
  echo "先跑一次打包(cargo build --features logtools --bin creatoros-logdec) 并把 exe 拷进 tools/logdec/" >&2
  exit 2
fi

# 补齐 --dir 模式的文件列表
if [[ -n "$DIR" ]]; then
  if [[ ! -d "$DIR" ]]; then
    echo "错误: 目录不存在: $DIR" >&2
    exit 2
  fi
  # 用 find 兼容有空格的目录 (mac WeChat 目录常见)
  while IFS= read -r -d '' f; do
    FILES+=("$f")
  done < <(find "$DIR" -type f -name '*.enc' -print0)
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "错误: 未指定要解密的文件 (给几个 .enc 或用 --dir <目录>)" >&2
  usage
  exit 2
fi

ok=0
skipped=0
failed=0

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "⚠ 跳过 (不存在): $f" >&2
    failed=$((failed+1))
    continue
  fi
  # 输出名: 去掉最后的 .enc,附加 .log (若原名不以 .log 结尾)
  base="$f"
  # 去 .enc
  base="${base%.enc}"
  # 若不含 .log 后缀,补一个
  case "$base" in
    *.log|*.log\(*\)|*.log\ *) out="$base.txt" ;;
    *) out="${base}.log" ;;
  esac
  if [[ -f "$out" && $FORCE -eq 0 ]]; then
    echo "⏭ 已存在 (--force 覆盖): $out"
    skipped=$((skipped+1))
    continue
  fi
  echo "→ $f"
  if "$LOGDEC" --key "$KEY" "$f" > "$out" 2>/dev/null; then
    size=$(wc -c < "$out")
    echo "  ✓ 输出 $out ($size B)"
    ok=$((ok+1))
  else
    rm -f "$out"
    echo "  ✗ 解密失败 (密钥不匹配或文件损坏)"
    failed=$((failed+1))
  fi
done

echo ""
echo "汇总: 成功 $ok · 跳过 $skipped · 失败 $failed"
[[ $failed -eq 0 ]]
