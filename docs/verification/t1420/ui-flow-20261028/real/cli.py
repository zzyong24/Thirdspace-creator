from pathlib import Path
import subprocess,json,re,datetime
ROOT=Path(__file__).parent
GROUP='grp-8fdb2e06-22'
def scrub(value):
 if isinstance(value,list):return [scrub(x) for x in value]
 if isinstance(value,dict):return {k:('[REDACTED]' if re.search(r'(?i)(secret|token|credential|authorization|apiKey)',k) else scrub(v)) for k,v in value.items()}
 if isinstance(value,str):return re.sub(r'(https?://[^\s?"<>]+)\?[^\s"<>]+',r'\1?[REDACTED_QUERY]',value)
 return value
def call(name,op,body,write=False,external=False):
 p=ROOT/(name+'-input.json');p.write_text(json.dumps(body,ensure_ascii=False,indent=2)+'\n')
 args=['creatoros','call',op,'--input','@'+str(p),'--group',GROUP]
 if write:args+=['--apply','--idempotency-key','t1420-real-'+name+'-20261028']
 if external:args+=['--confirm-impact',body.get('params',{}).get('outputId',GROUP)]
 result=subprocess.run(args,capture_output=True,text=True)
 try:v=json.loads(result.stdout)
 except:raise RuntimeError(result.stderr or result.stdout)
 (ROOT/(name+'.json')).write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'response':scrub(v)},ensure_ascii=False,indent=2)+'\n')
 if not v.get('ok'):raise RuntimeError(json.dumps(v.get('error',{}),ensure_ascii=False))
 print(name,'ok',flush=True)
 return v['data']
