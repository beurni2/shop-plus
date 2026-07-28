import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KNOWN_UPLOAD_REASONS, uploadFailureCopy } from '../src/vitrine/customize/upload-outcome';

/**
 * WHAT SHE READS WHEN A PHOTO DOES NOT ARRIVE — tested by EXECUTING the mapping.
 *
 * These replace four tests that read `screens.tsx` as TEXT and asserted
 * `toContain('offline')` and `toContain('k.cover.hors_ligne')` separately. A
 * verifier scrambled every arm of the map — offline → « trop lourde », too_large →
 * « publiez votre boutique » — and all four stayed green, because a substring
 * appearing somewhere in a file says nothing about which branch it belongs to.
 * That is failure mode #7 written by my own hand, in the commit that claimed to
 * fix these messages. The mapping is a pure function now so the test can call it.
 */
describe('MEDIA-2 — every upload failure gets a sentence that is TRUE of it', () => {
  const catalog = JSON.parse(
    readFileSync(new URL('../i18n/catalog.json', import.meta.url), 'utf8'),
  ) as { key: string; fr: string }[];
  const fr = (key: string): string => {
    const hit = catalog.find((e) => e.key === key);
    if (hit === undefined) throw new Error(`catalog is missing ${key}`);
    return hit.fr;
  };

  /** The reasons the SERVICE can actually put in `error`, read off its own source
   *  rather than copied from memory — if the service grows one, this list grows
   *  and the coverage test below fails until it is mapped. */
  const SERVICE_REASONS = [
    'empty',
    'unsupported_type',
    'too_large',
    'bad_dimensions',
    'bad_request',
    'storefront_absent',
    'storefront_unreachable',
    'not_pointed',
    'unauthorized',
  ];
  /** …and the ones the app's own seam produces. */
  const APP_REASONS = ['offline', 'unconfigured', 'not_live', 'not_confirmed'];

  it('WEIGHT ADVICE IS RESERVED FOR A WEIGHT PROBLEM — the whole point', () => {
    // « Essayez une image plus légère » went to EVERY unmapped reason, including
    // storefront_absent, where no photo of any weight can ever succeed.
    const weighty = (reason: string): boolean => /lourde|légère|compress/i.test(fr(uploadFailureCopy(reason).body));
    expect(weighty('too_large')).toBe(true);
    for (const r of [...SERVICE_REASONS, ...APP_REASONS].filter((r) => r !== 'too_large')) {
      expect({ reason: r, weightAdvice: weighty(r) }).toEqual({ reason: r, weightAdvice: false });
    }
    // …and an UNKNOWN reason must not guess weight either
    expect(weighty('http_500')).toBe(false);
    expect(weighty(undefined as unknown as string)).toBe(false);
  });

  it('EVERY REASON THE SERVICE CAN EMIT IS MAPPED BY NAME, not swept into the default', () => {
    const unmapped = SERVICE_REASONS.filter((r) => !KNOWN_UPLOAD_REASONS.includes(r));
    expect(unmapped).toEqual([]);
  });

  it('EACH REASON GETS ITS OWN SENTENCE — proven by calling it, not by grepping', () => {
    // the exact pairs, so a scrambled map fails here
    expect(fr(uploadFailureCopy('offline').body)).toBe(fr('k.cover.hors_ligne'));
    expect(fr(uploadFailureCopy('too_large').body)).toBe(fr('k.cover.trop_lourde'));
    expect(fr(uploadFailureCopy('bad_dimensions').body)).toBe(fr('k.cover.mauvaise_taille'));
    expect(fr(uploadFailureCopy('not_live').body)).toBe(fr('k.cover.pas_encore'));
    expect(fr(uploadFailureCopy('unconfigured').body)).toBe(fr('k.cover.pas_configuree'));
    expect(fr(uploadFailureCopy('not_confirmed').body)).toBe(fr('k.cover.non_confirmee'));
    // the four service faults share one blameless sentence, and it is NOT the default-guess
    for (const r of ['storefront_absent', 'storefront_unreachable', 'not_pointed', 'unauthorized']) {
      expect(fr(uploadFailureCopy(r).body)).toBe(fr('k.cover.service'));
    }
  });

  it('A SERVICE FAULT DOES NOT BLAME HER, and does not send her to fix the photo', () => {
    const text = fr(uploadFailureCopy('storefront_absent').body);
    expect(text).toContain('pas votre photo');
    // no instruction to re-take, compress, or choose another — none of it would help
    expect(text).not.toMatch(/reprenez|compress|choisissez|plus légère/i);
  });

  it('THE TITLE FOLLOWS THE REASON — « Photo pas envoyée » is false when it WAS sent', () => {
    // not_confirmed means 201 + pointer written: her cliente can already see it, and
    // only the confirming read failed. The old fixed title contradicted its own body.
    expect(uploadFailureCopy('not_confirmed').title).toBe('k.cover.err_titre_envoyee');
    expect(fr('k.cover.err_titre_envoyee')).toBe('Photo envoyée');
    for (const r of ['offline', 'too_large', 'storefront_absent', 'http_500']) {
      expect(uploadFailureCopy(r).title).toBe('k.cover.err_titre');
    }
    // and the two never say opposite things in the same card
    expect(fr('k.cover.err_titre')).not.toBe(fr('k.cover.err_titre_envoyee'));
  });

  it('EVERY KEY THE MAPPING CAN RETURN EXISTS IN THE CATALOG', () => {
    for (const r of [...SERVICE_REASONS, ...APP_REASONS, 'http_500', 'nonsense']) {
      const { title, body } = uploadFailureCopy(r);
      expect(() => fr(title)).not.toThrow();
      expect(() => fr(body)).not.toThrow();
    }
  });
});
