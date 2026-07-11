import { describe, expect, it } from 'vitest';
import { ORDER_ACTION_SURFACE, renderOrderView } from '../src/order-view';

/**
 * PROMINENCE PARITY (plan M4 / SP4.2 "problem path equal"): both actions of
 * each pair render with the SAME visual weight class, in the SAME action
 * row, with NO primary/secondary split between them. A problem path that is
 * one class dimmer than the happy path fails this suite.
 */
const buttonTags = (html: string): Array<{ key: string; classAttr: string }> =>
  [...html.matchAll(/<button class="([^"]+)" data-key="([^"]+)">/g)].map((m) => ({
    classAttr: m[1]!,
    key: m[2]!,
  }));

describe('order view — equal prominence (M4)', () => {
  it('payment_failed renders retry AND abandon with the identical weight class', () => {
    const html = renderOrderView({ state: 'payment_failed', buyerTotalFcfa: 12_500 });
    const buttons = buttonTags(html);
    expect(buttons.map((b) => b.key)).toEqual(['order.action.retry', 'order.action.abandon']);
    expect(buttons[0]!.classAttr).toBe(buttons[1]!.classAttr);
    expect(buttons[0]!.classAttr).toContain(ORDER_ACTION_SURFACE.weightClass);
    expect(buttons[0]!.classAttr).not.toContain('primary');
    expect((html.match(/action-row/g) ?? []).length).toBe(1); // one shared row
  });

  it('confirmed renders confirm-receipt AND report-problem with the identical weight class', () => {
    const html = renderOrderView({ state: 'confirmed', buyerTotalFcfa: 12_500 });
    const buttons = buttonTags(html);
    expect(buttons.map((b) => b.key)).toEqual([
      'order.action.confirm_receipt',
      'order.action.report_problem',
    ]);
    expect(buttons[0]!.classAttr).toBe(buttons[1]!.classAttr);
    expect(buttons[0]!.classAttr).toContain(ORDER_ACTION_SURFACE.weightClass);
  });

  it('the surface descriptor pins both pairs to one weight class', () => {
    expect(ORDER_ACTION_SURFACE.weightClass).toBe('action-equal');
    expect(ORDER_ACTION_SURFACE.equalPairs).toHaveLength(2);
  });

  it('payment_failed copy is the honest state: money not taken, both exits named', () => {
    const html = renderOrderView({ state: 'payment_failed', buyerTotalFcfa: 12_500 });
    expect(html).toContain("Le paiement n'est pas passé.");
    expect(html).toContain('12'); // the FCFA figure is present, large class
    expect(html).toContain('fcfa-figure');
  });

  it('paid_cancel_refused is honest about the E3 refund path (no dead end)', () => {
    const html = renderOrderView({ state: 'paid_cancel_refused', buyerTotalFcfa: 12_500 });
    expect(html).toContain('remboursement');
    expect(buttonTags(html).map((b) => b.key)).toContain('order.action.report_problem');
  });
});
