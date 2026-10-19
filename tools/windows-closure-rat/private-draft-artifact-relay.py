"""T247 固定未签 ZIP 的只读审计及唯一私有 draft 中转；不运行包或读取签名材料。"""
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = 'zzyong24/Thirdspace-creator'
BRANCH = 'codex/t247-windows-e315-build-20261017'
SOURCE = '76d0ff4749ebe4b08fb81afeb7d36c60de922bd8'
MAIN = '75968755b53126b13ea45947151bea239d5f3997'
PREPARE_RUN = 39056633545
ARTIFACT = 12109873404
ZIP_BYTES = 971194844
ZIP_SHA = '1defc50d7512d644761140775375b7c197de07570a5486c3169ab17653371401'
TAR_BYTES = 873120518
TAR_SHA = '84b1f27b9b59ed43e09a51308aecb97bd3efb9375db42e42fa739e6731693210'
TAR_BLAKE3_CLAIM = '9e420690bd72e22f2e5374af48c2ecbe3a5066652730f998373ce5e89dacd0a4'
NODE_SHA = '98843732431bad6c2c165908bb7dde6fe2a221ddbc491a955d548a2e6ab9ebff'
NODE_BYTES = 95618048
SUMMARY_SHA = '63833cd3c66affb669de30c3dee34b2c76e29515bbe4fa3ecd0f79b5e4fe5c06'
VERDICT_SHA = '1d1adea7a5bcd7e65f3e06be2c92eb24099da2d6685664d97141f83484d54e55'
CONFIG_SHA = '7997176cd671dbf21eb8f757deb8a42501afe648cf9545bc007e609c833b4e0b'
CONFIG_KID = 'growth-client-config-20260805-01'
ROOT_ID = 'creatoros-update-root-20260805-01'
OLD_RELEASE = 360969788
OLD_ASSET = 492529736
MEMBERS = {'sidecar.tar.gz': 6*1024**3,
           'creatoros-server-x86_64-pc-windows-msvc.exe': 256*1024**2,
           'runtime-inventory.json': 32*1024**2, 'capsule-manifest.json': 65536}


# 原串行链不重试/不续期：最多19个API请求+重定向、完整下载/上传、归档审计及收尾。
# 19*120 + 120 + 2*1200 + 1200 + 120 = 6120 < 7200；外层CI另覆盖控制测试/上传审计。
REQUEST_TIMEOUT_SECONDS = 120
BLOB_TIMEOUT_SECONDS = 1200
TOTAL_BUDGET_SECONDS = 7200


class RelayError(Exception):
    pass


def require(value, message):
    if not value:
        raise RelayError(message)


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def exact(value, keys):
    require(isinstance(value, dict) and set(value) == set(keys), '字段不闭合')


def safe_name(raw):
    if raw in ('.', './'):
        return None
    name = (raw[2:] if raw.startswith('./') else raw).rstrip('/')
    require(name and not name.startswith('/') and ':' not in name and '\\' not in name
            and all(p not in ('', '.', '..') for p in name.split('/')), '归档路径不安全')
    return name


def blob_url(url):
    p = urllib.parse.urlsplit(url)
    require(p.scheme == 'https' and not p.username and not p.password and not p.port
            and (p.hostname.endswith('.blob.core.windows.net')
                 or p.hostname.endswith('.actions.githubusercontent.com')), 'artifact 目标主机不符')
    return url


