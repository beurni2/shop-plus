import {
  DeliveryFailureReasonSchema,
  PlatformEventSchema,
  type DeliveryFailureReason,
  type PlatformEvent,
} from '@platform/contracts';

/**
 * THE PROBLEM PATH (plan M4 / SP4.2: "problem path equal"). A buyer report
 * from the order view: a STRUCTURED record on the canon §6.4 reason codes,
 * one canon event (incident.opened.v1), idempotent on command_id — and
 * NOTHING ELSE. This module NEVER touches the ledger, obligations, escrow,
 * or reservations: reporting a problem releases nothing, refunds nothing,
 * mutates no money record (CI gate scans this file for that machinery by
 * name). Humans read the report; the E3 sagas act on it.
 */

export interface ProblemReport {
  reportId: string;
  orderId: string;
  reasonCode: DeliveryFailureReason;
  /** i18n catalog key for the human-readable reason (register-tagged there). */
  humanReasonRef: string;
  /** free-text buyer note, stored verbatim — never parsed into behavior. */
  note?: string;
  reportedAt: string;
}

export type ProblemReportOutcome =
  | { ok: true; report: ProblemReport; event: PlatformEvent; duplicate: boolean }
  | { ok: false; reason: 'unknown_reason_code' };

export class ProblemReportBook {
  private readonly byCommandId = new Map<string, { report: ProblemReport; event: PlatformEvent }>();
  private counter = 0;

  report(args: {
    command_id: string;
    correlationId: string;
    orderId: string;
    reasonCode: string;
    humanReasonRef: string;
    note?: string;
    at: string;
    actor: string;
  }): ProblemReportOutcome {
    const replay = this.byCommandId.get(args.command_id);
    if (replay) return { ok: true, ...replay, duplicate: true };

    const parsedReason = DeliveryFailureReasonSchema.safeParse(args.reasonCode);
    if (!parsedReason.success) return { ok: false, reason: 'unknown_reason_code' };

    this.counter += 1;
    const report: ProblemReport = {
      reportId: `problem-${args.orderId}-${this.counter}`,
      orderId: args.orderId,
      reasonCode: parsedReason.data,
      humanReasonRef: args.humanReasonRef,
      ...(args.note !== undefined ? { note: args.note } : {}),
      reportedAt: args.at,
    };
    const event = PlatformEventSchema.parse({
      name: 'incident.opened.v1',
      envelope: {
        command_id: args.command_id,
        correlation_id: args.correlationId,
        aggregateVersion: this.counter,
        actor: args.actor,
        serverTime: args.at,
        version: '1',
      },
      payload: {
        order_id: args.orderId,
        report_id: report.reportId,
        reason_code: report.reasonCode,
        source: 'buyer_problem_report',
      },
    });
    this.byCommandId.set(args.command_id, { report, event });
    return { ok: true, report, event, duplicate: false };
  }

  reportsFor(orderId: string): ProblemReport[] {
    return [...this.byCommandId.values()].map((r) => r.report).filter((r) => r.orderId === orderId);
  }
}
