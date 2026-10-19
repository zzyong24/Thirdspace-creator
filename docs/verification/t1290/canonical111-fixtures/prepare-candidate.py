from pathlib import Path
import json,hashlib,subprocess,os,difflib
b=Path(__file__).resolve().parent;w=Path('/Users/zyongzhu/.codex/worktrees/unified-capability-models/Thirdspace-creator');r=Path('/Users/zyongzhu/.codex/worktrees/unified-editing-integration/Thirdspace-creator');proto=Path(json.loads((b.parents[1]/'t1278/integration-candidate/migration-preflight-revision/PROTOTYPE_BINDING.json').read_text())['prototypeRoot'])
sha=lambda x:hashlib.sha256(x).hexdigest();env=dict(os.environ,GIT_OPTIONAL_LOCKS='0');paths=['backend/src/legacy-source-migration.test.ts','backend/src/legacy-scheduled-job-migration.test.ts','backend/src/migration-convergence.test.ts','frontend/src/server/legacy-frozen-source-read.integration.test.ts'];base=b/'r-stage2-base';payload=b/'candidate';base.mkdir(exist_ok=True);payload.mkdir(exist_ok=True);bases={}
for rel in paths:
 original=subprocess.run(['git','-C',str(r),'show',':2:'+rel],env=env,capture_output=True)
 if original.returncode==0:x=original.stdout
 else:
  x=subprocess.check_output(['git','-C',str(r),'show','HEAD:'+rel],env=env)
  resolved=subprocess.check_output(['git','-C',str(r),'show',':0:'+rel],env=env)
  assert x==resolved,'stage0 must exactly match proven R HEAD stage2 base: '+rel
 p=base/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(x);bases[rel]=sha(x)
raw=(proto/'backend/drizzle/meta/_journal.json').read_bytes();journal=json.loads(raw);old=json.loads((w/'backend/drizzle/meta/_journal.json').read_text());assert len(journal['entries'])==111 and journal['entries'][:110]==old['entries'];assert journal['entries'][110]=={'idx':110,'version':'7','when':1791043200010,'tag':'0137_observability_routing_convergence','breakpoints':True}
(b/'canonical-journal111.json').write_bytes(raw);receipts=[];full=[]
for e in journal['entries']:
 sql=(proto if e['idx']==110 else w)/'backend/drizzle'/(e['tag']+'.sql');data=sql.read_bytes();receipts.append({'hash':sha(data),'created_at':e['when']});full.append(dict(e,sqlSha256=sha(data)))
