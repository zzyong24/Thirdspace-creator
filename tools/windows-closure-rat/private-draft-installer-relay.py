"""T247 固定H5安装器原ZIP私有中转；只读归档/PE，不运行产品。"""
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

_spec = importlib.util.spec_from_file_location('t247_capsule_transport', Path(__file__).with_name('private-draft-artifact-relay.py'))
_capsule = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_capsule)  # 原模块仅定义函数；__main__守卫不满足。
RelayError = _capsule.RelayError
require = _capsule.require
sha_file = _capsule.sha_file
blob_url = _capsule.blob_url
save = _capsule.save
validate_context = _capsule.validate_context
projection = _capsule.old_release_projection
REPO = _capsule.REPO
BRANCH = _capsule.BRANCH
MAIN = _capsule.MAIN
SOURCE = '76d0ff4749ebe4b08fb81afeb7d36c60de922bd8'
INSTALLER_CONTROL = '9124da4be35a05d7afd120aa64ed31617368385a'
INSTALLER_RUN = 39070212887
ARTIFACT = 12114589734
ZIP_BYTES = 911462588
ZIP_SHA = 'c95d6ea6e08833473341b280415bb5d27d7b8c050d0b253c31aad3bc56e990ee'
EXE_NAME = 'CreatorOS_1.2.0_x64-setup.exe'
EXE_BYTES = 911490104
EXE_SHA = 'fb1bc0cb7a1bec5331cb02625446c1cd1bc0cc7cd5f0f27b8dca4a8c4e9d7c28'
ATTESTATION_SHA = '00867224fc43d2be890ad1c65e9231d2bf51fa88e2f2c58610aed77b408a639a'
PROTECTED_RELEASES = (360969788, 415862230, 415949000, 415988397)
PROTECTED_ASSETS = (492529736, 650740392, 651052687, 651245047)


class InstallerClient(_capsule.Client):
    def download(self, target):
        req = urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/artifacts/'+str(ARTIFACT)+'/zip',
              headers={'Authorization': 'Bearer '+self.token, 'Accept': 'application/vnd.github+json'})
        try:
            self.opener.open(req, timeout=60)
            raise RelayError('artifact API 必须返回302')
        except urllib.error.HTTPError as e:
            require(e.code == 302, 'artifact API 未返回302')
            url = blob_url(e.headers.get('Location', ''))
        # 新请求只含公开 HTTP 头；绝不向 blob 传 GitHub Authorization。
        count = 0
        with self.opener.open(urllib.request.Request(url), timeout=60) as response, open(target, 'xb') as f:
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
        conn = http.client.HTTPSConnection('uploads.github.com', timeout=60)
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


def validate_installer_source(run, artifact):
    require(run.get('id') == INSTALLER_RUN and run.get('head_sha') == INSTALLER_CONTROL
            and run.get('head_branch') == BRANCH and run.get('event') == 'workflow_dispatch'
            and run.get('status') == 'completed' and run.get('conclusion') == 'success'
            and run.get('run_attempt') == 1 and run.get('repository', {}).get('full_name') == REPO,
            '固定H5安装验收run不符')
    require(artifact.get('id') == ARTIFACT and artifact.get('name') == 'desktop-windows-x86_64'
            and artifact.get('expired') is False and artifact.get('size_in_bytes') == ZIP_BYTES
            and artifact.get('digest') == 'sha256:'+ZIP_SHA
            and artifact.get('workflow_run', {}).get('id') == INSTALLER_RUN
            and artifact.get('workflow_run', {}).get('head_sha') == INSTALLER_CONTROL,
            '固定安装器artifact不符')


def inspect_pe(path):
    length = path.stat().st_size
    with path.open('rb') as f:
        dos = f.read(64)
        require(len(dos) == 64 and dos[:2] == b'MZ', '安装器不是PE DOS头')
        offset = struct.unpack_from('<I', dos, 60)[0]
        require(64 <= offset <= length-24, 'PE头偏移越界')
        f.seek(offset)
        header = f.read(24)
        require(header[:4] == b'PE\0\0', 'PE签名错误')
        machine, optional_bytes, characteristics = struct.unpack_from('<H', header, 4)[0], struct.unpack_from('<H', header, 20)[0], struct.unpack_from('<H', header, 22)[0]
        require(machine in (0x14c, 0x8664) and characteristics & 2 and 96 <= optional_bytes <= 4096
                and offset+24+optional_bytes <= length, 'PE COFF结构不符')
        optional = f.read(optional_bytes)
        magic = struct.unpack_from('<H', optional)[0]
        require((machine, magic) in ((0x14c, 0x10b), (0x8664, 0x20b)), 'PE机器与optional头不符')
        subsystem = struct.unpack_from('<H', optional, 68)[0]
        require(subsystem == 2, '安装器不是Windows GUI PE')
        count_offset, directories = (92, 96) if magic == 0x10b else (108, 112)
        require(len(optional) >= count_offset+4, 'PE目录数量缺失')
        count = struct.unpack_from('<I', optional, count_offset)[0]
        certificate = (0, 0)
        if count > 4:
            require(len(optional) >= directories+40, 'PE安全目录缺失')
            certificate = struct.unpack_from('<II', optional, directories+32)
            require((certificate == (0, 0)) or (certificate[0] >= offset+24+optional_bytes
                    and certificate[1] > 0 and sum(certificate) <= length), 'PE证书表越界')
    return {'machine': hex(machine), 'optionalMagic': hex(magic), 'subsystem': subsystem,
            'authenticodeCertificateTablePresent': certificate != (0, 0),
            'signatureTrustVerification': 'not-performed',
            'scope': '仅NSIS外层PE结构，不冒充已安装应用架构/执行验收'}


