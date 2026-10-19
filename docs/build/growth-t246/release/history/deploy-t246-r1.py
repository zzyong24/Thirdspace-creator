#!/usr/bin/env python3
"""T246：单域现有ACME续期、独立DMG、经外部校验后手动入口CAS。无自动更新写入。"""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import socket
import stat
import subprocess
import sys
import time

DOMAIN = "creatoros.aitongban.cloud"
CERT_DIR = Path("/etc/letsencrypt/live") / DOMAIN
NGINX = Path("/etc/nginx/conf.d/creatoros.conf")
RENEWAL = Path("/etc/letsencrypt/renewal") / (DOMAIN + ".conf")
LOCK = "/var/lock/creatoros-t246-manual-delivery.lock"  # 仅串行本driver；Certbot另有自身锁。

class Stop(RuntimeError):
    pass

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def regular(path):
    s = Path(path).lstat()
    if not stat.S_ISREG(s.st_mode):
        raise Stop("REGULAR_FILE_REQUIRED")
    return s

def expect(path, sha):
    regular(path)
    if digest(path) != sha:
        raise Stop("FILE_CAS_MISMATCH")

def durable_json(path, data):
    path = Path(path)
    temp = path.with_name(path.name + ".tmp")
    with open(temp, "x", encoding="utf8") as stream:
        os.chmod(temp, 0o600)
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    sync_dir(path.parent)

def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def invoke(argv, log=None):
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if log:
        Path(log).write_bytes(result.stdout)
        os.chmod(log, 0o600)
    if result.returncode:
        raise Stop("COMMAND_FAILED:" + Path(argv[0]).name)
    return result.stdout

def config_snapshot():
    files = {Path("/etc/nginx/nginx.conf")}
    for directory in [Path("/etc/nginx/conf.d"), Path("/etc/nginx/sites-enabled")]:
        if directory.exists():
            files.update(p.resolve() for p in directory.iterdir() if p.is_file() and (directory.name == "sites-enabled" or p.suffix == ".conf"))
    return {str(p): digest(p) for p in sorted(files) if p.is_file()}

def cert_links():
    return {name: str((CERT_DIR / name).readlink()) for name in ["cert.pem", "chain.pem", "fullchain.pem", "privkey.pem"]}

def strict_tls():
    context = ssl.create_default_context()
    with socket.create_connection(("127.0.0.1", 443), timeout=10) as raw:
        with context.wrap_socket(raw, server_hostname=DOMAIN) as conn:
            cert = conn.getpeercert()
            names = [v for k, v in cert.get("subjectAltName", []) if k == "DNS"]
            if names != [DOMAIN] or ssl.cert_time_to_seconds(cert["notAfter"]) < time.time() + 7 * 86400:
                raise Stop("CERTIFICATE_SCOPE_OR_VALIDITY_INVALID")
            return {"domain": DOMAIN, "sha256": hashlib.sha256(conn.getpeercert(binary_form=True)).hexdigest(), "notAfter": cert["notAfter"], "strictChainAndHostname": True}

def unchanged_legacy(m):
    for item in m["preserve"]:
        expect(item["path"], item["sha256"])

def target_state(m):
    state = {}
    for item in m["pointers"]:
        s = regular(item["path"])
        if (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) != (item["uid"], item["gid"], item["mode"]):
            raise Stop("POINTER_METADATA_CAS_MISMATCH")
        value = digest(item["path"])
        if value not in [item["before"], item["after"]]:
            raise Stop("FOREIGN_POINTER")
        state[item["path"]] = value
    return state

def preflight(m, initial=True, renewal_sha=None):
    if os.geteuid() != 0:
        raise Stop("ROOT_REQUIRED")
    expect(NGINX, m["nginxSHA256"])
    expect(RENEWAL, renewal_sha or m["renewalSHA256"])
    unchanged_legacy(m)
    pointers = target_state(m)
    if initial and any(pointers[p["path"]] != p["before"] for p in m["pointers"]):
        raise Stop("INITIAL_POINTER_NOT_BEFORE")
    for item in m["pointers"]:
        expect(item["candidate"], item["after"])
    expect(m["asset"]["cache"], m["asset"]["sha256"])
    if Path(m["asset"]["cache"]).stat().st_size != m["asset"]["bytes"]:
        raise Stop("ASSET_SIZE_INVALID")
    if initial and cert_links() != m["certificateBeforeLinks"]:
        raise Stop("CERTIFICATE_LINK_CAS_MISMATCH")
    required = m["asset"]["bytes"] + sum(Path(x["path"]).stat().st_size for x in m["preserve"]) + 128 * 1024 * 1024
    if initial and shutil.disk_usage(Path(m["asset"]["path"]).parent).free < required:
        raise Stop("INSUFFICIENT_DISK")
    invoke(["nginx", "-t"])
    return pointers

