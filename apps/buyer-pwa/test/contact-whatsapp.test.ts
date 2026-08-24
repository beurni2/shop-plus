import { describe, expect, it } from 'vitest';
import { httpStorefrontPort, demoStorefrontPort } from '../src/vitrine/profile';
import { renderC1, type ClienteProduit } from '../src/cliente/screens';
import { clienteProduitReel } from '../src/cliente/seed';
import { ROBE } from '../src/cliente/seed';
import type { Storefront } from '@platform/contracts';

/**
 * ═══ CONTACT-WHATSAPP-1 (founder order 2026-08-23) — « on each product an
 * option where buyers can tap and send a private WhatsApp message or audio to
 * the reseller about that specific product » ═══
 *
 * The number is the reseller's REGISTRATION phone, vouched server-side
 * (active account only) and re-checked at the port boundary; the tap is an
 * ANCHOR to wa.me with the product already named in the draft — WhatsApp's
 * own composer is where « message or audio » happens, nothing here records.
 */

const resolvedDemo = (await demoStorefrontPort('default').resolve('aicha-4821'))!;
const REAL_VIEW: Storefront = {
  ...resolvedDemo.storefront,
  id: 'sf_wa_1',
  resellerId: 'res_wa_1',
  slug: 'binta-7412',
  name: 'Chez Binta',
  curatedItems: ['pv_wa_a'],
  featuredItems: [],
  sections: [],
};

function withStubbedFetch<T>(body: unknown, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

describe('the port boundary — digits ride, everything else is absent', () => {
  it('a served whatsapp of wa.me digits arrives on the resolve', async () => {
    const got = await withStubbedFetch({ ...REAL_VIEW, whatsapp: '22670112233' }, () =>
      httpStorefrontPort('https://svc.example').resolve('binta-7412'),
    );
    expect(got!.whatsapp).toBe('22670112233');
  });
  it('absence and hostile shapes are all the same honest no-contact', async () => {
    for (const mauvais of [undefined, '', 'appelez-moi', '70 11 22 33', '123456789', 12345678901, { d: '226' }]) {
      const got = await withStubbedFetch(
        { ...REAL_VIEW, ...(mauvais !== undefined ? { whatsapp: mauvais } : {}) },
        () => httpStorefrontPort('https://svc.example').resolve('binta-7412'),
      );
      expect(got!.whatsapp, JSON.stringify(mauvais)).toBeUndefined();
    }
  });
  it('the demo port serves no number — the offline harness never renders a tap to nobody', async () => {
    expect(resolvedDemo.whatsapp).toBeUndefined();
  });
});

describe('the thread — the resolved contact rides into the C1 model, conditionally', () => {
  const storefront = { name: 'Chez Binta', slug: 'binta-7412', theme: 'laterite' as const, zone: 'Gounghin' };
  const product = { pid: 'pv_wa_a', name: 'Bazin riche', priceFcfa: 12_000, inStock: true, assetRefs: [] as string[] };
  it('with a number: produit.whatsapp carries it', () => {
    const { produit } = clienteProduitReel({ ...storefront, whatsapp: '22670112233' }, product, undefined);
    expect(produit.whatsapp).toBe('22670112233');
  });
  it('without: the KEY is absent, never an explicit undefined', () => {
    const { produit } = clienteProduitReel(storefront, product, undefined);
    expect('whatsapp' in produit).toBe(false);
  });
});

describe('C1 — the tap renders as an anchor the OS hands to WhatsApp', () => {
  const avec: ClienteProduit = { ...ROBE, whatsapp: '22670112233' };
  it('present: exactly one anchor, href pinned — wa.me digits + the product named in the draft', () => {
    const html = renderC1(avec, { epuise: false, sansVoix: true });
    const attendu = `https://wa.me/22670112233?text=${encodeURIComponent(
      `Bonjour ${ROBE.prenom}, je vous écris au sujet de « ${ROBE.productName}${ROBE.variant ? ` — ${ROBE.variant}` : ''} » vu sur ${ROBE.shopName}.`,
    )}`;
    expect(html.match(/data-role="whatsapp"/g) ?? []).toHaveLength(1);
    expect(html).toContain(`href="${attendu.replace(/&/g, '&amp;')}"`);
    // a NEW TAB with no opener back-channel — the boutique stays where she was
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // the label speaks WhatsApp and her name; the sub says message OR vocal
    expect(html).toContain(`Écrire à ${ROBE.prenom} sur WhatsApp`);
    expect(html).toContain('Message ou note vocale');
    // Commander stays the ONE primary action — the row is not a cl-cta
    expect(html.match(/class="cl-cta /g) ?? []).toHaveLength(1);
  });
  it('épuisé keeps the tap — « quand est-ce qu’il revient ? » is a WhatsApp question', () => {
    const html = renderC1(avec, { epuise: true, sansVoix: true });
    expect(html.match(/data-role="whatsapp"/g) ?? []).toHaveLength(1);
  });
  it('absent: no anchor, no wa.me byte anywhere', () => {
    const html = renderC1(ROBE, { epuise: false, sansVoix: true });
    expect(html).not.toContain('data-role="whatsapp"');
    expect(html).not.toContain('wa.me');
  });
  it('the number never appears as VISIBLE text — it lives in the href alone', () => {
    const html = renderC1(avec, { epuise: false, sansVoix: true });
    const visible = html.replace(/<[^>]+>/g, ' ');
    expect(visible).not.toContain('22670112233');
  });
  it('a hostile product name cannot break out of the attribute', () => {
    const hostile: ClienteProduit = { ...avec, productName: 'Robe "&<zip>" spéciale' };
    const html = renderC1(hostile, { epuise: false, sansVoix: true });
    // still one well-formed anchor; the raw quote never lands unescaped inside the href attribute
    expect(html.match(/data-role="whatsapp"/g) ?? []).toHaveLength(1);
    const href = /href="([^"]+)"/.exec(html)![1]!;
    expect(href.startsWith('https://wa.me/22670112233?text=')).toBe(true);
    expect(href).not.toContain('<zip>');
  });
});