def audit_installer_zip(archive, destination):
    require(archive.stat().st_size == ZIP_BYTES and sha_file(archive) == ZIP_SHA, '完整安装器ZIP摘要/长度不符')
    with zipfile.ZipFile(archive) as z:
        rows = z.infolist()
        require(len(rows) == 1 and rows[0].filename == EXE_NAME, '安装器ZIP必须恰1固定basename成员')
        item = rows[0]
        mode = item.external_attr >> 16
        require(not item.is_dir() and stat.S_IFMT(mode) in (0, stat.S_IFREG)
                and not item.flag_bits & 1 and item.file_size == EXE_BYTES
                and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), '安装器ZIP成员类型/加密/长度不符')
        destination.mkdir(mode=0o700)  # 仅独占新目录；不覆盖旧成员。
        path = destination/EXE_NAME
        count, digest = 0, hashlib.sha256()
        with z.open(item) as src, path.open('xb') as dst:
            for chunk in iter(lambda: src.read(1024*1024), b''):
                count += len(chunk)
                require(count <= EXE_BYTES, '安装器成员超界')
                digest.update(chunk)
                dst.write(chunk)
        require(count == EXE_BYTES and digest.hexdigest() == EXE_SHA, '完整安装器EXE摘要/长度不符')
    return {'members': [{'path': EXE_NAME, 'bytes': count, 'SHA256': digest.hexdigest(), 'PE': inspect_pe(path)}],
            'sidecarProductSource': SOURCE, 'installerControl': INSTALLER_CONTROL,
            'attestationSHA256': ATTESTATION_SHA, 'packageCodeExecuted': False,
            'codeSigningClaim': '原H5报告codesign=false；本步仅读PE结构'}


def validate_installer_draft(value, tag):
    _capsule.validate_draft(value, tag)
    require(value['id'] not in PROTECTED_RELEASES, '禁止复用旧draft')


def validate_installer_asset(value, name):
    require(type(value.get('id')) is int and value['id'] not in PROTECTED_ASSETS
            and value.get('name') == name and value.get('size') == ZIP_BYTES
            and value.get('state') == 'uploaded'
            and value.get('digest') in (None, 'sha256:'+ZIP_SHA), '安装器临时asset身份不符')


