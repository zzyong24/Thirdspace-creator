import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  FLOW_ARTIFACT_NAME,
  FLOW_BRANCH,
  FLOW_REPOSITORY,
  FLOW_ROOT_ID,
  FLOW_WORKFLOW_PATH,
  validateFlowArtifactBinding,
  validateFlowSigningReceipt,
  validateFlowTransferInputs,
} from './flow-package-binding.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const input = { runId: '12345', artifactId: '23456', artifactDigest: 'e'.repeat(64), manifestSHA256: 'f'.repeat(64), sourceCommit: 'a'.repeat(40), transportCommit: 'b'.repeat(40) };
  const repository = { id: 76543, full_name: 'zzyong24/Thirdspace-creator' };
  const run = { id: 12345, head_sha: input.sourceCommit, head_branch: FLOW_BRANCH, event: 'workflow_dispatch', path: FLOW_WORKFLOW_PATH, status: 'completed', conclusion: 'success', repository, head_repository: { ...repository } };
  const artifact = { id: 23456, name: FLOW_ARTIFACT_NAME, expired: false, workflow_run: { id: 12345, repository_id: repository.id, head_repository_id: repository.id, head_branch: FLOW_BRANCH, head_sha: input.sourceCommit }, digest: 'sha256:' + input.artifactDigest, size_in_bytes: 12345 };
  const signature = Buffer.alloc(104, 7);
  const manifest = { contractVersion: 'creatoros-windows-signed-capsule-v1', status: 'unsigned-not-distributable', rootId: FLOW_ROOT_ID, buildInput: { sourceCommit: input.sourceCommit, target: 'win32-x64', node: { sha256: 'd'.repeat(64), bytes: 96, target: 'win32-x64' } }, tar: { sha256: '1'.repeat(64), blake3: '2'.repeat(64), bytes: 123 } };
  const receipt = { contractVersion: 'creatoros-windows-sidecar-signature-v1', sourceCommit: input.sourceCommit, runId: input.runId, artifactId: input.artifactId, artifactDigest: input.artifactDigest, manifestSHA256: input.manifestSHA256, tarSHA256: manifest.tar.sha256, tarBLAKE3: manifest.tar.blake3, tarBytes: manifest.tar.bytes, node: { ...manifest.buildInput.node }, rootId: FLOW_ROOT_ID, signatureSHA256: hash(signature) };
  return { input, run, artifact, manifest, signature, receipt };
}

test('固定常量属于本次仓库、分支和准备产物，不能借历史任务', () => {
  assert.equal(FLOW_REPOSITORY, 'zzyong24/Thirdspace-creator');
  assert.equal(FLOW_BRANCH, 'codex/build-main-windows-20261027');
  assert.equal(FLOW_WORKFLOW_PATH, '.github/workflows/desktop-release.yml');
  assert.equal(FLOW_ARTIFACT_NAME, 't1404-unsigned-windows-capsule');
  assert.equal(FLOW_ROOT_ID, 'creatoros-update-root-20260805-01');
});

test('完整准确输入可消费且校验不修改原输入', () => {
  const { input } = fixture();
  const before = structuredClone(input);
  assert.deepEqual(validateFlowTransferInputs(input), before);
  assert.deepEqual(input, before);
});

test('输入拒绝数组、额外字段、shell片段、不精确ID及短SHA', () => {
  for (const value of [null, [], '', { ...fixture().input, unexpected: true }]) assert.throws(() => validateFlowTransferInputs(value));
  for (const [key, value] of [
    ['runId', '0'], ['runId', '012345'], ['runId', 12345], ['artifactId', '1;bad'], ['artifactId', '9007199254740993'],
    ['artifactDigest', ['e'.repeat(64)]], ['artifactDigest', 'E'.repeat(64)], ['manifestSHA256', 'sha256:' + 'f'.repeat(64)],
    ['sourceCommit', 'main'], ['sourceCommit', 'a'.repeat(39)], ['transportCommit', 'b'.repeat(40) + '\n'],
  ]) assert.throws(() => validateFlowTransferInputs({ ...fixture().input, [key]: value }), key);
});

test('准确本仓成功prepare与artifact接受，元数据保持不变', () => {
  const { input, run, artifact } = fixture();
  const before = structuredClone({ input, run, artifact });
  assert.equal(validateFlowArtifactBinding(input, run, artifact), true);
  assert.deepEqual({ input, run, artifact }, before);
});

test('拒绝失败或在途run、不同source/workflow/分支/事件', () => {
  for (const [key, value] of [['id', 999], ['id', '12345'], ['head_sha', 'c'.repeat(40)], ['head_branch', 'main'], ['head_branch', 'codex/build-windows-flow-repair-20261025'], ['head_branch', 'codex/t247-windows-e315-build-20261017'], ['event', 'push'], ['path', '.github/workflows/other.yml'], ['status', 'in_progress'], ['conclusion', 'failure'], ['conclusion', null]]) {
    const { input, run, artifact } = fixture();
    assert.throws(() => validateFlowArtifactBinding(input, { ...run, [key]: value }, artifact), key);
  }
});