def validate_context(env):
    require(env.get('GITHUB_REPOSITORY') == REPO
            and env.get('GITHUB_REF') == 'refs/heads/'+BRANCH
            and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and re.fullmatch('[a-f0-9]{40}', env.get('GITHUB_SHA', ''))
            and re.fullmatch('[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', '')), '中转控制来源不符')
    require(env.get('RELAY_ONLY') == 'windows' and env.get('RELAY_VALIDATE') == 'true'
            and all(env.get(k) == 'false' for k in ('RELAY_RAT_RUNTIME', 'RELAY_RAT_CLOSURE', 'RELAY_RAT_PACKAGE'))
            and env.get('RELAY_CAPSULE_MODE') in ('', 'none')
            and all(not env.get(k) for k in ('RELAY_SOURCE', 'RELAY_PREPARE_RUN', 'RELAY_ARTIFACT',
                    'RELAY_DIGEST', 'RELAY_MANIFEST', 'RELAY_SIGNATURE')), '中转不能兼跑产品/消费')
    return env['GITHUB_RUN_ID']


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token):
        require(isinstance(token, str) and bool(token), '缺当前 job 既有 GitHub token')
        self.token = token
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def api(self, suffix, method='GET', body=None, missing=False):
        require((suffix == '' or suffix.startswith('/')) and not suffix.startswith('//'), 'API 路径不符')
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request('https://api.github.com/repos/'+REPO+suffix, data=data,
              method=method, headers={'Authorization': 'Bearer '+self.token,
              'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json'})
        try:
            with self.opener.open(req, timeout=REQUEST_TIMEOUT_SECONDS) as r:
                require(r.status in (200, 201, 204), 'GitHub API 状态不符')
                value = r.read(4*1024**2+1)
                require(len(value) <= 4*1024**2, 'API 响应超界')
                return json.loads(value) if value else None
        except urllib.error.HTTPError as e:
            if missing and e.code == 404:
                return None
            raise RelayError('GitHub API HTTP '+str(e.code)) from None

    def download(self, target):
        req = urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/artifacts/'+str(ARTIFACT)+'/zip',
              headers={'Authorization': 'Bearer '+self.token, 'Accept': 'application/vnd.github+json'})
        try:
            self.opener.open(req, timeout=REQUEST_TIMEOUT_SECONDS)
            raise RelayError('artifact API 必须返回302')
        except urllib.error.HTTPError as e:
            require(e.code == 302, 'artifact API 未返回302')
            url = blob_url(e.headers.get('Location', ''))
        # 新请求只含公开 HTTP 头；绝不向 blob 传 GitHub Authorization。
        count = 0
        with self.opener.open(urllib.request.Request(url), timeout=BLOB_TIMEOUT_SECONDS) as response, open(target, 'xb') as f:
            require(response.status == 200, 'artifact blob 不是200')
            length = response.headers.get('Content-Length')
            require(length is None or int(length) == ZIP_BYTES, 'artifact blob 长度不符')
            for b in iter(lambda: response.read(1024*1024), b''):
                count += len(b)
                require(count <= ZIP_BYTES, 'artifact blob 超界')
                f.write(b)
        require(count == ZIP_BYTES and sha_file(target) == ZIP_SHA, '完整 ZIP 摘要/字节不符')

    def upload(self, release_id, path, name):
        # 固定 GitHub upload host；不接受 API 返回的可变 upload_url 或任何 redirect。
        conn = http.client.HTTPSConnection('uploads.github.com', timeout=BLOB_TIMEOUT_SECONDS)
        try:
            with open(path, 'rb') as f:
                conn.request('POST', '/repos/'+REPO+'/releases/'+str(release_id)+'/assets?'+urllib.parse.urlencode({'name': name}),
                             body=f, headers={'Authorization': 'Bearer '+self.token,
                             'Accept': 'application/vnd.github+json', 'Content-Type': 'application/zip',
                             'Content-Length': str(ZIP_BYTES), 'X-GitHub-Api-Version': '2022-11-28'})
                response = conn.getresponse()
                require(response.status == 201, '原 ZIP 上传未返回201')
                data = response.read(1024**2+1)
                require(len(data) <= 1024**2, '上传响应超界')
                return json.loads(data)
        finally:
            conn.close()


