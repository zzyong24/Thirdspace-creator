import json,subprocess,sys,re
from pathlib import Path
run=sys.argv[1] if len(sys.argv)>1 else '41473263553'
repo='zzyong24/Thirdspace-creator'
def gh(*args):return json.loads(subprocess.check_output(['gh',*args],text=True))
r=gh('run','view',run,'--repo',repo,'--json','status,conclusion,headSha,url,jobs')
a=gh('api',f'repos/{repo}/actions/runs/{run}/artifacts')['artifacts']
common=['打包(release.mjs 全链)','清理本次CI临时签名密钥','收集用户安装包(T-492)','上传已生成的安装包（额外验收不阻断）','校验 Chromium 已打进 sidecar','校验 updater 产物']
extra={'darwin':['macOS Developer ID、公证与 Gatekeeper 门','macOS sidecar 可搬运归档与解压后签名门','macOS 真启动与主页面加载冒烟'], 'windows':['校验 Windows 安装包 tarball 化','Windows 安装期 runtime 原生冒烟','Windows 已安装 runtime verdict 只读泄漏扫描','Windows 安装后真启动与主页面加载冒烟','Windows 主动卸载清理冒烟']}
items=[]
for target in ('darwin','windows'):
 jobs=[j for j in r['jobs'] if j['name'].startswith('build (') and (('macos' in j['name']) if target=='darwin' else ('windows' in j['name']))]
 job=jobs[0] if len(jobs)==1 else None
 gates=[]
 for prefix in common+extra[target]:
  found=[s for s in (job or {}).get('steps',[]) if s['name'].startswith(prefix)]
  gates.append({'requirement':prefix,'result':found[0]['conclusion'] if len(found)==1 else 'missing','status':found[0]['status'] if len(found)==1 else 'missing'})
 artifact='desktop-darwin-aarch64' if target=='darwin' else 'desktop-windows-x86_64'
 artifacts=[x for x in a if x['name']==artifact and not x['expired']]
 failures=[s['name'] for s in (job or {}).get('steps',[]) if s['conclusion']=='failure']
 raw_errors=[]; raw_verified=False; raw_missing=[]
 if job and job['status']=='completed':
  logpath=Path(f'/tmp/creatoros-release-{run}-{target}.log')
  if not logpath.exists() or logpath.stat().st_size==0:
   fetched=subprocess.run(['gh','api',f'repos/{repo}/actions/jobs/{job["databaseId"]}/logs'],capture_output=True,text=True)
   if fetched.returncode==0:logpath.write_text(fetched.stdout)
  if logpath.exists() and logpath.stat().st_size:
   raw=logpath.read_text()
   raw_errors=[line.strip() for line in raw.splitlines() if re.search(r'Z ##\[error\]Process completed with exit code [1-9]',line)]
   bodies=[re.sub(r'\x1b\[[0-9;]*m','',line.split('Z ',1)[1]).strip() for line in raw.splitlines() if 'Z ' in line]
   markers=(['[T-709] ✓ Developer ID、notary staple、Gatekeeper 与 DMG 内应用验收通过','[T-705] ✓ 归档零 AppleDouble','[T-663] ✓ macOS CreatorOS 真启动并完成主页面加载'] if target=='darwin' else ['[T-675] ✓ 原生安装期物化通过:','[T-675] ✓ 已安装 CreatorOS 真启动并完成主页面加载:','[T-557] ✓ 官方卸载器已清理 runtime 与安装目录'])
   raw_missing=[marker for marker in markers if not any(body.startswith(marker) for body in bodies)]
   raw_verified=not raw_errors and not raw_missing
 items.append({'target':target,'job_id':(job or {}).get('databaseId'),'job_status':(job or {}).get('status'),'job_conclusion':(job or {}).get('conclusion'),'gates':gates,'all_failed_steps':failures,'raw_execution_errors':raw_errors,'raw_missing_native_success_markers':raw_missing,'raw_log_review_passed':raw_verified,'artifact':[{k:x.get(k) for k in ['id','name','size_in_bytes','digest','expired']} for x in artifacts], 'passed':bool(job and job['conclusion']=='success' and all(g['result']=='success' for g in gates) and not failures and len(artifacts)==1 and raw_verified)})
result={'run_id':run,'head_sha':r['headSha'],'run_status':r['status'],'run_conclusion':r['conclusion'],'url':r['url'],'platforms':items,'ci_requirements_passed':r['status']=='completed' and r['conclusion']=='success' and all(i['passed'] for i in items),'local_installer_hash_and_integrity':'separate evidence required'}
p=Path(f'docs/verification/t1435/run-{run}-audit.json');p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'run_id':run,'status':r['status'],'conclusion':r['conclusion'],'platforms':[{'target':i['target'],'status':i['job_status'],'conclusion':i['job_conclusion'],'failures':i['all_failed_steps'],'raw_errors':len(i['raw_execution_errors']),'missing_native_success_markers':i['raw_missing_native_success_markers'],'ci_passed':i['passed']} for i in items]},ensure_ascii=False))
