// TMP v3 草案：仅新增精确旧chunk删除proof；保留v2 F1-F6全部强门；未经正式准入，本轮未执行。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync, fork } from 'node:child_process';
const REQUIRED = [
  {"label": "original-01", "argv": ["git", "diff", "--check"]},
  {"label": "original-02", "argv": ["pnpm", "-C", "contract", "typecheck"]},
  {"label": "original-03", "argv": ["pnpm", "-C", "frontend", "typecheck"]},
  {"label": "original-04", "argv": ["node", "frontend/scripts/verify-native-editors.mjs"]},
  {"label": "original-05", "argv": ["node", "frontend/scripts/build-noterelay.mjs", "--verify"]},
  {"label": "original-06", "argv": ["pnpm", "-C", "frontend", "test", "src/features/reference-editors/native-editor-surface.test.tsx", "src/features/reference-editors/graphic-design-workbench.test.tsx", "src/features/reference-editors/video-reference-workbench.test.tsx", "src/features/reference-editors/noterelay/noterelay-editor.test.tsx", "src/features/reference-editors/native-source-panel.test.tsx", "src/features/article/doocs-article-editor.test.tsx", "--maxWorkers=1"]},
  {"label": "original-07", "argv": ["pnpm", "-C", "frontend", "test", "src/features/creative-canvas/canvas-editor.test.tsx", "src/features/creative-canvas/canvas-template-library.test.tsx", "src/features/creative-canvas/canvas-home-transfer.test.ts", "src/features/creative-canvas/canvas-material-picker.test.tsx", "src/features/creative-canvas/work-canvas-context.test.tsx", "src/features/creative-canvas/graphic-page-context.test.tsx", "--maxWorkers=1"]},
  {"label": "original-08", "argv": ["pnpm", "-C", "frontend", "test", "src/features/projects/graphic-post-results.test.tsx", "src/features/projects/video-output-workbench.test.tsx", "src/features/projects/moments-model-panel.test.tsx", "src/features/projects/output-conversion-panel.test.tsx", "src/features/projects/output-conversion-lifecycle.test.tsx", "src/features/projects/work-materials-panel.test.tsx", "src/features/projects/work-materials-client.test.ts", "src/features/projects/work-review-panel.test.tsx", "src/features/projects/work-editing-recovery.test.tsx", "src/features/article/article-workbench.test.tsx", "src/features/article/article-workbench-save-race.test.tsx", "src/features/article/article-result-actions.test.tsx", "--maxWorkers=1"]},
  {"label": "original-09", "argv": ["pnpm", "-C", "frontend", "test", "src/features/copilot/copilot-attachment-picker.test.tsx", "--maxWorkers=1"]},
  {"label": "original-10", "argv": ["pnpm", "-C", "frontend", "test", "src/features/production/production-editor-entry.test.tsx", "src/features/production/rough-cut-workbench.test.tsx", "src/features/production/production-transcript-panel.test.tsx", "src/features/production/production-rough-candidate-panel.test.tsx", "src/features/reference-editors/native-rough-view.test.ts", "--maxWorkers=1"]},
  {"label": "original-11", "argv": ["pnpm", "-C", "frontend", "test", "src/lib/creation-workspace-scope.test.ts", "src/features/production/native-gap-audio-player.test.tsx", "src/features/draft-workbench/upload-to-project.test.ts", "--maxWorkers=1"]},
  {"label": "original-12", "argv": ["pnpm", "-C", "frontend", "exec", "playwright", "test", "tests/e2e/t1062-group-native-rough.spec.ts", "tests/e2e/creative-canvas.spec.ts", "tests/e2e/wechat-article-workbench.spec.ts", "--project=e2e"]},
  {"label": "original-13", "argv": ["pnpm", "-C", "frontend", "test", "src/features/projects/project-creation.test.ts", "src/features/projects/graphic-series-panel.test.tsx", "src/features/production/production-conversion-panel.test.tsx", "src/features/production/production-workbench.test.tsx", "src/features/production/video-decision-preview.test.tsx", "src/features/creative-canvas/infinite-canvas-node-reference.test.tsx", "--maxWorkers=1"]},
  {"label": "readonly-original-1", "argv": ["pnpm", "-C", "frontend", "test", "src/features/group-workspace/group-workspace.test.tsx", "--maxWorkers=1"]},
  {"label": "readonly-original-2", "argv": ["pnpm", "-C", "frontend", "test", "src/lib/account-events.test.ts", "--maxWorkers=1"]},
  {"label": "readonly-original-3", "argv": ["pnpm", "-C", "frontend", "test", "src/lib/contract-client-owner.test.ts", "--maxWorkers=1"]},
  {"label": "readonly-original-4", "argv": ["pnpm", "-C", "frontend", "test", "src/lib/http-transport.test.ts", "--maxWorkers=1"]},
  {"label": "LED-047-original", "argv": ["pnpm", "--dir", "frontend", "exec", "vitest", "run", "src/features/copilot/ai-copilot-interactions.test.tsx", "src/features/knowledge/knowledge-dump-zone.test.tsx", "src/features/topics/topics-interactions.test.tsx", "src/components/overlays/overlay-routing.test.tsx", "src/lib/copilot-navigation.test.ts", "src/features/copilot/chat-tool-trace.test.tsx", "src/features/automations/run-controls.test.tsx", "src/features/automations/cadence.test.ts", "--retry=0"]}
];
const self = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(self), '../..');
const formalScript = path.join(root, 'orchestrator/verification/t1062-frontend-native-adaptation.mjs');
const scopePath = path.join(root, 'docs/verification/t1062/frontend-native-adaptation-scope.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const reject = message => { throw new Error(message); };
if (self !== formalScript || !fs.existsSync(scopePath)) reject('缺正式位置或正式 scope；TMP 草案拒绝运行。');
const scopeBytes = fs.readFileSync(scopePath), scope = JSON.parse(scopeBytes);
if (scope.task !== 'T-1062' || scope.step !== 'integration' || scope.review_status !== 'approved' ||
    !/^[0-9a-f]{40}$/.test(scope.backend_final_commit ?? '') || scope.isolation_policy !== 'fresh-local-no-paid-model') reject('缺完整正式复核、后端提交或隔离绑定。');
const declared = scope.executable_verify_combinations;
if (!Array.isArray(declared) || declared.length !== 18 || REQUIRED.length !== 18 || declared.some((item, index) => item.label !== REQUIRED[index].label || JSON.stringify(item.argv) !== JSON.stringify(REQUIRED[index].argv))) reject('18 组 argv、顺序或覆盖不等于冻结组合。');
const git = argv => execFileSync('git', argv, { cwd: root, encoding: 'utf8' }).trim();
const head = git(['rev-parse', 'HEAD']);
if (spawnSync('git', ['merge-base', '--is-ancestor', scope.backend_final_commit, head], { cwd: root }).status !== 0) reject('正式后端提交不是当前源码祖先。');
const inRoot = relative => {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split('/').some(x => !x || x === '..') || /[\0\r\n*?]/.test(relative)) reject('非法精确仓内路径。');
  const target = path.resolve(root, relative), real = fs.realpathSync(target);
  if (!real.startsWith(fs.realpathSync(root) + path.sep) || !fs.statSync(real).isFile()) reject('源码路径越界或非文件。');
  return target;
};
// 仅本次正式 scope 精确列出的旧 Doocs hashed chunk 可作为 absence 输入；其它缺文件仍拒绝。
const deletionProof = scope.generated_output_deletion_proof;
const deletionRows = deletionProof?.entries ?? [];
const deleted = new Map();
const strictRelative = relative => {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split('/').some(x => !x || x === '..') || /[\0\r\n*?]/.test(relative)) reject('非法精确删除路径。');
  return relative;
};
const exactAbsent = relative => {
  strictRelative(relative);
  const target = path.resolve(root, relative), parent = fs.realpathSync(path.dirname(target));
  if (!parent.startsWith(fs.realpathSync(root) + path.sep)) reject('删除路径父目录越界。');
  try { fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  reject(`精确旧产物未删除: ${relative}`);
};
const frozenTmp = item => {
  if (!item || !path.isAbsolute(item.absolute_path ?? '') || !/^[0-9a-f]{64}$/.test(item.sha256 ?? '')) reject('缺精确 TMP 删除证据绑定。');
  const baseRoots = [...new Set([os.tmpdir(), '/tmp'].filter(p => fs.existsSync(p)).map(p => fs.realpathSync(p)))];
  const real = fs.realpathSync(item.absolute_path);
  if (!baseRoots.some(base => real.startsWith(base + path.sep)) || !fs.statSync(real).isFile()) reject('删除证据不属于真实 TMP 文件。');
  const bytes = fs.readFileSync(real);
  if (sha(bytes) !== item.sha256) reject('删除证据 SHA 漂移。');
  return { path:real, sha256:item.sha256, bytes };
};
let deletionInputs = [], deletionApplication = null;
if (!Array.isArray(deletionRows)) reject('精确删除 entries 类型错误。');
if (deletionRows.length) {
  if (deletionRows.length !== 12 || deletionProof.expected_count !== 12 || deletionProof.review_status !== 'approved' || !/^[0-9a-f]{40}$/.test(deletionProof.base_commit ?? '')) reject('缺本次精确12项删除准入。');
  if (spawnSync('git', ['merge-base', '--is-ancestor', deletionProof.base_commit, head], {cwd:root}).status !== 0) reject('删除原字节基线不是当前祖先。');
  for (const item of deletionRows) {
    const relative = strictRelative(item.relative_path);
    if (!/^frontend\/public\/reference-editors\/doocs-md\/native\/chunks\/[A-Za-z0-9_.-]+\.js$/.test(relative) || !/^[0-9a-f]{64}$/.test(item.base_sha256 ?? '') || deleted.has(relative) || !scope.write_set.includes(relative) || !scope.source_snapshot_paths.includes(relative)) reject('删除项越出本次旧hashed chunks/授权写集/完整快照。');
    const original = execFileSync('git', ['show', `${deletionProof.base_commit}:${relative}`], {cwd:root});
    if (sha(original) !== item.base_sha256) reject('旧产物 Git 原字节不等于删除基线 SHA。');
    deleted.set(relative,item); exactAbsent(relative);
  }
  const evidence = deletionProof.application_evidence;
  if (evidence?.relative_path !== 'docs/verification/t1062/frontend-native-transfer.json' || !/^[0-9a-f]{64}$/.test(evidence.sha256 ?? '')) reject('缺正式 transfer 实际应用证据。');
  const evidencePath = inRoot(evidence.relative_path), evidenceBytes = fs.readFileSync(evidencePath);
  if (sha(evidenceBytes) !== evidence.sha256) reject('实际应用 transfer SHA 漂移。');
  const transfer = JSON.parse(evidenceBytes), applied = transfer.generated_output_actual_application;
  if (applied?.kind !== 'actual_root_applied_exact_generated_deletions' || applied.base_commit !== deletionProof.base_commit || !/^[0-9a-f]{40}$/.test(applied.applied_head ?? '') || !Number.isFinite(Date.parse(applied.applied_at_utc ?? '')) || !Array.isArray(applied.deletions) || applied.deletions.length !== 12) reject('transfer 尚无实际12项应用证据，不能准备假PASS。');
  if (spawnSync('git', ['merge-base', '--is-ancestor', applied.applied_head, head], {cwd:root}).status !== 0) reject('应用观察 HEAD 不是当前祖先。');
  const rows = new Map();
  for (const row of applied.deletions) {
    const item = deleted.get(row.relative_path);
    if (!item || rows.has(row.relative_path) || row.base_sha256 !== item.base_sha256 || row.before_sha256 !== item.base_sha256 || row.before_type !== 'regular_file' || row.actual_delete !== true || row.after_exists !== false) reject('实际删除记录不等于冻结原字节/真实删除。');
    rows.set(row.relative_path,row);
  }
  if (!Array.isArray(scope.generated_delivery_expected_paths) || new Set(scope.generated_delivery_expected_paths).size !== scope.generated_delivery_expected_paths.length || !scope.generated_delivery_expected_paths.length || !Array.isArray(applied.outputs) || applied.outputs.length !== scope.generated_delivery_expected_paths.length) reject('缺实际当前全部产物精确路径/SHA。');
  const outputRows = new Map();
  for (const row of applied.outputs) {
    strictRelative(row.relative_path);
    if (!scope.generated_delivery_expected_paths.includes(row.relative_path) || !scope.write_set.includes(row.relative_path) || !scope.source_snapshot_paths.includes(row.relative_path) || deleted.has(row.relative_path) || outputRows.has(row.relative_path) || !row.relative_path.startsWith('frontend/public/reference-editors/') || !/^[0-9a-f]{64}$/.test(row.sha256 ?? '') || sha(fs.readFileSync(inRoot(row.relative_path))) !== row.sha256) reject('当前产物未完整绑定实际输出字节。');
    outputRows.set(row.relative_path,row);
  }
  const graph = frozenTmp(deletionProof.import_graph), outputManifest = frozenTmp(deletionProof.actual_output_manifest);
  if (applied.import_graph_sha256 !== graph.sha256 || applied.actual_output_manifest_sha256 !== outputManifest.sha256) reject('实际应用与真实build/import图证据不配套。');
  const buildManifest = JSON.parse(outputManifest.bytes), graphManifest = JSON.parse(graph.bytes);
  if (!buildManifest.editors || !Array.isArray(graphManifest) || graphManifest.length !== 4) reject('真实四编辑器build/import图证据形状错误。');
  const builtRows = new Map();
  for (const editor of ['kuaitu','doocs-md','opencut-classic','noterelay']) {
    const built = buildManifest.editors[editor], observedGraph = graphManifest.find(item => item.editor === editor);
    if (!built || !built.new || !built.old || !observedGraph || observedGraph.outputRoot !== built.outputRoot || !Array.isArray(observedGraph.deletedNamedReferences) || observedGraph.deletedNamedReferences.length !== 0) reject('真实build与import图归属/旧名引用不一致。');
    for (const row of Object.values(built.new)) {
      if (builtRows.has(row.path) || !outputRows.has(row.path) || outputRows.get(row.path).sha256 !== row.sha256) reject('实际apply output未采用build原字节。');
      builtRows.set(row.path,row.sha256);
    }
    for (const name of built.nonBuildDeliveryMetadataRetainedPendingRefresh ?? []) {
      const oldRow = built.old[name];
      if (!oldRow || !outputRows.has(oldRow.path) || outputRows.get(oldRow.path).sha256 !== oldRow.sha256 || builtRows.has(oldRow.path)) reject('保留delivery metadata未守旧字节。');
      builtRows.set(oldRow.path,oldRow.sha256);
    }
  }
  if (builtRows.size !== outputRows.size) reject('实际apply产物清单与真实build/保留metadata不完整相等。');
  const doocs = buildManifest.editors['doocs-md'];
  const buildDeleted = (doocs.deletionCandidates ?? []).map(name => doocs.old[name]?.path);
  if (buildDeleted.length !== deleted.size || buildDeleted.some(relative => !deleted.has(relative))) reject('scope删除项不等于真实Doocs output delta。');

  deletionInputs = [{path:evidencePath,sha256:evidence.sha256},{path:graph.path,sha256:graph.sha256},{path:outputManifest.path,sha256:outputManifest.sha256}];
  deletionApplication = {kind:applied.kind,appliedHead:applied.applied_head,appliedAtUtc:applied.applied_at_utc,baseCommit:applied.base_commit,entries:deletionRows,outputs:applied.outputs,graphLimitation:'零basename引用是已枚举当前JS/CSS的实际字节断言，不冒称任意用户动态URL全覆盖。'};
}
const verifyDeletedOutputs = () => {
  for (const relative of deleted.keys()) exactAbsent(relative);
  if (!deletionApplication) return;
  for (const row of deletionApplication.outputs) {
    const bytes = fs.readFileSync(inRoot(row.relative_path));
    if (sha(bytes) !== row.sha256) reject('当前生成产物在验收前后漂移。');
    if (/\.(?:js|css)$/.test(row.relative_path)) for (const relative of deleted.keys()) if (bytes.includes(Buffer.from(path.basename(relative)))) reject(`删除旧chunk仍被当前JS/CSS引用: ${relative}`);
  }
  for (const item of deletionInputs) if (sha(fs.readFileSync(item.path)) !== item.sha256) reject('删除应用/真实build/import图输入漂移。');
};
const snapshot = () => {
  verifyDeletedOutputs();
  return scope.source_snapshot_paths.map(relative => deleted.has(relative) ? {relative,type:'approved_generated_deletion_absent',base_sha256:deleted.get(relative).base_sha256} : {relative,sha256:sha(fs.readFileSync(inRoot(relative)))});
};
if (!Array.isArray(scope.source_snapshot_paths) || !scope.source_snapshot_paths.length || new Set(scope.source_snapshot_paths).size !== scope.source_snapshot_paths.length) reject('缺精确源码快照输入。');
const needed = ['frontend/playwright.config.ts', 'frontend/package.json', 'contract/package.json', 'pnpm-lock.yaml', 'frontend/scripts/verify-native-editors.mjs', 'frontend/scripts/build-noterelay.mjs'];
for (const key of ['write_set', 'conditional_paths', 'read_only_paths', 'backend_contract_refs']) {
  if (!Array.isArray(scope[key]) || !scope[key].length || scope[key].some(p => typeof p !== 'string')) reject(`缺 scope.${key} 精确 source 消费列表。`);
  needed.push(...scope[key]);
}
needed.push(...REQUIRED.flatMap(item => item.argv.filter(arg => /^(?:src|tests)\//.test(arg)).map(arg => `frontend/${arg}`)));
if (needed.some(p => !scope.source_snapshot_paths.includes(p))) reject('源码快照未覆盖正式写集、只读合同、原测试与真实构建配置。');
const MANDATORY_READERS = ["frontend/next.config.ts", "frontend/vitest.config.ts", "frontend/src/test/setup.ts", "frontend/src/test/empty-module.ts", "frontend/tests/helpers/test-environment.ts", "frontend/tests/helpers/network-policy.ts", "frontend/tests/visual/visual-lifecycle.ts", "frontend/tests/visual/__setup__.ts", "frontend/tests/visual/__teardown__.ts", "frontend/src/server/persistence-client.ts", "backend/src/db.ts", "backend/src/modules/identity/identity.db-schema.ts", "backend/src/modules/settings/settings.service.ts", "backend/src/modules/assets/media-root.ts", "backend/src/modules/assets/s3-object-storage.ts", "ai-worker/scripts/build.mjs", "ai-worker/package.json", "contract/tsconfig.json", "package.json", "pnpm-workspace.yaml", "backend/src/index.ts", "backend/src/modules/identity/index.ts", "backend/src/modules/identity/identity.service.ts", "backend/src/modules/identity/identity.repository.ts", "backend/src/modules/identity/identity.crypto.ts", "backend/src/modules/settings/index.ts", "backend/src/modules/settings/settings.repository.ts", "backend/src/modules/settings/settings.db-schema.ts", "backend/src/schema/identity.ts", "backend/src/schema/settings.ts", "ai-worker/scripts/pi-runtime-bundle.mjs", "backend/package.json", "frontend/tsconfig.json", "ai-worker/src/execution/worker-entry.ts", "ai-worker/src/execution/agentic-worker-entry.ts", "ai-worker/src/runtime/browser/index.ts", "ai-worker/src/execution/intelligence-generation-worker-entry.ts", "ai-worker/src/execution/intelligence-transcript-worker-entry.ts", "ai-worker/src/io/embedding-worker-entry.ts", "ai-worker/src/execution/flywheel-generation-worker-entry.ts", "ai-worker/src/io/model-probe-worker-entry.ts", "ai-worker/src/execution/codex-status-entry.ts", "ai-worker/vendor/codex-acp/src/index.ts", "backend/drizzle/meta/_journal.json", "backend/drizzle/0000_init.sql", "backend/drizzle/0001_model_secret_value.sql", "backend/drizzle/0002_storage_configs.sql", "backend/drizzle/0003_positioning_facets_rules.sql", "backend/drizzle/0004_candidate_card.sql", "backend/drizzle/0005_project_brief_detail.sql", "backend/drizzle/0006_calibration_rule_suggestions.sql", "backend/drizzle/0007_ai_task_steps.sql", "backend/drizzle/0008_project_source_platformref.sql", "backend/drizzle/0009_scheduled_job_and_run.sql", "backend/drizzle/0010_artifacts_origin.sql", "backend/drizzle/0011_audience_signals_publication.sql", "backend/drizzle/0012_douyin_throttle_state.sql", "backend/drizzle/0013_skill_config_overrides.sql", "backend/drizzle/0014_audience_signals_like_count.sql", "backend/drizzle/0015_retire_thesis_contract.sql", "backend/drizzle/0016_audience_signals_external_id.sql", "backend/drizzle/0017_publication_hidden_at.sql", "backend/drizzle/0018_knowledge_source_note.sql", "backend/drizzle/0019_ai_conversation_scope.sql", "backend/drizzle/0020_review_gate.sql", "backend/drizzle/0021_learnings_project_id.sql", "backend/drizzle/0022_ai_messages_parts.sql", "backend/drizzle/0023_material_link_priority.sql", "backend/drizzle/0024_asset_file_extraction.sql", "backend/drizzle/0025_multi_account_ownership.sql", "backend/drizzle/0026_job_run_progress.sql", "backend/drizzle/0027_activation_state.sql", "backend/drizzle/0028_skill_config_override_versions.sql", "backend/drizzle/0029_publication_platform_status.sql", "backend/drizzle/0030_scheduled_job_account.sql", "backend/drizzle/0031_platform_account_external_id.sql", "backend/drizzle/0032_benchmark_sources_works.sql", "backend/drizzle/0033_topic_preferences.sql", "backend/drizzle/0034_positioning_statement_change_reason.sql", "backend/drizzle/0035_trend_sources_darkhorse.sql", "backend/drizzle/0036_topic_attributions.sql", "backend/drizzle/0037_ai_messages_usage.sql", "backend/drizzle/0038_favorites_folders.sql", "backend/drizzle/0039_favorites_distill.sql", "backend/drizzle/0040_backfill_imported_publication_revision.sql", "backend/drizzle/0041_account_scoped_unique_identity.sql", "backend/drizzle/0042_account_isolation_notnull.sql", "backend/drizzle/0043_notifications_account_stamp.sql", "backend/drizzle/0044_benchmark_works_transcript.sql", "backend/drizzle/0045_learnings_evidence_strength.sql", "backend/drizzle/0046_scheduled_job_unique_source.sql", "backend/drizzle/0047_browser_sessions.sql", "backend/drizzle/0048_browser_sessions_drop_migrated.sql", "backend/drizzle/0049_activation_security_mirror.sql", "backend/drizzle/0050_content_intelligence.sql", "backend/drizzle/0051_content_intelligence_project_provenance.sql", "backend/drizzle/0052_intelligence_source_memberships.sql", "backend/drizzle/0053_account_skill_overlays.sql", "backend/drizzle/0054_ai_task_execution_ownership.sql", "backend/drizzle/0055_automation_task_active_owner.sql", "backend/drizzle/0056_asset_upload_atomic_identity.sql", "backend/drizzle/0057_knowledge_file_workspace.sql", "backend/drizzle/0058_source_sync_active_owner.sql", "backend/drizzle/0059_unify_content_radar_automation.sql", "backend/drizzle/0060_retire_self_detail_automation.sql", "backend/drizzle/0061_project_schedule_calendar.sql", "backend/drizzle/0062_normalize_scheduling_timestamps.sql", "backend/drizzle/0063_learning_adoption_dedupe.sql", "backend/drizzle/0064_positioning_master_version_floor.sql", "backend/drizzle/0065_positioning_master_snapshot.sql", "backend/drizzle/0066_positioning_discovery_sessions.sql", "backend/drizzle/0067_channel_model_credentials.sql", "backend/drizzle/0068_cli_invocations.sql", "backend/drizzle/0069_execution_authority_mapping.sql", "backend/drizzle/0070_execution_fence.sql", "backend/drizzle/0071_execution_call_ledger.sql", "backend/drizzle/0072_execution_call_result.sql", "backend/drizzle/0073_execution_retry_schedule.sql", "backend/drizzle/0074_execution_candidate_receipt.sql", "backend/drizzle/0075_execution_provider_receipt.sql", "backend/drizzle/0076_publication_draft_adoption.sql", "backend/drizzle/0077_artifact_version_adoption.sql", "backend/drizzle/0078_proposal_adoption_receipts.sql", "backend/drizzle/0079_agentic_tool_execution_claim.sql", "backend/drizzle/0080_execution_evidence.sql", "backend/drizzle/0081_execution_browser_profile_leases.sql", "backend/drizzle/0082_scheduled_child_active_owner.sql", "backend/drizzle/0083_execution_stream_events.sql", "backend/drizzle/0084_execution_call_parent.sql", "backend/drizzle/0085_pending_document_commits.sql", "backend/drizzle/0086_execution_evidence_metadata.sql", "backend/drizzle/0087_execution_provider_job.sql", "backend/drizzle/0088_pending_generated_asset_commits.sql", "backend/drizzle/0089_project_transcription_requests.sql", "backend/drizzle/0090_execution_call_accounting_basis.sql", "backend/drizzle/0091_browser_profile_host_owner.sql", "backend/drizzle/0092_page_read_revision.sql", "backend/drizzle/0093_positioning_current_statement.sql", "backend/drizzle/0094_publication_traffic.sql", "backend/drizzle/0095_redfox_credentials.sql", "backend/drizzle/0096_publication_sync_state.sql", "backend/drizzle/0097_onboarding_state.sql", "backend/drizzle/0098_separate_collection_jobs.sql", "backend/drizzle/0099_stagger_collection_jobs.sql", "backend/drizzle/0100_traffic_unavailable.sql", "backend/drizzle/0128_workspace_convergence.sql"];
needed.push(...MANDATORY_READERS);
const journal = JSON.parse(fs.readFileSync(inRoot('backend/drizzle/meta/_journal.json')));
needed.push(...journal.entries.map(entry => { if (typeof entry.tag !== 'string' || !/^[A-Za-z0-9_-]+$/.test(entry.tag)) reject('非法迁移 tag。'); return `backend/drizzle/${entry.tag}.sql`; }));
if (needed.some(p => !scope.source_snapshot_paths.includes(p))) reject('源码快照未覆盖实际 owner/bootstrap/predev/config/迁移读取输入。');
const before = snapshot();
// @next/env 实际消费 test 与 webServer development 的 exact 名称；模板不自动加载。
const autoEnvNames = ['.env', '.env.test', '.env.test.local', '.env.local', '.env.development', '.env.development.local'];
for (const directory of [root, path.join(root, 'frontend')]) for (const name of autoEnvNames) if (fs.existsSync(path.join(directory, name))) reject(`测试根存在自动加载 env: ${path.join(directory, name)}；不读取内容。`);

const input = scope.external_verification_environment_inputs?.noterelay;
const tmpRoots = [...new Set([os.tmpdir(), '/tmp'].filter(p => fs.existsSync(p)).map(p => fs.realpathSync(p)))];
const checkInput = (item, external) => {
  if (!item || !/^[0-9a-f]{64}$/.test(item.sha256 ?? '')) reject('缺冻结输入 SHA。');
  const filename = external ? item.absolute_path : inRoot(item.relative_path);
  if (external && (!path.isAbsolute(filename ?? '') || !tmpRoots.some(base => fs.realpathSync(filename).startsWith(base + path.sep)) || !fs.statSync(fs.realpathSync(filename)).isFile())) reject('外部冻结输入必须是精确 TMP 文件。');
  const bytes = fs.readFileSync(filename);
  if (sha(bytes) !== item.sha256) reject('冻结输入漂移，必须重采复核。');
  return { filename, bytes, sha256: item.sha256 };
};
const lock = checkInput(input?.lock, true), pkg = checkInput(input?.package, true), archive = checkInput(input?.source_archive, false);
if (input.source_archive.relative_path !== 'frontend/public/reference-editors/sources/noterelay/source.zip') reject('NoteRelay 归档输入不匹配。');
const archivedPackage = execFileSync('unzip', ['-p', archive.filename, 'web/package.json']);
if (sha(archivedPackage) !== pkg.sha256) reject('NoteRelay 配套 manifest 不等于 source.zip web/package.json。');
const lockJson = JSON.parse(lock.bytes), packageJson = JSON.parse(pkg.bytes);
const normalized = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
if (lockJson.lockfileVersion !== 3 || normalized(lockJson.packages?.['']?.dependencies) !== normalized(packageJson.dependencies) || normalized(lockJson.packages?.['']?.devDependencies) !== normalized(packageJson.devDependencies)) reject('NoteRelay lock 与依赖声明不一致。');
// 真实输入初始化：原predev顺序前移，实际缓存复制/同wrapper零任务ready，不是第19验收。
const NETWORK_READERS=['frontend/src/server/execution-worker-path.ts','backend/src/modules/execution/worker-supervisor.ts','backend/src/modules/execution/child-env.ts','ai-worker/src/execution/worker-runtime.ts'];
if(NETWORK_READERS.some(p=>!scope.source_snapshot_paths.includes(p))) reject('源码快照缺actual worker resolver/supervisor/child-env/runtime读取输入。');
const localInput=scope.external_verification_environment_inputs?.local_asr;
if(localInput?.review_status!=='approved') reject('缺当前evalWorker seam独立复核，不能拿旧父进程方案入场。');
const seamProposal=checkInput(localInput.proposal,true),seamWrapper=checkInput(localInput.wrapper,true),seamGate=checkInput(localInput.gate,true),cacheManifest=checkInput(localInput.cache_manifest,true),seamReview=checkInput(localInput.independent_review,true);
const seamDeclaration=JSON.parse(seamProposal.bytes);
if(seamDeclaration.schema!=='t1062-e2e-worker-network-seam/v2'||seamDeclaration.entry.sha256!==seamWrapper.sha256||seamDeclaration.gate.sha256!==seamGate.sha256) reject('网络seam/wrapper/gate不是精确同一evalWorker版本。');
const cacheDeclaration=JSON.parse(cacheManifest.bytes);
if(!Array.isArray(localInput.model_files)||localInput.model_files.length!==7||cacheDeclaration.modelFiles?.length!==7||new Set(localInput.model_files.map(x=>x.cache_relative_path)).size!==7) reject('缺七个精确Whisper缓存输入。');
const originalCacheRoot=fs.realpathSync(cacheDeclaration.cacheRoot),cacheSourceRows=[];
for(const item of localInput.model_files){
 if(!path.isAbsolute(item.absolute_path??'')||typeof item.cache_relative_path!=='string'||path.isAbsolute(item.cache_relative_path)||item.cache_relative_path.split('/').some(x=>!x||x==='..')||!item.cache_relative_path.startsWith('Xenova/whisper-small/')||!Number.isInteger(item.bytes)||!isFinite(item.bytes)||item.bytes<=0||!/^[0-9a-f]{64}$/.test(item.sha256??'')) reject('缓存输入路径/bytes/SHA错误。');
 const real=fs.realpathSync(item.absolute_path),entry=cacheDeclaration.modelFiles.find(x=>x.path===item.absolute_path);
 if(!tmpRoots.some(p=>real.startsWith(p+path.sep))||!real.startsWith(originalCacheRoot+path.sep)||path.relative(originalCacheRoot,real)!==item.cache_relative_path||!entry||entry.sha256!==item.sha256||entry.bytes!==item.bytes||!fs.statSync(real).isFile()||fs.statSync(real).size!==item.bytes||sha(fs.readFileSync(real))!==item.sha256) reject('七个cache文件不等已冻结R6真实输入。');
 cacheSourceRows.push({...item,real});
}
const extraInputRows=[seamProposal,seamWrapper,seamGate,cacheManifest,seamReview].map(x=>({path:x.filename,sha256:x.sha256}));

const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'creatoros-t1062-frontend-native-verify-'));
// 新E2E公开隔离根强检查：仅本次isolated的子根，真实mkdtemp前缀保持一致。
const playwrightDataRoot = fs.mkdtempSync(path.join(isolated, 'creatoros-playwright-'));
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(?:CREATOROS_|S3_|PG|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AWS_|AZURE_|DOUBAO_|ARK_|DEEPSEEK_|QWEN_|WHISPER_|XDG_)/i.test(key) || /(?:TOKEN|PASSWORD|SECRET|API_KEY|CREDENTIAL|PROVIDER|DATABASE|PGLITE|PROXY|NODE_OPTIONS|NODE_PATH)/i.test(key)) delete env[key];
// HOME/CODEX_HOME 不改；隔离依靠实际数据端口与目录，不伪装用户目录。
Object.assign(env, { NODE_ENV: 'test', CREATOROS_STORAGE: 'mock', DATABASE_URL: '',
  CREATOROS_DB_DIR: path.join(isolated, 'db'), PGLITE_DATA_DIR: path.join(isolated, 'pglite'),
  CREATOROS_MEDIA_ROOT: path.join(isolated, 'media'), CREATOROS_WORKSPACES_ROOT: path.join(isolated, 'workspaces'),
  CREATOROS_WHISPER_CACHE_DIR: path.join(isolated, 'models'), CREATOROS_DOUYIN_AUTH_DIR: path.join(isolated, 'auth/douyin'),
  CREATOROS_WEB_AUTH_DIR: path.join(isolated, 'auth/web'), CREATOROS_MASTER_KEY: crypto.randomBytes(32).toString('base64'),
  CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1',
  CREATOROS_PLAYWRIGHT_DATA_ROOT: playwrightDataRoot, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' });
for (const key of ['CREATOROS_DB_DIR','PGLITE_DATA_DIR','CREATOROS_MEDIA_ROOT','CREATOROS_WORKSPACES_ROOT','CREATOROS_WHISPER_CACHE_DIR','CREATOROS_DOUYIN_AUTH_DIR','CREATOROS_WEB_AUTH_DIR','CREATOROS_PLAYWRIGHT_DATA_ROOT']) fs.mkdirSync(env[key], { recursive: true });
const port = await new Promise((resolve, rejectPort) => {
  const server = net.createServer(); server.once('error', rejectPort);
  server.listen(0, '127.0.0.1', () => { const selected = server.address().port; server.close(error => error ? rejectPort(error) : resolve(selected)); });
});
env.CREATOROS_TEST_PORT = String(port);
const freshDataPath = path.join(env.CREATOROS_PLAYWRIGHT_DATA_ROOT, 'pglite');
fs.mkdirSync(freshDataPath);
const browserMediaPath = path.join(env.CREATOROS_PLAYWRIGHT_DATA_ROOT, 'media');
fs.mkdirSync(browserMediaPath);
const browserEnv = {...env, PGLITE_DATA_DIR:freshDataPath, CREATOROS_DB_DIR:freshDataPath, CREATOROS_MEDIA_ROOT:browserMediaPath};
const tsxCli = inRoot('frontend/node_modules/tsx/dist/cli.mjs');
const bootstrapPath = path.join(isolated, 'fresh-storage-owner-bootstrap.mts');
const bootstrapReceiptPath = path.join(isolated, 'fresh-storage-owner-bootstrap-result.json');
const playwrightConfig = path.join(isolated, 'playwright.config.ts');
fs.writeFileSync(playwrightConfig, `import base from ${JSON.stringify(path.join(root, 'frontend/playwright.config.ts'))};
if(base.webServer?.env?.PGLITE_DATA_DIR!==${JSON.stringify(freshDataPath)} || process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT!==${JSON.stringify(env.CREATOROS_PLAYWRIGHT_DATA_ROOT)}) throw Error('fresh PGlite 与实际 base config 不一致');
export default {...base,testDir:${JSON.stringify(path.join(root,'frontend/tests'))},outputDir:${JSON.stringify(path.join(isolated,'playwright-results'))},reporter:[['list'],['html',{open:'never',outputFolder:${JSON.stringify(path.join(isolated,'playwright-report'))}}]],webServer:{...base.webServer,cwd:${JSON.stringify(path.join(root,'frontend'))},reuseExistingServer:false,env:{...base.webServer.env,NODE_ENV:'development',PGLITE_DATA_DIR:${JSON.stringify(freshDataPath)}}}};
`);
fs.writeFileSync(bootstrapPath, `import fs from 'node:fs'; import path from 'node:path'; import {randomUUID} from 'node:crypto';
import {createDb} from ${JSON.stringify(path.join(root,'backend/src/index.ts'))};
import {createIdentityRepository,ensureLocalUser} from ${JSON.stringify(path.join(root,'backend/src/modules/identity/index.ts'))};
import {createSettingsRepository} from ${JSON.stringify(path.join(root,'backend/src/modules/settings/index.ts'))};
const isolated=${JSON.stringify(isolated)}, freshDataPath=${JSON.stringify(freshDataPath)}, tempMedia=${JSON.stringify(browserMediaPath)};
if(!fs.realpathSync(freshDataPath).startsWith(fs.realpathSync(isolated)+path.sep) || process.env.PGLITE_DATA_DIR!==freshDataPath || fs.readdirSync(freshDataPath).length!==0 || fs.readdirSync(tempMedia).length!==0) throw Error('bootstrap 仅准许本次 mkdtemp 中空 PGlite 与空媒体根');
const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>prefix+'-'+randomUUID()};
const opened=await createDb({dataDir:freshDataPath}); let receipt;
try { const user=await ensureLocalUser(createIdentityRepository(opened.db,deps),deps); const settings=createSettingsRepository(opened.db,deps);
const ctx={userId:user.id,accountId:null,requestId:'t1062-isolated-storage-bootstrap',source:'user' as const};
if(await settings.getStorageConfig(ctx)!==null) throw Error('fresh owner 原 storage row 非空');
await settings.putStorageConfig(ctx,{backend:'local',rootPath:tempMedia}); const stored=await settings.getStorageConfig(ctx);
if(stored?.userId!==user.id || stored.backend!=='local' || stored.rootPath!==tempMedia) throw Error('真实 owner storage 读回不匹配');
receipt={kind:'input_initialization_not_acceptance',fixtureUserId:user.id,freshDataPath,mediaRoot:tempMedia,backend:stored.backend,readback:'matched',close:'pending'};
} finally {await opened.client.close();}
fs.writeFileSync(${JSON.stringify(bootstrapReceiptPath)},JSON.stringify({...receipt,close:'completed',finishedAt:new Date().toISOString()},null,2)+'\\n');
`);
const derivedSnapshot = () => {
  const entries=[];
  const walk = relative => { const target=path.join(root,relative); if(!fs.existsSync(target)) return; const stat=fs.lstatSync(target); if(stat.isSymbolicLink()) {entries.push({relative,type:'symlink',target:fs.readlinkSync(target)});return;} if(stat.isDirectory()) for(const name of fs.readdirSync(target).sort()) walk(relative+'/'+name); else if(stat.isFile()) entries.push({relative,sha256:sha(fs.readFileSync(target)),bytes:stat.size}); };
  for(const relative of ['frontend/.next','frontend/tsconfig.tsbuildinfo','contract/tsconfig.tsbuildinfo','ai-worker/dist']) walk(relative);
  return entries;
};

const snapshotPath = path.join(isolated, 'source-snapshot-before.json');
fs.writeFileSync(snapshotPath, JSON.stringify(before, null, 2) + '\n');
const reportPath = path.join(isolated, 'verification-result.json');
const report = { task: 'T-1062', step: 'integration', actualRoot: root, headBefore: head, scopePath, scopeSha256: sha(scopeBytes), runnerSha256: sha(fs.readFileSync(self)),
  startedAt: new Date().toISOString(), isolated, port, freshDataPath, browserMediaPath, playwrightConfigPath:playwrightConfig, playwrightConfigSha256:sha(fs.readFileSync(playwrightConfig)), bootstrapSourcePath:bootstrapPath, bootstrapSourceSha256:sha(fs.readFileSync(bootstrapPath)), inputInitialization:[], derivedArtifactsBefore:derivedSnapshot(), environmentVariableNames: Object.keys(env).sort(), status: 'running', commands: [],
  sourceBefore: before, generatedDeletionProof:deletionApplication, generatedDeletionInputs:deletionInputs, sourceSnapshotPath: snapshotPath, sourceSnapshotSha256: sha(fs.readFileSync(snapshotPath)), externalInputs: [lock,pkg,archive].map(x => ({ path:x.filename, sha256:x.sha256, validation:'checked_not_built' })),
  nativeGate: {status:'NOT_EXECUTED_BY_THIS_RUNNER',required:['kuaitu','doocs-md','opencut-classic','noterelay'],currentBuildAndDependencyAndExactOutputProof:null},
  taskApproved:false, limits:['18 组通过仅代表此验证集合，不等于四原生当次独立构建、模型效果、安装版或整任务验收。','不执行 npm/host native 非verify build，不加归档 member，不拷新 chunk。','环境清洗不等于 OS 禁网；已审测试必须走隔离 fixture、本地端口，不触真实模型或付费服务。'] };
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save(); console.log(`T-1062 evidence: ${reportPath}`);
const workerPath=path.join(root,'ai-worker/dist/execution-worker.cjs'),seamManifestPath=path.join(root,'ai-worker/dist/t1062-network-seam.json');
let seamState=null;
const checkedPackage=()=>{const pkg=JSON.parse(fs.readFileSync(inRoot('frontend/package.json')));if(pkg.scripts?.predev!=='node ../ai-worker/scripts/build.mjs'||pkg.scripts?.dev!=='next dev'||pkg.scripts?.prepredev)reject('实际predev/dev脚本变化，禁止臆造hook');return pkg;};
const restoreWorker=()=>{
 if(!seamState)return;const state=seamState;if(state.childClosePending)reject('真实child尚未关闭：禁止释放句柄/恢复bundle，保留失败证据等待ROOT清理。');
 if(state.installed){if(sha(fs.readFileSync(workerPath))!==seamWrapper.sha256||sha(fs.readFileSync(state.originalSibling))!==state.builtSHA)reject('同wrapper/owned original在恢复前漂移。');fs.copyFileSync(state.originalSibling,workerPath);fs.chmodSync(workerPath,state.builtMode);if(sha(fs.readFileSync(workerPath))!==state.builtSHA)reject('恢复构建原bundle失败');}
 if(state.originalSibling&&fs.existsSync(state.originalSibling))fs.unlinkSync(state.originalSibling);if(state.ownedManifest&&fs.existsSync(seamManifestPath))fs.unlinkSync(seamManifestPath);
 if(state.preBuildExisted){fs.copyFileSync(state.preBuildBackup,workerPath);fs.chmodSync(workerPath,state.preBuildMode);if(sha(fs.readFileSync(workerPath))!==state.preBuildSHA)reject('恢复本次build前ignored bundle原字节失败');}else if(fs.existsSync(workerPath))fs.unlinkSync(workerPath);
 state.restored=true;state.restoredAt=new Date().toISOString();state.restoredSHA=fs.existsSync(workerPath)?sha(fs.readFileSync(workerPath)):null;
};
const prepareLocalAsr=async deadline=>{
 checkedPackage();if(fs.existsSync(path.join(root,'frontend/runtime/execution-worker.cjs'))||fs.existsSync(seamManifestPath))reject('既有packaged worker优先路径或他人seam manifest阻止隔离包装。');
 if(spawnSync('git',['check-ignore','--quiet','--','ai-worker/dist/execution-worker.cjs'],{cwd:root}).status!==0)reject('fixed worker路径必须是当前仓库真实ignored build产物。');
 if(fs.realpathSync(path.join(root,'ai-worker'))!==path.join(fs.realpathSync(root),'ai-worker')||(fs.existsSync(path.dirname(workerPath))&&fs.realpathSync(path.dirname(workerPath))!==path.join(fs.realpathSync(root),'ai-worker/dist')))reject('worker dist不是owned真实目录。');
 const preBuildExisted=fs.existsSync(workerPath);if(preBuildExisted&&!fs.lstatSync(workerPath).isFile())reject('原ignored bundle非regular file');
 const state={preBuildExisted,preBuildSHA:preBuildExisted?sha(fs.readFileSync(workerPath)):null,preBuildMode:preBuildExisted?fs.statSync(workerPath).mode&0o777:null,preBuildBackup:path.join(isolated,'execution-worker-before-predev.cjs'),installed:false,ownedManifest:false,restored:false};seamState=state;if(preBuildExisted)fs.copyFileSync(workerPath,state.preBuildBackup);
 for(const item of cacheSourceRows){const dest=path.join(env.CREATOROS_WHISPER_CACHE_DIR,item.cache_relative_path);if(fs.existsSync(dest))reject('fresh cache已有文件');fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.copyFileSync(item.real,dest,fs.constants.COPYFILE_EXCL);fs.chmodSync(dest,0o600);if(fs.statSync(dest).size!==item.bytes||sha(fs.readFileSync(dest))!==item.sha256||sha(fs.readFileSync(item.real))!==item.sha256)reject('缓存复制/源前后SHA不等');}
 if(deadline-Date.now()<1000)reject('cache初始化后原#12预算不足启动predev');
 const outPath=path.join(isolated,'predev.stdout.log'),errPath=path.join(isolated,'predev.stderr.log'),out=fs.openSync(outPath,'wx'),err=fs.openSync(errPath,'wx'),startedAt=new Date().toISOString();let built;
 try{built=spawnSync('pnpm',['run','predev'],{cwd:path.join(root,'frontend'),env:browserEnv,stdio:['ignore',out,err],timeout:Math.max(1,deadline-Date.now())});}finally{fs.closeSync(out);fs.closeSync(err);}
 report.inputInitialization.push({kind:'actual_public_predev_input_not_19th_verification',argv:['pnpm','run','predev'],cwd:path.join(root,'frontend'),startedAt,finishedAt:new Date().toISOString(),exit:built.status,signal:built.signal,error:built.error?.message??null,stdoutPath:outPath,stderrPath:errPath,stdoutSha256:sha(fs.readFileSync(outPath)),stderrSha256:sha(fs.readFileSync(errPath)),withinOriginal12Deadline:true});save();if(built.status!==0||Date.now()>=deadline)reject('实际predev失败/原#12预算耗尽');
 if(fs.realpathSync(path.dirname(workerPath))!==path.join(fs.realpathSync(root),'ai-worker/dist'))reject('build后dist不是owned真实目录');
 if(!fs.lstatSync(workerPath).isFile()||fs.lstatSync(workerPath).isSymbolicLink())reject('实际build没有固定regular worker');
 state.builtSHA=sha(fs.readFileSync(workerPath));state.builtMode=fs.statSync(workerPath).mode&0o777;state.originalSibling=path.join(path.dirname(workerPath),'execution-worker.t1062-owned-'+crypto.randomBytes(8).toString('hex')+'.cjs');fs.renameSync(workerPath,state.originalSibling);
 const gatePath=path.join(isolated,'network-gate.cjs');fs.writeFileSync(gatePath,seamGate.bytes,{flag:'wx',mode:0o600});
 const networkOutput=path.join(isolated,'worker-network-evidence');fs.mkdirSync(networkOutput,{mode:0o700});
 fs.writeFileSync(seamManifestPath,JSON.stringify({originalWorkerPath:state.originalSibling,originalWorkerSHA256:state.builtSHA,gatePath,output:networkOutput,cacheRoot:env.CREATOROS_WHISPER_CACHE_DIR},null,2)+'\n',{flag:'wx',mode:0o600});state.ownedManifest=true;
 fs.writeFileSync(workerPath,seamWrapper.bytes,{flag:'wx',mode:state.builtMode});state.installed=true;report.workerSeamState=state;save();
 const readyOutPath=path.join(isolated,'zero-task-ready.stdout.log'),readyErrPath=path.join(isolated,'zero-task-ready.stderr.log'),readyOut=fs.openSync(readyOutPath,'wx'),readyErr=fs.openSync(readyErrPath,'wx'),messages=[];
 let readyReceipt;
 try{readyReceipt=await new Promise((resolve,rejectReady)=>{
  const remaining=deadline-Date.now();if(remaining<3000){rejectReady(Error('原#12剩余预算不足真实ready与关闭'));return;}
  const child=fork(workerPath,[],{cwd:path.join(root,'frontend'),env:browserEnv,serialization:'advanced',execArgv:[],stdio:['ignore',readyOut,readyErr,'ipc']}),startedAt=new Date().toISOString();
  let actualReady=null,exitCode=null,exitSignal=null,closed=false,promiseFinished=false,failure=null,termTimer=null,killTimer=null;const stopActions=[];
  state.childClosePending=true;
  const clear=()=>{clearTimeout(startupTimer);clearTimeout(termTimer);clearTimeout(killTimer);clearTimeout(capTimer);};
  const signal=kind=>{if(closed)return;stopActions.push({signal:kind,at:new Date().toISOString(),pid:child.pid??null,accepted:child.kill(kind)});};
  const stop=reason=>{if(failure)return;failure=reason;signal('SIGTERM');termTimer=setTimeout(()=>{signal('SIGKILL');},Math.min(1000,Math.max(1,deadline-Date.now()-1000)));};
  const startupTimer=setTimeout(()=>stop('同wrapper真实worker ready超时'),Math.min(15000,remaining-2000));
  const capTimer=setTimeout(()=>{if(closed)return;signal('SIGKILL');failure=failure??'原#12总预算耗尽且child关闭未完成';promiseFinished=true;report.inputInitialization.push({kind:'actual_same_wrapper_zero_task_ready_not_model_acceptance',status:'CLOSE_PENDING_FAIL_CLOSED',startedAt,finishedAt:new Date().toISOString(),messages,stopActions,childClosePending:true,taskMessagesSent:0});save();rejectReady(Error(failure));},remaining);
  child.on('error',error=>stop('真实worker启动失败: '+error.message));
  child.on('message',message=>{messages.push(message);if(!actualReady&&message?.version===1&&message.type==='ready'&&Array.isArray(message.capabilities)&&message.capabilities.includes('asset.asr')){actualReady=message;if(child.connected)child.disconnect();}});
  child.on('exit',(code,signal)=>{exitCode=code;exitSignal=signal;});
  child.on('close',()=>{
   closed=true;state.childClosePending=false;clear();state.actualChildCloseAt=new Date().toISOString();
   if(promiseFinished){fs.closeSync(readyOut);fs.closeSync(readyErr);return;}
   promiseFinished=true;
   const receipt={kind:'actual_same_wrapper_zero_task_ready_not_model_acceptance',startedAt,finishedAt:state.actualChildCloseAt,messages,code:exitCode,signal:exitSignal,stopActions,actualChildClosed:true,taskMessagesSent:0,originalWorkerSHA256:state.builtSHA,wrapperSHA256:seamWrapper.sha256,gateSHA256:seamGate.sha256,ipcOptions:{serialization:'advanced',execArgv:[],cwd:path.join(root,'frontend')}};
   if(failure||!actualReady||exitCode!==0||Date.now()>deadline){report.inputInitialization.push({...receipt,status:'READY_OR_CLOSE_FAILED'});save();rejectReady(Error(failure??'真实零任务ready/关闭/原预算失败'));}else resolve(receipt);
  });
 });}finally{if(!state.childClosePending){fs.closeSync(readyOut);fs.closeSync(readyErr);}}
 report.inputInitialization.push({...readyReceipt,stdoutPath:readyOutPath,stderrPath:readyErrPath,stdoutSha256:sha(fs.readFileSync(readyOutPath)),stderrSha256:sha(fs.readFileSync(readyErrPath))});
 if(sha(fs.readFileSync(state.originalSibling))!==state.builtSHA||sha(fs.readFileSync(workerPath))!==seamWrapper.sha256)reject('ready后original/options/wrapper漂移');
 if(Date.now()>=deadline)reject('ready完成后原#12预算已耗尽');
 const admissionPath=path.join(isolated,'local-asr-admission.json'),admission={dataRoot:fs.realpathSync(env.CREATOROS_PLAYWRIGHT_DATA_ROOT),backendCommit:scope.backend_final_commit,workerNetworkPolicy:'deny_non_loopback',cacheDir:fs.realpathSync(env.CREATOROS_WHISPER_CACHE_DIR),files:cacheSourceRows.map(x=>({path:x.cache_relative_path,bytes:x.bytes,sha256:x.sha256})),mechanism:'reviewed Node gate prepended to actual eval Worker source; not OS sandbox',zeroTaskReady:readyReceipt,wrapperSHA256:seamWrapper.sha256,gateSHA256:seamGate.sha256,originalWorkerSHA256:state.builtSHA};
 fs.writeFileSync(admissionPath,JSON.stringify(admission,null,2)+'\n',{flag:'wx',mode:0o600});Object.assign(browserEnv,{CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION:admissionPath,CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION_SHA256:sha(fs.readFileSync(admissionPath))});
 const launcherPath=path.join(isolated,'next-dev-launcher.mjs');fs.writeFileSync(launcherPath,`import fs from 'node:fs';import crypto from 'node:crypto';import {spawn} from 'node:child_process';const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');const pkg=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root,'frontend/package.json'))}));if(pkg.scripts.predev!=='node ../ai-worker/scripts/build.mjs'||pkg.scripts.dev!=='next dev'||sha(${JSON.stringify(workerPath)})!==${JSON.stringify(seamWrapper.sha256)}||sha(${JSON.stringify(state.originalSibling)})!==${JSON.stringify(state.builtSHA)}||sha(${JSON.stringify(seamManifestPath)})!==${JSON.stringify(sha(fs.readFileSync(seamManifestPath)))})throw Error('startup scripts/owned original/wrapper manifest漂移');const child=spawn('pnpm',['exec','next','dev','--hostname','127.0.0.1','--port',${JSON.stringify(String(port))}],{cwd:${JSON.stringify(path.join(root,'frontend'))},env:process.env,stdio:'inherit'});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('error',error=>{console.error(error);process.exitCode=1});child.on('exit',(code,signal)=>{process.exitCode=code??1});` ,{flag:'wx',mode:0o600});
 for(const token of [process.execPath,launcherPath])if(!/^[A-Za-z0-9_./-]+$/.test(token))reject('派生webServer command需要安全绝对argv');
 const actualCommand=process.execPath+' '+launcherPath;
 fs.writeFileSync(playwrightConfig,`import base from ${JSON.stringify(path.join(root,'frontend/playwright.config.ts'))};if(base.webServer?.command!==${JSON.stringify('pnpm dev --hostname 127.0.0.1 --port '+port)}||base.webServer?.env?.PGLITE_DATA_DIR!==${JSON.stringify(freshDataPath)}||process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT!==${JSON.stringify(env.CREATOROS_PLAYWRIGHT_DATA_ROOT)})throw Error('实际base command/fresh PGlite不同');export default {...base,testDir:${JSON.stringify(path.join(root,'frontend/tests'))},outputDir:${JSON.stringify(path.join(isolated,'playwright-results'))},reporter:[['list'],['html',{open:'never',outputFolder:${JSON.stringify(path.join(isolated,'playwright-report'))}}]],webServer:{...base.webServer,command:${JSON.stringify(actualCommand)},cwd:${JSON.stringify(path.join(root,'frontend'))},reuseExistingServer:false,env:{...base.webServer.env,...${JSON.stringify({CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION:admissionPath,CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION_SHA256:browserEnv.CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION_SHA256,CREATOROS_WHISPER_CACHE_DIR:browserEnv.CREATOROS_WHISPER_CACHE_DIR})},NODE_ENV:'development',PGLITE_DATA_DIR:${JSON.stringify(freshDataPath)}}}};`);
 report.localAsrInput={admissionPath,admissionSHA256:browserEnv.CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION_SHA256,launcherPath,launcherSHA256:sha(fs.readFileSync(launcherPath)),ownedOriginalPath:state.originalSibling,ownedOriginalSHA256:state.builtSHA,wrapperSHA256:seamWrapper.sha256,gateSHA256:seamGate.sha256,networkOutput,cacheFiles:admission.files,notModelAcceptance:true};report.playwrightConfigSha256=sha(fs.readFileSync(playwrightConfig));save();
};

try {
  for (let index = 0; index < REQUIRED.length; index++) {
    const item = REQUIRED[index], argv = [...item.argv], commandDeadline=Date.now()+20*60*1000;
    let commandEnv = env;
    if (argv.includes('playwright')) {
      await prepareLocalAsr(commandDeadline);
      if(commandDeadline-Date.now()<1000)reject('predev/ready初始化后原#12预算不足启动owner bootstrap');
      commandEnv = browserEnv;
      const stdoutPath=path.join(isolated,'bootstrap.stdout.log'),stderrPath=path.join(isolated,'bootstrap.stderr.log');
      const out=fs.openSync(stdoutPath,'wx'),err=fs.openSync(stderrPath,'wx'),startedAt=new Date().toISOString();
      let initialized;
      try {initialized=spawnSync(process.execPath,[tsxCli,bootstrapPath],{cwd:root,env:browserEnv,stdio:['ignore',out,err],timeout:Math.min(5*60*1000,commandDeadline-Date.now())});} finally {fs.closeSync(out);fs.closeSync(err);}
      const storageOwnerInitialization={kind:'fresh_storage_owner_input_not_19th_verification',argv:[process.execPath,tsxCli,bootstrapPath],startedAt,finishedAt:new Date().toISOString(),exit:initialized.status,signal:initialized.signal,error:initialized.error?.message??null,stdoutPath,stderrPath,stdoutSha256:sha(fs.readFileSync(stdoutPath)),stderrSha256:sha(fs.readFileSync(stderrPath)),receiptPath:bootstrapReceiptPath};
      report.inputInitialization.push(storageOwnerInitialization);
      save();
      if(initialized.status!==0) reject('fresh storage owner bootstrap 失败，未启动 webServer。');
      storageOwnerInitialization.receipt=JSON.parse(fs.readFileSync(bootstrapReceiptPath,'utf8'));storageOwnerInitialization.receiptSha256=sha(fs.readFileSync(bootstrapReceiptPath));
      if(commandDeadline-Date.now()<1000)reject('owner bootstrap后原#12预算不足启动Playwright');
      argv.push('--config', playwrightConfig);
    }
    if(commandDeadline-Date.now()<1000)reject('原命令预算不足启动下一阶段');
    const prefix = path.join(isolated, String(index + 1).padStart(2, '0'));
    const stdoutPath = `${prefix}.stdout.log`, stderrPath = `${prefix}.stderr.log`;
    const out = fs.openSync(stdoutPath, 'wx'), err = fs.openSync(stderrPath, 'wx'), startedAt = new Date().toISOString();
    console.log(`[${index + 1}/18] ${item.label}`);
    let result;
    try { result = spawnSync(argv[0], argv.slice(1), { cwd: root, env:commandEnv, stdio: ['ignore', out, err], timeout: Math.max(1,commandDeadline-Date.now()) }); }
    finally { fs.closeSync(out); fs.closeSync(err); }
    report.commands.push({ label:item.label, declaredArgv:item.argv, actualArgv:argv, cwd:root, startedAt, finishedAt:new Date().toISOString(), exit:result.status, signal:result.signal, error:result.error?.message ?? null,
      stdoutPath, stderrPath, stdoutSha256:sha(fs.readFileSync(stdoutPath)), stderrSha256:sha(fs.readFileSync(stderrPath)) });
    save(); console.log(`exit=${result.status} stdout=${stdoutPath} stderr=${stderrPath}`);
    if (result.status !== 0) reject(`${item.label} exit=${result.status}`);
  }
  report.status = 'declared_18_passed_native_gate_pending';
} catch (error) { report.status = 'failed'; report.failure = error.message; process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  try {
    report.workerSeamRestore=seamState; restoreWorker();
    for(const row of [...extraInputRows,...cacheSourceRows.map(x=>({path:x.real,sha256:x.sha256}))])if(sha(fs.readFileSync(row.path))!==row.sha256)reject('seam/cache原输入验收后漂移');
    report.localAsrExternalInputs=extraInputRows;
    report.derivedArtifactsAfter=derivedSnapshot();
    report.headAfter = git(['rev-parse','HEAD']); report.sourceAfter = snapshot(); report.scopeSha256After = sha(fs.readFileSync(scopePath));
    report.externalInputsAfter = [lock,pkg,archive].map(x => ({path:x.filename, sha256:sha(fs.readFileSync(x.filename))}));
    if (report.externalInputsAfter.some((item, index) => item.sha256 !== report.externalInputs[index].sha256)) { report.status='external_input_drift'; process.exitCode=1; }
    if (report.headAfter !== report.headBefore || JSON.stringify(report.sourceAfter) !== JSON.stringify(report.sourceBefore) || report.scopeSha256After !== report.scopeSha256) { report.status='source_drift'; process.exitCode=1; }
  } catch (error) { report.status='snapshot_failed'; report.snapshotError=error.message; process.exitCode=1; }
  save();
}