def validate_prepare(run, artifact):
    require(run['id'] == PREPARE_RUN and run['head_sha'] == SOURCE
            and run['head_branch'] == BRANCH and run['event'] == 'workflow_dispatch'
            and run['status'] == 'completed' and run['conclusion'] == 'success'
            and run['repository']['full_name'] == REPO, 'prepare run 来源不符')
    require(artifact['id'] == ARTIFACT and artifact['name'] == 't247-unsigned-windows-capsule'
            and artifact['expired'] is False and artifact['size_in_bytes'] == ZIP_BYTES
            and artifact['digest'] == 'sha256:'+ZIP_SHA
            and artifact['workflow_run']['id'] == PREPARE_RUN
            and artifact['workflow_run']['head_sha'] == SOURCE, '固定 artifact 不符')


def extract_four(archive, out):
    with zipfile.ZipFile(archive) as z:
        rows = z.infolist()
        require(len(rows) == 4 and {r.filename for r in rows} == set(MEMBERS), 'ZIP 成员不符')
        for r in rows:
            mode = r.external_attr >> 16
            require(not r.is_dir() and stat.S_IFMT(mode) in (0, stat.S_IFREG)
                    and 0 < r.file_size <= MEMBERS[r.filename], 'ZIP 类型/大小不符')
        out.mkdir(mode=0o700)
        for r in rows:
            with z.open(r) as src, open(out/r.filename, 'xb') as dst:
                shutil.copyfileobj(src, dst, 1024*1024)


def expected_manifest(m):
    exact(m, ['contractVersion', 'status', 'buildInput', 'rootId', 'tar', 'inventorySHA256'])
    b = m['buildInput']
    exact(b, ['contractVersion', 'sourceCommit', 'target', 'ownedDevices', 'modelBenefits',
          'licenseProject', 'verdictPublicKeySHA256', 'configPublicKeySHA256', 'configKeyId',
          'node', 'validationLayerSummary'])
    require(m['contractVersion'] == b['contractVersion'] == 'creatoros-windows-signed-capsule-v1'
            and m['status'] == 'unsigned-not-distributable' and m['rootId'] == ROOT_ID
            and b['sourceCommit'] == SOURCE and b['target'] == 'win32-x64'
            and b['ownedDevices'] is True and b['modelBenefits'] is True and b['licenseProject'] == 'creatoros'
            and b['verdictPublicKeySHA256'] == VERDICT_SHA and b['configPublicKeySHA256'] == CONFIG_SHA
            and b['configKeyId'] == CONFIG_KID, '构建身份/公开根声明不符')
    require(b['node'] == {'sha256': NODE_SHA, 'bytes': NODE_BYTES, 'target': 'win32-x64'}
            and b['validationLayerSummary'] == {'sha256': SUMMARY_SHA, 'bytes': 700}
            and m['tar'] == {'sha256': TAR_SHA, 'blake3': TAR_BLAKE3_CLAIM, 'bytes': TAR_BYTES}, 'tar/Node/summary 声明不符')
    require(re.fullmatch('[a-f0-9]{64}', m['inventorySHA256']) is not None, 'inventory 摘要格式不符')
    return b


def inspect_tar(archive):
    seen = set()
    files = []
    captured = {}
    wanted = {'.creatoros-build-input.json', '.creatoros-validation-layer-summary.json',
              'frontend/.next/server/verdict-verify-key.json', 'frontend/worker-dependency-map.json'}
    with tarfile.open(archive, 'r|gz') as stream:
        for m in stream:
            name = safe_name(m.name)
            if name is None:
                continue
            require(name.casefold() not in seen, 'tar 大小写重复路径')
            seen.add(name.casefold())
            require(m.isdir() or m.isfile(), 'tar 非普通成员或链接')
            parts = name.split('/')
            require(not any(p.casefold() in ('node_modules', '.git', '.ssh') for p in parts)
                    and parts[-1].casefold() not in ('.env', '.npmrc', '.netrc', 'id_rsa', 'id_ed25519',
                            'creatoros-update-root-20260805.pem'), 'tar 禁止路径')
            if m.isdir():
                continue
            collect = name in wanted or (name.startswith('frontend/.next/worker-packages/') and name.endswith('/package.json'))
            if collect:
                require(m.size <= 32*1024**2, '审计 metadata 超界')
            h = hashlib.sha256()
            chunks = []
            f = stream.extractfile(m)
            for chunk in iter(lambda: f.read(1024*1024), b''):
                h.update(chunk)
                if collect:
                    chunks.append(chunk)
            files.append({'path': name, 'bytes': m.size, 'sha256': h.hexdigest()})
            if collect:
                captured[name] = b''.join(chunks)
    return files, captured, len(seen)


