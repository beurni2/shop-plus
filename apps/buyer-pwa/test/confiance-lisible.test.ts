import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENTE_STYLES } from '../src/cliente/styles';
import { VITRINE_STYLES } from '../src/vitrine/styles';
import { renderC3 } from '../src/cliente/screens';
import { renderListeSheet } from '../src/vitrine/render';

/**
 * CONFIANCE-LISIBLE-1 (AUDIT-SHOP-2 F-56, F-57) — the source pins for the
 * buyer flow's targets and names. The driven proof (the measured boxes, the
 * focused stage, the resolved labels) is e2e/confiance-lisible.spec.ts.
 */

const BASE = {
  zoneFiltre: '', zoneEdition: true, zone: '', repere: '', phone: '',
  voice: 'idle' as const, recTime: '0:00', geo: 'repos' as const, carte: null, canContinue: false,
};

/** The LAST base rule for a selector — `.cl-voir` is declared twice (a flex
 *  hint first, the control's own rule after), and the later one is the one
 *  the sheet applies. */
function regle(feuille: string, selecteur: string): string {
  const tous = [...feuille.matchAll(new RegExp(`^\\s*${selecteur.replace(/[.\-]/g, '\\$&')} \\{([^}]*)\\}`, 'gm'))];
  expect(tous.length, `${selecteur}: no base rule found`).toBeGreaterThan(0);
  return tous[tous.length - 1]?.[1] ?? '';
}

describe('F-56 — every control on the buyer flow is a ≥ 44px target', () => {
  it('the discs, the chip, the stop and play buttons are 44 tall; « Voir » and « Refaire » grow their hit area', () => {
    for (const sel of ['.cl-shield', '.cl-round-btn', '.cl-voice-done-play']) {
      const r = regle(CLIENTE_STYLES, sel);
      expect(r, sel).toMatch(/width: 44px; height: 44px/);
    }
    expect(regle(CLIENTE_STYLES, '.cl-chip')).toContain('height: 44px');
    expect(regle(CLIENTE_STYLES, '.cl-rec-stop')).toContain('height: 44px');
    // « Voir » keeps its 12px face; the target is the padding, the layout the negative margin
    const voir = regle(CLIENTE_STYLES, '.cl-voir');
    expect(voir).toContain('min-height: 44px');
    expect(voir).toContain('padding: 16px 8px; margin: -16px -8px');
    expect(regle(CLIENTE_STYLES, '.cl-refaire')).toContain('min-height: 44px');
    // the vitrine's back button
    expect(regle(VITRINE_STYLES, '.vt-topbtn')).toMatch(/width: 44px; height: 44px/);
    expect(regle(VITRINE_STYLES, '.vt-topbar')).toContain('height: 44px');
    // and none of the named controls keeps a 40px box
    for (const sel of ['.cl-shield', '.cl-round-btn', '.cl-voice-done-play', '.cl-chip', '.cl-rec-stop', '.cl-voir', '.cl-refaire']) {
      expect(regle(CLIENTE_STYLES, sel), sel).not.toContain('40px');
    }
    for (const sel of ['.vt-topbtn', '.vt-topbar']) {
      expect(regle(VITRINE_STYLES, sel), sel).not.toContain('40px');
    }
  });
});

describe('F-57 — names, alerts, focus', () => {
  it('C3\'s three inputs carry an accessible name that says what they are', () => {
    const html = renderC3(BASE);
    expect(html).toMatch(/data-role="quartier-filtre" aria-label="Votre quartier"/);
    expect(html).toMatch(/data-role="repere" aria-label="Le repère"/);
    expect(html).toMatch(/data-role="phone" aria-label="Votre numéro, pour la livraison"/);
  });

  it('the two alert slots are live regions', () => {
    const liste = renderListeSheet([], new Set());
    expect(liste).toContain('data-role="liste-alerte" role="alert"');
    const screens = readFileSync(join(import.meta.dirname, '../src/cliente/screens.ts'), 'utf8');
    expect(screens).toContain('data-role="merci-alerte" role="alert"');
    const render = readFileSync(join(import.meta.dirname, '../src/vitrine/render.ts'), 'utf8');
    expect(render.match(/data-role="liste-alerte" role="alert"/g)).toHaveLength(3);
  });

  it('the stage is focusable and takes focus on a NEW screen only — never on the first paint, never on a same-screen state change', () => {
    const flow = readFileSync(join(import.meta.dirname, '../src/cliente/flow.ts'), 'utf8');
    expect(flow).toContain('<div class="cl-stage" tabindex="-1">');
    expect(flow).toContain("if (ecranPeint !== null && state.screen !== ecranPeint) {\n      container.querySelector<HTMLElement>('.cl-stage')?.focus({ preventScroll: true });");
    expect(CLIENTE_STYLES).toContain('.cl-stage:focus { outline: none; }');
  });
});
