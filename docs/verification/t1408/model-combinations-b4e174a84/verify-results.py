"""核对已发生的公开 CLI 回执；不调用业务、不读取用户运行文件。"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'cli-retest'
GROUP = 'grp_legacy_acct-ae1a8346-9'
matrix = json.loads((RAW / 'matrix.json').read_text())
expected = {('codex', 'codex'), ('codex', 'pi'), ('official', 'codex'), ('self', 'pi'), ('self', 'codex')}
assert {(x['source'], x['engine']) for x in matrix} == expected
rows = []
for item in matrix:
    row = {'source': item['source'], 'engine': item['engine'], 'conversationId': item['conversationId']}
    if (item['source'], item['engine']) == ('codex', 'pi'):
        assert len(item['turns']) == 1
        turn = item['turns'][0]
        assert not turn.get('taskId') and turn['submission']['ok'] is False
        assert turn['submission']['error']['code'] == 'HTTP_409'
        assert 'Pi 引擎无法执行' in turn['submission']['error']['message']
        row.update(result='EXPECTED_UNSUPPORTED', taskCreated=False)
    else:
        assert len(item['turns']) == 3
        turns = []
        for index, turn in enumerate(item['turns'], 1):
            task = turn['task']
            assert task['groupId'] == GROUP and task['status'] == task['runtimeStatus'] == 'succeeded'
            answers = [m for m in turn['messages'] if m['role'] == 'assistant' and m.get('modelMetadata', {}).get('chatTaskId') == turn['taskId']]
            assert len(answers) == 1
            answer = answers[0]
            meta = answer['modelMetadata']
            assert meta['actualEngine'] == item['engine'] and meta['completeness'] == 'completed'
            tools = [p for p in answer['parts'] if p['type'].startswith('tool-')]
            content = answer['content'].strip()
            if index == 1:
                assert content.rstrip('。.!！').endswith('月光731') and not tools
            elif index == 2:
                assert content == '月光731｜323' and not tools
            else:
                assert '月明水清深' in content and len(tools) == 1
                tool = tools[0]
                assert tool['type'] in {'tool-system.read', 'tool-system_read'}
                assert tool['state'] == 'output-available'
                assert tool['input']['request'] == {'kind': 'accountGroups.get', 'params': {'groupId': GROUP}}
                assert tool['output']['complete'] is True
                outcome = tool['output']['__creatorosOutcome']
                assert outcome['status'] == 'ok' and outcome['sideEffect'] == 'none'
            turns.append({'turn': index, 'taskId': turn['taskId'], 'executionTaskId': task['executionTaskId'],
                          'actualEngine': meta['actualEngine'], 'completed': True, 'contentChecked': True,
                          'toolCount': len(tools), 'onlyBoundGroupRead': index == 3,
                          'wallSecondsIncludingCli': turn['wallSeconds']})
        row.update(result='PASS', turns=turns)
    rows.append(row)
restoration = json.loads((RAW / 'route-restoration.json').read_text())
assert restoration['restored'] is True
assert restoration['final']['data']['choices'] == restoration['originalChoices']
files = sorted((RAW / 'receipts').glob('*.json')) + [RAW / 'matrix.json', RAW / 'route-restoration.json', RAW / 'routing-state.json']
manifest = [{'path': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
(ROOT / 'receipt-hashes.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
result = {'installedCommit': 'b4e174a8433e21f75bbc6b2f69b2e065855b7698', 'rows': rows,
          'routingRestored': True, 'finalRoutingRevision': restoration['final']['data']['revision'],
          'officialPi': {'result': 'NOT_PASSED', 'sameInstalledCandidateProbe128': 'reply received',
                         'sameInstalledCandidateProbe8192': 'HTTP_402', 'formalThreeTurnTest': 'not passed',
                         'evidence': '../../t1417/installed-summary.json'},
          'paidOfficialProbeRepeated': False, 'protectedOriginalRecoveryUsed': False, 'allCombinationsPassed': False}
(ROOT / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'threeTurnCombinationsPassed': 4, 'successfulTurns': 12, 'unsupportedCombinations': 1,
                  'officialPi': 'NOT_PASSED', 'routingRestored': True}, ensure_ascii=False))
