#!/usr/bin/env bash
# CreatorOS 官网一键部署(T-168)—— 推静态站到腾讯云 152.136.151.58 + 装 nginx 配置。
#
# 用法(在 repo 根或 website/ 下跑):
#   bash website/deploy/deploy.sh                 # 部署站点 + 安装/更新 nginx 配置 + reload
#   bash website/deploy/deploy.sh --site-only     # 只推 HTML(nginx 配置已装过时用)
#
# 前置:本机能 ssh root@152.136.151.58(已验证可免密上);服务器有 nginx + rsync(已确认)。
# DNS:creatoros.aitongban.cloud 需一条 A 记录指向 152.136.151.58(腾讯云 DNS 控制台加)。
# SSL:首次部署后在服务器跑 `certbot --nginx -d creatoros.aitongban.cloud`(自动配 443+跳转)。
set -euo pipefail

HOST="${CREATOROS_DEPLOY_HOST:-root@152.136.151.58}"
REMOTE_ROOT="/var/www/creatoros"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # website/
SITE_ONLY=0
[[ "${1:-}" == "--site-only" ]] && SITE_ONLY=1

echo "[deploy] 目标: $HOST : $REMOTE_ROOT"

# 1) 确保远端根目录在。
ssh -o BatchMode=yes "$HOST" "mkdir -p $REMOTE_ROOT"

# 2) rsync 站点静态文件(只推 website/ 根的产物,排除 deploy/ 工具本身与隐藏文件)。
echo "[deploy] rsync 站点静态文件…"
rsync -az --delete \
  --exclude 'deploy/' --exclude '.*' --exclude '*.test.*' \
  --exclude 'updates/' --exclude 'prompts/' \
  "$HERE"/ "$HOST:$REMOTE_ROOT/"

if [[ "$SITE_ONLY" -eq 0 ]]; then
  # 3) 安装/更新 nginx 站点配置 + 校验 + reload(nginx -t 不过就不 reload,防打断现有站点)。
  echo "[deploy] 安装 nginx 配置 + 校验…"
  scp -o BatchMode=yes "$HERE/deploy/nginx-creatoros.conf" "$HOST:/etc/nginx/conf.d/creatoros.conf"
  ssh -o BatchMode=yes "$HOST" "nginx -t && systemctl reload nginx && echo '[remote] nginx reloaded ✓'"
fi

echo "[deploy] ✅ 完成。"
echo "  访问(配好 DNS 后): http://creatoros.aitongban.cloud/"
echo "  立即验证(走 IP,Host 头模拟): curl -s -H 'Host: creatoros.aitongban.cloud' http://152.136.151.58/ | head"
echo ""
echo "  下一步(你的 op):"
echo "   ① 腾讯云 DNS 加 A 记录: creatoros.aitongban.cloud → 152.136.151.58"
echo "   ② 服务器跑: certbot --nginx -d creatoros.aitongban.cloud   (自动配 HTTPS)"
echo "   ③ P3/updater 上传: latest.json → $REMOTE_ROOT/updates/ ; 签名 prompt bundle → $REMOTE_ROOT/prompts/"