def main():
    os.umask(0o077)
    run_id = validate_context(os.environ)
    base = Path(os.environ['RUNNER_TEMP']).resolve()/('t247-private-installer-relay-'+run_id)
    base.mkdir(mode=0o700)
    report = {'status': 'preparing', 'phase': 'preflight', 'sidecarProductSource': SOURCE,
              'installerControl': INSTALLER_CONTROL, 'relayControl': os.environ['GITHUB_SHA'],
              'transportTarget': MAIN, 'installerRunId': INSTALLER_RUN, 'artifactId': ARTIFACT,
              'ZIP_SHA256': ZIP_SHA, 'ZIPBytes': ZIP_BYTES, 'helperSHA256': sha_file(Path(__file__)),
              'networkHelperSHA256': sha_file(Path(_capsule.__file__)),
              'rootSigning': False, 'runtimeExecuted': False, 'cleanupPendingLocalFullVerification': True}
    output = base/'audit-and-relay.json'
    start = time.monotonic()
    client = InstallerClient(os.environ['GH_TOKEN'])
    def expired(*_):
        raise RelayError('中转总预算1800s超时')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(1800)
    try:
        repo = client.api('')
        require(repo['full_name'] == REPO and repo['private'] is True and repo['default_branch'] == 'main', '仓库形状漂移')
        require(client.api('/git/ref/heads/main')['object']['sha'] == MAIN, 'main CAS漂移')
        validate_installer_source(client.api('/actions/runs/'+str(INSTALLER_RUN)), client.api('/actions/artifacts/'+str(ARTIFACT)))
        tags_before = client.api('/git/matching-refs/tags/?per_page=100')
        require(len(tags_before) <= 100, '旧tag清单需分页')
        protected = {str(i): projection(client.api('/releases/'+str(i))) for i in PROTECTED_RELEASES}
        require(all(any(a['id'] == asset for a in protected[str(release)]['assets']) for release, asset in zip(PROTECTED_RELEASES, PROTECTED_ASSETS)), '旧资产前提漂移')
        report.update({'oldReleasesBefore': protected, 'oldTagsBefore': [{'ref': t['ref'], 'object': t['object']} for t in tags_before]})
        report['phase'] = 'download-fixed-installer-zip'
        save(output, report)
        archive = base/('artifact-'+str(ARTIFACT)+'.zip')
        client.download(archive)
        with archive.open('rb') as f:
            prefix = f.read(2097152)
        require(len(prefix) == 2097152, '完整ZIP首段缺失')
        report['ZIPPrefix'] = {'bytes': len(prefix), 'SHA256': hashlib.sha256(prefix).hexdigest()}
        report['phase'] = 'audit-fixed-installer'
        save(output, report)
        report['audit'] = audit_installer_zip(archive, base/'members')
        tag = 't247-installer-transfer-'+str(INSTALLER_RUN)+'-'+str(ARTIFACT)+'-'+run_id
        require(client.api('/releases/tags/'+tag, missing=True) is None and client.api('/git/ref/tags/'+tag, missing=True) is None, '临时名称已存在；禁止clobber')
        require(client.api('/git/ref/heads/main')['object']['sha'] == MAIN, '创建前main CAS漂移')
        report.update({'phase': 'before-create-draft', 'transportTag': tag})
        save(output, report)
        draft = client.api('/releases', 'POST', {'tag_name': tag, 'target_commitish': MAIN,
                'name': 'T247 H5安装器私有中转 '+run_id+'（未发布）',
                'body': '仅固定artifact '+str(ARTIFACT)+'原ZIP传输；外层H5 '+INSTALLER_CONTROL+'；侧车N '+SOURCE+'。不构建/执行/签名/正式分发。',
                'draft': True, 'prerelease': True, 'make_latest': 'false', 'generate_release_notes': False})
        report['releaseId'] = draft.get('id')
        save(output, report)
        validate_installer_draft(draft, tag)
        require(draft.get('assets') == [], '新draft非空')
        report['phase'] = 'upload-original-installer-zip'
        save(output, report)
        name = 'artifact-'+str(ARTIFACT)+'-'+ZIP_SHA[:8]+'.zip'
        asset = client.upload(draft['id'], archive, name)
        report['assetId'] = asset.get('id')
        save(output, report)
        validate_installer_asset(asset, name)
        after = client.api('/releases/'+str(draft['id']))
        validate_installer_draft(after, tag)
        require(len(after.get('assets', [])) == 1 and after['assets'][0]['id'] == asset['id'], 'draft资产集合漂移')
        validate_installer_asset(after['assets'][0], name)
        require(archive.stat().st_size == ZIP_BYTES and sha_file(archive) == ZIP_SHA, '上传后原ZIP漂移')
        require(all(projection(client.api('/releases/'+release)) == before for release, before in protected.items()), '旧draft资产漂移；不自动恢复')
        tags_after = client.api('/git/matching-refs/tags/?per_page=100')
        by_ref = {t['ref']: t['object'] for t in tags_after}
        require(all(by_ref.get(t['ref']) == t['object'] for t in tags_before), '旧tag漂移；不删除')
        report.update({'status': 'draft-asset-ready-not-published', 'phase': 'complete',
                'release': projection(after), 'asset': {k: asset.get(k) for k in ('id', 'name', 'size', 'state', 'digest')},
                'transportTagActuallyCreated': by_ref.get('refs/tags/'+tag), 'oldAllReleasesAssetsTagsPreserved': True,
                'elapsedSeconds': time.monotonic()-start, 'noPublishCall': True, 'noSignatureOrProductExecution': True})
    except Exception as e:
        report.update({'status': 'failed', 'errorType': type(e).__name__,
                'errorCode': str(e) if isinstance(e, RelayError) else '中转失败，保留原材料与已记录ID',
                'elapsedSeconds': time.monotonic()-start})
    finally:
        signal.alarm(0)
        save(output, report)
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
            f.write('report_path='+str(output)+'\n')
    print(json.dumps({k: report.get(k) for k in ('status', 'phase', 'releaseId', 'assetId', 'errorType', 'elapsedSeconds')}, ensure_ascii=False))
    return 0 if report['status'] == 'draft-asset-ready-not-published' else 1


if __name__ == '__main__':
    raise SystemExit(main())
