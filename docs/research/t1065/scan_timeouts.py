#!/usr/bin/env python3
"""T-1065 只读超时检索；候选不自动冒充真实控制策略。"""
import argparse
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs', '.py', '.sh',
              '.ps1', '.yml', '.yaml', '.json', '.toml', '.go', '.css', '.html',
              '.cs', '.bat', '.cmd', '.swift', '.sql'}
PATTERN = re.compile(r'timeout|deadline|max[_-]?(?:wait|elapsed|duration)|time[_-]?limit|'
                     r'setTimeout|wait_for\(|wait_timeout|wait_until|WaitForExit\(|'
                     r'from_secs\(|from_millis\(|\.elapsed\(|Date\.now\(', re.I)


def scan(root):
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
    scope, rows, excluded = [], [], Counter()
    for rel in paths:
        if not rel:
            continue
        p, parts = root / rel, Path(rel).parts
        if p.suffix.lower() not in EXTENSIONS:
            excluded['非代码配置文件'] += 1
            continue
        if any(x in parts for x in ['node_modules', 'target', 'dist', 'build', '.next',
                                    'browsers', 'vendor', '.git']):
            excluded['依赖或构建产物'] += 1
            continue
        if parts[0] in ['docs', 'output', 'outputs', 'tmp', '__artifacts__', '.agent-packets',
                        '.codex'] or any(x in parts for x in ['fixtures', '__fixtures__',
                                                            'testdata', 'test-results']):
            excluded['文档或历史产物夹具'] += 1
            continue
        if re.search(r'\.(test|spec|fixture)\.[^.]+$|(^|/)(tests|__tests__)/|_tests\.rs$', rel):
            excluded['测试或探针夹具专用文件'] += 1
            continue
        if not p.is_file():
            continue
        try:
            source = p.read_text()
        except UnicodeDecodeError:
            continue
        if rel.startswith('orchestrator/process/'):
            group = '治理脚手架'
        elif rel.startswith(('.agents/', '.claude/')):
            group = '项目技能及开发配置'
        elif rel.startswith(('frontend/scripts/', 'tools/', '.github/', 'backend/scripts/',
                             'ai-worker/scripts/', 'mcp-server/scripts/')):
            group = '构建验收运维'
        elif rel.startswith(('frontend/src/', 'frontend/src-tauri/src/', 'backend/src/',
                             'ai-worker/src/', 'contract/src/', 'mcp-server/src/')):
            group = '产品运行时'
        else:
            group = '其它第一方配置与工具'
        scope.append({'file': rel, 'group': group, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
        for line, value in enumerate(source.splitlines(), 1):
            if PATTERN.search(value):
                rows.append({'file': rel, 'line': line, 'group': group, 'source': value.strip()})
    return {'sourceRoot': str(root),
            'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip(),
            'scope': scope, 'excluded': dict(excluded), 'candidates': rows,
            'method': 'git tracked first-party files; broad lexical candidates; human review separately'}


def verify():
    raw = json.loads((HERE / 'search-candidates.json').read_text())
    reviewed = json.loads((HERE / 'timeout-inventory.json').read_text())
    root, errors = Path(raw['sourceRoot']), []
    for item in raw['scope']:
        p = root / item['file']
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != item['sha256']:
            errors.append('源码快照已变化: ' + item['file'])
    ids = set()
    for p in reviewed['policies']:
        if p['id'] in ids:
            errors.append('重复记录 ID: ' + p['id'])
        ids.add(p['id'])
        file = root / p['file']
        if not file.is_file() or not 1 <= p['line'] <= len(file.read_text().splitlines()):
            errors.append('引用文件或行号不存在: ' + p['id'])
        if type(p['is30s']) is not bool or not all(p.get(k) for k in
                    ['expression', 'duration', 'effect', 'category', 'recordType', 'scope']):
            errors.append('记录字段不完整: ' + p['id'])
    actual = Counter(p['scope'] for p in reviewed['policies'])
    if dict(actual) != reviewed['summary']['byScope']:
        errors.append('分区计数不匹配')
    if sum(p['is30s'] for p in reviewed['policies']) != reviewed['summary']['records30s']:
        errors.append('30秒计数不匹配')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(json.dumps({'ok': True, 'sourceFilesVerified': len(raw['scope']),
                      'candidateLines': len(raw['candidates']),
                      'reviewedRecords': len(reviewed['policies']),
                      'records30s': reviewed['summary']['records30s'],
                      'sourceHead': raw['head'], 'verification': '静态证据及统计一致性；非真实业务E2E'},
                     ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--root', type=Path)
    parser.add_argument('--out', type=Path, default=HERE / 'search-candidates.json')
    args = parser.parse_args()
    if args.verify:
        verify()
    elif args.root:
        args.out.write_text(json.dumps(scan(args.root.resolve()), ensure_ascii=False, indent=2) + '\n')
        print(str(args.out))
    else:
        parser.error('选择 --verify 或 --root <被审源码目录>')
