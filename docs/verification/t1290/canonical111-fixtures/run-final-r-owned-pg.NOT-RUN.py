"""仅新建本轮ownedPG；调用候选原型公共createRuntimeDb，finally关闭原PID/socket。"""
from pathlib import Path
import os,json,secrets,socket,subprocess,tempfile,time,sys,hashlib
D=Path(__file__).resolve().parent
B=json.loads((D/'RUN_BINDING.json').read_text());P=Path(B['sourceRoot']);assert B['status']=='FROZEN_FINAL_R_SOURCE';assert str(P)==B['requiredRSourceRoot']
nonce=secrets.token_hex(16);temporary=Path(tempfile.mkdtemp(prefix='t1290-pg-parent-',dir='/private/tmp'));temporary.chmod(0o700);(D/'OWNED_PG_TEMP_PARENT.json').write_text(json.dumps({'root':str(temporary),'uid':os.getuid(),'purpose':'新owned PostgreSQL短Unix socket路径，不连接既有数据库'}));root=Path(tempfile.mkdtemp(prefix='t1246-owned-pg-',dir=temporary)).resolve();root.chmod(0o700);data=root/'data';registry=root/'databases';registry.mkdir(mode=0o700)
role='t1246_'+nonce[:12];env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','HOME':str(D/'owned-home'),'TMPDIR':str(root.parent),'LC_ALL':'C','TSX_DISABLE_CACHE':'1'};Path(env['HOME']).mkdir(exist_ok=True)
env.update(PATH='/opt/homebrew/bin:/usr/bin:/bin',LC_ALL='C',TSX_DISABLE_CACHE='1')
result={'purpose':'T1278_FINAL_R_PUBLIC_FACTORY_REAL_OWNED_ONLY','nonce':nonce,'uid':os.getuid(),'root':str(root),'dataDir':str(data),'formalScope':'FINAL_R_SOURCE_BOUND_RUN_ONLY','formalGate':'NOT-RUN','sourceRoot':str(P),'runBindingSha256':hashlib.sha256((D/'RUN_BINDING.json').read_bytes()).hexdigest()}
server=None;log=None;port=None;markerpath=root/'marker.json'
def command(args,name,timeout=180):
 r=subprocess.run(args,env=env,cwd=D,capture_output=True,text=True,timeout=timeout);(D/name).write_text(r.stdout+r.stderr);assert r.returncode==0,(name,r.returncode);return r
