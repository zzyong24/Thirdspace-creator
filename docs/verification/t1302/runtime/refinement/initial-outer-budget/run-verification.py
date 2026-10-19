from pathlib import Path
import json,os,subprocess,sys,time
r=Path(__file__).resolve().parent
commands=json.loads((r/'commands.json').read_text())
for name in sys.argv[1:]:
 command=commands[name]
 started=time.time()
 with (r/(name+'.log')).open('w') as log:
  try:
   result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=2400,env={**os.environ,'T1302_REFINEMENT_ARTIFACTS':str(r/'final-artifacts'),'T1303_DOM_DIR':str(r/'final-combo-dom')})
   code=result.returncode
  except subprocess.TimeoutExpired:code=124
 (r/(name+'.exit')).write_text(str(code)+'\n')
 print(name,'exit',code,'elapsed',round(time.time()-started,2),flush=True)
