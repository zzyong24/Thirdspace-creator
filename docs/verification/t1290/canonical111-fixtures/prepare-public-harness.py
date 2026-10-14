from pathlib import Path
import json,shutil
b=Path(__file__).resolve().parent;old=b.parents[1]/'t1278/integration-candidate/migration-preflight-revision';proto=Path(json.loads((old/'PROTOTYPE_BINDING.json').read_text())['prototypeRoot']);fixtures=b/'frozen-migration-sql';fixtures.mkdir(exist_ok=True)
for name in ['old-Main109','old-W110']:
 if not(fixtures/name).exists():shutil.copytree(proto/name,fixtures/name)
x=(old/'public-prototype.mts').read_text();x=x.replace("assert(D.endsWith('/migration-preflight-revision'));","assert(D.endsWith('/canonical111-fixtures'));").replace("'PROTOTYPE_BINDING.json'","'RUN_BINDING.json'").replace('const P=binding.prototypeRoot;','const P=binding.sourceRoot;const F=binding.frozenFixtureRoot;assert(P===binding.requiredRSourceRoot);')
x=x.replace("join(P,'prototype-databases'","join(D,'owned-pglite-data'").replace("seed(join(P,'old-'+c.old))","seed(join(F,'old-'+c.old))")
x=x.replace("let management:any=null;","if(engine==='postgres'&&!red)cases.push({name:'fresh-concurrent',old:null,concurrent:true} as any,{name:'main109-concurrent',old:'Main109',concurrent:true} as any,{name:'w110-concurrent',old:'W110',concurrent:true} as any);\nlet management:any=null;")
needle="   try{publicStore=engine==='postgres'?await createRuntimeDb({connectionString:url}):await createDb({dataDir:dir});}catch(e){error=e;}"
replace="""   try{
    if(c.concurrent){
     // 真实同URL两次公共createRuntimeDb；各自dispose，不把helper同时调用当并发证据。
     const both=await Promise.allSettled([createRuntimeDb({connectionString:url}),createRuntimeDb({connectionString:url})]);
     for(const opened of both)if(opened.status==='fulfilled')await opened.value.pool.end();
     const failed=both.find(opened=>opened.status==='rejected');
     if(failed?.status==='rejected')throw failed.reason;
     row.concurrentPublicOpeners=2;row.bothPublicOpenersSucceeded=true;
    }else publicStore=engine==='postgres'?await createRuntimeDb({connectionString:url}):await createDb({dataDir:dir});
   }catch(e){error=e;}"""
assert needle in x;x=x.replace(needle,replace);x=x.replace("formalScope:'PENDING',formalGate:'NOT-RUN'","formalScope:'FINAL_R_SOURCE_BOUND_RUN_ONLY',formalGate:'NO_MODEL_OR_FUNDS_CLAIM'")
# Bind every import/source before issuing any public factory call.
needle="const {createDb,createRuntimeDb}=await import(pathToFileURL(join(P,'backend/src/db.ts')).href);"
replace="""for(const [relative,expected]of Object.entries(binding.sourceSha256))assert.equal(createHash('sha256').update(await readFile(join(P,relative))).digest('hex'),expected,'final R source changed:'+relative);
assert.equal(binding.status,'FROZEN_FINAL_R_SOURCE');
const {createDb,createRuntimeDb}=await import(pathToFileURL(join(P,'backend/src/db.ts')).href);""";assert needle in x;x=x.replace(needle,replace);(b/'public-final-r.mts').write_text(x)
# Only link immutable installed module ports for this docs harness; no source/DB copied.
modules=b/'node_modules';modules.mkdir(exist_ok=True)
for name in ['@electric-sql','drizzle-orm']:
 q=modules/name
 if not q.exists():q.symlink_to((proto/'backend/node_modules'/name).resolve())
# Driver candidate adopts existing owned PG proof/closure, but clean env and final-R imports.
x=(old/'run-new-owned-pg.py').read_text().replace("'PROTOTYPE_BINDING.json'","'RUN_BINDING.json'").replace("P=Path(B['prototypeRoot'])","P=Path(B['sourceRoot']);assert B['status']=='FROZEN_FINAL_R_SOURCE';assert str(P)==B['requiredRSourceRoot']")
x=x.replace("env={k:v for k,v in os.environ.items() if not k.startswith('PG') and k!='NODE_PG_FORCE_NATIVE'}","env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','HOME':str(D/'owned-home'),'TMPDIR':str(root.parent),'LC_ALL':'C','TSX_DISABLE_CACHE':'1'};Path(env['HOME']).mkdir(exist_ok=True)")
x=x.replace("root=Path(tempfile.mkdtemp(prefix='t1246-owned-pg-')).resolve();","temporary=D/'owned-run-tmp';temporary.mkdir(exist_ok=True);root=Path(tempfile.mkdtemp(prefix='t1246-owned-pg-',dir=temporary)).resolve();")
x=x.replace("'sourceRoot':str(P)","'sourceRoot':str(P),'runBindingSha256':hashlib.sha256((D/'RUN_BINDING.json').read_bytes()).hexdigest()")
x=x.replace("str(P/'backend/public-prototype.mts')","str(D/'public-final-r.mts')")
x=x.replace("'PENDING'","'FINAL_R_SOURCE_BOUND_RUN_ONLY'").replace("'T1278_CANDIDATE_PREFLIGHT_ONLY'","'T1278_FINAL_R_PUBLIC_FACTORY_REAL_OWNED_ONLY'")
(b/'run-final-r-owned-pg.NOT-RUN.py').write_text(x)
(b/'RUN_BINDING.template.json').write_text(json.dumps({'status':'UNBOUND_NOT_RUN','requiredRSourceRoot':'/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator','sourceRoot':'/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator','frozenFixtureRoot':str(fixtures),'purpose':'原15族公共工厂+3PG并发；R正式融合后Root先freeze再串行run，不copy生产DB','sourceSha256':{}},ensure_ascii=False,indent=2)+'\n')
print('完整15族保持，新增fresh/Main109/W110真实PG双公共factory并发fixture；仅准备，NOT-RUN。')
