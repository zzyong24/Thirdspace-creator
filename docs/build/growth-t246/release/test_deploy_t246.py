import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import hashlib
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('t246', Path(__file__).with_name('deploy-t246.py'))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
h = lambda b: hashlib.sha256(b).hexdigest()

class Delivery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.cert = self.root/'live'; self.cert.mkdir()
        self.links = {n: '../../archive/'+d.DOMAIN+'/'+n.replace('.pem','1.pem') for n in ['cert.pem','chain.pem','fullchain.pem','privkey.pem']}
        for name, target in self.links.items(): (self.cert/name).symlink_to(target)
        self.nginx = self.root/'nginx.conf'; self.nginx.write_text('creatoros-only')
        self.renew = self.root/'renew.conf'; self.renew.write_text('authenticator = nginx\ninstaller = nginx\nserver = https://acme-v02.api.letsencrypt.org/directory\n')
        self.cache = self.root/'cache.dmg'; self.cache.write_bytes(b'synthetic-dmg')
        self.asset = self.root/'new.dmg'
        self.pointers = []
        for i in range(2):
            p = self.root/f'pointer{i}'; p.write_bytes(f'old{i}'.encode());p.chmod(0o644)
            candidate = self.root/f'candidate{i}';candidate.write_bytes(f'new{i}'.encode())
            self.pointers.append({'name':f'p{i}','path':str(p),'candidate':str(candidate),'before':h(p.read_bytes()),'after':h(candidate.read_bytes()),'uid':os.getuid(),'gid':os.getgid(),'mode':0o644,'host':d.DOMAIN,'urlPath':'/'})
        self.legacy = self.root/'legacy.tar'; self.legacy.write_bytes(b'old-updater-untouched')
        self.m = {'asset':{'cache':str(self.cache),'path':str(self.asset),'url':'https://'+d.DOMAIN+'/new.dmg','sha256':h(self.cache.read_bytes()),'bytes':self.cache.stat().st_size},'nginxSHA256':d.digest(self.nginx),'renewalSHA256':d.digest(self.renew),'certificateBeforeLinks':self.links,'pointers':self.pointers,'preserve':[{'path':str(self.legacy),'sha256':d.digest(self.legacy)}]}
        self.m.update(externalCollectorSHA256='test-collector',originIP='152.136.151.58')
        self.global_config = self.root/'cli.ini'; self.global_config.write_text('# no hooks\n')
        self.hook_dirs = [self.root/('hooks-'+n) for n in ['pre','post','deploy']]
        for folder in self.hook_dirs:folder.mkdir()
        self.m['certbotHookGuard']={'configs':[{'path':str(self.global_config),'sha256':d.digest(self.global_config)},{'path':str(self.root/'absent-cli.ini'),'sha256':None}],'directories':[{'path':str(folder),'entries':[]}for folder in self.hook_dirs]}
        self.attempt = self.root/'attempt'
        for target, value in [('NGINX', self.nginx),('RENEWAL',self.renew),('CERT_DIR',self.cert)]:
            p=patch.object(d,target,value);p.start();self.addCleanup(p.stop)
        for target,value in [('strict_tls',lambda:{'sha256':'new-cert','strictChainAndHostname':True}),('config_snapshot',lambda:{str(self.nginx):d.digest(self.nginx)}),('public_pointers',self.public_check)]:
            p=patch.object(d,target,value);p.start();self.addCleanup(p.stop)
        p=patch.object(d.os,'geteuid',return_value=0);p.start();self.addCleanup(p.stop)
        p=patch.object(d.subprocess,'run',return_value=SimpleNamespace(returncode=1));p.start();self.addCleanup(p.stop)
        self.calls=[]
        self.fault=None
        self._real_invoke=d.invoke
        p=patch.object(d,'invoke',self.native);p.start();self.addCleanup(p.stop)
        original_chown=os.fchown
        p=patch.object(d.os,'fchown',lambda fd,uid,gid: original_chown(fd,os.getuid(),os.getgid()));p.start();self.addCleanup(p.stop)
    def native(self, argv, log=None):
        self.calls.append(argv)
        if argv[0]=='certbot':
            self.assertEqual(argv[:4],['certbot','renew','--cert-name',d.DOMAIN])
            self.assertEqual(argv.count('--cert-name'),1)
            if '--dry-run' in argv:
                if self.fault=='dry-config':self.nginx.write_text('unexpected-config')
                return b''
            if self.fault=='renew-error':raise d.Stop('SIMULATED_ACME_FAILURE')
            for n in self.links:
                p=self.cert/n;p.unlink();p.symlink_to(self.links[n].replace('1.pem','2.pem'))
            self.renew.write_text(self.renew.read_text()+'# native metadata update\n')
        return b''
    def public_check(self,m,after):
        for item in m['pointers']:d.expect(item['path'],item['after' if after else 'before'])
    def stage(self):return d.stage(self.m,self.attempt)
    def external(self, **change):
        data={'url':self.m['asset']['url'],'sha256':self.m['asset']['sha256'],'bytes':self.m['asset']['bytes'],'tlsVerified':True,'externalToOriginHost':True,'collectorSourceSHA256':'test-collector','curlRemoteIP':'152.136.151.58','curlVerifyResult':0,'httpStatus':200,'collectorHostPlatform':'Darwin'};data.update(change)
        p=self.root/'external.json';p.write_text(json.dumps(data));return p,d.digest(p)
    def test_real_files_stage_then_activate_keeps_legacy(self):
        self.assertEqual(self.stage()['state'],'asset-ready-awaiting-external-hash')
        for item in self.pointers:d.expect(item['path'],item['before'])
        p,sha=self.external();out=d.activate(self.m,self.attempt,p,sha)
        self.assertEqual(out['state'],'manual-download-ready');d.unchanged_legacy(self.m)
        self.assertEqual(len([x for x in self.calls if x[0]=='certbot']),2)
    def test_asset_immutable_and_idempotent(self):
        self.assertTrue(d.publish_asset(self.m['asset']));self.assertFalse(d.publish_asset(self.m['asset']))
        self.asset.write_bytes(b'foreign')
        with self.assertRaises(d.Stop):d.publish_asset(self.m['asset'])
        self.assertEqual(self.asset.read_bytes(),b'foreign')
    def test_changed_candidate_bytes_refuse_before_replace(self):
        item=self.pointers[0]
        with self.assertRaisesRegex(d.Stop,'CONTENT_BINDING'):d.replace_pointer(item,item['before'],b'foreign')
        d.expect(item['path'],item['before'])
    def test_after_rename_fsync_error_restores_actual_after(self):
        self.stage();p,sha=self.external();original=d.sync_dir;once=[False]
        def fault(path):
            if not once[0] and d.digest(self.pointers[0]['path'])==self.pointers[0]['after']:
                once[0]=True;raise OSError('directory-fsync-after-rename')
            return original(path)
        with patch.object(d,'sync_dir',fault),self.assertRaises(OSError):d.activate(self.m,self.attempt,p,sha)
        self.assertTrue(once[0]);self.assertEqual(json.loads((self.attempt/'receipt.json').read_text())['state'],'pointers-restored')
        self.public_check(self.m,False);d.expect(self.asset,self.m['asset']['sha256'])
    def test_foreign_pointer_refuses_recovery_overwrite(self):
        self.stage();self.asset.exists();p,sha=self.external();Path(self.pointers[1]['path']).write_bytes(b'foreign')
        with self.assertRaises(d.Stop):d.activate(self.m,self.attempt,p,sha)
        self.assertEqual(Path(self.pointers[1]['path']).read_bytes(),b'foreign')
        self.assertEqual(json.loads((self.attempt/'receipt.json').read_text())['state'],'manual-recovery')
    def test_external_tls_scope_hash_all_required(self):
        for change in [{'tlsVerified':False},{'externalToOriginHost':False},{'bytes':1},{'sha256':'bad'},{'url':'http://bad'},{'collectorSourceSHA256':'foreign-source'},{'curlRemoteIP':'1.2.3.4'},{'curlVerifyResult':10},{'httpStatus':302},{'collectorHostPlatform':'Linux'}]:
            with self.subTest(change=change):
                p,sha=self.external(**change)
                with self.assertRaises(d.Stop):d.validate_external(self.m,p,sha)
    def test_dryrun_configuration_drift_is_manual_and_no_asset(self):
        self.fault='dry-config'
        with self.assertRaises(d.Stop):self.stage()
        self.assertFalse(self.asset.exists());self.public_check(self.m,False)
        self.assertEqual(self.nginx.read_text(),'unexpected-config')
        self.assertEqual(json.loads((self.attempt/'receipt.json').read_text())['state'],'manual-recovery')
    def test_acme_failure_never_activates_entry(self):
        self.fault='renew-error'
        with self.assertRaises(d.Stop):self.stage()
        self.assertFalse(self.asset.exists());self.public_check(self.m,False)
        self.assertEqual(json.loads((self.attempt/'receipt.json').read_text())['state'],'manual-recovery')
    def test_public_validation_failure_restores_only_our_pointers(self):
        self.stage();p,sha=self.external();calls=[]
        def fail_after(m,after):
            calls.append(after)
            if after:raise d.Stop('SYNTHETIC_PUBLIC_BODY_MISMATCH')
            self.public_check(m,after)
        with patch.object(d,'public_pointers',fail_after),self.assertRaises(d.Stop):d.activate(self.m,self.attempt,p,sha)
        self.assertEqual(calls,[True,False]);self.public_check(self.m,False);d.unchanged_legacy(self.m)
    def test_certificate_changed_after_staging_is_not_activated(self):
        self.stage();p,sha=self.external()
        with patch.object(d,'strict_tls',return_value={'sha256':'foreign-cert'}),self.assertRaises(d.Stop):d.activate(self.m,self.attempt,p,sha)
        self.public_check(self.m,False)
        self.assertEqual(json.loads((self.attempt/'receipt.json').read_text())['state'],'manual-recovery')
    def test_backup_fsync_failure_keeps_all_pointers_before(self):
        original=d.os.fsync;once=[False]
        def fail_backup(fd):
            if not once[0] and os.fstat(fd).st_size==4:
                once[0]=True;raise OSError('synthetic-backup-fsync')
            return original(fd)
        with patch.object(d.os,'fsync',fail_backup),self.assertRaises(OSError):self.stage()
        self.assertTrue(once[0]);self.public_check(self.m,False);self.assertFalse(self.asset.exists())
        self.assertEqual(json.loads((self.attempt/'receipt.json').read_text())['state'],'manual-recovery')
        self.assertFalse(any(c[0]=='certbot' for c in self.calls))
    def test_new_directory_hook_refuses_before_any_renewal(self):
        (self.hook_dirs[0]/'new-hook').write_text('synthetic-never-executed')
        with self.assertRaisesRegex(d.Stop,'DIRECTORY_HOOK'):self.stage()
        self.assertFalse(self.attempt.exists());self.assertFalse(self.calls)
    def test_nonempty_lineage_hook_refuses_even_if_config_hash_matches(self):
        self.renew.write_text(self.renew.read_text()+'pre_hook = synthetic-never-executed\n')
        self.m['renewalSHA256']=d.digest(self.renew)
        with self.assertRaisesRegex(d.Stop,'LINEAGE_HOOK'):self.stage()
        self.assertFalse(self.attempt.exists());self.assertFalse(self.calls)
    def test_native_capture_is_durable_and_nonzero_is_not_pass(self):
        import sys
        # 仅本机自有Python进程，恢复真实invoke；不执行Certbot或Nginx。
        original = self._real_invoke
        log=self.root/'child.log'
        original([sys.executable,'-c','print("synthetic-only")'],log)
        self.assertEqual(log.read_bytes(),b'synthetic-only\n')
        with self.assertRaisesRegex(d.Stop,'COMMAND_FAILED'):
            original([sys.executable,'-c','raise SystemExit(3)'],self.root/'child-fail.log')
    def test_original_legacy_change_is_not_overwritten(self):
        self.legacy.write_bytes(b'foreign-legacy')
        with self.assertRaises(d.Stop):self.stage()
        self.assertFalse(self.attempt.exists());self.assertEqual(self.legacy.read_bytes(),b'foreign-legacy')

if __name__=='__main__':unittest.main()
