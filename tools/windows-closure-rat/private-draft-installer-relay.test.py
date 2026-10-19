"""仅合成安装器/控制面，不连网、不运行产品或签名工具。"""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import struct
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

spec = importlib.util.spec_from_file_location('t247_installer_transfer', Path(__file__).with_name('private-draft-installer-relay.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def pe(machine=0x14c):
    data = bytearray(512)
    data[:2] = b'MZ'; struct.pack_into('<I', data, 60, 64)
    data[64:68] = b'PE\0\0'; struct.pack_into('<H', data, 68, machine)
    struct.pack_into('<H', data, 84, 240); struct.pack_into('<H', data, 86, 2)
    struct.pack_into('<H', data, 88, 0x10b if machine == 0x14c else 0x20b)
    struct.pack_into('<H', data, 156, 2)
    return bytes(data)


def source():
    run = {'id':m.INSTALLER_RUN,'head_sha':m.INSTALLER_CONTROL,'head_branch':m.BRANCH,
           'event':'workflow_dispatch','status':'completed','conclusion':'success','run_attempt':1,
           'repository':{'full_name':m.REPO}}
    art = {'id':m.ARTIFACT,'name':'desktop-windows-x86_64','expired':False,
           'size_in_bytes':m.ZIP_BYTES,'digest':'sha256:'+m.ZIP_SHA,
           'workflow_run':{'id':m.INSTALLER_RUN,'head_sha':m.INSTALLER_CONTROL}}
    return run, art


class InstallerRelayTests(unittest.TestCase):
    def test_fixed_installer_source_separates_H5_from_N(self):
        self.assertNotEqual(m.SOURCE,m.INSTALLER_CONTROL)
        m.validate_installer_source(*source())
        for kind,key,value in [('run','head_sha',m.SOURCE),('run','id',m._capsule.PREPARE_RUN),
                ('run','conclusion','failure'),('run','run_attempt',2),('art','id',m._capsule.ARTIFACT),
                ('art','name','t247-unsigned-windows-capsule'),('art','digest','sha256:'+'0'*64),
                ('art','size_in_bytes',m.ZIP_BYTES-1),('art','expired',True)]:
            with self.subTest(key=key),self.assertRaises(m.RelayError):
                r,a=source();(r if kind=='run' else a)[key]=value;m.validate_installer_source(r,a)
        r,a=source();a['workflow_run']['head_sha']=m.SOURCE
        with self.assertRaises(m.RelayError):m.validate_installer_source(r,a)

    def audit(self, directory, rows, expected_exe=None):
        archive=directory/'fixture.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            for name,data,mode in rows:
                item=zipfile.ZipInfo(name);item.external_attr=mode<<16;z.writestr(item,data)
        data=expected_exe if expected_exe is not None else pe()
        with patch.multiple(m,ZIP_BYTES=archive.stat().st_size,ZIP_SHA=m.sha_file(archive),
                EXE_BYTES=len(data),EXE_SHA=hashlib.sha256(data).hexdigest()):
            return m.audit_installer_zip(archive,directory/'members')

    def test_closed_single_member_full_hash_and_pe_without_execution(self):
        with tempfile.TemporaryDirectory() as d:
            result=self.audit(Path(d),[(m.EXE_NAME,pe(),stat.S_IFREG|0o600)])
            self.assertFalse(result['packageCodeExecuted'])
            self.assertEqual(result['members'][0]['PE']['machine'],'0x14c')
            self.assertFalse(result['members'][0]['PE']['authenticodeCertificateTablePresent'])
            self.assertEqual(result['installerControl'],m.INSTALLER_CONTROL)

    def test_duplicate_extra_escape_link_directory_and_wrong_size_reject(self):
        bad=[[(m.EXE_NAME,pe(),stat.S_IFREG|0o600)]*2,
             [(m.EXE_NAME,pe(),stat.S_IFREG|0o600),('extra.txt',b'x',stat.S_IFREG|0o600)],
             [('../'+m.EXE_NAME,pe(),stat.S_IFREG|0o600)],
             [(m.EXE_NAME,pe(),stat.S_IFLNK|0o777)],
             [(m.EXE_NAME+'/',pe(),stat.S_IFDIR|0o700)],
             [(m.EXE_NAME,pe()+b'x',stat.S_IFREG|0o600)]]
        for rows in bad:
            with self.subTest(name=rows[0][0]),tempfile.TemporaryDirectory() as d,self.assertRaises(m.RelayError):
                self.audit(Path(d),rows)

    def test_wrong_exe_digest_and_non_pe_reject(self):
        for data,expected in [(pe()+b'x',pe()+b'y'),(b'x'*512,b'x'*512)]:
            with self.subTest(data=data[:2]),tempfile.TemporaryDirectory() as d,self.assertRaises(m.RelayError):
                self.audit(Path(d),[(m.EXE_NAME,data,stat.S_IFREG|0o600)],expected)

    def test_zip_full_digest_must_match_before_extract(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'x.zip';p.write_bytes(b'not-a-zip')
            with patch.multiple(m,ZIP_BYTES=p.stat().st_size,ZIP_SHA='0'*64),self.assertRaises(m.RelayError):
                m.audit_installer_zip(p,Path(d)/'members')
            self.assertFalse((Path(d)/'members').exists())

    def test_encrypted_member_and_corrupt_crc_reject(self):
        for kind in ('encrypted','crc'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as d:
                p=Path(d)/'fixture.zip'
                with zipfile.ZipFile(p,'w',zipfile.ZIP_STORED) as z:z.writestr(m.EXE_NAME,pe())
                raw=bytearray(p.read_bytes())
                if kind=='encrypted':
                    off=raw.index(b'PK\x01\x02');struct.pack_into('<H',raw,off+8,1)
                else:raw[30+len(m.EXE_NAME)+100]^=1
                p.write_bytes(raw)
                with patch.multiple(m,ZIP_BYTES=len(raw),ZIP_SHA=hashlib.sha256(raw).hexdigest(),EXE_BYTES=512,EXE_SHA=hashlib.sha256(pe()).hexdigest()):
                    with self.assertRaises((m.RelayError,zipfile.BadZipFile,RuntimeError)):
                        m.audit_installer_zip(p,Path(d)/'members')

    def test_PE_machine_optional_offset_and_subsystem_guards(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'pe.exe';p.write_bytes(pe(0x8664));self.assertEqual(m.inspect_pe(p)['machine'],'0x8664')
            cases=[]
            x=bytearray(pe());struct.pack_into('<I',x,60,9999);cases.append(x)
            x=bytearray(pe());struct.pack_into('<H',x,88,0x20b);cases.append(x)
            x=bytearray(pe());struct.pack_into('<H',x,156,3);cases.append(x)
            for x in cases:
                p.write_bytes(x)
                with self.assertRaises(m.RelayError):m.inspect_pe(p)

    def test_protected_drafts_and_assets_cannot_be_reused(self):
        value={'id':999,'draft':True,'prerelease':True,'published_at':None,'tag_name':'nonce','target_commitish':m.MAIN}
        m.validate_installer_draft(value,'nonce')
        for ident in m.PROTECTED_RELEASES:
            with self.assertRaises(m.RelayError):m.validate_installer_draft({**value,'id':ident},'nonce')
        asset={'id':999,'name':'fixed.zip','size':m.ZIP_BYTES,'state':'uploaded','digest':'sha256:'+m.ZIP_SHA}
        m.validate_installer_asset(asset,'fixed.zip')
        for ident in m.PROTECTED_ASSETS:
            with self.assertRaises(m.RelayError):m.validate_installer_asset({**asset,'id':ident},'fixed.zip')
        for key,val in [('draft',False),('published_at','now'),('target_commitish',m.SOURCE)]:
            with self.assertRaises(m.RelayError):m.validate_installer_draft({**value,key:val},'nonce')

    def test_download_uses_installer_ID_and_no_token_on_blob(self):
        payload=b'synthetic';requests=[];budgets=[]
        class Response(io.BytesIO):
            status=200;headers={'Content-Length':str(len(payload))}
        class Opener:
            def open(self,request,timeout):
                requests.append(request);budgets.append(timeout)
                if len(requests)==1:
                    raise urllib.error.HTTPError(request.full_url,302,'redirect',{'Location':'https://x.blob.core.windows.net/a'},None)
                return Response(payload)
        client=object.__new__(m.InstallerClient);client.token='synthetic-only';client.opener=Opener()
        with tempfile.TemporaryDirectory() as d,patch.multiple(m,ZIP_BYTES=len(payload),ZIP_SHA=hashlib.sha256(payload).hexdigest()):
            client.download(Path(d)/'download.zip')
        self.assertIn('/'+str(m.ARTIFACT)+'/zip',requests[0].full_url)
        self.assertIn('Authorization',requests[0].headers)
        self.assertNotIn('Authorization',requests[1].headers)
        self.assertNotIn(str(m._capsule.ARTIFACT),requests[0].full_url)
        self.assertTrue(all(t >= 120 for t in budgets))

    def test_no_main_or_network_on_module_import_and_no_capsule_audit_call(self):
        import ast
        tree=ast.parse(Path(m.__file__).read_text())
        mains=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main'];self.assertEqual(len(mains),1)
        text=ast.get_source_segment(Path(m.__file__).read_text(),mains[0])
        self.assertIn('audit_installer_zip(',text)
        for old in ('audit_four(', 'extract_four(', 'validate_prepare('):self.assertNotIn(old,text)
        self.assertIn("if __name__ == '__main__':",Path(m.__file__).read_text())
        # 原模块不是__main__，import结束也没有实际client/输出目录实例。
        self.assertNotEqual(m._capsule.__name__,'__main__')
        self.assertNotIn('client',vars(m))


class InstallerUploadBudgetTests(unittest.TestCase):
    def test_upload_complete_response_keeps_two_minute_budget(self):
        budgets=[]
        class Response(io.BytesIO): status=201
        class Connection:
            def request(self,*args,**kwargs): pass
            def getresponse(self): return Response(b'{"id":123}')
            def close(self): pass
        def connect(host,timeout): budgets.append(timeout); return Connection()
        client=object.__new__(m.InstallerClient);client.token='synthetic-only'
        with tempfile.TemporaryDirectory() as d,patch.object(m.http.client,'HTTPSConnection',side_effect=connect):
            path=Path(d)/'fixture.zip';path.write_bytes(b'synthetic')
            self.assertEqual(client.upload(123,path,'synthetic.zip'),{'id':123})
        self.assertTrue(all(t >= 120 for t in budgets))


if __name__=='__main__':
    unittest.main()
