import pathlib,hashlib,json,sys
root=pathlib.Path(__file__).resolve().parents[4]
out=pathlib.Path(__file__).resolve().parent/sys.argv[1]
out.mkdir(parents=True,exist_ok=False)
files=['backend/src/modules/ai/daily-topic-completion.service.ts','frontend/src/server/persistence-client.ts','frontend/src/server/__module_integration__/daily-topic-supply.persistence-client.test.ts','backend/src/integration/daily-topic-completion.test.ts','backend/src/modules/ai/daily-topic-completion.service.test.ts','docs/verification/t1309/runtime/frontend.vitest.config.ts','docs/verification/t1309/runtime/backend.vitest.config.ts','docs/verification/t1309/runtime/automation-equivalent.test.ts','docs/verification/t1309/runtime/automation-equivalent.vitest.config.ts']
rows=[]
for path in files:
 data=(root/path).read_bytes();name=path.replace('/','__');(out/name).write_bytes(data);rows.append({'path':path,'snapshot':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(out/'INDEX.json').write_text(json.dumps({'phase':'pre-run exact snapshots','files':rows},ensure_ascii=False,indent=2)+'\n')
print('已保存完整运行前快照',out.name)
