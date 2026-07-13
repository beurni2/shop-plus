// NEGATIVE FIXTURE for the no-emoji-in-chrome gate. This file plants an emoji
// in a "tab bar" so the gate MUST fail (exit 1) when run against this dir. If
// this stops failing, the gate has gone blind — the run-gates harness treats a
// non-1 exit here as a gate failure.
export const TABS = [
  { key: 'accueil', icon: '🏠', label: 'Accueil' },
  { key: 'opportunites', icon: '🛍️', label: 'Opportunités' },
  { key: 'gains', icon: '💰', label: 'Gains' },
];
