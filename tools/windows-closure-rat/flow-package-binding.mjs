import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const FLOW_REPOSITORY = 'zzyong24/Thirdspace-creator';
export const FLOW_BRANCH = 'codex/build-main-windows-20261027';
export const FLOW_WORKFLOW_PATH = '.github/workflows/desktop-release.yml';
export const FLOW_ARTIFACT_NAME = 't1404-unsigned-windows-capsule';
export const FLOW_ROOT_ID = 'creatoros-update-root-20260805-01';

const TRANSFER_KEYS = ['runId', 'artifactId', 'artifactDigest', 'manifestSHA256', 'sourceCommit', 'transportCommit'];
const RECEIPT_KEYS = ['contractVersion', 'sourceCommit', 'runId', 'artifactId', 'artifactDigest', 'manifestSHA256', 'tarSHA256', 'tarBLAKE3', 'tarBytes', 'node', 'rootId', 'signatureSHA256'];
const MAX_ARTIFACT_BYTES = 8 * 1024 ** 3;
const MAX_TAR_BYTES = 6 * 1024 ** 3;
const MAX_NODE_BYTES = 256 * 1024 ** 2;

function reject(code) {
  // 只输出固定故障码，不回显输入、环境、URL 或密钥材料。
  throw new Error(`[T-1404] ${code}`);
}

function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!record(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every(key => typeof key === 'string' && expected.includes(key));
}

function hex(value, length) {
  return typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value);
}

function positiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value > 0 && value <= max;
}

function canonicalId(value) {
  return typeof value === 'string' && positiveInteger(Number(value)) && String(Number(value)) === value;
}

function validNode(value) {
  return exactKeys(value, ['sha256', 'bytes', 'target']) && hex(value.sha256, 64)
    && positiveInteger(value.bytes, MAX_NODE_BYTES) && value.bytes >= 64 && value.target === 'win32-x64';
}

/** 固定输入来自已核对的 run/artifact；不接受分支名、短 SHA 或 shell 片段。 */
export function validateFlowTransferInputs(input) {
  if (!exactKeys(input, TRANSFER_KEYS)
    || !canonicalId(input.runId) || !canonicalId(input.artifactId)
    || !hex(input.artifactDigest, 64) || !hex(input.manifestSHA256, 64)
    || !hex(input.sourceCommit, 40) || !hex(input.transportCommit, 40)) {
    reject('INVALID_TRANSFER_INPUT');
  }
  return { ...input };
}

/** 仅核 API 元数据归属；下载器仍须核完整 ZIP 的实际 SHA256 与字节数。 */
export function validateFlowArtifactBinding(input, run, artifact) {
  const expected = validateFlowTransferInputs(input);
  if (!record(run) || !positiveInteger(run.id) || run.id !== Number(expected.runId)
    || run.head_sha !== expected.sourceCommit || run.head_branch !== FLOW_BRANCH
    || run.event !== 'workflow_dispatch' || run.path !== FLOW_WORKFLOW_PATH
    || run.status !== 'completed' || run.conclusion !== 'success') {
    reject('PREPARE_RUN_BINDING_MISMATCH');
  }
  if (!record(run.repository) || !record(run.head_repository)
    || run.repository.full_name !== FLOW_REPOSITORY || run.head_repository.full_name !== FLOW_REPOSITORY
    || !positiveInteger(run.repository.id) || !positiveInteger(run.head_repository.id)
    || run.repository.id !== run.head_repository.id) {
    reject('PREPARE_REPOSITORY_BINDING_MISMATCH');
  }
  if (!record(artifact) || !positiveInteger(artifact.id) || artifact.id !== Number(expected.artifactId)
    || artifact.name !== FLOW_ARTIFACT_NAME || artifact.expired !== false
    || artifact.digest !== `sha256:${expected.artifactDigest}`
    || !positiveInteger(artifact.size_in_bytes, MAX_ARTIFACT_BYTES)) {
    reject('PREPARE_ARTIFACT_BINDING_MISMATCH');
  }
  const workflowRun = artifact.workflow_run;
  if (!record(workflowRun) || workflowRun.id !== run.id
    || workflowRun.head_sha !== expected.sourceCommit || workflowRun.head_branch !== FLOW_BRANCH
    || workflowRun.repository_id !== run.repository.id || workflowRun.head_repository_id !== run.head_repository.id) {
    reject('ARTIFACT_WORKFLOW_RUN_BINDING_MISMATCH');
  }
  return true;
}

/**
 * 仅校验公开回执的身份与摘要绑定，不执行签名数学验证。
 * 消费方仍必须调用官方 verifyCapsule/adoptCapsule，以固定既有根核验原 tar。
 */
export function validateFlowSigningReceipt(receipt, input, manifest, signature) {
  const expected = validateFlowTransferInputs(input);
  if (!record(manifest) || manifest.contractVersion !== 'creatoros-windows-signed-capsule-v1'
    || manifest.status !== 'unsigned-not-distributable' || manifest.rootId !== FLOW_ROOT_ID
    || !record(manifest.buildInput) || manifest.buildInput.sourceCommit !== expected.sourceCommit
    || manifest.buildInput.target !== 'win32-x64' || !validNode(manifest.buildInput.node)
    || !exactKeys(manifest.tar, ['sha256', 'blake3', 'bytes'])
    || !hex(manifest.tar.sha256, 64) || !hex(manifest.tar.blake3, 64)
    || !positiveInteger(manifest.tar.bytes, MAX_TAR_BYTES)) {
    reject('SIGNING_MANIFEST_BINDING_MISMATCH');
  }
  if (!Buffer.isBuffer(signature) || signature.length !== 104) reject('INVALID_PUBLIC_SIGNATURE');
  if (!exactKeys(receipt, RECEIPT_KEYS)
    || receipt.contractVersion !== 'creatoros-windows-sidecar-signature-v1'
    || receipt.sourceCommit !== expected.sourceCommit || receipt.runId !== expected.runId
    || receipt.artifactId !== expected.artifactId || receipt.artifactDigest !== expected.artifactDigest
    || receipt.manifestSHA256 !== expected.manifestSHA256
    || receipt.tarSHA256 !== manifest.tar.sha256 || receipt.tarBLAKE3 !== manifest.tar.blake3
    || receipt.tarBytes !== manifest.tar.bytes || !validNode(receipt.node)
    || !isDeepStrictEqual(receipt.node, manifest.buildInput.node) || receipt.rootId !== FLOW_ROOT_ID
    || receipt.signatureSHA256 !== createHash('sha256').update(signature).digest('hex')) {
    reject('PUBLIC_SIGNING_RECEIPT_BINDING_MISMATCH');
  }
  return true;
}
