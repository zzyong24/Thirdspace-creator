"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PREP_ROOT = path.resolve(__dirname, '../../../runs/final-repair-prep');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function loadBinding() {
  const file = process.env.T1314_FINAL_REPAIR_BINDING;
  if (!file || !path.isAbsolute(file)) throw Error('FINAL_BINDING_REQUIRED_PREPARATION_ONLY');
  const binding = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (binding.mode !== 'EXECUTION' || binding.executionAuthorized !== true || binding.performanceWindowReleased !== true || !binding.finalCandidateBinding)
    throw Error('FINAL_CANDIDATE_NOT_AUTHORIZED');
  const candidate = binding.finalCandidateBinding;
  if (!/^[a-f0-9]{40}$/.test(binding.sourceHead || '') || candidate.sourceHead !== binding.sourceHead || !/^[a-f0-9]{64}$/.test(candidate.packageSha256 || '') || !candidate.sessionId)
    throw Error('FINAL_CANDIDATE_IDENTITY_REQUIRED');
  function receipt(proof, code) {
    if (!proof || !path.isAbsolute(proof.path || '') || !/^[a-f0-9]{64}$/.test(proof.sha256 || '')) throw Error(code);
    const bytes = fs.readFileSync(proof.path); if (sha(bytes) !== proof.sha256) throw Error(code);
    const value = JSON.parse(bytes); if (value.sourceHead !== binding.sourceHead || value.sessionId !== candidate.sessionId || value.confirmed !== true) throw Error(code);
    return value;
  }
  const preflight = receipt(binding.candidatePreflightReceipt, 'FINAL_PREFLIGHT_RECEIPT_REQUIRED');
  receipt(binding.beforeSnapshotReceipt, 'FINAL_BEFORE_SNAPSHOT_RECEIPT_REQUIRED');
  if (preflight.baseURL !== candidate.baseURL || preflight.packageSha256 !== candidate.packageSha256 || preflight.groupId !== binding.ownedScope?.groupId)
    throw Error('FINAL_PREFLIGHT_BINDING_MISMATCH');
  const origin = new URL(binding.runtime.baseURL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.origin !== candidate.baseURL) throw Error('EXACT_OWNED_LOOPBACK_REQUIRED');
  const scope = binding.ownedScope;
  if (!scope?.groupId || !scope.userId || scope.accountId !== null || !scope.projectId || !scope.scriptArtifactId || !scope.articleOutputId || !scope.graphicOutputId) throw Error('EXACT_NEW_OWNED_PURE_GROUP_FIXTURE_REQUIRED');
  if (!Number.isSafeInteger(binding.routing?.revision) || !binding.routing.choices || !binding.expectedRuntimeVersion || !binding.expectedModelId)
    throw Error('FROZEN_CONFIGURATION_REQUIRED');
  if (!Number.isFinite(Date.parse(binding.absoluteObservationDeadlineAt)) || Date.parse(binding.absoluteObservationDeadlineAt) - Date.now() < 120000)
    throw Error('ORIGINAL_ABSOLUTE_OBSERVATION_DEADLINE_REQUIRED');
  const out = path.resolve(binding.outputDirectory || '');
  if (!out.startsWith(PREP_ROOT + path.sep) || fs.existsSync(path.join(out, 'invocation-start.json'))) throw Error('FRESH_OWNED_OUTPUT_REQUIRED_NO_RESUBMISSION');
  if (!path.isAbsolute(binding.runtime.frontendPackageJson || '') || !path.isAbsolute(binding.runtime.handshakePrivateFile || '')) throw Error('EXACT_RUNTIME_AND_PRIVATE_SESSION_REQUIRED');
  const secret = fs.readFileSync(binding.runtime.handshakePrivateFile, 'utf8').trim();
  if (!secret) throw Error('OWNED_HANDSHAKE_REQUIRED');
  return {binding, secret, out};
}
module.exports = {loadBinding, sha};
