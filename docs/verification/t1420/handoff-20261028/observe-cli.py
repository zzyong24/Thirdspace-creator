from pathlib import Path
import argparse,json,re,subprocess,sys,datetime
p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('args',nargs=argparse.REMAINDER);a=p.parse_args()
r=subprocess.run(['/Users/masx/.local/bin/creatoros',*a.args],capture_output=True,text=True)
def scrub(x):
    if isinstance(x,list):return [scrub(v) for v in x]
    if isinstance(x,dict):return {k:('[REDACTED]' if re.search(r'(?i)^(authorization|secret|secretReference|token|apiKey|accessToken|refreshToken)$',k) else scrub(v)) for k,v in x.items()}
    if isinstance(x,str):return re.sub(r'(https?://[^\s?"<>]+)\?[^\s"<>]+',r'\1?[REDACTED_QUERY]',x)
    return x
try:data=scrub(json.loads(r.stdout))
except json.JSONDecodeError:data={'unparsed_stdout':scrub(r.stdout),'stderr':scrub(r.stderr)}
out={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':r.returncode,'response':data}
f=Path(__file__).parent/(a.name+'.json');f.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(str(f));print(json.dumps(data,ensure_ascii=False)[:7000]);sys.exit(r.returncode)
