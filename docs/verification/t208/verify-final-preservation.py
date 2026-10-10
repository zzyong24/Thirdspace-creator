from pathlib import Path
import json,hashlib,os,subprocess
out=Path('docs/verification/t208');snap=out/'private-before';before=json.loads((out/'before.json').read_text())['files'];initial=json.loads((out/'preservation-after-initial-verification.json').read_text())
result={'protected_old_dirty_byte_equal':{f:hashlib.sha256(Path(f).read_bytes()).hexdigest()==before[f]['sha256'] for f in initial['protected_old_dirty_byte_equal']},'old_control_objects':{}}
for f in ['orchestrator/DECISION_LOG.md','orchestrator/events.ndjson']:
 result['old_control_objects'][f]={'old_prefix_byte_equal':Path(f).read_bytes().startswith((snap/f).read_bytes())}
f='BACKLOG.md';result['old_control_objects'][f]={'old_rows_byte_equal':b''.join(line for line in Path(f).read_bytes().splitlines(keepends=True)if b'| T-208 |'not in line)==(snap/f).read_bytes()}
f='orchestrator/process/modules.config.json';j=json.loads(Path(f).read_text());j['modules'].pop('T-208');result['old_control_objects'][f]={'old_objects_deep_equal':j==json.loads((snap/f).read_text())}
f='orchestrator/progress.json';j=json.loads(Path(f).read_text());j['verticals']=[v for v in j['verticals']if v.get('task_id')!='T-208'];result['old_control_objects'][f]={'old_objects_deep_equal':j==json.loads((snap/f).read_text())}
packet='docs/verification/t1072/integration/t915-mother-cycle2-review.json';result['t915_review_packet_sha256']=hashlib.sha256(Path(packet).read_bytes()).hexdigest();result['t915_review_packet_byte_equal']=result['t915_review_packet_sha256']=='17564729b1d2d24e6d532a4977b142c81f62ba1de07b71ae7d3d29320b223b86'
freeze=json.loads((out/'final-source-freeze.json').read_text());result['frozen_source_unchanged']={f:hashlib.sha256(Path(f).read_bytes()).hexdigest()==h for f,h in freeze['frozen_source_sha256'].items()}
original_registry=subprocess.check_output(['git','show','HEAD:orchestrator/ID_REGISTRY.md']);result['id_registry_head_prefix_byte_equal']=Path('orchestrator/ID_REGISTRY.md').read_bytes().startswith(original_registry);assert result['id_registry_head_prefix_byte_equal']
result['old_id_registry_note']='本任务前 ID_REGISTRY 在 git status 中干净，以HEAD全文前缀逐字验证，仅新增 T208/DEC 行。'
(out/'final-preservation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');os.chmod(out/'final-preservation.json',0o600)
assert all(result['protected_old_dirty_byte_equal'].values());assert all(all(d.values())for d in result['old_control_objects'].values());assert result['t915_review_packet_byte_equal'];assert all(result['frozen_source_unchanged'].values());print(json.dumps(result,ensure_ascii=False,indent=2))
