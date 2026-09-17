#!/usr/bin/env bash
# 发布: 本地检查 → 上传脚本与服务端 → 重启服务 → 核对线上版本。
#
# 连接参数写在 deploy/.env (已在 .gitignore, 不进仓库):
#   SHCD_HOST=root@<服务器>
#   SHCD_KEY=~/.ssh/<私钥>          可选
# 服务器首次准备见 deploy/sh.cd.service 与 deploy/sh.cd.env.example。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[ -f "$ROOT/deploy/.env" ] && . "$ROOT/deploy/.env"
: "${SHCD_HOST:?请在 deploy/.env 里设置 SHCD_HOST}"
REMOTE=/opt/sh.cd

# 复用一条 SSH 连接, 并只用指定的密钥: 服务器有登录失败封禁, 连接过多或挨个试密钥都会被封
SSH_OPTS="-o ControlMaster=auto -o ControlPath=/tmp/shcd-deploy-%r@%h -o ControlPersist=120 -o IdentitiesOnly=yes"
[ -n "${SHCD_KEY:-}" ] && SSH_OPTS="$SSH_OPTS -i ${SHCD_KEY/#\~/$HOME}"
remote() { ssh $SSH_OPTS "$SHCD_HOST" "$@"; }

cd "$ROOT"
echo "==> 检查"
bash -n check.sh
bun test >/dev/null
bunx tsc --noEmit -p tsconfig.json

REV="$(git rev-parse --short=12 HEAD)"
git diff --quiet HEAD -- check.sh server assets package.json || REV="$REV-wip-$(date -u +%Y%m%d%H%M%S)"
VERSION="$(sed -n 's/^VERSION="\(.*\)"$/\1/p' check.sh)"

echo "==> 上传 $REV (脚本 v$VERSION)"
rsync -az --delete -e "ssh $SSH_OPTS" --exclude .DS_Store check.sh package.json server assets "$SHCD_HOST:$REMOTE/app/"
remote "echo '$REV $(date -u +%FT%TZ)' > $REMOTE/app/REVISION && systemctl restart sh.cd && sleep 1 && systemctl is-active --quiet sh.cd && curl -sf http://127.0.0.1:\$(sed -n 's/^PORT=//p' $REMOTE/sh.cd.env)/healthz >/dev/null" \
  || { echo "❌ 服务没有起来:"; remote "journalctl -u sh.cd -n 20 --no-pager"; exit 1; }

echo "==> 核对线上"
live="$(curl -s -m 15 https://sh.cd | sed -n 's/^VERSION="\(.*\)"$/\1/p')"
[ "$live" = "$VERSION" ] && echo "  ✓ https://sh.cd 已是 v$VERSION ($REV)" || { echo "  ❌ 线上版本是 '$live'"; exit 1; }
