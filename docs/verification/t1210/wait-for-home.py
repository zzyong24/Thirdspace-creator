import time,re
from pathlib import Path
n=Path(__file__).resolve().parent;end=time.monotonic()+1200
while time.monotonic()<end:
 text='\n'.join(p.read_text(errors='replace') for p in [n/'native.stdout.log',n/'native.stderr.log'] if p.exists())
 match=re.search(r'MAIN_PAGE_LOAD_FINISHED http://(?:127\.0\.0\.1|localhost):\d+/(?:\s|$)',text)
 if match:print(match.group().strip(),flush=True);break
 time.sleep(2)
else:raise RuntimeError('1200秒观察内未见真实HTTP首页完成，原日志保留')
