import os

def make_env(root,control,out):
 env={k:os.environ[k] for k in ['PATH','LANG','LC_ALL','TERM'] if k in os.environ}
 env.update(TMPDIR=str(control)+'/',NO_PROXY='127.0.0.1,localhost',no_proxy='127.0.0.1,localhost',NEXT_TELEMETRY_DISABLED='1',CI='1',T1369_ATTEMPT='production-attempt03',T1369_DIAGNOSTIC_MODE='production',T1356_FIXTURE_ROOT=str(root),T1356_APP_PORT='41387',T1356_PG_PORT='41388',T1356_HOST_PORT='41389',CREATOROS_DB_DIR=str(root/'db'),CREATOROS_WORKSPACES_ROOT=str(root/'workspaces'),T1369_PRODUCTION_OUTPUT=str(out))
 return env
