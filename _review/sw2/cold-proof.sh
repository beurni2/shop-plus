#!/usr/bin/env bash
# SP#001-B COLD PROOF — isolation-evidence law. Fresh clone of the COMMITTED
# bytes, fresh HOME on the CREDENTIAL-ONLY BASELINE (proxy insteadOf only — NO
# git@→https normalization), isolated pnpm store + XDG cache, Playwright at the
# preinstalled chromium. Proves: the committed lockfile is cold-installable
# (frozen, 0 ssh-form), the NEW workspace package (@shop-plus/store-projection,
# source-exported) resolves cold for both a tsc service AND the vite PWA, the ONE
# producer drives the directory + discovery cold, and run-gates.sh is green.
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
echo "=== HOME (fresh) ==="; echo "$HOME"
echo "=== baseline auth line (credential-only, NO normalization) ==="
git config --list --show-origin | grep -i insteadof

echo "=== git clone the committed bytes (e7/wo-sw-2) ==="
git clone --branch e7/wo-sw-2 "$ORIGIN" "$COLD/shop-plus" 2>&1 | tail -3 || { echo "CLONE FAILED"; exit 1; }
cd "$COLD/shop-plus"
echo "cold HEAD: $(git rev-parse --short HEAD)"

echo "=== cloned lockfile portability (must be 0 ssh-form, 0 proxy-leak) ==="
echo "ssh-form git@: $(grep -c 'git@github.com:' pnpm-lock.yaml)"
echo "proxy-leak:    $(grep -c 'local_proxy' pnpm-lock.yaml)"

echo "=== isolated store + cache (fresh, empty) ==="
export PNPM_STORE="$COLD/store"; export XDG_CACHE_HOME="$COLD/cache"
mkdir -p "$PNPM_STORE" "$XDG_CACHE_HOME"
echo "store entries: $(ls "$PNPM_STORE" 2>/dev/null | wc -l) | cache entries: $(ls "$XDG_CACHE_HOME" 2>/dev/null | wc -l)"

echo "=== pnpm install --frozen-lockfile (cold-installable proof) ==="
pnpm install --frozen-lockfile --store-dir "$PNPM_STORE" 2>&1 | tail -6
RC=${PIPESTATUS[0]}
echo "FROZEN INSTALL rc=$RC"
[ "$RC" -eq 0 ] || { echo "COLD INSTALL FAILED"; exit 1; }

echo "=== content pins (cold) ==="
echo "ui-tokens: $(node -p "require('@platform/ui-tokens/package.json').version")"

echo "=== THE ONE PRODUCER + consumers resolve cold (source-exported package) ==="
export PW_EXECUTABLE=/opt/pw-browsers/chromium
pnpm -w turbo run typecheck test --force \
  --filter=@shop-plus/supply-consumer --filter=@shop-plus/reseller-app \
  --filter=@shop-plus/storefront-service \
  --filter=@shop-plus/discovery-service \
  --filter=@shop-plus/buyer-pwa 2>&1 | grep -E "Tests |Tasks:|FAIL|error TS" | tail -8
echo "PRODUCER+CONSUMERS rc=${PIPESTATUS[0]}"

echo "=== run-gates.sh (Playwright at preinstalled chromium) ==="
bash scripts/run-gates.sh 2>&1 | tail -4
echo "RUN-GATES rc=${PIPESTATUS[0]}"