def publish_asset(item):
    source, target = Path(item["cache"]), Path(item["path"])
    expect(source, item["sha256"])
    if target.exists() or target.is_symlink():
        expect(target, item["sha256"])
        if target.stat().st_size != item["bytes"]:
            raise Stop("EXISTING_ASSET_INVALID")
        return False
    temp = target.with_name("." + target.name + ".t246-" + str(os.getpid()))
    try:
        with open(source, "rb") as read, open(temp, "xb") as write:
            shutil.copyfileobj(read, write, 1024 * 1024)
            os.fchmod(write.fileno(), 0o644)
            os.fchown(write.fileno(), 0, 0)
            write.flush()
            os.fsync(write.fileno())
        expect(temp, item["sha256"])
        os.link(temp, target)  # 原子排他创建，绝不replace同名外来资产。
        sync_dir(target.parent)
    finally:
        temp.unlink(missing_ok=True)
    expect(target, item["sha256"])
    return True

def replace_pointer(item, expected, content):
    path = Path(item["path"])
    expect(path, expected)
    next_sha = item["after"] if expected == item["before"] else item["before"]
    if hashlib.sha256(content).hexdigest() != next_sha:
        raise Stop("POINTER_CONTENT_BINDING_MISMATCH")
    temp = path.with_name("." + path.name + ".t246-" + str(os.getpid()))
    try:
        with open(temp, "xb") as write:
            write.write(content)
            os.fchmod(write.fileno(), item["mode"])
            os.fchown(write.fileno(), item["uid"], item["gid"])
            write.flush()
            os.fsync(write.fileno())
        expect(path, expected)
        os.replace(temp, path)
        sync_dir(path.parent)
    finally:
        temp.unlink(missing_ok=True)

def public_pointers(m, after):
    for item in m["pointers"]:
        conn = http.client.HTTPSConnection(item["host"], timeout=20, context=ssl.create_default_context())
        try:
            conn.request("GET", item["urlPath"], headers={"Cache-Control": "no-cache"})
            response = conn.getresponse()
            data = response.read(2 * 1024 * 1024)
            if response.status != 200 or hashlib.sha256(data).hexdigest() != item["after" if after else "before"]:
                raise Stop("PUBLIC_POINTER_BODY_MISMATCH")
        finally:
            conn.close()

def restore_pointers(m, attempt):
    # 先判全体before/after，foreign拒覆盖；再逐次CAS，覆盖rename已发生但fsync抛错的窗口。
    target_state(m)
    for item in reversed(m["pointers"]):
        target_state(m)
        if digest(item["path"]) == item["after"]:
            before = Path(attempt) / (item["name"] + ".before")
            expect(before, item["before"])
            replace_pointer(item, item["after"], before.read_bytes())
    unchanged_legacy(m)

def validate_external(m, path, expected_sha):
    expect(path, expected_sha)
    evidence = json.loads(Path(path).read_text())
    asset = m["asset"]
    if evidence.get("url") != asset["url"] or evidence.get("sha256") != asset["sha256"] or evidence.get("bytes") != asset["bytes"] or evidence.get("tlsVerified") is not True or evidence.get("externalToOriginHost") is not True:
        raise Stop("EXTERNAL_DOWNLOAD_RECEIPT_INVALID")
    return expected_sha

def stage(m, attempt):
    preflight(m)
    if subprocess.run(["pgrep", "-x", "certbot"], stdout=subprocess.DEVNULL).returncode == 0:
        raise Stop("ANOTHER_CERTBOT_RUNNING")
    Path(attempt).mkdir(mode=0o700)
    receipt = {"state": "preparing", "domain": DOMAIN, "businessActions": False, "autoUpdaterChanged": False}
    durable_json(Path(attempt) / "receipt.json", receipt)
    try:
        backup_entries = []
        for item in m["pointers"]:
            dest = Path(attempt) / (item["name"] + ".before")
            shutil.copyfile(item["path"], dest)
            os.chmod(dest, 0o600)
            expect(dest, item["before"])
        for number, item in enumerate(m["preserve"]):
            dest = Path(attempt) / ("legacy-" + str(number) + ".before")
            shutil.copyfile(item["path"], dest)
            os.chmod(dest, 0o600)
            expect(dest, item["sha256"])
            backup_entries.append({"path": str(dest), "sha256": item["sha256"], "bytes": dest.stat().st_size})
        for name, path in [("creatoros.conf.before", NGINX), ("creatoros-renewal.conf.before", RENEWAL)]:
            shutil.copyfile(path, Path(attempt) / name)
            os.chmod(Path(attempt) / name, 0o600)
        configs = config_snapshot()
        receipt.update(beforeConfigurationHashes=configs, beforeCertificateLinks=cert_links(), legacyBackups=backup_entries)
        durable_json(Path(attempt) / "receipt.json", receipt)
        preflight(m)
        # 此隐藏flag已核宿主Certbot2.8.0实际CLI源码；无全域renew/force-renewal。
        argv = ["certbot", "renew", "--cert-name", DOMAIN, "--non-interactive", "--no-random-sleep-on-renew"]
        invoke(argv + ["--dry-run"], Path(attempt) / "certbot-dry-run.log")
        if config_snapshot() != configs or cert_links() != m["certificateBeforeLinks"] or digest(RENEWAL) != m["renewalSHA256"]:
            raise Stop("DRY_RUN_DID_NOT_RESTORE_EXACT_CONFIGURATION")
        preflight(m)
        invoke(argv, Path(attempt) / "certbot-renew.log")
        if config_snapshot() != configs:
            raise Stop("NGINX_CONFIGURATION_DRIFT")
        # Certbot可能机械更新本域renewal元数据；认证方式/CA不得改变。
        renewal_text = RENEWAL.read_text()
        for key, value in [("authenticator", "nginx"), ("installer", "nginx"), ("server", "https://acme-v02.api.letsencrypt.org/directory")]:
            if re.findall(r"(?m)^" + key + r"\s*=\s*(.*?)\s*$", renewal_text) != [value]:
                raise Stop("RENEWAL_SEMANTICS_CHANGED")
        invoke(["nginx", "-t"], Path(attempt) / "nginx-test.log")
        receipt["certificate"] = strict_tls()
        receipt["afterRenewalSHA256"] = digest(RENEWAL)
        receipt["afterCertificateLinks"] = cert_links()
        receipt["newAssetCreated"] = publish_asset(m["asset"])
        unchanged_legacy(m)
        if strict_tls()["sha256"] != receipt["certificate"]["sha256"] or cert_links() != receipt["afterCertificateLinks"]:
            raise Stop("CERTIFICATE_CHANGED_DURING_ASSET_STAGE")
        receipt["state"] = "asset-ready-awaiting-external-hash"
        durable_json(Path(attempt) / "receipt.json", receipt)
        return receipt
    except Exception as exc:
        receipt.update(state="manual-recovery", reason=str(exc) if isinstance(exc, Stop) else type(exc).__name__, afterCertificateLinks=cert_links())
        # 不盲退有效新证书、不用全局checkpoint覆盖其它域；本阶段没有指针激活。
        durable_json(Path(attempt) / "receipt.json", receipt)
        raise


