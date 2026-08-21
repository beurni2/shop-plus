import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDom, makeCtx, type InstalledDom } from './doubles/dom';
import { t } from '../src/i18n';

/**
 * RENDU-RÉEL — the composeur screen is DRIVEN, not read (founder standing order
 * 2026-08-10). reseller-kit had no such harness; this is the first slice to touch
 * its screen, so it builds one. It mounts the REAL `main.ts` (side-effect module),
 * presses the REAL « Créer l'image », and asks the four questions the law names:
 * did the tree survive · is the primary action present + pressable + wired · does a
 * failed act leave a way out · can she reach the next step. Only the native seams
 * (canvas context, toBlob, the anchor download) are doubled; no app code is stubbed.
 *
 * Audit F1 lives here: a null blob (a real full-resolution outcome on a 1GB Android)
 * and a canvas that yields no 2D context must both leave the screen usable, never
 * stuck on « Rendue… » or blanked by an uncaught throw.
 */

let dom: InstalledDom | undefined;
afterEach(() => {
  dom?.restore();
  dom = undefined;
  vi.resetModules();
});

/** Mount the real main.ts against a fresh DOM double. */
async function mount(opts?: Parameters<typeof installDom>[0]): Promise<InstalledDom> {
  vi.resetModules();
  dom = installDom(opts);
  await import('../src/main.js');
  return dom;
}

const ctaOf = (d: InstalledDom) => d.find((n) => n.className === 'cta');
const statusOf = (d: InstalledDom) => d.find((n) => n.className === 'status');

describe('rendu-réel — the composeur screen (audit F1)', () => {
  it('the primary action is present, pressable, wired, and reaches the next step', async () => {
    const d = await mount({ online: true });
    const cta = ctaOf(d);
    expect(cta, 'the « Créer l\'image » button must be in the tree').toBeDefined();
    expect(cta!.textContent).toBe(t('kit.cta'));
    expect(cta!.listeners.get('click')?.length, 'the CTA must be wired to a handler').toBe(1);

    const status = statusOf(d)!;
    expect(status.textContent).toBe(''); // render() cleared it

    cta!.dispatchClick();
    // Reached the next step: the JPEG was saved to the phone.
    expect(d.downloads.length).toBe(1);
    expect(d.downloads[0]!.download).toBe('shop-plus-story.jpg');
    expect(status.textContent).toBe(t('kit.etat_prete'));
  });

  it('a failed JPEG encode (null blob) shows an error + retry, never a stuck « Rendue… »', async () => {
    const d = await mount({ toBlob: () => null });
    const cta = ctaOf(d)!;
    cta.dispatchClick();

    const status = statusOf(d)!;
    expect(status.textContent, 'a null blob must not strand the user on « Rendue… »').not.toBe(t('kit.etat_rendu'));
    expect(status.textContent).toBe(t('kit.etat_echec'));
    // The way out: nothing downloaded, and the CTA is still there to press again.
    expect(d.downloads.length).toBe(0);
    expect(cta.listeners.get('click')?.length).toBe(1);
  });

  it('a canvas that yields no 2D context on export leaves a way out, not an uncaught throw', async () => {
    // Preview (role="img") draws so the mount succeeds; the export canvas (no role)
    // yields no context, so paint() throws inside the click handler.
    const d = await mount({ contextFor: (role) => (role === 'img' ? makeCtx() : null) });
    const cta = ctaOf(d)!;
    expect(() => cta.dispatchClick(), 'the failed export must not throw out of the tap').not.toThrow();

    const status = statusOf(d)!;
    expect(status.textContent).toBe(t('kit.etat_echec'));
    expect(d.downloads.length).toBe(0);
    expect(cta.listeners.get('click')?.length).toBe(1);
  });

  it('a canvas that yields no 2D context at first paint still builds a usable screen', async () => {
    // The preview canvas (role="img") yields no context, so the module-level
    // render() cannot paint — the tree must still survive with an honest status.
    await expect(
      mount({ contextFor: (role) => (role === 'img' ? null : makeCtx()) }),
    ).resolves.toBeDefined();

    const cta = ctaOf(dom!);
    expect(cta, 'the tree must survive a first-paint failure').toBeDefined();
    expect(cta!.textContent).toBe(t('kit.cta'));
    expect(statusOf(dom!)!.textContent).toBe(t('kit.etat_echec'));
  });
});
