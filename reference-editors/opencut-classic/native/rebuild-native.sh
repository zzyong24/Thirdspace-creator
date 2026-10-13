#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo "用法: $0 <源码根目录> <install|build|verify|fixture>" >&2
  exit 2
fi
source_root=$(cd "$1" && pwd)
script_root=$(cd "$(dirname "$0")" && pwd)
if [[ ! -f "$source_root/bun.lock" || ! -f "$source_root/apps/web/src/embedded/native-entry.tsx" ]]; then
  echo "该目录不是本次交付的OpenCut原生源码。" >&2
  exit 2
fi
command -v bun >/dev/null
case "$2" in
  install)
    cd "$source_root"
    bun install --frozen-lockfile --ignore-scripts
    ;;
  build)
    cd "$source_root"
    bun apps/web/scripts/build-native.mjs
    ;;
  verify)
    cd "$source_root/apps/web"
    bun ../../node_modules/typescript/bin/tsc --noEmit --project tsconfig.embedded.json
    bun test src/embedded/__tests__/native-lifecycle.test.ts src/embedded/__tests__/native-command.test.ts src/embedded/__tests__/host-boundary.test.ts
    bun test src/embedded/__tests__/native-workspace.test.tsx
    # 资源测试使用独立Bun进程，显式fixture不污染原命令回归的模块图。
    bun test src/embedded/__tests__/native-resources.test.ts
    # 各端口夹具单独进程，不混入原生命令/WASM模块图。
    for preview_test in native-preview native-preview-resources native-preview-audio native-preview-canvas native-preview-image; do
      bun test "src/embedded/__tests__/$preview_test.test.ts"
    done
    CREATOROS_TEST_TYPESCRIPT_MODULE="$source_root/node_modules/typescript/lib/typescript.js" bun "$script_root/verification/check-process-globals.ts" "$source_root/apps/web/native-dist/native.js"
    ;;
  fixture)
    : "${CREATOROS_TEST_JSDOM_MODULE:?请指定已有JSDOM的api.js绝对路径；该模式不执行真实GPU/MP4}"
    cd "$source_root"
    bun apps/web/scripts/build-native.mjs --dom-fixture
    CREATOROS_NATIVE_FIXTURE_MODULE="$source_root/apps/web/native-dom-fixture-dist/native.js" bun "$script_root/verification/dom-probe.ts"
    CREATOROS_NATIVE_FIXTURE_MODULE="$source_root/apps/web/native-dom-fixture-dist/native.js" bun "$script_root/verification/t1274/workspace-dom-probe.ts"
    ;;
  *)
    echo "未知模式: $2" >&2
    exit 2
    ;;
esac
