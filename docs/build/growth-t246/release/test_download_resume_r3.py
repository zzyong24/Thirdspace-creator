import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

resume=load('resume',ROOT/'collect-external-download-resume-r3.py')
driver=load('driver',ROOT/'deploy-t246-r3.py')

class Recovery(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.body=b'known-local-immutable-test-content'*3
        self.old=self.base/'external-verify/original.partial';self.old.parent.mkdir();self.old.write_bytes(self.body[:20]);self.prefix=self.old.read_bytes()
        self.execution=self.base/'prior.json';self.execution.write_text(json.dumps({'exitCode':2,'collectorSHA256':resume.ORIGINAL_COLLECTOR,'elapsedSeconds':900.5}));(self.old.parent/'curl.stderr.log').write_text('curl: (28) Operation timed out')
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close);self.addCleanup(self.tmp.cleanup)
        for k,v in {'BASE':self.base,'ROOT':self.base/'new','ORIGINAL':self.old,'PRIOR_EXECUTION':self.execution,'SIZE':len(self.body),'SHA':hashlib.sha256(self.body).hexdigest()}.items():self.stack.enter_context(patch.object(resume,k,v))
        self.status='206';self.bad_range=False;self.bad_body=False;self.net_calls=0;actual_run=subprocess.run
        def run(argv,**kwargs):
            if argv[0]=='/bin/cp':return actual_run(argv,**kwargs)
            self.net_calls+=1;self.assertEqual(argv[0],'curl');self.assertIn('--continue-at',argv);self.assertEqual(argv[argv.index('--continue-at')+1],'20');self.assertIn('If-Range: '+resume.ETAG,argv)
            target=Path(argv[argv.index('--output')+1]);target.write_bytes(target.read_bytes()+(b'x'*(len(self.body)-20) if self.bad_body else self.body[20:]))
            hdr=Path(argv[argv.index('--dump-header')+1]);hdr.write_text('HTTP/1.1 '+self.status+' Partial Content\r\nContent-Range: bytes '+('0' if self.bad_range else '20')+'-'+str(len(self.body)-1)+'/'+str(len(self.body))+'\r\nContent-Length: '+str(len(self.body)-20)+'\r\nETag: '+resume.ETAG+'\r\n\r\n')
            return types.SimpleNamespace(returncode=0,stdout=self.status+' '+resume.IP+' 0',stderr='')
        self.stack.enter_context(patch.object(resume.subprocess,'run',side_effect=run))
    def collect(self):
        with contextlib.redirect_stdout(io.StringIO()):resume.collect(resume.digest(self.execution))
    def test_real_clone_append_whole_hash_preserves_original(self):
        self.collect();self.assertEqual(self.old.read_bytes(),self.prefix);self.assertEqual((resume.ROOT/'CreatorOS-e315.dmg').read_bytes(),self.body);j=json.loads((resume.ROOT/'external-download-receipt.json').read_text());self.assertEqual(j['httpStatus'],206);self.assertEqual(j['bytes'],len(self.body));self.assertEqual(j['initialPartialSHA256'],hashlib.sha256(self.prefix).hexdigest())
    def test_range_ignored_http200_never_receipt(self):
        self.status='200'
        with self.assertRaisesRegex(RuntimeError,'STATUS_INVALID'):self.collect()
        self.assertFalse((resume.ROOT/'external-download-receipt.json').exists());self.assertEqual(self.old.read_bytes(),self.prefix)
    def test_wrong_range_never_receipt(self):
        self.bad_range=True
        with self.assertRaisesRegex(RuntimeError,'CONTENT_RANGE_INVALID'):self.collect()
        self.assertEqual(self.old.read_bytes(),self.prefix)
    def test_full_size_wrong_whole_sha_rejected(self):
        self.bad_body=True
        with self.assertRaisesRegex(RuntimeError,'WHOLE_FILE_SHA'):self.collect()
        self.assertFalse((resume.ROOT/'CreatorOS-e315.dmg').exists())
    def test_still_running_or_unproven_original_rejected(self):
        self.execution.write_text(json.dumps({'exitCode':0,'collectorSHA256':resume.ORIGINAL_COLLECTOR,'elapsedSeconds':900}))
        with self.assertRaisesRegex(RuntimeError,'NOT_CONFIRMED_FAILED'):self.collect()
        self.assertEqual(self.net_calls,0)
    def test_total_budget_exhaustion_no_network(self):
        self.execution.write_text(json.dumps({'exitCode':2,'collectorSHA256':resume.ORIGINAL_COLLECTOR,'elapsedSeconds':2300}))
        with self.assertRaisesRegex(RuntimeError,'BUDGET_EXHAUSTED'):self.collect()
        self.assertEqual(self.net_calls,0)
    def test_budget_accounts_prior_and_final_margin(self):
        self.assertEqual(resume.network_budget(900,80),1300)
        with self.assertRaises(RuntimeError):resume.network_budget(float('nan'),0)
    def test_changed_etag_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'ETAG_CHANGED'):resume.verify_response({'content-range':f'bytes 20-{len(self.body)-1}/{len(self.body)}','content-length':str(len(self.body)-20),'etag':'"foreign"'},'206 '+resume.IP+' 0',20)

class Receipt(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)/'receipt.json'
        self.m=json.loads((ROOT/'deploy-manifest-r3.pending.json').read_text());self.m['externalResume'].update(partialBytes=100,partialSHA256='a'*64,priorExecutionSHA256='b'*64)
        a=self.m['asset'];self.value={'url':a['url'],'sha256':a['sha256'],'bytes':a['bytes'],'tlsVerified':True,'externalToOriginHost':True,'collectorSourceSHA256':self.m['externalCollectorSHA256'],'curlRemoteIP':self.m['originIP'],'curlVerifyResult':0,'httpStatus':206,'collectorHostPlatform':'Darwin','transferMode':'range-resume','rangeStart':100,'contentRange':f'bytes 100-{a["bytes"]-1}/{a["bytes"]}','ifRangeETag':self.m['externalResume']['ifRangeETag'],'initialPartialSHA256':'a'*64,'originalFailureExecutionSHA256':'b'*64,'originalPartialPreserved':True,'cumulativeBudgetSeconds':2400,'cumulativeElapsedSeconds':1500}
    def check(self,v=None,m=None):
        self.path.write_text(json.dumps(v or self.value));return driver.validate_external(m or self.m,self.path,driver.digest(self.path))
    def test_valid_real_206_metadata(self):self.check()
    def test_forged_200_wrong_prefix_range_budget_rejected(self):
        for key,value in [('httpStatus',200),('rangeStart',True),('contentRange','bytes 0-0/845127298'),('initialPartialSHA256','c'*64),('originalFailureExecutionSHA256','d'*64),('originalPartialPreserved',False),('cumulativeElapsedSeconds',2401),('cumulativeElapsedSeconds',float('nan'))]:
            with self.subTest(key=key,value=value):
                v=copy.deepcopy(self.value);v[key]=value
                with self.assertRaises(driver.Stop):self.check(v)
    def test_unbound_manifest_rejected(self):
        m=copy.deepcopy(self.m);m['externalResume']['partialBytes']=None
        with self.assertRaisesRegex(driver.Stop,'NOT_FROZEN'):self.check(m=m)

if __name__=='__main__':unittest.main()