try:
 command(['/opt/homebrew/bin/initdb','-D',str(data),'--username='+role,'--auth-local=trust','--auth-host=trust','--no-locale','--encoding=UTF8'],'owned-pg-initdb.log')
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 assert port not in (5432,55422,55488)
 log=(D/'owned-pg-postgres.log').open('w');server=subprocess.Popen(['/opt/homebrew/bin/postgres','-D',str(data),'-h','127.0.0.1','-p',str(port),'-k',str(root)],env=env,stdout=log,stderr=log)
 result['spawnBirth']=subprocess.check_output(['/bin/ps','-p',str(server.pid),'-o','lstart='],env=env,text=True).strip()
 deadline=time.monotonic()+180;lines=None
 while time.monotonic()<deadline:
  assert server.poll() is None,'OWNED_SERVER_EARLY_EXIT'
  try:
   lines=(data/'postmaster.pid').read_text().splitlines()
   if len(lines)>7 and lines[7].strip()=='ready':break
  except FileNotFoundError:pass
  time.sleep(.1)
 assert lines and lines[7].strip()=='ready','OWNED_START_TIMEOUT'
 assert int(lines[0])==server.pid and lines[1]==str(data) and int(lines[3])==port and lines[4]==str(root) and lines[5]=='127.0.0.1'
 birth=subprocess.check_output(['/bin/ps','-p',str(server.pid),'-o','lstart='],env=env,text=True).strip()
 uid=int(subprocess.check_output(['/bin/ps','-p',str(server.pid),'-o','uid='],env=env,text=True).strip());assert uid==os.getuid()
 binary=Path(subprocess.check_output(['/bin/ps','-p',str(server.pid),'-o','comm='],env=env,text=True).strip()).resolve();assert binary==Path('/opt/homebrew/bin/postgres').resolve()
 marker={'version':1,'task':'T-1246','nonce':nonce,'root':str(root),'dataDir':str(data),'registryDir':str(registry),'uid':uid,'pid':server.pid,'startedUnix':int(lines[2]),'processBirth':birth,'postgresBinary':str(binary),'port':port,'adminRole':role,'managementDatabase':'postgres'}
 markerpath.write_text(json.dumps(marker));markerpath.chmod(0o600);result.update(marker=marker,pid=server.pid,port=port,postmasterMarker=lines)
 env.update(CREATOROS_OWNED_PG_MARKER=str(markerpath),CREATOROS_OWNED_PG_NONCE=nonce,CREATOROS_TEST_POSTGRES_URL=f'postgresql://{role}@127.0.0.1:{port}/postgres',T1278_PREFLIGHT_DOC_ROOT=str(D),T1278_PREFLIGHT_DRIVER='postgres',T1278_PREFLIGHT_ATTEMPT=nonce[:8],T1278_PREFLIGHT_RESULT_NAME='postgres-public-result.json')
 # 禁止任意DATABASE_URL fallback，即使调用方fixture错参也不会连其它库。
 env.pop('DATABASE_URL',None);env.pop('CREATOROS_ISOLATED_PG_URL',None)
 cmd=['node','--import',str((P/'backend/node_modules/tsx/dist/loader.mjs').resolve()),str(D/'public-final-r.mts')]
 with (D/'postgres-public-run.log').open('w') as nodeLog:r=subprocess.run(cmd,cwd=P/'backend',env=env,stdout=nodeLog,stderr=nodeLog,timeout=3600)
 result['nodeExit']=r.returncode;result['status']='PROTOTYPE_FINISHED' if r.returncode==0 else 'FAIL';assert r.returncode==0,'PUBLIC_PROTOTYPE_FAILED'
except BaseException as e:
 result['status']='FAIL';result['failure']=repr(e)
 raise
finally:
 if server and server.poll() is None:
  now=(data/'postmaster.pid').read_text().splitlines();assert int(now[0])==server.pid and now[1]==str(data),'CLOSE_NOT_OWNED'
  assert subprocess.check_output(['/bin/ps','-p',str(server.pid),'-o','lstart='],env=env,text=True).strip()==result.get('marker',{}).get('processBirth',result['spawnBirth']),'PID_REUSED'
  command(['/opt/homebrew/bin/pg_ctl','-D',str(data),'-m','fast','-w','-t','180','stop'],'owned-pg-stop.log')
 if server:
  result['postgresExit']=server.wait(timeout=180);result['pidFileRemoved']=not(data/'postmaster.pid').exists();result['unixSocketRemoved']=not(root/f'.s.PGSQL.{port}').exists();result['socketLockRemoved']=not(root/f'.s.PGSQL.{port}.lock').exists();result['originalPidAbsent']=subprocess.run(['/bin/ps','-p',str(server.pid),'-o','pid='],capture_output=True).returncode!=0
  with socket.socket() as check:check.settimeout(2);result['tcpListenerAbsent']=check.connect_ex(('127.0.0.1',port))!=0
  result['registeredDatabasesRemaining']=len(list(registry.glob('*.json')))
  if log:log.close()
 (D/'OWNED_PG_RESULT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result.get('status'),'nodeExit':result.get('nodeExit'),'postgresExit':result.get('postgresExit'),'cleanup':{k:result.get(k) for k in ['pidFileRemoved','unixSocketRemoved','socketLockRemoved','originalPidAbsent','tcpListenerAbsent','registeredDatabasesRemaining']}},ensure_ascii=False))
