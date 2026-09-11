import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERRER_POLICY, hachagesInline, injecterPolitique, politiqueContenu } from '../vite.config';

/**
 * POLITIQUE-CONTENU-1 (AUDIT-SHOP-2 F-61) — the policy, pinned by value on the
 * two real pages. What a wrong policy costs is silent: a blocked restore
 * script and no deep link ever boots; a missing origin and the map, a voice
 * note or every call to the service dies without a word on screen. So the
 * hashes are recomputed here from the pages' own bytes, the origins are read
 * back for the three bases a build can have, and the shape of every line is
 * held. The browser's own enforcement — no violation on the real screens,
 * and a planted script or fetch refused — is `e2e/csp.spec.ts`.
 */

const racine = join(import.meta.dirname, '..');
const INDEX = readFileSync(join(racine, 'index.html'), 'utf8');
const QUATRE_CENT_QUATRE = readFileSync(join(racine, 'public', '404.html'), 'utf8');
const DEPLOI = 'https://storefront-service.ilboudobernard2.workers.dev';
const HARNAIS = 'http://127.0.0.1:9099/api';

const sha256 = (s: string): string => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const meta = (html: string, nom: 'http-equiv' | 'name', valeur: string): string => {
  const m = new RegExp(`<meta ${nom}="${valeur}" content="([^"]*)" />`).exec(html);
  if (m === null) throw new Error(`no <meta ${nom}="${valeur}"> in the page`);
  return m[1] as string;
};
const directive = (politique: string, nom: string): string => {
  const d = politique.split('; ').find((x) => x.startsWith(`${nom} `) || x === nom);
  if (d === undefined) throw new Error(`no ${nom} directive in: ${politique}`);
  return d;
};

describe('POLITIQUE-CONTENU-1 — the inline restore scripts are named by their exact bytes', () => {
  it('index.html: ONE classic inline script (the SPA restore), hashed over the bytes between its tags', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(INDEX)![1] as string;
    expect(script).toContain('replaceState'); // it is the restore, not something else
    expect(hachagesInline(INDEX)).toEqual([sha256(script)]);
    // The module entry is NOT an inline script: it is `'self'`, never a hash.
    expect(INDEX).toMatch(/<script type="module" src="\/src\/main\.ts"><\/script>/);
  });

  it('404.html: its own inline script, its own hash — never index.html’s', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(QUATRE_CENT_QUATRE)![1] as string;
    expect(script).toContain('pathSegmentsToKeep');
    expect(hachagesInline(QUATRE_CENT_QUATRE)).toEqual([sha256(script)]);
    expect(hachagesInline(QUATRE_CENT_QUATRE)).not.toEqual(hachagesInline(INDEX));
  });

  it('an edited script is a different hash — the policy cannot go stale silently', () => {
    const edite = INDEX.replace('replaceState', 'replaceState /* edited */');
    expect(hachagesInline(edite)).not.toEqual(hachagesInline(INDEX));
  });
});

describe('POLITIQUE-CONTENU-1 — the lines, for the three bases a build can have', () => {
  it('the deploy base: the Worker is the ONE connect origin; images and media may be any https origin; no unsafe script', () => {
    const p = politiqueContenu(INDEX, DEPLOI);
    expect(directive(p, 'default-src')).toBe("default-src 'self'");
    expect(directive(p, 'script-src')).toBe(`script-src 'self' ${hachagesInline(INDEX)[0]}`);
    expect(directive(p, 'script-src')).not.toContain('unsafe');
    expect(p).not.toContain("'unsafe-eval'");
    expect(directive(p, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(p, 'img-src')).toBe("img-src 'self' data: blob: https:");
    expect(directive(p, 'media-src')).toBe("media-src 'self' data: blob: https:");
    expect(directive(p, 'font-src')).toBe("font-src 'self'");
    expect(directive(p, 'connect-src')).toBe(`connect-src 'self' ${DEPLOI}`);
    expect(directive(p, 'worker-src')).toBe("worker-src 'self'");
    expect(directive(p, 'manifest-src')).toBe("manifest-src 'self'");
    expect(directive(p, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(p, 'form-action')).toBe("form-action 'self'");
    expect(directive(p, 'object-src')).toBe("object-src 'none'");
    expect(directive(p, 'frame-src')).toBe("frame-src 'none'");
    // …and nothing that a <meta> cannot carry, or that would upgrade the harness.
    expect(p).not.toContain('frame-ancestors');
    expect(p).not.toContain('report-uri');
    expect(p).not.toContain('upgrade-insecure-requests');
  });

  it('the harness base (http, local): named on connect, img and media — the tiles, the voice notes and every call still load', () => {
    const p = politiqueContenu(INDEX, HARNAIS);
    expect(directive(p, 'connect-src')).toBe("connect-src 'self' http://127.0.0.1:9099");
    expect(directive(p, 'img-src')).toBe("img-src 'self' data: blob: https: http://127.0.0.1:9099");
    expect(directive(p, 'media-src')).toBe("media-src 'self' data: blob: https: http://127.0.0.1:9099");
  });

  it('no base (the demo build): connect is self alone — the demo talks to nobody', () => {
    for (const base of [undefined, '']) {
      const p = politiqueContenu(INDEX, base);
      expect(directive(p, 'connect-src')).toBe("connect-src 'self'");
      expect(directive(p, 'img-src')).toBe("img-src 'self' data: blob: https:");
    }
  });
});

describe('POLITIQUE-CONTENU-1 — where the metas land', () => {
  it('index.html: both metas right after the charset, BEFORE the inline script they govern; the referrer policy explicit', () => {
    const html = injecterPolitique(INDEX, DEPLOI);
    expect(meta(html, 'http-equiv', 'Content-Security-Policy')).toBe(politiqueContenu(INDEX, DEPLOI));
    expect(meta(html, 'name', 'referrer')).toBe(REFERRER_POLICY);
    expect(REFERRER_POLICY).toBe('strict-origin-when-cross-origin');
    const iCharset = html.indexOf('<meta charset="UTF-8" />');
    const iCsp = html.indexOf('http-equiv="Content-Security-Policy"');
    const iScript = html.indexOf('<script>');
    expect(iCharset).toBeGreaterThanOrEqual(0);
    expect(iCsp).toBeGreaterThan(iCharset);
    expect(iScript).toBeGreaterThan(iCsp);
    // The page's own bytes are otherwise untouched: the script it hashes is still there, verbatim.
    expect(html).toContain(/<script>([\s\S]*?)<\/script>/.exec(INDEX)![0]);
  });

  it('404.html: the same placement, its own hash', () => {
    const html = injecterPolitique(QUATRE_CENT_QUATRE, DEPLOI);
    expect(meta(html, 'http-equiv', 'Content-Security-Policy')).toContain(hachagesInline(QUATRE_CENT_QUATRE)[0]);
    expect(html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(html.indexOf('<script>'));
  });

  it('a page without the charset anchor is a build error, never a page without a policy', () => {
    expect(() => injecterPolitique('<html><head><script>x</script></head></html>', DEPLOI)).toThrow(/charset/);
  });
});
