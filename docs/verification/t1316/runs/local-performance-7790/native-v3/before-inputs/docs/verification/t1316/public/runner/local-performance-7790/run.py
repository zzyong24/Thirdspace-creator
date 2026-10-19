import pathlib,subprocess,time,json,os,signal,sys
repo=pathlib.Path(__file__).resolve().parents[6];out=repo/'docs/verification/t1316/runs/local-performance-7790';out=out/os.environ.get('T1316_RUN_LABEL','tabs-v2');out.mkdir(parents=True,exist_ok=True)
import hashlib,shutil
rows=[{'path':str(p.relative_to(repo)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in list(pathlib.Path(__file__).parent.rglob('*'))+list((pathlib.Path(__file__).parent.parent/'performance').glob('*.cjs')) if p.is_file()]
for r in rows:
 target=out/'before-inputs'/r['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(repo/r['path'],target);r['snapshotPath']=str(target.relative_to(repo))
(out/'BEFORE_RUN_INPUTS.json').write_text(json.dumps(rows,indent=2)+'\n')
budget=116880;selection='新context首访|同page暖访' if len(sys.argv)<2 else sys.argv[1]
assert '普通单turn' not in selection
cmd=['pnpm','-C','frontend','exec','playwright','test','--config',str(pathlib.Path(__file__).with_name('playwright.config.cjs')),'--grep',selection]
receipt=out/'outer-start.json';receipt.write_text(json.dumps({'command':cmd,'selection':selection,'outerBudgetSeconds':budget,'startedAt':time.time(),'noModelAuthorization':True},ensure_ascii=False,indent=2)+'\n')
env=dict(os.environ,T1316_OUTER_RECEIPT=str(receipt),T1316_PERF_RUN=out.name);start=time.monotonic()
with (out/'tabs.log').open('w') as log:
 p=subprocess.Popen(cmd,cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=p.wait(timeout=budget);expired=False
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGTERM);code=p.wait(timeout=120);expired=True
result={'exitCode':code,'expired':expired,'elapsedSeconds':time.monotonic()-start,'outerBudgetSeconds':budget,'selection':selection};(out/'outer-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result));sys.exit(code)
