// NEGATIVE FIXTURE: a problem path that moves money — the
// problem-path-never-releases gate MUST fail on this file. Never import this.
import { LedgerRecords } from '../../../packages/commerce-core/src/ledger.js';
export function reportAndRefund(ledger: LedgerRecords, orderId: string): void {
  // banned: reporting a problem must never touch obligations or refunds
  const obligations = ledger.obligationsFor(orderId);
  obligations.forEach(() => { /* auto-refund on report — forbidden */ });
}
