import os

def make_env(root,control,out):
 env={k:os.environ[k] for k in ['PATH','LANG','LC_ALL','TERM'] if k in os.environ}
 env.update(TMPDIR=str(control)+'/',NO_PROXY='127.0.0.1,localhost',no_proxy='127.0.0.1,localhost',NEXT_TELEMETRY_DISABLED='1',CI='1',T1369_ATTEMPT=out.name,T1369_DIAGNOSTIC_MODE='production',T1356_FIXTURE_ROOT=str(root),T1356_APP_PORT='41387',T1356_PG_PORT='41388',T1356_HOST_PORT='41389',CREATOROS_DB_DIR=str(root/'db'),CREATOROS_WORKSPACES_ROOT=str(root/'workspaces'),T1369_PRODUCTION_OUTPUT=str(out))
 env.update(T1355_FIXTURE_ROOT=str(root),T1355_PG_PORT='41388',T1355_HOST_PORT='41389',DATABASE_URL='postgresql://t1355_fixture@127.0.0.1:41388/creatoros_t1355',PGLITE_DATA_DIR=str(root/'fallback-pglite'),CREATOROS_MEDIA_ROOT=str(root/'media'),CREATOROS_DATABASE_BACKUP_DIR=str(root/'database-backups'),CREATOROS_DOUYIN_AUTH_DIR=str(root/'auth-douyin'),CREATOROS_WEB_AUTH_DIR=str(root/'auth-web'),CREATOROS_DISABLE_BACKGROUND_DRIVERS='1',CREATOROS_DISABLE_SCHEDULER='1',CREATOROS_DEV_MODE='1')
 return env
