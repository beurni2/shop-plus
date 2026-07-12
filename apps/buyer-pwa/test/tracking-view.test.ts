import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderTracking, TRACKING_STEPS } from '../src/tracking-view';
import { trackingModelFor } from '../src/journey';

/**
 * WO-4.4 — CONFIRMATION + TRACKING. Laws under test:
 * — coarse honest states, « jamais un point GPS vif » (plan SP4.1);
 * — problem path EQUAL prominence (SP-I10) at the door and reachable always;
 * — §6.3 (quoted): "the buyer enters the drop code last, after any door
 *   payment is provider-confirmed" — the code NEVER shows while a door
 *   payment is pending, and is framed « c'est votre preuve ».
 */

const F = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

describe('§6.2 tracking — the coarse honest timeline', () => {
  it('every coarse step renders on the timeline; the current one is marked', () => {
    const html = renderTracking({ step: 'en_route' });
    for (const step of TRACKING_STEPS) expect(html).toContain(`data-step="${step}"`);
    expect(html).toContain('timeline-now');
    expect(html).toMatch(/timeline-now" data-step="en_route"/);
  });

  it('NO live GPS anywhere — no map, no coordinates, no live-position vocabulary (source + render)', () => {
    // Comments stripped first: the docblock QUOTES the law it enforces.
    const source = readFileSync(join(import.meta.dirname, '../src/tracking-view.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/gps|geolocation|latitude|longitude|position en direct/i);
    const html = renderTracking({ step: 'en_route' });
    expect(html).not.toMatch(/gps|carte|map/i);
    expect(html).toContain('Nous vous prévenons à chaque étape.');
  });

  it('at the door: accept and report share ONE weight class, ONE row (SP-I10)', () => {
    const html = renderTracking({ step: 'porte' });
    expect(html).toContain('data-key="order.action.confirm_receipt"');
    expect(html).toContain('data-key="order.action.report_problem"');
    const equal = html.match(/class="action action-equal"/g);
    expect(equal).toHaveLength(2);
  });

  it('Option B at the door shows the due amount as display (never computed here)', () => {
    const html = renderTracking({ step: 'porte', amountDueAtDoorFcfa: 11_500 });
    expect(html).toContain(`${F(11_500)} F`);
    expect(html).toContain('À payer avant de recevoir');
  });

  it('§6.3 NEGATIVE: while the door payment is provider-PENDING, the drop code stays hidden — even if set', () => {
    const html = renderTracking({
      step: 'porte',
      amountDueAtDoorFcfa: 11_500,
      doorPaymentPending: true,
      dropCode: '4732',
    });
    expect(html).not.toContain('4732');
    expect(html).not.toContain('data-role="drop-code"');
    expect(html).toContain('Paiement envoyé. L\'opérateur le confirme.');
    expect(html).toContain('Le livreur garde le colis scellé près de lui.');
  });

  it('the drop code appears ONLY at handoff, framed as the buyer\'s proof', () => {
    const handoff = renderTracking({ step: 'porte', dropCode: '4732' });
    expect(handoff).toContain('data-role="drop-code"');
    expect(handoff).toContain('4732');
    expect(handoff).toContain('Ce code est votre preuve.');
    // and NOWHERE else on the way there:
    for (const step of ['confirmee', 'preparee', 'scellee', 'en_route'] as const) {
      expect(renderTracking({ step, dropCode: '4732' })).not.toContain('4732');
    }
  });

  it('the problem path never disappears — reachable on every tracking screen', () => {
    for (const step of TRACKING_STEPS) {
      const html = renderTracking({ step });
      expect(html, `step ${step}`).toContain('data-action="souci"');
      expect(html, `step ${step}`).toContain('data-action="protections"');
    }
  });

  it('the ?etat= demo mapping honors the §6.3 order (code last, pending beats code)', () => {
    expect(trackingModelFor('code')).toEqual({ step: 'porte', dropCode: '4732' });
    expect(trackingModelFor('porte-b-attente')).toMatchObject({ doorPaymentPending: true });
    expect(trackingModelFor('porte-b-attente')).not.toHaveProperty('dropCode');
    expect(trackingModelFor(undefined)).toEqual({ step: 'confirmee' });
    expect(trackingModelFor('nonsense')).toEqual({ step: 'confirmee' });
  });
});
