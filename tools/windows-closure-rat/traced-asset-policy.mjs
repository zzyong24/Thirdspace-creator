const NON_RUNTIME_TRACED_ASSET_PREFIXES = [
  "frontend/src/",
  "frontend/src-tauri/",
  "frontend/tests/",
  "frontend/docs/",
  "frontend/specs/",
  "frontend/scripts/",
];

export function isNonRuntimeTracedAsset(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/, "");
  return NON_RUNTIME_TRACED_ASSET_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}
