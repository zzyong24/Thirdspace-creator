from pathlib import Path
import json,subprocess,hashlib
b=Path(__file__).resolve().parent;j=json.loads((b/'RUN_BINDING.json').read_text());assert j['status']=='FROZEN_FINAL_R_SOURCE';r=Path(j['requiredRSourceRoot']);assert str(r)==j['sourceRoot']
home=b/'owned-home';tmp=b/'owned-run-tmp';home.mkdir(exist_ok=True);tmp.mkdir(exist_ok=True)
env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','HOME':str(home),'TMPDIR':str(tmp),'LC_ALL':'C','TSX_DISABLE_CACHE':'1','T1278_PREFLIGHT_DOC_ROOT':str(b),'T1278_PREFLIGHT_DRIVER':'pglite','T1278_PREFLIGHT_RESULT_NAME':'final-r-pglite-public-result.json','T1278_PREFLIGHT_ATTEMPT':'actual-final-r'}
with(b/'final-r-pglite-public-run.log').open('w')as log:x=subprocess.run([str((r/'backend/node_modules/.bin/tsx').resolve()),str(b/'public-final-r.mts')],cwd=r/'backend',env=env,stdout=log,stderr=subprocess.STDOUT,timeout=3600)
(b/'final-r-pglite-public-run.exit').write_text(str(x.returncode)+'\n');raise SystemExit(x.returncode)
