import json, os, re, subprocess, sys, time
from pathlib import Path
label=sys.argv[1]
if not re.fullmatch(r'[a-z0-9-]+',label): raise ValueError('owned run label')
root=Path(__file__).resolve().parent
command=sys.argv[2:]
started=time.time()
with (root/(label+'.log')).open('wb') as log:
    process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    record={'label':label,'command':command,'pid':process.pid,'pgid':process.pid,'startedAt':started,'log':str(root/(label+'.log')),'outerTimeoutSeconds':86400}
    (root/(label+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    try: code=process.wait(timeout=86400)
    except subprocess.TimeoutExpired:
        record['timedOut']=True
        (root/(label+'.json')).write_text(json.dumps(record,indent=2)+'\n')
        raise
record.update(exitCode=code,elapsedSeconds=round(time.time()-started,3))
(root/(label+'.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
sys.exit(code)