def canvas_structure(graph, captured, files):
    require(graph.get('schemaVersion') == 1 and isinstance(graph.get('nodes'), dict)
            and isinstance(graph.get('entries'), dict), 'Worker graph 格式不符')
    nodes = graph['nodes']
    for node in nodes.values():
        root = safe_name(node['root'])
        require(root == node['root'] and root.startswith('frontend/.next/worker-packages/'), '图节点路径不符')
        data = captured.get(root+'/package.json')
        require(data is not None and hashlib.sha256(data).hexdigest() == node['manifestSHA256'], '图节点实际 manifest 不符')
        manifest = json.loads(data)
        require(manifest.get('name') == node['name'] and manifest.get('version') == node['version'], '图节点身份不符')
        require(all(edge in nodes for edge in node['dependencies'].values()), '图必需边缺失')
    entry = graph['entries']['frontend/runtime/execution-worker.cjs']['dependencies']
    pdf_id = entry.get('pdf-parse')
    require(pdf_id in nodes, 'execution-worker 缺 pdf-parse')
    pdf = nodes[pdf_id]
    canvas_id = pdf['dependencies'].get('@napi-rs/canvas')
    require(canvas_id in nodes, 'pdf-parse 缺 canvas owner 边')
    canvas = nodes[canvas_id]
    native_id = canvas['dependencies'].get('@napi-rs/canvas-win32-x64-msvc')
    require(native_id in nodes, 'canvas 缺 Windows native 边')
    native = nodes[native_id]
    native_files = [f for f in files if f['path'].startswith(native['root']+'/') and f['path'].endswith('.node')]
    require(bool(native_files) and all(f['bytes'] > 0 for f in native_files), 'canvas Windows native 文件缺失')
    return {'status': '仅真实 tar 静态结构，不是 Windows 运行结果',
            'directExecutionWorkerCanvasEdge': entry.get('@napi-rs/canvas'),
            'pdfParse': {'id': pdf_id, **pdf}, 'canvas': {'id': canvas_id, **canvas},
            'windowsNative': {'id': native_id, **native}, 'nativeFiles': native_files,
            'runtimePending': True, 'productGraphUnchanged': True}


def declared_npm_structure(graph, captured, files):
    # 仅核真实图/manifest/实际成员，不解析或执行任何包代码。
    names = {'punycode', 'buffer', 'string_decoder'}
    nodes, members, rows, seen = graph['nodes'], {f['path']: f for f in files}, [], set()
    for owner_id, owner in nodes.items():
        owner_data = captured.get(owner['root']+'/package.json')
        require(owner_data is not None and hashlib.sha256(owner_data).hexdigest() == owner['manifestSHA256'], 'npm owner manifest 摘要不符')
        manifest = json.loads(owner_data)
        require(manifest.get('name') == owner['name'] and manifest.get('version') == owner['version'], 'npm owner 身份不符')
        for name in names.intersection(manifest.get('dependencies', {})):
            target_id = owner['dependencies'].get(name)
            require(target_id in nodes, '显式同名npm依赖边缺失: '+name)
            target = nodes[target_id]
            require(target['name'] == name and name in target['aliases'], 'npm target 身份不符')
            raw = captured.get(target['root']+'/package.json')
            require(raw is not None and hashlib.sha256(raw).hexdigest() == target['manifestSHA256'], 'npm target manifest 摘要不符')
            package = json.loads(raw)
            require(package.get('name') == name and package.get('version') == target['version'], 'npm target manifest 身份不符')
            main = package.get('main', 'index.js')
            require(isinstance(main, str), 'npm main 类型不符')
            entry = safe_name(target['root']+'/'+(main[2:] if main.startswith('./') else main))
            require(entry in members and members[entry]['bytes'] > 0, 'npm实际入口成员缺失')
            rows.append({'ownerId': owner_id, 'ownerName': owner['name'], 'ownerVersion': owner['version'],
                         'ownerManifestSHA256': owner['manifestSHA256'], 'dependency': name,
                         'declaredRange': manifest['dependencies'][name], 'targetId': target_id,
                         'targetName': target['name'], 'targetVersion': target['version'],
                         'targetManifestSHA256': target['manifestSHA256'], 'actualEntry': members[entry]})
            seen.add(name)
    require(seen == names, '缺少本新产物三类同名npm声明证据')
    return {'status': '真实tar静态边/manifest/成员核验，不是Windows运行', 'rows': rows,
            'targetPackageCodeExecuted': False}


