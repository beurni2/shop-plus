#!/usr/bin/env node
import { runScanGate } from './scan.mjs';

/**
 * CI gate: lockfile-url-form (cold-install law, WO-7.0).
 * The committed pnpm-lock.yaml must pin every git dependency by a PORTABLE
 * https-form URL (git+https://github.com/…). SSH-form URLs (git@github.com:)
 * install ONLY in an environment that carries a matching git insteadOf/SSH
 * accommodation — they make a cold clone of committed bytes uninstallable
 * (proven by WO-7.0's cold proof, where the SSH-form lockfile died on
 * `git clone git@github.com:…: could not read Username`).
 *
 * Canon v0.9.4 carries this as STANDING LAW; this local gate is defense in
 * depth so a shop-plus lockfile regeneration can never re-introduce the
 * SSH-form under the repo's own harness. Positive scans the real lockfile;
 * the planted negative is a lockfile snippet with a git@ URL.
 */
runScanGate({
  gateName: 'lockfile-url-form',
  invariant: 'cold-install law — pnpm-lock.yaml pins git deps by portable https-form URL, never SSH-form git@github.com:',
  defaultRoots: ['pnpm-lock.yaml'],
  patterns: [{ name: 'ssh-form-url', regex: /git@github\.com:/ }],
});
