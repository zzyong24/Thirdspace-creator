import { createHash } from "node:crypto";

function digest(label, value) {
  return createHash("sha256")
    .update(`${label}\0${JSON.stringify(value)}`)
    .digest("hex");
}

function common(inputs) {
  return {
    platform: inputs.platform,
    arch: inputs.arch,
    securityManifestFormat: inputs.securityManifestFormat,
  };
}

/**
 * RAT-PKG-04 的候选分层 key 计算器。
 *
 * 这里不读工作区，也不猜“哪些文件变了”；调用方必须先为 SPEC FR-PKG-08 列出的每组输入
 * 生成内容摘要。纯函数让 fixture 可以逐项变异，并证明 shell-only/app-only/heavy layer
 * 不会互相误失效。
 */
export function computeRuntimeLayerKeys(inputs) {
  const shared = common(inputs);
  const shell = digest("shell", { ...shared, ...inputs.shell });
  const appCode = digest("app-code", { ...shared, ...inputs.appCode });
  const nodeRuntime = digest("node-runtime", {
    ...shared,
    ...inputs.nodeRuntime,
  });
  const browser = digest("browser", { ...shared, ...inputs.browser });
  const media = digest("media", { ...shared, ...inputs.media });
  const localAi = digest("local-ai", {
    ...shared,
    ...inputs.localAi,
    pnpmLock: inputs.nodeRuntime.pnpmLock,
    nodeVersion: inputs.nodeRuntime.nodeVersion,
    nodeAbi: inputs.nodeRuntime.nodeAbi,
    normalizedClosure: inputs.nodeRuntime.normalizedClosure,
    dynamicRegistry: inputs.nodeRuntime.dynamicRegistry,
    buildSidecar: inputs.nodeRuntime.buildSidecar,
    nativeInputs: inputs.nodeRuntime.nativeInputs,
  });
  const runtimeId = digest("runtime-image", {
    shell,
    appCode,
    nodeRuntime,
    browser,
    media,
    localAi,
  });

  return {
    shell,
    appCode,
    nodeRuntime,
    browser,
    media,
    localAi,
    runtimeId,
  };
}