def audit_four(out):
    m = json.loads((out/'capsule-manifest.json').read_bytes())
    b = expected_manifest(m)
    archive = out/'sidecar.tar.gz'
    node = out/'creatoros-server-x86_64-pc-windows-msvc.exe'
    require(archive.stat().st_size == TAR_BYTES and sha_file(archive) == TAR_SHA, '实际 tar 摘要/字节不符')
    require(node.stat().st_size == NODE_BYTES and sha_file(node) == NODE_SHA, '实际外置 Node 不符')
    with open(node, 'rb') as f:
        header = f.read(64)
        require(header[:2] == b'MZ', 'Node 非PE')
        f.seek(int.from_bytes(header[60:64], 'little'))
        require(f.read(6) == b'PE\0\0\x64\x86', 'Node 非Windows x64')
    inv = out/'runtime-inventory.json'
    require(sha_file(inv) == m['inventorySHA256'], 'inventory 文件摘要不符')
    files, captured, count = inspect_tar(archive)
    require(files == json.loads(inv.read_bytes()), 'inventory 与实际 tar 全成员不符')
    require(json.loads(captured['.creatoros-build-input.json']) == b, 'tar 内 metadata 不符')
    summary = captured['.creatoros-validation-layer-summary.json']
    require(len(summary) == 700 and hashlib.sha256(summary).hexdigest() == SUMMARY_SHA, '原 summary 字节不符')
    cli = next(f for f in files if f['path'] == 'cli/node.exe')
    require(cli['sha256'] == NODE_SHA and cli['bytes'] == NODE_BYTES, 'CLI Node 与外置 Node 不同')
    require(any(f['path'] == 'THIRD_PARTY_NOTICES.md' for f in files), '缺许可资源')
    verdict = json.loads(captured['frontend/.next/server/verdict-verify-key.json'])
    require(verdict.get('algorithm') == 'ed25519', 'verdict 公开根算法不符')
    key = base64.urlsafe_b64decode(verdict['publicKeyB64']+'='*((-len(verdict['publicKeyB64']))%4))
    require(len(key) == 32 and hashlib.sha256(key).hexdigest() == VERDICT_SHA, 'tar 实际 verdict 公根不符')
    canvas = canvas_structure(json.loads(captured['frontend/worker-dependency-map.json']), captured, files)
    declared_npm = declared_npm_structure(json.loads(captured['frontend/worker-dependency-map.json']), captured, files)
    return {'status': 'readonly-archive-PASS', 'manifestSHA256': sha_file(out/'capsule-manifest.json'),
            'manifest': m, 'actualTarSHA256': TAR_SHA, 'actualExternalAndCliNodeSHA256': NODE_SHA,
            'regularFiles': len(files), 'directoriesAndFiles': count, 'inventoryEveryMemberMatched': True,
            'originalSummarySHA256': SUMMARY_SHA, 'originalSummary': json.loads(summary),
            'actualVerdictPublicKeySHA256': VERDICT_SHA, 'configRootMetadataMatchesExpected': True,
            'configRuntimeInjectionPendingInstaller': True,
            'BLAKE3': {'claimedByPrepare': TAR_BLAKE3_CLAIM, 'independentLocalCalculationPending': True},
            'canvas': canvas, 'declaredBuiltinNamedNpm': declared_npm, 'packageCodeExecuted': False, 'rootSigning': False}


