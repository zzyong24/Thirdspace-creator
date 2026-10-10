import pathlib,subprocess,sys,json
cluster=pathlib.Path('/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/isolated-pg/data').resolve()
base=['psql','-w','-h','127.0.0.1','-p','55422','-U','creatoros_test','-d','postgres','-XtAc']
def query(sql):
    return subprocess.check_output(base+[sql],text=True).strip()
actual=pathlib.Path(query('SHOW data_directory')).resolve()
assert actual==cluster, str(actual)
assert not query("SELECT rolname FROM pg_roles WHERE rolname='creatoros_t1074'"), 'test role already exists; do not take over'
print(json.dumps({'cluster':str(actual),'roleExisted':False,'testRole':'creatoros_t1074'},ensure_ascii=False),flush=True)
subprocess.run(base+['CREATE ROLE creatoros_t1074 LOGIN CREATEDB'],check=True)
code=1
try:
    cmd=['env','CREATOROS_TEST_POSTGRES_URL=postgresql://creatoros_test@127.0.0.1:55422/postgres','CREATOROS_ISOLATED_PG_URL=postgresql://creatoros_test@127.0.0.1:55422/postgres','CREATOROS_T1074_ISOLATED_PG_URL=postgresql://creatoros_t1074@127.0.0.1:55422/postgres','pnpm','--dir','backend','exec','vitest','run','src/application/chat/assistant-system-root.integration.test.ts','-t','PG T1074']
    code=subprocess.run(cmd).returncode
finally:
    cleanup=subprocess.run(base+['DROP ROLE creatoros_t1074'])
    print(json.dumps({'testExitCode':code,'cleanupExitCode':cleanup.returncode}),flush=True)
    if cleanup.returncode: code=cleanup.returncode
sys.exit(code)
