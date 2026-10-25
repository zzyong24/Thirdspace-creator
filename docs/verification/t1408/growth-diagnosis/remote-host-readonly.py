"""可信宿主入口：服务环境只转给原 release 子进程，stdout 仅传白名单 JSON。"""
import ast
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys


def main():
    bundle = json.load(sys.stdin)
    root = pathlib.Path('/opt/thirdspace/current').resolve()
    pid = subprocess.check_output(['systemctl', 'show', 'thirdspace-growth-api.service', '-p', 'MainPID', '--value'], text=True).strip()
    if not pid.isdecimal() or int(pid) <= 1 or pathlib.Path('/proc', pid, 'cwd').resolve() != root:
        raise ValueError('LIVE_RELEASE_NOT_VERIFIED')
    result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'release': str(root),
              'apiPid': int(pid), 'businessWrites': False, 'sources': {}}
    for name in ('server/integrations/managed_model/omnihi.py', 'server/modules/client_config/service.py',
                 'server/application/ai_credit_service.py'):
        content = (root / name).read_text()
        tree = ast.parse(content)
        result['sources'][name] = {'sha256': hashlib.sha256(content.encode()).hexdigest(), 'snippets': [
            {'name': node.name, 'line': node.lineno, 'source': ast.get_source_segment(content, node)}
            for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)
            and node.name in {'_account_payload', '_managed_credential_response', 'get_budget', 'build_omnihi_managed_model_provider'}]}
    if bundle.get('mode') == 'version':
        return result
    if bundle.get('mode') != 'account':
        raise ValueError('MODE_NOT_ALLOWED')
    # 只在服务器内使用运行服务已配置的 DB 与供应商认证，不复制到本机或输出。
    live_env = dict(item.split('=', 1) for item in pathlib.Path('/proc', pid, 'environ').read_text().split('\0') if '=' in item)
    allowed_env = {'THIRDSPACE_DATABASE_URL', 'THIRDSPACE_OMNIHI_BASE_URL', 'THIRDSPACE_OMNIHI_AUTH_TYPE',
                   'THIRDSPACE_OMNIHI_IDENTIFIER', 'THIRDSPACE_OMNIHI_PASSWORD',
                   'THIRDSPACE_OMNIHI_COUNTRY_CODE', 'THIRDSPACE_OMNIHI_TIMEOUT_SECONDS'}
    child_env = {key: value for key, value in live_env.items() if key in allowed_env}
    child_env.update(PATH=os.defpath, PYTHONPATH=str(root / 'server'), PYTHONDONTWRITEBYTECODE='1')
    child = subprocess.run([str(root / '.venv/bin/python'), '-c', bundle['collector']],
                           cwd=root, env=child_env, input=json.dumps(bundle['target']),
                           capture_output=True, text=True, timeout=55)
    if child.returncode:
        result['accountCheck'] = {'error': 'SCOPED_COLLECTOR_FAILED', 'exitCode': child.returncode}
    else:
        result['accountCheck'] = json.loads(child.stdout)
    result['sameApiPidAfter'] = pid == subprocess.check_output(
        ['systemctl', 'show', 'thirdspace-growth-api.service', '-p', 'MainPID', '--value'], text=True).strip()
    return result


try:
    print(json.dumps(main(), ensure_ascii=False))
except Exception as exc:
    print(json.dumps({'error': 'READ_ONLY_HOST_CHECK_FAILED', 'exceptionType': type(exc).__name__}))
    sys.exit(1)