def old_release_projection(value):
    return {k: value.get(k) for k in ('id', 'tag_name', 'target_commitish', 'draft', 'published_at')} | {
            'assets': [{k: a.get(k) for k in ('id', 'name', 'size', 'state', 'digest')} for a in value.get('assets', [])]}


def validate_draft(value, tag):
    require(value.get('draft') is True and value.get('prerelease') is True
            and value.get('published_at') is None and value.get('tag_name') == tag
            and value.get('target_commitish') == MAIN and type(value.get('id')) is int
            and value['id'] != OLD_RELEASE, '临时 draft 状态/身份不符')


def validate_asset(value, name):
    require(type(value.get('id')) is int and value['id'] != OLD_ASSET
            and value.get('name') == name and value.get('size') == ZIP_BYTES
            and value.get('state') == 'uploaded'
            and value.get('digest') in (None, 'sha256:'+ZIP_SHA), '临时 asset 身份/字节不符')


def save(path, value):
    tmp = path.with_suffix('.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def main():
    os.umask(0o077)
    run_id = validate_context(os.environ)
    base = Path(os.environ['RUNNER_TEMP']).resolve()/('t247-private-relay-'+run_id)
    base.mkdir(mode=0o700)  # 结果未知禁止重入/覆盖；先只读核既有 ID。
    report = {'status': 'preparing', 'phase': 'preflight', 'productSource': SOURCE,
              'controlCommit': os.environ['GITHUB_SHA'], 'transportTarget': MAIN,
              'prepareRunId': PREPARE_RUN, 'artifactId': ARTIFACT, 'ZIP_SHA256': ZIP_SHA,
              'helperSHA256': sha_file(Path(__file__)), 'rootSigning': False, 'runtimeExecuted': False,
              'cleanupPendingLocalFullVerification': True}
    output = base/'audit-and-relay.json'
    start = time.monotonic()
    client = Client(os.environ['GH_TOKEN'])
    def expired(*_):
        raise RelayError('中转原绝对总预算7200s耗尽')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(TOTAL_BUDGET_SECONDS)
    try:
        repo = client.api('')
        require(repo['full_name'] == REPO and repo['private'] is True and repo['default_branch'] == 'main', '仓库形状漂移')
        require(client.api('/git/ref/heads/main')['object']['sha'] == MAIN, 'default main CAS 漂移')
        run, artifact = client.api('/actions/runs/'+str(PREPARE_RUN)), client.api('/actions/artifacts/'+str(ARTIFACT))
        validate_prepare(run, artifact)
        tags_before = client.api('/git/matching-refs/tags/?per_page=100')
        require(len(tags_before) <= 100, '旧 tag 清单需分页审查')
        protected = old_release_projection(client.api('/releases/'+str(OLD_RELEASE)))
        require(any(a['id'] == OLD_ASSET for a in protected['assets']), '旧资产前提漂移')
        report.update({'oldReleaseBefore': protected,
                       'oldTagsBefore': [{'ref': t['ref'], 'object': t['object']} for t in tags_before]})
        save(output, report)
        report['phase'] = 'download-fixed-zip'
        save(output, report)
        archive = base/'artifact-12109873404.zip'
        client.download(archive)
        with open(archive, 'rb') as prefix_file:
            prefix = prefix_file.read(2097152)
        require(len(prefix) == 2097152, '完整ZIP首段缺失')
        report['ZIPPrefix'] = {'bytes': len(prefix), 'SHA256': hashlib.sha256(prefix).hexdigest()}
        report['phase'] = 'audit-fixed-bytes'
        save(output, report)
        members = base/'members'
        extract_four(archive, members)
        report['audit'] = audit_four(members)
        report['phase'] = 'before-create-draft'
        tag = 't247-transfer-39056633545-12109873404-'+run_id
        require(client.api('/releases/tags/'+tag, missing=True) is None
                and client.api('/git/ref/tags/'+tag, missing=True) is None, '临时名称已存在；禁止复用或 clobber')
        require(client.api('/git/ref/heads/main')['object']['sha'] == MAIN, '创建前 main CAS 漂移')
        report['transportTag'] = tag
        save(output, report)
        draft = client.api('/releases', 'POST', {'tag_name': tag, 'target_commitish': MAIN,
                 'name': 'T247 未签临时中转 '+run_id+'（不可交付）',
                 'body': '仅固定 artifact 12109873404 的原 ZIP 中转；未签、未发布、不可安装交付。产品 source '+SOURCE+'；transport target '+MAIN+'。',
                 'draft': True, 'prerelease': True, 'make_latest': 'false', 'generate_release_notes': False})
        report['releaseId'] = draft.get('id')  # 即使后续验证失败也保留已发生的准确对象。
        save(output, report)
        validate_draft(draft, tag)
        require(draft.get('assets') == [], '新 draft 非空，停止防覆盖')
        report['phase'] = 'upload-original-zip'
        save(output, report)
        asset_name = 'artifact-12109873404-1defc50d.zip'
        asset = client.upload(draft['id'], archive, asset_name)
        report['assetId'] = asset.get('id')
        save(output, report)
        validate_asset(asset, asset_name)
        after = client.api('/releases/'+str(draft['id']))
        validate_draft(after, tag)
        require(len(after.get('assets', [])) == 1 and after['assets'][0]['id'] == asset['id'], 'draft 资产集合漂移')
        validate_asset(after['assets'][0], asset_name)
        require(sha_file(archive) == ZIP_SHA and archive.stat().st_size == ZIP_BYTES, '上传后原ZIP漂移')
        require(old_release_projection(client.api('/releases/'+str(OLD_RELEASE))) == protected, '旧 draft 发生漂移；不自动恢复外来变更')
        tags_after = client.api('/git/matching-refs/tags/?per_page=100')
        by_ref = {t['ref']: t['object'] for t in tags_after}
        require(all(by_ref.get(t['ref']) == t['object'] for t in tags_before), '旧 tag 漂移；不自动删除')
        report.update({'status': 'draft-asset-ready-not-published', 'phase': 'complete',
                       'release': old_release_projection(after), 'asset': {k: asset.get(k) for k in ('id', 'name', 'size', 'state', 'digest')},
                       'transportTagActuallyCreated': by_ref.get('refs/tags/'+tag),
                       'oldReleaseAndTagsPreserved': True, 'elapsedSeconds': time.monotonic()-start,
                       'noPublishCall': True, 'noSignatureOrProductExecution': True})
    except Exception as e:
        report.update({'status': 'failed', 'errorType': type(e).__name__,
                       'errorCode': str(e) if isinstance(e, RelayError) else '中转失败，保原材料及已记录ID',
                       'elapsedSeconds': time.monotonic()-start})
    finally:
        signal.alarm(0)
        save(output, report)
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
            f.write('report_path='+str(output)+'\n')
    # 只打印非秘密阶段和稳定ID；完整公开审计报告通过小 artifact 留存。
    print(json.dumps({k: report.get(k) for k in ('status', 'phase', 'releaseId', 'assetId', 'errorType', 'elapsedSeconds')}, ensure_ascii=False))
    return 0 if report['status'] == 'draft-asset-ready-not-published' else 1


if __name__ == '__main__':
    raise SystemExit(main())
