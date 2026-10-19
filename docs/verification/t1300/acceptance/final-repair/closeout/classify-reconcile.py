import pathlib,json,re,hashlib
repo=pathlib.Path(__file__).resolve().parents[6];out=pathlib.Path(__file__).resolve().parent
result=json.loads((out/'reconcile-result.json').read_text());raw=(out/'reconcile.log').read_text();plain=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',raw)
baseline=repo/'docs/verification/t1296/GLOBAL_RECONCILE_COMPARISON.json';old=json.loads(baseline.read_text())['existingKeys'];errors=[]
for line in plain.splitlines():
 if '[ERROR]' not in line:continue
 message=line.split('[ERROR]',1)[1].strip();key=None
 if message.startswith('lesson '):
  m=re.search(r'LED-\d+',message);key=m.group(0) if m else None
 elif message.startswith(('review receipt: ','frontend receipt: ')):key=message.split(': ',1)[1].split(':',1)[0]
 elif message.startswith('backlog-health.mjs:'):key='backlog-health'
 else:key=message.split(':',1)[0]
 errors.append({'key':key,'message':message,'identityInOriginal29':key in old})
keys={x['key'] for x in errors};data={'schema':'t1300-current-reconcile-comparison/v1','actualResult':result,'baselinePath':str(baseline.relative_to(repo)),'baselineSha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),'baseline29Keys':old,'errors':errors,'actualErrorLines':len(errors),'currentUniqueKeys':sorted(keys),'sameIdentityAsOriginal29':sorted(keys&set(old)),'notReportedOriginalKeys':sorted(set(old)-keys),'newIdentityKeys':sorted(keys-set(old)),'sameIdentityDoesNotProveSameCause':True,'subcommandFailureDetailLimit':'原reconcile execSync stdio=ignore，不新增重跑来补造原失败细节','taskCompletion':'不批量complete；新增身份逐项说明/登记，原29不抹'}
(out/'GLOBAL_RECONCILE_COMPARISON.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:data[k] for k in ['actualErrorLines','newIdentityKeys','notReportedOriginalKeys']},ensure_ascii=False))
