from pathlib import Path
import json,subprocess,time,selectors,os,hashlib
repo=Path(__file__).resolve().parents[5];phase=Path('/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7/green-research-v2');d=phase/'diagnostic-final-emission';src=json.loads((d/'REPLAY_INPUT.json').read_text());node='/opt/homebrew/Cellar/node/25.9.0_2/bin/node';cmd=[node,str(repo/'docs/verification/t1334/runtime/preparation-v2/codex-cli.fixture.cjs'),str(d),*src['argv']];started=time.monotonic();p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True,bufsize=1);frames=[];sent=[];nextId=0
steps=[('initialize',{'clientInfo':{'name':'creatoros','title':'CreatorOS','version':'1'},'capabilities':{'experimentalApi':True}}),('config/read',{'includeLayers':False,'cwd':src['threadParams']['cwd']}),('account/read',{'refreshToken':False}),('thread/start',src['threadParams']),('mcpServerStatus/list',{'threadId':'t1334-thread-research','detail':'toolsAndAuthOnly','limit':100,'cursor':None}),('turn/start',src['turnParams'])]
def send(value):p.stdin.write(json.dumps(value,ensure_ascii=False)+'\n');p.stdin.flush();sent.append(value)
def advance():
 global nextId
 if steps:
  method,params=steps.pop(0);nextId+=1;send({'id':nextId,'method':method,'params':params})
advance();sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ);complete=False;error=None
try:
 while time.monotonic()-started<120:
  if not sel.select(1):
   if p.poll() is not None:break
   continue
  line=p.stdout.readline()
  if not line:break
  value=json.loads(line);frames.append(value)
  if value.get('method')=='item/tool/call':
   originalName=value['params']['tool'].replace('_','.',1);reply=next(x for x in src['toolReplies']if x['originalName']==originalName);send({'id':value['id'],'result':{'contentItems':[{'type':'inputText','text':json.dumps(reply['outcome'],ensure_ascii=False,separators=(',',':'))}],'success':reply['success']}})
  elif value.get('method')=='turn/completed':complete=True;break
  elif value.get('id')==nextId and 'method'not in value:advance()
except BaseException as e:error=repr(e)
finally:
 p.stdin.close();p.terminate()
 try:p.wait(timeout=120)
 except subprocess.TimeoutExpired:p.kill();p.wait(timeout=120)
 stderr=p.stderr.read();(d/'stderr.utf8').write_text(stderr);(d/'SENT.json').write_text(json.dumps(sent,ensure_ascii=False,indent=2)+'\n');(d/'FRAMES.json').write_text(json.dumps(frames,ensure_ascii=False,indent=2)+'\n');v={'meaning':'独立离线CLI重放，不是原当时final emission已观察；0Host/0模型/0DB/0网络','command':cmd,'elapsedSeconds':time.monotonic()-started,'finalEmissionSeen':complete,'methods':[x.get('method')for x in frames if x.get('method')],'replayedToolReplyCount':len([x for x in sent if 'result'in x]),'processExitCodeAfterTermination':p.returncode,'error':error,'files':[{'path':str(f),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}for f in [d/'REPLAY_INPUT.json',d/'scenario.json',d/'SENT.json',d/'FRAMES.json',d/'stderr.utf8']]};(d/'RESULT.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');print(json.dumps(v,ensure_ascii=False))
