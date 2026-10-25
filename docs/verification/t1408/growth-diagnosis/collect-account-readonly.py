"""在 Growth 已部署 Python 环境内执行；仅定向读取 T249 原权益，不输出身份/密钥。"""
import datetime
import hashlib
import json
import os
import pathlib
import signal
import sys
from decimal import Decimal

from sqlalchemy import create_engine, text


def main():
    target = json.load(sys.stdin)
    engine = create_engine(os.environ['THIRDSPACE_DATABASE_URL'], echo=False)
    result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'businessWrites': False, 'generationRequests': 0,
              'identityEvidence': 'T249 原同机权益的 credential/provider/encrypted-token/wallet 四重一致性标签；当前客户端身份尚未独立复核'}
    with engine.connect().execution_options(isolation_level='REPEATABLE READ') as db:
        tx = db.begin()
        try:
            db.exec_driver_sql('SET TRANSACTION READ ONLY')
            db.exec_driver_sql("SET LOCAL statement_timeout = '5s'")
            assert db.exec_driver_sql('SHOW transaction_read_only').scalar_one() == 'on'
            result['readOnlyTransaction'] = True
            result['schema'] = db.exec_driver_sql('SELECT version_num FROM alembic_version').scalar_one()
            credentials = list(db.execute(text('''SELECT id,provider_key_id,status,included_amount,currency,
                md5(id) AS credential_consistency_tag,
                md5(provider_key_id) AS provider_key_record_consistency_tag,
                md5(encrypted_token) AS encrypted_token_consistency_tag,
                last_error_code IS NOT NULL AS has_last_error,created_at,updated_at
                FROM managed_model_credential
                WHERE project_key='creatoros' AND service_id='omnihi-main'
                  AND md5(id)=:credential AND md5(provider_key_id)=:provider
                  AND md5(encrypted_token)=:encrypted LIMIT 2'''), target).mappings())
            if len(credentials) != 1:
                raise ValueError('EXACT_ORIGINAL_CREDENTIAL_NOT_UNIQUE')
            credential = dict(credentials[0])
            credential_id = credential.pop('id')
            provider_id = credential.pop('provider_key_id')
            accounts = list(db.execute(text('''SELECT md5(id) AS wallet_consistency_tag,
                wallet_total_units,currency,sync_status,baseline_budget_amount,target_budget_amount,
                omnihi_budget_target_amount,confirmed_budget_amount,confirmed_budget_used,
                confirmed_budget_frozen,confirmed_budget_remaining,asr_reserved_units,asr_committed_units,
                last_usage_refreshed_at,last_error_code IS NOT NULL AS has_last_error,created_at,updated_at
                FROM ai_credit_account WHERE managed_credential_id=:credential_id AND md5(id)=:wallet LIMIT 2'''),
                {'credential_id': credential_id, 'wallet': target['wallet']}).mappings())
            if len(accounts) != 1:
                raise ValueError('EXACT_ORIGINAL_WALLET_NOT_UNIQUE')
            result.update(credential=credential, wallet=dict(accounts[0]))
        finally:
            tx.rollback()
    engine.dispose()

    # 先验证已读的供应商实现版本；只允许正常管理登录和名单 GET，拒绝所有其它网络动作。
    provider_file = pathlib.Path('server/integrations/managed_model/omnihi.py')
    provider_hash = hashlib.sha256(provider_file.read_bytes()).hexdigest()
    if provider_hash != target['providerSourceSha256']:
        raise ValueError('PROVIDER_SOURCE_CHANGED')
    result['providerSourceSha256'] = provider_hash
    import httpx
    from integrations.managed_model.omnihi import build_omnihi_managed_model_provider
    calls = []

    def request_guard(request):
        allowed = request.url.scheme == 'https' and request.url.host == 'omnihi.ai' and request.url.port in (None, 443)
        allowed = allowed and ((request.method == 'POST' and request.url.path == '/api/v1/auth/login')
                               or (request.method == 'GET' and request.url.path == '/api/v1/user/apikeys'))
        if not allowed or len(calls) >= 101:
            raise ValueError('READ_ONLY_PROVIDER_SCOPE_VIOLATION')
        calls.append({'method': request.method, 'path': request.url.path})

    def response_guard(response):
        calls[-1]['status'] = response.status_code

    with httpx.Client(timeout=10, follow_redirects=False,
                      event_hooks={'request': [request_guard], 'response': [response_guard]}) as client:
        provider = build_omnihi_managed_model_provider(os.environ, http_client=client)
        if provider is None:
            result['provider'] = {'error': 'PROVIDER_NOT_CONFIGURED'}
        else:
            def total_timeout(_signal, _frame):
                raise TimeoutError('PROVIDER_TOTAL_TIMEOUT')
            prior_handler = signal.signal(signal.SIGALRM, total_timeout)
            prior_timer = signal.setitimer(signal.ITIMER_REAL, 30)
            try:
                snapshot = provider.get_budget(provider_key_id=provider_id,
                    deadline_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=30))
                result['provider'] = {name: getattr(snapshot, name) for name in
                    ('budget_amount', 'budget_used', 'budget_frozen', 'budget_remaining', 'currency')}
                result['provider']['identityMatched'] = snapshot.provider_key_id == provider_id
                result['provider']['balanced'] = Decimal(snapshot.budget_amount) == sum(Decimal(getattr(snapshot, name))
                    for name in ('budget_used', 'budget_frozen', 'budget_remaining'))
            except Exception as exc:
                safe_errors = {'MODEL_PROVIDER_KEY_NOT_FOUND', 'MODEL_PROVIDER_UNAVAILABLE', 'MODEL_PROVIDER_RESPONSE_INVALID',
                               'AI_CREDIT_BOOTSTRAP_EXPIRED', 'READ_ONLY_PROVIDER_SCOPE_VIOLATION', 'PROVIDER_TOTAL_TIMEOUT'}
                result['provider'] = {'error': str(exc) if str(exc) in safe_errors else 'PROVIDER_CHECK_FAILED',
                                      'exceptionType': type(exc).__name__}
            finally:
                signal.setitimer(signal.ITIMER_REAL, *prior_timer)
                signal.signal(signal.SIGALRM, prior_handler)
    result['providerCalls'] = calls
    return result


try:
    print(json.dumps(main(), default=str, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({'error': 'SCOPED_READ_ONLY_DIAGNOSIS_FAILED', 'exceptionType': type(exc).__name__}))
    sys.exit(1)
