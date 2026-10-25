"""只通过已安装 CreatorOS 公开 CLI 复验；每次请求留存回执，可沿原任务恢复。"""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parent / 'cli-retest'
ROOT.mkdir(exist_ok=True)
RECEIPTS = ROOT / 'receipts'
RECEIPTS.mkdir(exist_ok=True)
CLI = shutil.which('creatoros')
GROUP = 'grp_legacy_acct-ae1a8346-9'
PREFIX = 't1407-static-pi-installed-20261025'
MATRIX = ROOT / 'matrix.json'
results = json.loads(MATRIX.read_text()) if MATRIX.exists() else []
sequence = max([int(p.name.split('-')[0]) for p in RECEIPTS.glob('*.json')], default=0)


def run(args, label, timeout=180):
    global sequence
    sequence += 1
    start = time.monotonic()
    proc = subprocess.run([CLI, *args], capture_output=True, text=True, timeout=timeout)
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        data = {'ok': False, 'stdout': proc.stdout, 'stderr': proc.stderr}
    receipt = {'args': args, 'elapsedSeconds': round(time.monotonic()-start, 3),
               'exitCode': proc.returncode, 'response': data}
    (RECEIPTS / f'{sequence:04d}-{label}.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
    return data


def call(op, payload, label, key=None, impact=None, scoped=True):
    description = run(['operations', 'describe', op], label+'-describe')
    if not description.get('ok'):
        raise RuntimeError('当前安装版能力发现失败：'+op)
    args = ['call', op, '--input', json.dumps(payload, ensure_ascii=False)]
    if scoped:
        args += ['--group', GROUP]
    if key:
        args += ['--apply', '--idempotency-key', key]
    if impact:
        args += ['--confirm-impact', impact]
    return run(args, label)


def save():
    MATRIX.write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n')


def terminal(task):
    return task.get('status') in {'succeeded', 'failed', 'cancelled', 'awaiting_confirmation', 'partial'} or task.get('runtimeStatus') in {'waiting_user', 'unknown_result'}


def observe(task_id, label):
    for index in range(10):
        response = call('ai.tasks.get', {'params': {'taskId': task_id}}, f'{label}-get-{index}')
        if not response.get('ok'):
            raise RuntimeError('原任务读取失败；保留 taskId：'+task_id)
        task = response['data']
        if task.get('groupId') not in {None, GROUP}:
            raise RuntimeError('任务组不一致')
        if terminal(task):
            return task
        run(['tasks', 'wait', task_id, '--group', GROUP, '--timeout', '120'], f'{label}-wait-{index}')
    raise RuntimeError('原任务仍未终结，停止后续提交，沿原ID恢复：'+task_id)


def finish(item, record, label):
    task = observe(record['taskId'], label)
    record['task'] = task
    messages = call('ai.conversations.messages.list', {'params': {'conversationId': item['conversationId']}}, label+'-messages')
    if not messages.get('ok'):
        raise RuntimeError('回复回读失败')
    record['messages'] = messages.get('data')
    execution_id = task.get('executionTaskId')
    if execution_id:
        record['modelCalls'] = call('workbench.modelCalls.summary', {'params': {'taskId': execution_id}, 'query': {'limit': 20}}, label+'-models').get('data')
        events, cursor = [], 0
        while True:
            value = call('workbench.tasks.events', {'params': {'taskId': execution_id}, 'query': {'limit': 128, 'afterSequence': cursor}}, label+f'-events-{cursor}')
            if not value.get('ok'):
                record['eventsReadError'] = value
                break
            page = value['data']
            events.extend(page['events'])
            if not page['hasMore']:
                break
            if page['nextSequence'] <= cursor:
                raise RuntimeError('公开事件游标没有前进')
            cursor = page['nextSequence']
        record['events'] = events
    record['observedAt'] = time.time()
    record['wallSeconds'] = round(record['observedAt']-record['startedAt'], 3)
    save()
    print(json.dumps({'combination': item['source']+'-'+item['engine'], 'turn': len(item['turns']),
                      'status': task.get('status'), 'runtimeStatus': task.get('runtimeStatus'),
                      'errorCode': task.get('errorCode'), 'wallSeconds': record['wallSeconds']}, ensure_ascii=False), flush=True)


state_path = ROOT / 'routing-state.json'
initial = call('settings.modelRouting.get', {}, 'initial-route', scoped=False)
if not initial.get('ok'):
    raise RuntimeError('无法读取路由')
if state_path.exists():
    state = json.loads(state_path.read_text())
    if initial['data']['revision'] != state['revision'] or initial['data']['choices'] != state['choices']:
        raise RuntimeError('配置已被其他操作修改；不覆盖')
else:
    state = {'original': copy.deepcopy(initial['data']['choices']), 'choices': initial['data']['choices'], 'revision': initial['data']['revision']}
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2)+'\n')


