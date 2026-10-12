"""真实 TOML 结构投影与生产锁包集比对；只写调用方指定 owned 新文件。"""
import sys, json, tomllib
from pathlib import Path


def read_lock(path):
    parsed = tomllib.loads(Path(path).read_text())
    if set(parsed) != {'version', 'package'} or not isinstance(parsed['version'], int) or not isinstance(parsed['package'], list):
        raise ValueError('UNSUPPORTED_ACTUAL_LOCK_STRUCTURE')
    return parsed


def identity(package):
    if not isinstance(package.get('name'), str) or not isinstance(package.get('version'), str):
        raise ValueError('INVALID_ACTUAL_PACKAGE_IDENTITY')
    for key in ('source', 'checksum'):
        if key in package and not isinstance(package[key], str):
            raise ValueError('INVALID_ACTUAL_PACKAGE_' + key.upper())
    return tuple(package.get(key) for key in ('name', 'version', 'source', 'checksum'))


def seed(original, main_manifest, private_manifest, output, receipt):
    locked = read_lock(original)
    main = tomllib.loads(Path(main_manifest).read_text())
    private = tomllib.loads(Path(private_manifest).read_text())
    root_matches = [p for p in locked['package'] if p['name'] == main['package']['name'] and p['version'] == main['package']['version'] and 'source' not in p]
    if len(root_matches) != 1:
        raise ValueError('UNIQUE_ACTUAL_MAIN_ROOT_REQUIRED')
    main_root = root_matches[0]
    names = set(private['dependencies'])
    for target in private.get('target', {}).values():
        names.update(target.get('dependencies', {}))
    # Cargo lock dependency references preserve the original complete string,
    # including explicit multi-version/source disambiguation. No version guess.
    references = [value for value in main_root['dependencies'] if value.split(' ', 1)[0] in names]
    if {value.split(' ', 1)[0] for value in references} != names:
        raise ValueError('ALL_PRIVATE_DIRECT_DEPS_MUST_HAVE_ACTUAL_MAIN_REFERENCE')
    private_root = {'name': private['package']['name'], 'version': private['package']['version'], 'dependencies': sorted(references)}
    if identity(private_root) != ('creatoros-workbench-test', '0.0.0', None, None):
        raise ValueError('EXACT_PRIVATE_TEST_ROOT_REQUIRED')
    projected = {'version': locked['version'], 'package': [private_root if p is main_root else p for p in locked['package']]}
    lines = ['# 私有测试seed：生产package原事实保留，仅私有root/direct-deps投影。', 'version = ' + str(projected['version'])]
    for package in projected['package']:
        lines.append('\n[[package]]')
        for key, value in package.items():
            if not isinstance(value, (str, list)) or (isinstance(value, list) and any(not isinstance(item, str) for item in value)):
                raise ValueError('UNSUPPORTED_PACKAGE_FIELD_TYPE')
            lines.append(key + ' = ' + json.dumps(value, ensure_ascii=False))
    result = '\n'.join(lines) + '\n'
    if tomllib.loads(result) != projected:
        raise ValueError('STRUCTURAL_SEED_ROUNDTRIP_FAILED')
    with Path(output).open('x') as stream:
        stream.write(result)
    facts = {'seedGenerated': True, 'packages': len(projected['package']), 'originalMainRoot': identity(main_root), 'privateRoot': identity(private_root), 'directDependencyReferences': references, 'nonRootPackagesExactlyPreserved': all(identity(p) in {identity(old) for old in locked['package']} for p in projected['package'] if p is not private_root), 'notProductionLock': True}
    with Path(receipt).open('x') as stream:
        json.dump(facts, stream, ensure_ascii=False, indent=2)
    print(json.dumps(facts, ensure_ascii=False))


def compare(original, generated, receipt):
    main = read_lock(original)
    actual = read_lock(generated)
    allowed = {identity(p) for p in main['package']}
    roots = [p for p in actual['package'] if identity(p) == ('creatoros-workbench-test', '0.0.0', None, None)]
    differences = [identity(p) for p in actual['package'] if identity(p) not in allowed and identity(p) != ('creatoros-workbench-test', '0.0.0', None, None)]
    accepted = len(roots) == 1 and not differences
    facts = {'accepted': accepted, 'originalPackageCount': len(main['package']), 'actualPackageCount': len(actual['package']), 'privateRootCount': len(roots), 'differences': differences, 'differenceCount': len(differences), 'comparisonFields': ['name', 'version', 'source', 'checksum'], 'productionSubsetConfirmed': accepted, 'noBuildPermissionOnMismatch': True}
    with Path(receipt).open('x') as stream:
        json.dump(facts, stream, ensure_ascii=False, indent=2)
    print(json.dumps(facts, ensure_ascii=False))
    if not accepted:
        raise SystemExit(1)


if __name__ == '__main__':
    mode, *args = sys.argv[1:]
    if mode == 'seed':
        seed(*args)
    elif mode == 'compare':
        compare(*args)
    else:
        raise ValueError('EXPLICIT_LOCK_PROOF_MODE_REQUIRED')
