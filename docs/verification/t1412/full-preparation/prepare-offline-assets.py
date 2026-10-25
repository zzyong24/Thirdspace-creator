#!/usr/bin/env python3
"""T-1412 单次离线资产准备；不运行测试、构建、浏览器或网络命令。"""
from pathlib import Path
import ctypes, hashlib, json, os, stat, subprocess, tomllib, datetime
ROOT = Path('/Users/zyongzhu/Workbase/Thirdspace-creator')
OUT = ROOT / 'docs/verification/t1412/full-preparation'
STATE = ROOT / 'docs/verification/t1412/clean-validation/state.json'
state_bytes = STATE.read_bytes()
state = json.loads(state_bytes)
TREE = Path(state['tree'])
PRIVATE = Path(state['privateRoot'])
CARGO = PRIVATE / 'cargo-offline-assets'
TARGET = PRIVATE / 'cargo-target-full'
REG = Path('/Users/zyongzhu/.cargo/registry')
CANON = 'index.crates.io-1949cf8c6b5b557f'
MIRROR = 'rsproxy.cn-e3de039b2554c837'
TOOLCHAIN = Path('/Users/zyongzhu/.rustup/toolchains/stable-aarch64-apple-darwin')
sha = lambda b: hashlib.sha256(b).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(name, value):
    p = OUT / name
    assert not p.exists(), f'不覆盖证据: {p}'
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def info(path):
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
libc.clonefile.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
libc.clonefile.restype = ctypes.c_int
clone_log = []
def clone(source, destination, expected_sha=None):
    assert source.is_file() and not source.is_symlink(), str(source)
    assert source.resolve().is_relative_to(REG.resolve()), str(source)
    assert destination.is_relative_to(CARGO), str(destination)
    before = source.read_bytes()
    h = sha(before)
    assert expected_sha is None or h == expected_sha, str(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    assert destination.parent.resolve().is_relative_to(CARGO.resolve())
    assert source.stat().st_dev == destination.parent.stat().st_dev, '跨设备禁止回落普通复制'
    if destination.exists():
        assert not destination.is_symlink() and destination.read_bytes() == before
        action = 'existing-exact'
    else:
        result = libc.clonefile(os.fsencode(source), os.fsencode(destination), 0)
        assert result == 0, (source, destination, ctypes.get_errno())
        action = 'clonefile-success'
    assert sha(destination.read_bytes()) == h
    assert source.read_bytes() == before
    assert (source.stat().st_dev, source.stat().st_ino) != (destination.stat().st_dev, destination.stat().st_ino)
    clone_log.append({'source': str(source), 'destination': str(destination), 'sha256': h, 'bytes': len(before), 'action': action, 'sameDevice': True, 'independentInode': True})
    return clone_log[-1]
assert PRIVATE.is_dir() and TREE.is_dir()
assert PRIVATE.stat().st_dev == REG.stat().st_dev == TREE.stat().st_dev
CARGO.mkdir(mode=0o700, exist_ok=True)
TARGET.mkdir(mode=0o700, exist_ok=True)
assert not list(TARGET.iterdir()), '不得复用旧 target 产物'
assert not (CARGO/'config').exists() and not (CARGO/'config.toml').exists()
assert not (CARGO/'credentials').exists() and not (CARGO/'credentials.toml').exists()
base = {'preparedAt': now(), 'stateSha256': sha(state_bytes), 'tree': str(TREE), 'privateRoot': str(PRIVATE), 'head': subprocess.check_output(['git','-C',str(TREE),'rev-parse','HEAD'], text=True).strip()}
# 已审历史基线；若已有目标不同则失败，不覆盖其他执行者的新观测。
fixtures = []
for rel, expected in [
 ('docs/verification/t1073/worker/ipc-memory-serial-observation.json','dfc479002442577b7076eb81f33b2480ea1bac89ae6780382a8c499ba6b1d305'),
 ('docs/verification/t1073/worker/ipc-memory-parallel-observation.json','a08b03fdb7c9c412a322da547e21dcfa6df07a4a2c88fa8949c433462197e1ef')]:
    source, destination = ROOT/rel, TREE/rel
    b = source.read_bytes()
    assert sha(b) == expected and not source.is_symlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    assert destination.parent.resolve().is_relative_to(TREE.resolve())
    if destination.exists():
        assert not destination.is_symlink() and destination.read_bytes() == b, f'目标已有不同观测: {destination}'
        action = 'existing-exact'
    else:
        with destination.open('xb') as f: f.write(b)
        action = 'exclusive-create'
    assert sha(destination.read_bytes()) == expected
    fixtures.append({'source': str(source), 'destination': str(destination), 'sha256': expected, 'bytes':len(b), 'action':action, 'identity':'历史基线；不是本轮新测观测'})
save('led061-historical-baselines.json', {**base, 'files': fixtures})
packages = {}
locks = []
for rel in ['frontend/src-tauri/Cargo.lock','frontend/src-tauri/src/workbench/Cargo.lock']:
    path = TREE/rel; locks.append(info(path))
    for p in tomllib.loads(path.read_text())['package']:
        if 'source' not in p: continue
        assert p['source'] == 'registry+https://github.com/rust-lang/crates.io-index', p['source']
        key = (p['name'],p['version'])
        assert key not in packages or packages[key]['checksum'] == p['checksum']
        packages[key] = p
public = REG/'index'/CANON/'config.json'
assert json.loads(public.read_text()) == {'dl':'https://static.crates.io/crates','api':'https://crates.io'}
clone(public, CARGO/'registry/index'/CANON/'config.json')
def index_rel(name):
    if len(name)==1:return '1/'+name
    if len(name)==2:return '2/'+name
    if len(name)==3:return '3/'+name[0]+'/'+name
    return name[:2]+'/'+name[2:4]+'/'+name
names = {}
for (name,version),p in packages.items(): names.setdefault(name,[]).append(p)
indexes = []
for name, ps in names.items():
    chosen = None
    for namespace in [CANON,MIRROR]:
        path = REG/'index'/namespace/'.cache'/index_rel(name)
        if not path.is_file():continue
        records = []
        for piece in path.read_bytes().split(b'\x00'):
            if piece.startswith(b'{'): records.append(json.loads(piece))
        if all(any(r.get('vers')==p['version'] and r.get('cksum')==p['checksum'] for r in records) for p in ps):
            chosen = path;break
    assert chosen is not None, f'缺少已锁版本 checksum 对应 index: {name}'
    row = clone(chosen,CARGO/'registry/index'/CANON/'.cache'/index_rel(name))
    indexes.append({'name':name,'versions':[p['version'] for p in ps],**row})
archives = []; missing = []
for (name,version),p in packages.items():
    selected = None
    for namespace in [CANON,MIRROR]:
        path = REG/'cache'/namespace/f'{name}-{version}.crate'
        if path.is_file():
            assert sha(path.read_bytes())==p['checksum'], f'本地归档与锁不符: {path}'
            selected = path;break
    if selected:
        row = clone(selected,CARGO/'registry/cache'/CANON/f'{name}-{version}.crate',p['checksum'])
        archives.append({'name':name,'version':version,'lockChecksum':p['checksum'],**row})
    else:
        sources = [REG/'src'/namespace/f'{name}-{version}' for namespace in [CANON,MIRROR]]
        missing.append({'name':name,'version':version,'lockChecksum':p['checksum'],'sourceDirectoriesPresent':[str(d) for d in sources if d.is_dir()], 'hostTargetRequired':'未运行依赖解析，尚不能判定'})
tools = []
for name in ['cargo','rustc','rustdoc']:
    path = TOOLCHAIN/'bin'/name
    result = subprocess.run([str(path),'--version'],env=state['env'],capture_output=True,text=True)
    assert result.returncode==0
    tools.append({**info(path),'argv':[str(path),'--version'],'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
save('rust-offline-assets.json',{**base,'locks':locks,'cargoHome':str(CARGO),'targetDir':str(TARGET),'toolchain':str(TOOLCHAIN),'tools':tools,'uniqueRegistryVersions':len(packages),'gitDependencies':[],'indexCount':len(indexes),'indexes':indexes,'archiveCount':len(archives),'archiveBytes':sum(r['bytes'] for r in archives),'archives':archives,'missingArchives':missing,'allLockTargetsComplete':not missing,'hostDependencyClosureVerified':False,'cloneReceipts':clone_log,'excluded':['用户 Cargo config/credentials 未读未复制','用户 Git 凭据与配置未读未复制','旧 target 未复制','解压源码未复制；后续 Cargo 可从精确归档自行解压','未运行 cargo metadata/resolve/build/test/fetch']})
# 只定位及散列固定浏览器 bundle，不启动、不下载、不接触 profile 或 .links。
cache = Path('/Users/zyongzhu/Library/Caches/ms-playwright')
core = TREE/'node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core'
assert json.loads((core/'package.json').read_text())['version']=='1.60.0'
metadata = json.loads((core/'browsers.json').read_text())
for name,rev in [('chromium','1223'),('chromium-headless-shell','1223'),('ffmpeg','1011')]:
    assert any(b['name']==name and b['revision']==rev for b in metadata['browsers'])
browser_files=[]; links=[]
for directory in ['chromium-1223','chromium_headless_shell-1223','ffmpeg-1011']:
    asset = cache/directory
    assert asset.is_dir() and not asset.is_symlink()
    assert (asset/'INSTALLATION_COMPLETE').is_file()
    for walk, dirs, files in os.walk(asset,followlinks=False):
        for name in dirs+files:
            p=Path(walk)/name
            if p.is_symlink():
                resolved=p.resolve();assert resolved.is_relative_to(asset) and p.exists(),str(p)
                links.append({'path':str(p),'target':os.readlink(p),'resolved':str(resolved)})
        for name in files:
            p=Path(walk)/name
            if not p.is_symlink():browser_files.append(info(p))
executables = [cache/'chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',cache/'chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',cache/'ffmpeg-1011/ffmpeg-mac']
for p in executables:assert p.is_file() and os.access(p,os.X_OK),str(p)
save('playwright-local-assets.json',{**base,'package':info(core/'package.json'),'browsersMetadata':info(core/'browsers.json'),'packageVersion':'1.60.0','browserRevision':'1223','browserVersion':'148.0.7778.96','cacheRoot':str(cache),'executables':[info(p) for p in executables],'files':browser_files,'symlinks':links,'launched':False,'downloaded':False,'profileOrUserConfigurationRead':False,'optionalCftRoot':str(cache/'chromium-1223')})
assert STATE.read_bytes()==state_bytes,'state.json 被其他执行者更改；需重新核对绑定'
for lock in locks:assert sha(Path(lock['path']).read_bytes())==lock['sha256']
suggestion={**base,'status':'建议增量，尚未由 root 应用','envAdditions':{'PATH':str(TOOLCHAIN/'bin')+':'+state['env']['PATH'],'RUSTC':str(TOOLCHAIN/'bin/rustc'),'RUSTDOC':str(TOOLCHAIN/'bin/rustdoc'),'CARGO_HOME':str(CARGO),'CARGO_TARGET_DIR':str(TARGET),'CARGO_NET_OFFLINE':'true','PLAYWRIGHT_BROWSERS_PATH':str(cache)},'optionalOnlyAfterRootDecision':{'CREATOROS_TEST_CFT_ROOT':str(cache/'chromium-1223')},'doNotSet':['DATABASE_URL','TEST_DATABASE_URL','NODE_PATH','NODE_OPTIONS','RUSTUP_HOME 指向用户目录','CREATOROS_TEST_BROWSER_FIXTURE_BINARY 指向旧产物'],'preservePrivateTmpdir':state['env']['TMPDIR'],'ownedPostgresKeysProvidedOnlyByRoot':['CREATOROS_OWNED_PG_MARKER','CREATOROS_OWNED_PG_NONCE','CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL'],'remaining':['151 个锁版本没有本地归档或源码；包含非本机目标，不能等同于 151 个 full 阻断，本机实际依赖闭包尚未解析','未运行原 full、测试、构建、浏览器，不能宣称这些已通过','若开启 CREATOROS_TEST_CFT_ROOT，须接受并真实执行原有 5 个条件测试；本次没有构建 fixture 或提供未知旧 binary','编译输出实际磁盘峰值未知；未复制旧 target，磁盘不足应保持真实失败，不改门']}
save('suggested-env-delta.json',suggestion)
print(json.dumps({'fixtures':len(fixtures),'archives':len(archives),'indexFiles':len(indexes),'missingLockVersions':len(missing),'browserFiles':len(browser_files),'browserLinks':len(links),'stateUnchanged':True,'cargoHome':str(CARGO)},ensure_ascii=False))
