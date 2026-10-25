"""核对已冻结候选与现安装指纹，再调用仓库原有本地安装函数。"""
from pathlib import Path
import datetime
import hashlib
import json
import plistlib
import subprocess
import tempfile
import time

OUT = Path(__file__).resolve().parent
candidate = json.loads((OUT / 'combined-candidate-manifest.json').read_text())
root = Path(candidate['worktree'])
app = Path('/Applications/CreatorOS.app')
built = root / 'frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app'
dmg = Path.home() / 'Downloads/CreatorOS-1.2.0.dmg'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def freeze_check():
    assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == candidate['candidateCommit'], '候选提交发生变化'
    drift = [p for p, h in candidate['sourceSha256'].items() if sha(root / p) != h]
    assert not drift, ('源码漂移', drift)


def command(args, log):
    with (OUT / log).open('w') as stream:
        result = subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT)
    assert result.returncode == 0, (args[0], result.returncode, log)


freeze_check()
assert sha(app / 'Contents/Resources/sidecar.tar.gz') == candidate['installedSidecarBefore'], '安装版已由其他工作更新，停止替换'
version = plistlib.loads((built / 'Contents/Info.plist').read_bytes())
assert version['CFBundleShortVersionString'] == '1.2.0'
command(['hdiutil', 'verify', str(dmg)], 'dmg-verify.txt')
command(['codesign', '--verify', '--deep', '--strict', str(built)], 'built-app-signature.txt')
expected = {'binary': sha(built / 'Contents/MacOS/CreatorOS'), 'sidecar': sha(built / 'Contents/Resources/sidecar.tar.gz')}
assert expected['sidecar'] != candidate['installedSidecarBefore'], '新包未变化，拒绝以旧包代验'
backup = Path(tempfile.mkdtemp(prefix='creatoros-t1407-rollback-')) / 'CreatorOS.app'
command(['/bin/cp', '-cR', str(app), str(backup)], 'rollback-copy.txt')
assert sha(backup / 'Contents/Resources/sidecar.tar.gz') == candidate['installedSidecarBefore']
receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceDrift': [],
           'sourceFreeze': 'combined-candidate-manifest.json', 'standardCleanCommittedFreeze': True,
           'localHashFreezeException': False, 'dmgPath': str(dmg), 'dmgSha256': sha(dmg),
           'expectedBuiltHashes': expected, 'priorSidecarSha256': candidate['installedSidecarBefore'],
           'rollbackAppPath': str(backup), 'installed': False, 'notarized': False}
(OUT / 'installed-candidate-proof.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
assert sha(app / 'Contents/Resources/sidecar.tar.gz') == candidate['installedSidecarBefore'], '安装前指纹变化，停止'
module = (root / 'frontend/scripts/desktop/package-local.mjs').as_uri()
script = 'import {installAndLaunchLocalMacApp} from '+json.dumps(module)+'; console.log(JSON.stringify(installAndLaunchLocalMacApp({frontendDir:'+json.dumps(str(root / 'frontend'))+'})));'
command(['node', '--input-type=module', '-e', script], 'install-and-launch.txt')
command(['codesign', '--verify', '--deep', '--strict', str(app)], 'installed-app-signature.txt')
actual = {'binary': sha(app / 'Contents/MacOS/CreatorOS'), 'sidecar': sha(app / 'Contents/Resources/sidecar.tar.gz')}
assert actual == expected, '已安装产物与当前构建不同'
receipt.update(installed=True, installedHashes=actual)
for attempt in range(15):
    result = subprocess.run(['creatoros', 'status'], capture_output=True, text=True)
    try:
        status = json.loads(result.stdout)
    except json.JSONDecodeError:
        status = {'ok': False}
    if status.get('ok') and status.get('connected') and status.get('access') == 'full':
        break
    time.sleep(2)
else:
    raise RuntimeError('新App已安装，但公开CLI尚未连通；保留安装证明与原任务，不重提')
freeze_check()
assert sha(app / 'Contents/Resources/sidecar.tar.gz') == expected['sidecar']
receipt.update(cliStatus=status, completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(OUT / 'installed-candidate-proof.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'installed': True, 'dmgSha256': receipt['dmgSha256'], 'hashes': actual, 'cliConnected': True}, ensure_ascii=False), flush=True)
