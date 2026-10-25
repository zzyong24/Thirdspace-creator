"""从原始公开 CLI 回执核实最终包两条引擎路径，不改写失败或任务。"""
from pathlib import Path
import hashlib
import json
import subprocess

OUT = Path(__file__).resolve().parent
GROUP = 'grp_legacy_acct-ae1a8346-9'
summary = {'candidateCommit': '6daaf71d4d3afe8d5bfa5801cffff7c9b9b345bb', 'matrix': []}
for folder, engine in [(OUT, 'pi'), (OUT / 'codex-confirmation', 'codex')]:
    matrix = json.loads((folder / 'cli-retest/matrix.json').read_text())
    assert len(matrix) == 1 and len(matrix[0]['turns']) == 3
    item = matrix[0]
    result = {'source': item['source'], 'engine': engine, 'conversationId': item['conversationId'], 'turns': []}
    for index, turn in enumerate(item['turns']):
        assert turn['task']['status'] == 'succeeded'
        message = next(m for m in reversed(turn['messages']) if m['role'] == 'assistant')
        assert message['modelMetadata']['chatTaskId'] == turn['taskId']
        assert message['modelMetadata']['actualEngine'] == engine
        tools = [part for part in message['parts'] if part.get('type', '').startswith('tool-')]
        if index == 0:
            assert '月光731' in message['content'] and not tools
        elif index == 1:
            assert message['content'].strip() == '月光731｜323' and not tools
        else:
            assert len(tools) == 1 and tools[0]['state'] == 'output-available'
            tool_input = tools[0]['input']
            assert tool_input['request'] == {'kind': 'accountGroups.get', 'params': {'groupId': GROUP}}
            # assistantReadInputSchema: 分页默认值允许由合同解析器显式补齐。
            assert set(tool_input) <= {'request', 'limit', 'offset'}
            assert tool_input.get('limit', 20) == 20 and tool_input.get('offset', 0) == 0
            assert tools[0]['output']['__creatorosOutcome']['status'] == 'ok'
            assert tools[0]['output']['__creatorosOutcome']['sideEffect'] == 'none'
            assert '月明水清深' in json.dumps(tools[0]['output'], ensure_ascii=False)
            assert '月明水清深' in message['content']
        result['turns'].append({'taskId': turn['taskId'], 'status': 'succeeded', 'actualEngine': engine,
            'reply': message['content'], 'toolCalls': len(tools), 'observationSeconds': turn['wallSeconds'],
            'inputTokens': message['inputTokens'], 'outputTokens': message['outputTokens'], 'cachedTokens': message['cachedTokens']})
    restoration = json.loads((folder / 'cli-retest/route-restoration.json').read_text())
    assert restoration['restored']
    result['sourceChoicesRestored'] = True
    summary['matrix'].append(result)

def read(op, payload, name):
    description = subprocess.run(['creatoros', 'operations', 'describe', op], capture_output=True, text=True, check=True)
    assert json.loads(description.stdout)['ok']
    result = subprocess.run(['creatoros', 'call', op, '--group', GROUP, '--input', json.dumps(payload)],
                            capture_output=True, text=True, check=True)
    value = json.loads(result.stdout)
    assert value['ok']
    (OUT / (name + '.json')).write_text(result.stdout)
    return value['data']

projects = read('projects.list', {'query': {'page': 1, 'pageSize': 100}}, 'projects-after')
group = read('accountGroups.get', {'params': {'groupId': GROUP}}, 'group-after')
routing = read('settings.modelRouting.get', {}, 'routing-after')
official = read('ai.tasks.get', {'params': {'taskId': 'ai-task-5e73167d-401'}}, 'official-original-after')
before_projects = json.loads((OUT / 'projects-before.json').read_text())['data']
before_group = json.loads((OUT / 'group-before.json').read_text())['data']
before_routing = json.loads((OUT / 'routing-before.json').read_text())['data']
assert projects == before_projects and group == before_group
assert routing['choices'] == before_routing['choices']
proof = json.loads((OUT / 'installed-candidate-proof.json').read_text())
hashes = {key: hashlib.sha256(Path(path).read_bytes()).hexdigest() for key, path in {
    'binary': '/Applications/CreatorOS.app/Contents/MacOS/CreatorOS',
    'sidecar': '/Applications/CreatorOS.app/Contents/Resources/sidecar.tar.gz'}.items()}
assert hashes == proof['installedHashes']
summary['preservation'] = {'projects': len(projects), 'publicProjectRowsEqual': True, 'publicGroupRowEqual': True,
    'modelChoicesRestored': True, 'beforeRoutingRevision': before_routing['revision'],
    'afterRoutingRevision': routing['revision'], 'installedHashesUnchanged': True}
summary['officialOriginalTask'] = {key: official.get(key) for key in ['id', 'status', 'runtimeStatus', 'errorCode', 'errorMessage']}
summary['boundary'] = '六组合完整矩阵仍归属初次8f757安装；最终6daaf包针对两条实际引擎各补测三轮。官方失败任务只回读，不重发或换源；不据此声称官方API恢复。'
(OUT / 'FINAL_CLI_SUMMARY.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'verifiedEngines': ['pi', 'codex'], 'successfulTurns': 6, 'projectsPreserved': len(projects),
                  'officialOriginalTask': summary['officialOriginalTask']}, ensure_ascii=False))