test('run仓库与head仓库必须是同一本仓ID，拒绝fork和名称替换', () => {
  for (const [key, value] of [['repository', null], ['repository', { id: 76543, full_name: 'other/repo' }], ['repository', { id: '76543', full_name: FLOW_REPOSITORY }], ['head_repository', { id: 76544, full_name: FLOW_REPOSITORY }], ['head_repository', { id: 76543, full_name: 'fork/Thirdspace-creator' }]]) {
    const { input, run, artifact } = fixture();
    assert.throws(() => validateFlowArtifactBinding(input, { ...run, [key]: value }, artifact), key);
  }
});

test('artifact必须绑定准确ID、名称、摘要、大小及未过期状态', () => {
  for (const [key, value] of [['id', 23457], ['id', '23456'], ['name', 't247-unsigned-windows-capsule'], ['expired', true], ['expired', null], ['digest', 'sha256:' + '0'.repeat(64)], ['digest', fixture().input.artifactDigest], ['size_in_bytes', '12345'], ['size_in_bytes', 0], ['size_in_bytes', -1], ['size_in_bytes', 1.5], ['size_in_bytes', 8 * 1024 ** 3 + 1], ['size_in_bytes', Number.MAX_SAFE_INTEGER + 1]]) {
    const { input, run, artifact } = fixture();
    assert.throws(() => validateFlowArtifactBinding(input, run, { ...artifact, [key]: value }), key);
  }
});

test('artifact.workflow_run的run/source/分支与仓库ID均不可移花接木', () => {
  for (const [key, value] of [['id', 111], ['head_sha', 'c'.repeat(40)], ['head_branch', 'main'], ['repository_id', 76544], ['head_repository_id', 76544], ['repository_id', '76543']]) {
    const { input, run, artifact } = fixture();
    assert.throws(() => validateFlowArtifactBinding(input, run, { ...artifact, workflow_run: { ...artifact.workflow_run, [key]: value } }), key);
  }
  const { input, run, artifact } = fixture();
  assert.throws(() => validateFlowArtifactBinding(input, run, { ...artifact, workflow_run: null }));
});

test('104B公签回执准确绑定同一ZIP、清单、tar、Node和固定root', () => {
  const { input, receipt, manifest, signature } = fixture();
  const before = structuredClone({ input, receipt, manifest });
  assert.equal(validateFlowSigningReceipt(receipt, input, manifest, signature), true);
  assert.deepEqual({ input, receipt, manifest }, before);
});

test('公签回执任一身份、摘要、字节数或root漂移必须拒绝', () => {
  for (const [key, value] of [['contractVersion', 'other'], ['sourceCommit', 'c'.repeat(40)], ['runId', '111'], ['artifactId', '222'], ['artifactDigest', '0'.repeat(64)], ['manifestSHA256', '0'.repeat(64)], ['tarSHA256', '0'.repeat(64)], ['tarBLAKE3', '0'.repeat(64)], ['tarBytes', 124], ['tarBytes', '123'], ['rootId', 'different-root'], ['signatureSHA256', '0'.repeat(64)], ['unexpected', true]]) {
    const { input, receipt, manifest, signature } = fixture();
    assert.throws(() => validateFlowSigningReceipt({ ...receipt, [key]: value }, input, manifest, signature), key);
  }
});

test('公签不能用错误长度、数组、不同字节或非Windows Node蒙混', () => {
  const { input, receipt, manifest, signature } = fixture();
  for (const value of [Buffer.alloc(103), Buffer.alloc(105), Buffer.alloc(104, 8), [...signature], signature.toString('base64'), null]) assert.throws(() => validateFlowSigningReceipt(receipt, input, manifest, value));
  for (const node of [{ ...receipt.node, target: 'darwin-arm64' }, { ...receipt.node, sha256: '0'.repeat(64) }, { ...receipt.node, bytes: 95 }, { ...receipt.node, bytes: '96' }, { ...receipt.node, extra: true }]) assert.throws(() => validateFlowSigningReceipt({ ...receipt, node }, input, manifest, signature));
});

test('清单source/root/协议及自洽但非法tar或Node仍必须拒绝', () => {
  for (const change of [{ rootId: 'other' }, { status: 'signed' }, { contractVersion: 'other' }, { tar: { sha256: '1'.repeat(64), blake3: '2'.repeat(64), bytes: 0 } }]) {
    const { input, receipt, manifest, signature } = fixture();
    assert.throws(() => validateFlowSigningReceipt(receipt, input, { ...manifest, ...change }, signature));
  }
  for (const change of [{ sourceCommit: 'c'.repeat(40) }, { target: 'darwin-arm64' }, { node: { sha256: 'd'.repeat(64), bytes: 0, target: 'win32-x64' } }]) {
    const { input, receipt, manifest, signature } = fixture();
    assert.throws(() => validateFlowSigningReceipt(receipt, input, { ...manifest, buildInput: { ...manifest.buildInput, ...change } }, signature));
  }
});
