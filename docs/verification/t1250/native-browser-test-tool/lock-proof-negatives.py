"""纯结构TOML反例，绝不启动Cargo/服务/浏览器/模型。"""
from pathlib import Path
import json, hashlib, importlib.util, tempfile, datetime
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('lock_proof',base/'lock-proof.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
owned=Path(tempfile.mkdtemp(prefix='lock-proof-',dir=base/'reviews'))
root={'name':'creatoros-workbench-test','version':'0.0.0'}
prod=[{'name':'same-name','version':'1.0.0','source':'registry+https://example.invalid/test','checksum':'a'*64},{'name':'same-name','version':'2.0.0','source':'registry+https://example.invalid/test','checksum':'b'*64},{'name':'vendor','version':'0.7.2'}]
def write(path,packages):
 text='version = 4\n'
 for package in packages:
  text+='\n[[package]]\n'+''.join(key+' = '+json.dumps(value)+'\n' for key,value in package.items())
 path.write_text(text)
original=owned/'original.lock';write(original,prod)
cases=[('all-original-multi-version',[root,*prod],True),('version-changed',[root,{**prod[0],'version':'1.0.1'}],False),('source-changed',[root,{**prod[0],'source':'registry+https://foreign.invalid/test'}],False),('checksum-changed',[root,{**prod[0],'checksum':'c'*64}],False),('unrecognized-new-package',[root,{'name':'foreign','version':'1.0.0'}],False),('missing-private-root',prod,False),('duplicate-private-root',[root,root,*prod],False),('wrong-private-root-source',[{**root,'source':'registry+https://example.invalid/test'},*prod],False)]
results=[]
for i,(name,packages,expected) in enumerate(cases):
 candidate=owned/(str(i)+'.lock');receipt=owned/(str(i)+'.json');write(candidate,packages)
 try:module.compare(original,candidate,receipt);accepted=True
 except SystemExit as e:assert e.code==1;accepted=False
 assert accepted==expected,name
 results.append({'id':name,'expectedAccepted':expected,'actualAccepted':accepted,'status':'passed'})
output=owned/'result.json';output.write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':hashlib.sha256((base/'lock-proof.py').read_bytes()).hexdigest(),'cases':results,'total':len(results),'passed':len(results),'cargoExecuted':False,'notRuntimeApproval':True},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'output':str(output),'passed':len(results)}))
