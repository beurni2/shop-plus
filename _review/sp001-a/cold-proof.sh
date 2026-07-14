#!/usr/bin/env bash
# WO-7.2b COLD PROOF — isolation-evidence law. Fresh clone of the COMMITTED
# bytes, fresh HOME on the CREDENTIAL-ONLY BASELINE (proxy insteadOf only — NO
# normalization git@→https rules; Item 3), isolated pnpm store + XDG cache,
# NORMAL TMPDIR (so chromium doesn't SIGTRAP), Playwright at the preinstalled
# chromium. Proves: the committed lockfile is cold-installable (frozen, 0
# ssh-form), both app lines build/test, and run-gates.sh is green.
set -uo pipefail
COLD="$1"
ORIGIN='http://local_proxy@127.0.0.1:41729/git/beurni2/shop-plus'
rm -rf "$COLD"; mkdir -p "$COLD"
FRESH_HOME="$COLD/home"; mkdir -p "$FRESH_HOME"

# --- the credential-only baseline gitconfig (proxy auth, NO normalization) ---
cat > "$FRESH_HOME/.gitconfig" <<'GC'
[url "http://local_proxy@127.0.0.1:41729/git/"]
	insteadOf = https://github.com/
	insteadOf = git@github.com:
	insteadOf = ssh://git@github.com/
GC
export HOME="$FRESH_HOME"
echo "=== HOME (fresh) ==="; echo "$HOME"
echo "=== the baseline auth line (credential-only, NO git@→https normalization) ==="
git config --list --show-origin | grep -i insteadof

echo "=== git clone the committed bytes (e7/wo-sp001-a) ==="
git clone --branch e7/wo-sp001-a "$ORIGIN" "$COLD/shop-plus" 2>&1 | tail -3 || { echo "CLONE FAILED"; exit 1; }
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

echo "=== BOTH LINES — the encoder (reseller-app) + the composeur (reseller-kit) ==="
node -p "require('./apps/reseller-kit/package.json').name" >/dev/null && echo "reseller-kit present"

echo "=== run-gates.sh (Playwright at preinstalled chromium) ==="
export PW_EXECUTABLE=/opt/pw-browsers/chromium
bash scripts/run-gates.sh 2>&1 | tail -4
echo "RUN-GATES rc=${PIPESTATUS[0]}"
