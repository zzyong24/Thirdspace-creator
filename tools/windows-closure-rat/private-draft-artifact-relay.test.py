"""只用合成控制面/归档；不调用 API、不访问签名材料、不执行包。"""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('t247_private_relay', Path(__file__).with_name('private-draft-artifact-relay.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def context():
    return {'GITHUB_REPOSITORY': m.REPO, 'GITHUB_REF': 'refs/heads/'+m.BRANCH,
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_SHA': 'a'*40,
            'GITHUB_RUN_ID': '123456', 'RELAY_ONLY': 'windows', 'RELAY_VALIDATE': 'true',
            'RELAY_RAT_RUNTIME': 'false', 'RELAY_RAT_CLOSURE': 'false', 'RELAY_RAT_PACKAGE': 'false',
            'RELAY_CAPSULE_MODE': 'none'}


def manifest():
    return {'contractVersion': 'creatoros-windows-signed-capsule-v1', 'status': 'unsigned-not-distributable',
            'rootId': m.ROOT_ID, 'inventorySHA256': '1'*64,
            'tar': {'sha256': m.TAR_SHA, 'blake3': m.TAR_BLAKE3_CLAIM, 'bytes': m.TAR_BYTES},
            'buildInput': {'contractVersion': 'creatoros-windows-signed-capsule-v1',
                'sourceCommit': m.SOURCE, 'target': 'win32-x64', 'ownedDevices': True,
                'modelBenefits': True, 'licenseProject': 'creatoros', 'verdictPublicKeySHA256': m.VERDICT_SHA,
                'configPublicKeySHA256': m.CONFIG_SHA, 'configKeyId': m.CONFIG_KID,
                'node': {'sha256': m.NODE_SHA, 'bytes': m.NODE_BYTES, 'target': 'win32-x64'},
                'validationLayerSummary': {'sha256': m.SUMMARY_SHA, 'bytes': 700}}}


class ControlTests(unittest.TestCase):
    def test_exact_manual_context(self):
        self.assertEqual(m.validate_context(context()), '123456')

    def test_no_foreign_or_tag_source(self):
        for field, value in [('GITHUB_REPOSITORY', 'other/repo'), ('GITHUB_REF', 'refs/tags/v1'),
                             ('GITHUB_EVENT_NAME', 'push'), ('GITHUB_SHA', 'x'*40)]:
            with self.subTest(field=field), self.assertRaises(m.RelayError):
                x = context(); x[field] = value; m.validate_context(x)

    def test_cannot_accidentally_build_or_consume(self):
        for field, value in [('RELAY_ONLY', 'all'), ('RELAY_VALIDATE', 'false'),
                             ('RELAY_RAT_RUNTIME', 'true'), ('RELAY_RAT_CLOSURE', 'true'),
                             ('RELAY_RAT_PACKAGE', 'true'), ('RELAY_CAPSULE_MODE', 'consume'),
                             ('RELAY_SOURCE', m.SOURCE), ('RELAY_SIGNATURE', 'a'*40)]:
            with self.subTest(field=field), self.assertRaises(m.RelayError):
                x = context(); x[field] = value; m.validate_context(x)

    def test_url_fixed_tls_host_without_credentials(self):
        self.assertEqual(m.blob_url('https://x.blob.core.windows.net/a?q=synthetic'), 'https://x.blob.core.windows.net/a?q=synthetic')
        for url in ['http://x.blob.core.windows.net/a', 'https://evil.invalid/a',
                    'https://x.blob.core.windows.net.evil.invalid/a',
                    'https://user:pw@x.blob.core.windows.net/a', 'https://x.blob.core.windows.net:443/a']:
            with self.subTest(url=url), self.assertRaises(m.RelayError):
                m.blob_url(url)

    def test_exact_product_metadata_not_transport_main(self):
        self.assertEqual(m.expected_manifest(manifest())['sourceCommit'], m.SOURCE)
        for field, value in [('sourceCommit', m.MAIN), ('ownedDevices', False),
                             ('modelBenefits', False), ('licenseProject', 'moving'),
                             ('configPublicKeySHA256', '0'*64)]:
            with self.subTest(field=field), self.assertRaises(m.RelayError):
                x = manifest(); x['buildInput'][field] = value; m.expected_manifest(x)

    def test_metadata_rejects_extra_and_changed_tar_node_summary(self):
        rows = []
        x = manifest(); x['extra'] = True; rows.append(x)
        x = manifest(); x['tar']['sha256'] = '0'*64; rows.append(x)
        x = manifest(); x['buildInput']['node']['bytes'] += 1; rows.append(x)
        x = manifest(); x['buildInput']['validationLayerSummary']['bytes'] += 1; rows.append(x)
        for x in rows:
            with self.subTest(value=x), self.assertRaises(m.RelayError):
                m.expected_manifest(x)

    def test_prepare_rejects_foreign_digest_or_incomplete_run(self):
        run = {'id': m.PREPARE_RUN, 'head_sha': m.SOURCE, 'head_branch': m.BRANCH,
               'event': 'workflow_dispatch', 'status': 'completed', 'conclusion': 'success',
               'repository': {'full_name': m.REPO}}
        art = {'id': m.ARTIFACT, 'name': 't247-unsigned-windows-capsule', 'expired': False,
               'size_in_bytes': m.ZIP_BYTES, 'digest': 'sha256:'+m.ZIP_SHA,
               'workflow_run': {'id': m.PREPARE_RUN, 'head_sha': m.SOURCE}}
        m.validate_prepare(run, art)
        for kind, field, value in [('run', 'status', 'in_progress'), ('run', 'head_sha', m.MAIN),
                                   ('artifact', 'expired', True), ('artifact', 'digest', 'sha256:'+'0'*64),
                                   ('artifact', 'size_in_bytes', m.ZIP_BYTES-1)]:
            with self.subTest(field=field), self.assertRaises(m.RelayError):
                a, b = copy.deepcopy(run), copy.deepcopy(art)
                (a if kind == 'run' else b)[field] = value
                m.validate_prepare(a, b)

    def test_new_draft_only_never_existing_or_published(self):
        x = {'id': 999, 'draft': True, 'prerelease': True, 'published_at': None,
             'tag_name': 't247-transfer-test', 'target_commitish': m.MAIN}
        m.validate_draft(x, 't247-transfer-test')
        for field, value in [('id', m.OLD_RELEASE), ('draft', False), ('published_at', 'now'),
                             ('target_commitish', m.SOURCE), ('tag_name', 'v1.0.0')]:
            with self.subTest(field=field), self.assertRaises(m.RelayError):
                bad = {**x, field: value}; m.validate_draft(bad, 't247-transfer-test')

    def test_asset_exact_original_bytes_and_identity(self):
        x = {'id': 999, 'name': 'artifact-test.zip', 'size': m.ZIP_BYTES,
             'state': 'uploaded', 'digest': 'sha256:'+m.ZIP_SHA}
        m.validate_asset(x, 'artifact-test.zip')
        for field, value in [('id', m.OLD_ASSET), ('name', 'other.zip'), ('size', m.ZIP_BYTES-1),
                             ('state', 'starter'), ('digest', 'sha256:'+'0'*64)]:
            with self.subTest(field=field), self.assertRaises(m.RelayError):
                m.validate_asset({**x, field: value}, 'artifact-test.zip')


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='t247-relay-safe-')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def zipfile(self, extras=(), symlink=False, duplicate=False):
        p = self.root/'fixture.zip'
        with zipfile.ZipFile(p, 'w') as z:
            for name in m.MEMBERS:
                i = zipfile.ZipInfo(name)
                i.external_attr = (stat.S_IFLNK | 0o777) << 16 if symlink else (stat.S_IFREG | 0o600) << 16
                z.writestr(i, b'fixture')
            for name in extras:
                z.writestr(name, b'extra')
            if duplicate:
                z.writestr('capsule-manifest.json', b'duplicate')
        return p

    def test_zip_exact_four_regular_members(self):
        m.extract_four(self.zipfile(), self.root/'out')
        self.assertEqual({p.name for p in (self.root/'out').iterdir()}, set(m.MEMBERS))

    def test_zip_extra_and_escape_rejected_before_extract(self):
        with self.assertRaises(m.RelayError):
            m.extract_four(self.zipfile(extras=('../escape',)), self.root/'out')
        self.assertFalse((self.root/'out').exists())

    def test_zip_symlink_rejected(self):
        with self.assertRaises(m.RelayError):
            m.extract_four(self.zipfile(symlink=True), self.root/'out')

    def test_zip_duplicate_rejected(self):
        with self.assertRaises(m.RelayError):
            m.extract_four(self.zipfile(duplicate=True), self.root/'out')

    def tarfile(self, rows):
        p = self.root/'fixture.tar.gz'
        with tarfile.open(p, 'w:gz') as t:
            for name, link in rows:
                i = tarfile.TarInfo(name)
                if link:
                    i.type = tarfile.SYMTYPE; i.linkname = 'elsewhere'; t.addfile(i)
                else:
                    i.size = 4; t.addfile(i, io.BytesIO(b'test'))
        return p

    def test_tar_stream_hash_and_count(self):
        files, captured, count = m.inspect_tar(self.tarfile([('./file.txt', False)]))
        self.assertEqual(files, [{'path': 'file.txt', 'bytes': 4, 'sha256': hashlib.sha256(b'test').hexdigest()}])
        self.assertEqual(count, 1); self.assertEqual(captured, {})

    def test_tar_escape_rejected(self):
        with self.assertRaises(m.RelayError):
            m.inspect_tar(self.tarfile([('../escape', False)]))

    def test_tar_links_rejected(self):
        with self.assertRaises(m.RelayError):
            m.inspect_tar(self.tarfile([('link', True)]))

    def test_tar_case_duplicate_rejected(self):
        with self.assertRaises(m.RelayError):
            m.inspect_tar(self.tarfile([('same', False), ('SAME', False)]))

    def test_tar_secret_paths_and_node_modules_rejected(self):
        for index, name in enumerate(['x/.env', 'x/node_modules/file', '.ssh/file',
                                      'keys/creatoros-update-root-20260805.pem']):
            with self.subTest(name=name), self.assertRaises(m.RelayError):
                m.inspect_tar(self.tarfile([(name, False)]))


class CanvasStructureTests(unittest.TestCase):
    def fixture(self):
        captured = {}
        nodes = {}
        for ident, name, deps in [('pdf', 'pdf-parse', {'@napi-rs/canvas': 'canvas'}),
                                  ('canvas', '@napi-rs/canvas', {'@napi-rs/canvas-win32-x64-msvc': 'native'}),
                                  ('native', '@napi-rs/canvas-win32-x64-msvc', {})]:
            root = 'frontend/.next/worker-packages/'+ident
            data = json.dumps({'name': name, 'version': '1.0.0'}).encode()
            captured[root+'/package.json'] = data
            nodes[ident] = {'root': root, 'name': name, 'version': '1.0.0',
                            'manifestSHA256': hashlib.sha256(data).hexdigest(), 'dependencies': deps}
        graph = {'schemaVersion': 1, 'nodes': nodes,
                 'entries': {'frontend/runtime/execution-worker.cjs': {'dependencies': {'pdf-parse': 'pdf'}}}}
        files = [{'path': nodes['native']['root']+'/canvas.node', 'bytes': 4, 'sha256': 'a'*64}]
        return graph, captured, files

    def test_actual_owner_edge_is_only_structure_not_native_runtime(self):
        result = m.canvas_structure(*self.fixture())
        self.assertIsNone(result['directExecutionWorkerCanvasEdge'])
        self.assertTrue(result['runtimePending'])
        self.assertEqual(result['pdfParse']['id'], 'pdf')

    def test_manifest_mismatch_rejected(self):
        graph, captured, files = self.fixture()
        graph['nodes']['pdf']['manifestSHA256'] = '0'*64
        with self.assertRaises(m.RelayError):
            m.canvas_structure(graph, captured, files)

    def test_missing_native_file_rejected(self):
        graph, captured, _ = self.fixture()
        with self.assertRaises(m.RelayError):
            m.canvas_structure(graph, captured, [])

    def test_missing_owner_edge_rejected(self):
        graph, captured, files = self.fixture()
        graph['nodes']['pdf']['dependencies'] = {}
        with self.assertRaises(m.RelayError):
            m.canvas_structure(graph, captured, files)


class DeclaredNpmStructureTests(unittest.TestCase):
    def fixture(self):
        nodes, captured, files = {}, {}, []
        for index, name in enumerate(('punycode', 'buffer', 'string_decoder')):
            owner_id, target_id = f'p{index*2:04}', f'p{index*2+1:04}'
            for ident, package in ((owner_id, {'name': 'owner-'+name, 'version': '1', 'dependencies': {name: '1'}}),
                                   (target_id, {'name': name, 'version': '1', 'main': './index.js'})):
                raw = json.dumps(package).encode(); root = 'frontend/.next/worker-packages/'+ident
                nodes[ident] = {'name': package['name'], 'version': '1', 'root': root, 'aliases': [package['name']],
                                'manifestSHA256': hashlib.sha256(raw).hexdigest(), 'dependencies': {name: target_id} if ident == owner_id else {}}
                captured[root+'/package.json'] = raw
                files.append({'path': root+'/index.js', 'bytes': 7, 'sha256': 'a'*64})
        return {'nodes': nodes}, captured, files

    def test_all_three_actual_manifest_edges_and_entry_hashes_reported(self):
        result = m.declared_npm_structure(*self.fixture())
        self.assertEqual({r['dependency'] for r in result['rows']}, {'punycode', 'buffer', 'string_decoder'})
        self.assertTrue(all(r['actualEntry']['sha256'] == 'a'*64 for r in result['rows']))
        self.assertFalse(result['targetPackageCodeExecuted'])

    def test_missing_edge_manifest_or_member_rejects(self):
        for mode in ('edge', 'manifest', 'member'):
            with self.subTest(mode=mode), self.assertRaises(m.RelayError):
                graph, captured, files = self.fixture()
                if mode == 'edge': graph['nodes']['p0000']['dependencies'] = {}
                if mode == 'manifest': captured['frontend/.next/worker-packages/p0001/package.json'] = b'{}'
                if mode == 'member': files = []
                m.declared_npm_structure(graph, captured, files)


if __name__ == '__main__':
    unittest.main(verbosity=2)