def activate(m, attempt, external_path, external_sha):
    receipt_path = Path(attempt) / "receipt.json"
    receipt = json.loads(receipt_path.read_text())
    if receipt.get("state") != "asset-ready-awaiting-external-hash":
        raise Stop("STAGE_RECEIPT_NOT_READY")
    try:
        validate_external(m, external_path, external_sha)
        preflight(m, initial=False, renewal_sha=receipt["afterRenewalSHA256"])
        if strict_tls()["sha256"] != receipt["certificate"]["sha256"] or cert_links() != receipt["afterCertificateLinks"]:
            raise Stop("CERTIFICATE_CHANGED_SINCE_STAGE")
        expect(m["asset"]["path"], m["asset"]["sha256"])
        for item in m["pointers"]:
            target_state(m)
            if digest(item["path"]) == item["before"]:
                replace_pointer(item, item["before"], Path(item["candidate"]).read_bytes())
        unchanged_legacy(m)
        public_pointers(m, after=True)
        receipt.update(state="manual-download-ready", externalReceiptSHA256=external_sha, pointerAfterHashes=target_state(m))
        durable_json(receipt_path, receipt)
        return receipt
    except Exception as exc:
        if isinstance(exc, Stop) and str(exc) == "CERTIFICATE_CHANGED_SINCE_STAGE":
            receipt.update(state="manual-recovery", reason=str(exc))
            durable_json(receipt_path, receipt)
            raise
        try:
            restore_pointers(m, attempt)
            strict_tls()
            public_pointers(m, after=False)
            receipt.update(state="pointers-restored", reason=str(exc) if isinstance(exc, Stop) else type(exc).__name__)
        except Exception as recovery:
            receipt.update(state="manual-recovery", reason=type(exc).__name__, recoveryReason=str(recovery) if isinstance(recovery, Stop) else type(recovery).__name__)
        durable_json(receipt_path, receipt)
        raise

def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["preflight", "stage", "activate"])
    p.add_argument("--manifest", required=True)
    p.add_argument("--manifest-sha", required=True)
    p.add_argument("--attempt", required=True)
    p.add_argument("--external-receipt")
    p.add_argument("--external-sha")
    a = p.parse_args()
    expect(a.manifest, a.manifest_sha)
    m = json.loads(Path(a.manifest).read_text())
    if m["domain"] != DOMAIN or m["asset"]["path"] != "/var/www/creatoros/updates/CreatorOS_1.2.0_e3151ce89_macos-arm64.dmg" or not re.fullmatch(r"/var/backups/creatoros-t246/[A-Za-z0-9_-]+", a.attempt):
        raise Stop("FIXED_SCOPE_INVALID")
    with open(LOCK, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if a.mode == "preflight":
            result = {"state": "preflight-pass", "pointers": preflight(m)}
        elif a.mode == "stage":
            result = stage(m, a.attempt)
        else:
            if not a.external_receipt or not a.external_sha:
                raise Stop("EXTERNAL_RECEIPT_REQUIRED")
            result = activate(m, a.attempt, a.external_receipt, a.external_sha)
        print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"state": "STOP", "reason": str(exc) if isinstance(exc, Stop) else type(exc).__name__}, ensure_ascii=False))
        sys.exit(2)
