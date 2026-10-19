import sys, subprocess, pathlib, time, json, os, signal
name=sys.argv[1]
command=sys.argv[2:]
root=pathlib.Path(__file__).resolve().parent
started=time.time()
with (root/(name+'.log')).open('wb') as out:
    try:
        child=subprocess.Popen(command,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
        (root/(name+'.pid.json')).write_text(json.dumps({'pid':child.pid,'processGroup':child.pid,'command':command,'startedAt':started},ensure_ascii=False,indent=2)+'\n')
        code=child.wait(timeout=86400)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid,signal.SIGTERM)
        child.wait()
        code=124
result={'command':command,'exitCode':code,'elapsedSeconds':time.time()-started,'outerTimeoutSeconds':86400,'startedAt':started,'cwd':os.getcwd(),'environment':{key:os.environ[key] for key in ['VITEST_MAX_WORKERS'] if key in os.environ}}
(root/(name+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
sys.exit(code)
