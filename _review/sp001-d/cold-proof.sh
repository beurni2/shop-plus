#!/usr/bin/env bash
# SP#001-D COLD PROOF — isolation-evidence law. Fresh clone of the COMMITTED
# bytes, fresh HOME (credential-only baseline), isolated store + cache. Proves:
# the committed lockfile is cold-installable (frozen, 0 ssh-form); the première-
# commande e2e resolves its CROSS-PACKAGE imports (commerce-core + storefront-
# service dist, built by turbo) AND hosts the AttributionLockDO on workerd
# (Miniflare) from a cold bundle; and run-gates.sh is green.
set -uo pipefail
COLD="$1"
ORIGIN='http://local_proxy@127.0.0.1:41729/git/beurni2/shop-plus'
rm -rf "$COLD"; mkdir -p "$COLD"
FRESH_HOME="$COLD/home"; mkdir -p "$FRESH_HOME"
cat > "$FRESH_HOME/.gitconfig" <<'GC'
[url "http://local_proxy@127.0.0.1:41729/git/"]
	insteadOf = https://github.com/
	insteadOf = git@github.com:
	insteadOf = ssh://git@github.com/
GC
export HOME="$FRESH_HOME"
echo "=== baseline auth line (credential-only, NO normalization) ==="
git config --list --show-origin | grep -i insteadof
echo "=== git clone the committed bytes (e7/wo-sp001-d) ==="
git clone --branch e7/wo-sp001-d "$ORIGIN" "$COLD/shop-plus" 2>&1 | tail -2 || { echo "CLONE FAILED"; exit 1; }
cd "$COLD/shop-plus"
echo "cold HEAD: $(git rev-parse --short HEAD)"
echo "=== lockfile portability ==="
echo "ssh-form git@: $(grep -c 'git@github.com:' pnpm-lock.yaml)"
echo "proxy-leak:    $(grep -c 'local_proxy' pnpm-lock.yaml)"
export PNPM_STORE="$COLD/store"; export XDG_CACHE_HOME="$COLD/cache"
mkdir -p "$PNPM_STORE" "$XDG_CACHE_HOME"
echo "store entries: $(ls "$PNPM_STORE" 2>/dev/null | wc -l)"
echo "=== pnpm install --frozen-lockfile ==="
pnpm install --frozen-lockfile --store-dir "$PNPM_STORE" 2>&1 | tail -4
RC=${PIPESTATUS[0]}; echo "FROZEN INSTALL rc=$RC"; [ "$RC" -eq 0 ] || { echo "COLD INSTALL FAILED"; exit 1; }
echo "ui-tokens: $(node -p "require('@platform/ui-tokens/package.json').version")"
export PW_EXECUTABLE=/opt/pw-browsers/chromium
echo "=== la première commande réelle e2e resolves + runs COLD (cross-pkg + workerd DO) ==="
pnpm -w turbo run typecheck test --force --filter=@shop-plus/attribution-service 2>&1 | grep -E "Tests |Tasks:|première|LA PREMIÈRE|held|FAIL|error TS" | tail -12
echo "ATTR-E2E rc=${PIPESTATUS[0]}"
echo "=== run-gates.sh ==="
bash scripts/run-gates.sh 2>&1 | tail -3
echo "RUN-GATES rc=${PIPESTATUS[0]}"