def source(text):
    live = call('settings.modelRouting.get', {}, 'check-route-'+text, scoped=False)
    if not live.get('ok') or live['data']['revision'] != state['revision'] or live['data']['choices'] != state['choices']:
        raise RuntimeError('配置发生并发变化；不覆盖')
    if state['choices']['text'] == text:
        return
    choices = {**state['choices'], 'text': text}
    changed = call('settings.modelRouting.put', {'body': {'schemaVersion': 1, 'choices': choices, 'expectedRevision': state['revision']}},
                   'set-route-'+text, key=f"{PREFIX}-route-{state['revision']}-{text}", scoped=False)
    if not changed.get('ok'):
        raise RuntimeError('路由修改失败')
    verified = call('settings.modelRouting.get', {}, 'readback-route-'+text, scoped=False)
    if not verified.get('ok') or verified['data']['choices'] != choices:
        raise RuntimeError('路由回读不一致')
    state.update(choices=choices, revision=verified['data']['revision'])
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2)+'\n')


try:
    group = call('accountGroups.get', {'params': {'groupId': GROUP}}, 'bound-group')
    if not group.get('ok') or group['data']['name'] != '月明水清深':
        raise RuntimeError('已指定的真实账号组未核实')
    for text, engine in [('self', 'pi')]:
        source(text)
        label = text+'-'+engine
        item = next((x for x in results if x['source'] == text and x['engine'] == engine), None)
        if item is None:
            response = call('ai.conversations.create', {'body': {'title': '静态Pi打包后CLI实测-20261025-'+label, 'scope': 'assistant'}}, label+'-conversation', key=PREFIX+'-'+label+'-conversation')
            if not response.get('ok') or response['data'].get('groupId') != GROUP:
                raise RuntimeError('测试对话创建/归属失败')
            item = {'source': text, 'engine': engine, 'conversationId': response['data']['id'], 'turns': []}
            results.append(item)
            save()
        prompts = [
            '这是专用CLI对话测试，不采纳或修改任何已有内容。请记住测试代号是月光731。现在只用一句中文说明AI能怎样帮助创作者，并在句末写上这个代号。不要调用工具。',
            '继续测试：不使用工具，请只输出上轮的测试代号和17乘以19的结果，格式为“代号｜结果”，不要加解释。',
            '继续测试：请使用当前可用的只读上下文工具核实当前账号组名称，回答真实名称并简述依据。不要创建、修改、采纳或发布任何业务内容；不调用外部采集工具。',
        ]
        for number, content in enumerate(prompts, 1):
            if len(item['turns']) >= number:
                record = item['turns'][number-1]
                if record.get('taskId') and not terminal(record.get('task', {})):
                    finish(item, record, label+f'-turn{number}')
                if record.get('task', {}).get('status') != 'succeeded':
                    break
                continue
            if number > 1 and item['turns'][-1].get('task', {}).get('status') != 'succeeded':
                break
            record = {'startedAt': time.time()}
            response = call('ai.conversations.messages.create', {'params': {'conversationId': item['conversationId']}, 'body': {'content': content, 'executionEngine': engine}},
                            label+f'-turn{number}-submit', key=PREFIX+'-'+label+f'-turn{number}', impact=item['conversationId'])
            record['submission'] = response
            record['taskId'] = response.get('data', {}).get('modelMetadata', {}).get('chatTaskId')
            item['turns'].append(record)
            save()
            if not record['taskId']:
                print(json.dumps({'combination': label, 'submission': response}, ensure_ascii=False), flush=True)
                break
            finish(item, record, label+f'-turn{number}')
finally:
    save()
    if state['choices'] != state['original']:
        source(state['original']['text'])
    final = call('settings.modelRouting.get', {}, 'restored-route', scoped=False)
    (ROOT / 'route-restoration.json').write_text(json.dumps({'originalChoices': state['original'], 'final': final,
        'restored': final.get('data', {}).get('choices') == state['original']}, ensure_ascii=False, indent=2)+'\n')