canonical=json.dumps(receipts,separators=(',',':'),ensure_ascii=False);(b/'ordered-receipts111.json').write_text(canonical+'\n');(b/'sql-inventory111.json').write_text(json.dumps(full,indent=2)+'\n');jsha=sha(raw);lsha=sha(canonical.encode());assert full[110]['sqlSha256']=='d9ffc8a011672cc985015d3f6cafcb693be8b77f33b5f04d6906d25939f80494'
# Three backend candidates preserve all old fixture/negative branches, add only the new exact tail.
rel=paths[0];x=(base/rel).read_text();oldline="expect(ledger.slice(0,oldLedger!.length)).toEqual(oldLedger!);expect(ledger).toHaveLength(oldLedger!.length+6);expect(ledger.slice(oldLedger!.length).map(row=>Number(row.created_at))).toEqual([1791043200003,1791043200004,1791043200005,1791043200006,1791043200008,1791043200009]);expect(ledger.at(-1)?.created_at).toBe(1791043200009);";new=oldline.replace('length+6','length+7').replace('0008,1791043200009]','0008,1791043200009,1791043200010]').replace('at(-1)?.created_at).toBe(1791043200009)','at(110)?.created_at).toBe(1791043200010)');assert x.count(oldline)==1;x=x.replace(oldline,new).replace('当前110尾精确追加','当前111尾精确追加').replace('expect(journal.entries).toHaveLength(110);','expect(journal.entries).toHaveLength(111);');needle=" expect(journal.entries[109]).toEqual({idx:109,version:'7',when:1791043200009,tag:'0136_embedding_identity',breakpoints:true});";assert x.count(needle)==1;x=x.replace(needle,needle+"\n expect(journal.entries[110]).toEqual({idx:110,version:'7',when:1791043200010,tag:'0137_observability_routing_convergence',breakpoints:true});\n expect(digest(await readFile(join(folder,'0137_observability_routing_convergence.sql'),'utf8'))).toBe('d9ffc8a011672cc985015d3f6cafcb693be8b77f33b5f04d6906d25939f80494');");target=payload/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(x)
rel=paths[1];x=(base/rel).read_text();oldline='toEqual([1791043200004,1791043200005,1791043200006,1791043200008,1791043200009]);';assert x.count(oldline)==1;x=x.replace(oldline,'toEqual([1791043200004,1791043200005,1791043200006,1791043200008,1791043200009,1791043200010]);');(payload/rel).write_text(x)
rel=paths[2];x=(base/rel).read_text();x+='''

it('T1278 canonical111完整固定journal与ordered SQL receipts，原110 prefix及bridge身份不漂移',async()=>{
 const raw=await readFile(join(folder,'meta/_journal.json'),'utf8');
 expect(createHash('sha256').update(raw).digest('hex')).toBe('''+repr(jsha)+''');
 const current=JSON.parse(raw) as {entries:Array<{idx:number;version:string;when:number;tag:string;breakpoints:boolean}>};
 expect(current.entries).toHaveLength(111);
 expect(current.entries[109]).toEqual({idx:109,version:'7',when:1791043200009,tag:'0136_embedding_identity',breakpoints:true});
 expect(current.entries[110]).toEqual({idx:110,version:'7',when:1791043200010,tag:'0137_observability_routing_convergence',breakpoints:true});
 const receipts=await Promise.all(current.entries.map(async entry=>({hash:createHash('sha256').update(await readFile(join(folder,entry.tag+'.sql'),'utf8')).digest('hex'),created_at:entry.when})));
 expect(createHash('sha256').update(JSON.stringify(receipts)).digest('hex')).toBe('''+repr(lsha)+''');
 expect(receipts[110]).toEqual({hash:'d9ffc8a011672cc985015d3f6cafcb693be8b77f33b5f04d6906d25939f80494',created_at:1791043200010});
});
''';(payload/rel).write_text(x)
rel=paths[3];x=(base/rel).read_text();oldstock="const currentMigrationInventory={entries:110,journalSha256:'09c6b2044aaa493bfe553c2ec57d6b4d87e0c1c11ba902b69162b36af00466f7',ledgerSha256:'f11c2509971111e253c63856e420aaf7a933c28a66da97f49a9a48104803a9dd'} as const;";assert x.count(oldstock)==1;x=x.replace(oldstock,f"const currentMigrationInventory={{entries:111,journalSha256:'{jsha}',ledgerSha256:'{lsha}'}} as const;").replace('W固定完整110项journal','canonical固定完整111项journal');needle="   expect(currentJournal.entries.at(109)!.tag).toBe('0136_embedding_identity');";assert x.count(needle)==1;x=x.replace(needle,needle+"\n   expect(currentJournal.entries.at(110)!).toEqual({idx:110,version:'7',when:1791043200010,tag:'0137_observability_routing_convergence',breakpoints:true});");target=payload/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(x)
patch=''.join(''.join(difflib.unified_diff((base/rel).read_text().splitlines(True),(payload/rel).read_text().splitlines(True),fromfile='a/'+rel,tofile='b/'+rel))for rel in paths);(b/'01-fixed111-tests.candidate.diff').write_text(patch)
binding={'status':'PREPARED_NOT_RUN','rHead':subprocess.check_output(['git','-C',str(r),'rev-parse','HEAD'],env=env,text=True).strip(),'rMergeHead':subprocess.check_output(['git','-C',str(r),'rev-parse','MERGE_HEAD'],env=env,text=True).strip(),'rStage2Base':bases,'wHead':subprocess.check_output(['git','-C',str(w),'rev-parse','HEAD'],env=env,text=True).strip(),'canonicalEntries':111,'journalSha256':jsha,'orderedReceiptsCompactJsonSha256':lsha,'orderedReceiptsFileSha256':sha((b/'ordered-receipts111.json').read_bytes()),'bridgeSqlSha256':full[110]['sqlSha256'],'candidateFiles':{rel:sha((payload/rel).read_bytes())for rel in paths},'patchSha256':sha(patch.encode()),'frontendInventoryRecheck':'T1286独立recheck待Root；不按本准备签PASS','tests':'NOT-RUN;R source still being serially merged','productionWrites':0};(b/'BINDING.json').write_text(json.dumps(binding,ensure_ascii=False,indent=2)+'\n');print(json.dumps(binding,ensure_ascii=False,indent=2))
