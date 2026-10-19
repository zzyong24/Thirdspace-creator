from pathlib import Path
import hashlib,json,subprocess,os
b=Path(__file__).resolve().parent;r=Path('/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator');env=dict(os.environ,GIT_OPTIONAL_LOCKS='0');stock=json.loads((b/'BINDING.json').read_text());expected=json.loads((b/'ordered-receipts111.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for rel in ['backend/src/db.ts','backend/src/migration-convergence.ts','backend/drizzle/meta/_journal.json']:
 assert b'<<<<<<<'not in(r/rel).read_bytes(),'R仍未完成融合：'+rel
assert sha(r/'backend/drizzle/meta/_journal.json')==stock['journalSha256'],'R必须已实际接固定canonical111'
journal=json.loads((r/'backend/drizzle/meta/_journal.json').read_text());actual=[{'hash':sha(r/'backend/drizzle'/(e['tag']+'.sql')),'created_at':e['when']}for e in journal['entries']];assert actual==expected
assert sha(r/'backend/src/migration-convergence.ts')=='45a81e2ff1ec425b09e3b4a62cb23ac1911a2aaaf8f9ef6e0b7d6acca66f4ea8','不是独审已绑定bridge源；Root应审真实差异后另精确绑定，不能宽松忽略'
rels=['backend/src/db.ts','backend/src/migration-convergence.ts','backend/src/test-fixtures/owned-postgres.ts','backend/drizzle/meta/_journal.json','backend/drizzle/0137_observability_routing_convergence.sql','backend/package.json','backend/tsconfig.json','pnpm-lock.yaml']+[str(q.relative_to(r))for q in(r/'backend/drizzle').glob('*.sql')]
result=json.loads((b/'RUN_BINDING.template.json').read_text());result.update({'status':'FROZEN_FINAL_R_SOURCE','rHead':subprocess.check_output(['git','-C',str(r),'rev-parse','HEAD'],env=env,text=True).strip(),'sourceSha256':{rel:sha(r/rel)for rel in rels},'journalSha256':stock['journalSha256'],'orderedReceiptsSha256':stock['orderedReceiptsCompactJsonSha256'],'fixturesSourceOnlyNoProductionDB':True,'frozenFixtureSha256':{str(q.relative_to(b/'frozen-migration-sql')):sha(q)for q in(b/'frozen-migration-sql').rglob('*')if q.is_file()},'scriptSha256':{name:sha(b/name)for name in ['public-final-r.mts','run-final-r-owned-pg.NOT-RUN.py']}})
# Only deps ports for this evidence harness; use actual R installed locks, no production file mutation.
for name in ['@electric-sql','drizzle-orm']:
 q=b/'node_modules'/name;target=(r/'backend/node_modules'/name).resolve();assert target.exists();assert q.is_symlink();q.unlink();q.symlink_to(target)
(b/'RUN_BINDING.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('只读R source已精确绑定；仅写docs RUN_BINDING，无DB/模型/服务运行。')
