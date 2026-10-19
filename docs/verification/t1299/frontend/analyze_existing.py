"""只解析已有验收产物；不联网、不启动 App/浏览器、不读取用户库。"""
from pathlib import Path
import collections, datetime, hashlib, json, math, re, zipfile

ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).parent
def stats(values):
    xs=sorted(v for v in values if v is not None and v>=0)
    return {'n':len(xs),'min_ms':xs[0],'median_ms':xs[len(xs)//2],
            'p95_ms':xs[max(0,math.ceil(len(xs)*.95)-1)],'max_ms':xs[-1]} if xs else {'n':0}
def ms(n,unit): return float(n)*{'s':1000,'ms':1,'µs':.001}[unit]
def normalized(url):
    url=re.sub(r'http://127\.0\.0\.1:\d+','',url)
    url=re.sub(r'([?&](?:token|scope|exp)=)[^&]+',r'\1REDACTED',url)
    return re.sub(r'(project|output|artifact|grp|ai-conv|ai-msg|execution-task|ai-task)-[\w-]+',r'\1-ID',url)
def server_log(path):
    rows=[];errors=collections.Counter()
    for line in path.read_text().splitlines():
        line=re.sub(r'\x1b\[[0-9;]*m','',line)
        m=re.search(r' (GET|POST|PUT|DELETE) (\S+) (\d+) in ([\d.]+)(ms|µs|s)',line)
        if m: rows.append({'method':m[1],'url':normalized(m[2]),'status':int(m[3]),'ms':ms(m[4],m[5])})
        if 'DISPATCH_FAILED ' in line:
            try:
                e=json.loads(line.split('DISPATCH_FAILED ',1)[1]);errors[(e.get('operation'),e.get('errorCode'))]+=1
            except ValueError:pass
    groups=collections.defaultdict(list)
    for r in rows:groups[(r['method'],r['url'],r['status'])].append(r['ms'])
    return {'path':str(path.relative_to(ROOT)), 'request_count':len(rows),
        'groups':[{'method':k[0],'url':k[1],'status':k[2],**stats(v)} for k,v in groups.items()],
        'dispatch_failures':[{'operation':k[0],'errorCode':k[1],'count':v} for k,v in errors.items()]}
def trace(path):
    z=zipfile.ZipFile(path);nets=[];actions=[];assertions=[]
    for name in z.namelist():
        if name.endswith('.network'):
            for line in z.read(name).decode().splitlines():
                s=json.loads(line)['snapshot'];q=s['request'];operation=None
                d=q.get('postData',{});text=d.get('text')
                if not text and d.get('_sha1'):
                    try:text=z.read('resources/'+d['_sha1']).decode()
                    except (KeyError,UnicodeDecodeError):pass
                if text and q['url'].split('?')[0].endswith('/api/v1/dispatch'):
                    try:operation=json.loads(text).get('id')
                    except (ValueError,AttributeError):pass
                nets.append({'start_ms':s.get('_monotonicTime'), 'duration_ms':s.get('time'),
                    'from_test_api':s.get('_apiRequest',False),'method':q['method'],
                    'url':normalized(q['url']),'operation':operation,'status':s['response']['status'],
                    'request_fingerprint':hashlib.sha256((text or '').encode()).hexdigest()[:16],
                    'body_size':s['response'].get('content',{}).get('size',-1)})
        if name.endswith('.trace') and name!='test.trace':
            es=[json.loads(l) for l in z.read(name).decode().splitlines()];ends={e['callId']:e for e in es if e.get('type')=='after'}
            for e in es:
                if e.get('type')!='before' or e['callId'] not in ends:continue
                a=ends[e['callId']];row={'method':e['method'],'start_ms':e['startTime'],'end_ms':a['endTime'],
                    'duration_ms':a['endTime']-e['startTime'],'params':e.get('params',{}),'error':a.get('error')}
                if e['method'] in ['goto','reload','click','fill']:actions.append(row)
                if e['method']=='expect':assertions.append(row)
    groups=collections.defaultdict(list)
    for r in nets:groups[(r['from_test_api'],r['operation'] or r['url'],r['status'])].append(r['duration_ms'])
    concurrency=[]
    for r in nets:
        if not r['from_test_api'] and r['operation'] and r['start_ms'] is not None and r['duration_ms']>=0:
            concurrency.extend([(r['start_ms'],1,r['operation']),(r['start_ms']+r['duration_ms'],-1,r['operation'])])
    active=collections.Counter();peaks=collections.Counter()
    for _,delta,op in sorted(concurrency):active[op]+=delta;peaks[op]=max(peaks[op],active[op])
    return {'path':str(path.relative_to(ROOT)),'network_groups':[{'from_test_api':k[0],'operation_or_url':k[1],'status':k[2],**stats(v)} for k,v in groups.items()],
        'browser_operation_peak_inflight':dict(peaks),'actions':actions,'assertions':assertions,'network_rows':nets}

runs={}
for name in ['prepared-e5d626b5ff97ae2d','prepared-78ec5dfefb16c9e9']:
    p=ROOT/'docs/verification/t1298/browser/runs'/name
    r=server_log(p/'next.log');r['task_windows']=[]
    for kind in ['article-reorganize','article-correct','graphic-reorganize','graphic-correct']:
        x=json.loads((p/(kind+'-task.json')).read_text())['task']
        delta=(datetime.datetime.fromisoformat(x['updatedAt'])-datetime.datetime.fromisoformat(x['createdAt'])).total_seconds()*1000
        r['task_windows'].append({'round':kind,'created_to_last_updated_ms':delta,'status':x['status']})
    runs[name]=r
for name in ['prepared-2c06a8f22158b86e','prepared-3b54766676a66d81']:
    path=ROOT/'docs/verification/t1294/browser/runs'/name/'next.log'
    if path.exists():runs['t1294-'+name]=server_log(path)
path=ROOT/'docs/verification/t1298/regression/t1296-initial.log'
if path.exists():runs['t1296-initial']=server_log(path)
traces={}
for p in (ROOT/'docs/verification').glob('t129[468]/**/trace.zip'):
    if any(s in str(p) for s in ['4969bcc','bc5eb415','7a28c6d']):traces[str(p.relative_to(ROOT))]=trace(p)
(OUT/'existing-measurements.json').write_text(json.dumps({'schema':'t1299-existing-frontend-measurements/v1',
    'limitations':['dev:true隔离Next，不等于生产App','action结束不等于首个可交互','task created→updated包括排队/宿主/模型/工具，不等于纯模型耗时','没有FCP/LCP/INP/CPU/RSS采样'],
    'runs':runs,'traces':traces},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'runs':runs,'trace_count':len(traces)},ensure_ascii=False,indent=2))
