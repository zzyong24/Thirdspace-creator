"""只从本次真实已完成旅程生成正式报告；不执行或伪造验收。"""
from pathlib import Path
import hashlib, json, subprocess, sys

base = Path(__file__).resolve().parent
repo = next(p for p in base.parents if (p / 'BACKLOG.md').is_file())
run_root = repo / 'docs/verification/t1338/final-package/formal-v2/runtime'
task = sys.argv[1]
assert task in ['T-1307', 'T-1340', 'T-1338', 'T-1339']
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
latest = json.loads((run_root / 'LATEST' / (task + '.json')).read_text())
assert latest['exitCode'] == 0, '失败旅程不能生成PASS报告'
receipt_path = Path(latest['latestReceipt'])
assert sha(receipt_path) == latest['sha256']
receipt = json.loads(receipt_path.read_text())
assert receipt['exitCode'] == 0 and receipt['controlHead'] == head
assert receipt['modelRootsSubmitted'] == 0
out = Path(receipt['outputDirectory'])
actual = json.loads(Path(receipt['taskResult']).read_text())
execution = json.loads(Path(receipt['executionResult']).read_text())
outer = json.loads(Path(receipt['outerResult']).read_text())
cleanup = json.loads((out / 'CLEANUP.json').read_text())
assert execution['exitCode'] == 0 and execution['expired'] is False
assert execution['error'] is None and execution['afterInputDrift'] == []
assert execution['remainingOwnedGroup'] == []
assert all(row['current'] is None for row in execution['registeredChildrenAfterCleanup'])
assert outer['exitCode'] == 0 and cleanup['browserClosed'] is True
assert all(row['result'] == 'pass' for row in actual['checks'])
contract = base / 'contracts' / (task + '.md')
visible = Path(receipt['visibleCopy'])
number = task.split('-')[1]
key = 't' + number + '-final-live:e2e'
commands = json.loads((repo / 'orchestrator/process/reconcile.config.json').read_text())['frontend_verify_commands']
logic = {
    'T-1307': 'docs/verification/t1307/runtime/IMPLEMENTATION_REVIEW.md',
    'T-1340': 'docs/verification/t1340/runtime/FINAL_LOCAL_INDEX.json',
    'T-1338': 'docs/verification/t1338/runtime/FINAL_INDEX.json',
    'T-1339': 'docs/verification/t1339/runtime/final-result/OUTPUT_INDEX.json',
}[task]
assert (repo / logic).is_file()
report = {
    'schema': 'frontend-validation/v1', 'task_id': task,
    'contract_path': str(contract.relative_to(repo)), 'contract_sha': sha(contract)[:12],
    'commit_sha': head, 'observed_at': actual['observed_at'],
    'run': {'verify_key': key, 'command': commands[key], 'exit_code': 0,
            'output_ref': str(receipt_path.relative_to(repo))},
    'environment': {'surface': 'desktop-web',
                    'runtime': '真实同包Chromium channel / Playwright 1.60.0与实际Next服务',
                    'viewports': actual['viewports']},
    'data': {'mode': 'non-fixture', 'witnesses': actual['witnesses'],
             'description': actual['dataDescription']},
    'levels': {
        'logic': {'status': 'pass', 'evidence_ref': logic},
        'surface': {'status': 'pass', 'evidence_ref': str(Path(receipt['taskResult']).relative_to(repo))},
        'journey': {'status': 'pass', 'evidence_ref': str(receipt_path.relative_to(repo))},
        'experience': {'status': 'not-requested',
                       'evidence_ref': '机器与独立AI复核不冒真人体验确认；本次未请求用户审美评分。'},
    },
    'checks': actual['checks'], 'coverage': actual['coverage'],
    'visible_copy': {'artifact_path': str(visible.relative_to(repo)), 'artifact_sha256': sha(visible)},
    'tdd_red_ref': logic, 'open_defects': [], 'status': 'pass',
}
reports = base / 'reports'
reports.mkdir(exist_ok=True)
file = reports / (task + '-' + receipt['runId'] + '.md')
assert not file.exists(), '不覆盖已形成的报告'
notes = {
    'T-1307': '原连续下划线正文/预览/HTML真实逐字核对。历史RET001/002留证缺失仍保，不称已补齐。',
    'T-1340': '真实延迟native加载后两平台专属助手与正文核对；0发送/保存。',
    'T-1338': '原组合/朋友圈/报告/同确认回执，空集合使用支持SSR地址导航；项目首页无组合按钮另列可发现性限制。',
    'T-1339': '人工内部publication三族与空发布态，不冒真实平台指标；未显示KPI仅公开DTO，不回写旧物理行仍引原受控证据。',
}
text = '# ' + task + ' 本次前瞻正式界面验收\n\n' + notes[task]
text += '\n\n控制HEAD `' + head + '`；实际包仍 `' + actual['bundleHead'] + '`。'
text += '正式API持久的隔离人工记录/原受控报告仅用于本次权限、数值或正文旅程，不冒真实用户资料、平台实绩或新模型结果。\n\n'
file.write_text(text + '```frontend-validation\n' + json.dumps(report, ensure_ascii=False, indent=2) + '\n```\n')
print(file.relative_to(repo))
