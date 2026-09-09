import { expect, test } from '@playwright/test';
import { ENTETE_KEYS } from '../src/vitrine/entetes';

/**
 * ═══ CONFIANCE-LISIBLE-1 (AUDIT-SHOP-2 F-25) — legibility MEASURED in the
 * real renderer, on every header style ═══
 *
 * The audit's static reading found trust-row and proof text at 8–9.5 px and
 * several colours under 4.5:1 (pagne `.pg-cell-s--o` 3.87:1, `.pg-stars`
 * 3.20:1). A static scan cannot see what a word sits on — a gradient, a
 * photograph, a rotated panel — so this walk asks Chromium: for every text
 * node inside the mounted header that renders under 12 px, the computed
 * size, its colour, and the nearest SOLID background behind it. It asserts
 * the floor (≥ 10 px, labels ≥ 11 px) and WCAG AA contrast (≥ 4.5:1) where a
 * solid background can be named; a word over a gradient or an image is
 * reported, never judged — that stays with the founder's eyes in sunlight.
 */

type Mesure = {
  readonly style: string;
  readonly classe: string;
  readonly texte: string;
  readonly taille: number;
  readonly couleur: string;
  readonly fond: string | null;
  readonly contraste: number | null;
};

function luminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbDe(css: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(css);
  if (m === null) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

/** Composite a translucent colour over a solid one (source-over). */
function surFond(avant: [number, number, number, number], fond: [number, number, number]): [number, number, number] {
  const a = avant[3];
  return [
    Math.round(avant[0] * a + fond[0] * (1 - a)),
    Math.round(avant[1] * a + fond[1] * (1 - a)),
    Math.round(avant[2] * a + fond[2] * (1 - a)),
  ];
}

for (const key of ENTETE_KEYS) {
  test(`${key}: trust and proof text at ≥ 10 px (labels ≥ 11 px), and ≥ 4.5:1 over every solid background`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const fautes: string[] = [];
    const rapport: Mesure[] = [];
    await page.goto(`/?demo-vitrine=aicha-4821&entete=${key}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    const brut = await page.evaluate(() => {
      const racine = document.querySelector('.vt-root');
      if (racine === null) return [];
      const grille = document.querySelector('.vt-grid, [data-role="vitrine-grid"]');
      const sortie: Array<{ classe: string; texte: string; taille: number; couleur: string; fond: string | null; gradient: boolean }> = [];
      const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
      let noeud: Node | null;
      // eslint-disable-next-line no-cond-assign
      while ((noeud = marcheur.nextNode())) {
        const texte = (noeud.textContent ?? '').trim();
        if (texte === '') continue;
        const el = noeud.parentElement;
        if (el === null || (grille !== null && grille.contains(el))) continue;
        const cs = getComputedStyle(el);
        const taille = parseFloat(cs.fontSize);
        if (!(taille < 12)) continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || el.getBoundingClientRect().height === 0) continue;
        // the nearest SOLID background: the first ancestor painting an opaque
        // background-color with no background-image; a gradient or an image on
        // the way marks the measure as not computable.
        let fond: string | null = null;
        let gradient = false;
        for (let a: HTMLElement | null = el; a !== null; a = a.parentElement) {
          const s = getComputedStyle(a);
          const m = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/.exec(s.backgroundColor);
          const opaque = m !== null && (m[1] === undefined || Number(m[1]) >= 0.98);
          // (verifier) a TILED pattern (a background-size is set) is dots over a
          // declared colour — judged against that colour, as the eye reads it; a
          // full-cover gradient or an image stays reported, never judged.
          if (s.backgroundImage !== 'none' && !(s.backgroundSize !== 'auto' && opaque)) { gradient = true; break; }
          if (opaque) { fond = s.backgroundColor; break; }
        }
        sortie.push({ classe: el.className.toString(), texte: texte.slice(0, 40), taille, couleur: cs.color, fond, gradient });
      }
      return sortie;
    });
    for (const m of brut) {
      const c = rgbDe(m.couleur);
      const f = m.fond === null ? null : rgbDe(m.fond);
      let ratio: number | null = null;
      if (c !== null && f !== null && !m.gradient) {
        const fondSolide: [number, number, number] = [f[0], f[1], f[2]];
        ratio = contraste(c[3] < 1 ? surFond(c, fondSolide) : [c[0], c[1], c[2]], fondSolide);
      }
      rapport.push({ style: key, classe: m.classe, texte: m.texte, taille: m.taille, couleur: m.couleur, fond: m.gradient ? 'gradient/image' : m.fond, contraste: ratio });
      const label = /cell-l\b/.test(m.classe);
      if (m.taille < 10 || (label && m.taille < 11)) {
        fautes.push(`${key} .${m.classe.split(' ').pop()} « ${m.texte} » ${m.taille}px`);
      }
      if (ratio !== null && ratio < 4.5) {
        fautes.push(`${key} .${m.classe.split(' ').pop()} « ${m.texte} » ${m.couleur} on ${m.fond} = ${ratio.toFixed(2)}:1`);
      }
    }
    test.info().annotations.push({ type: 'mesures', description: JSON.stringify(rapport) });
    expect(rapport.length, 'the walk must have measured something').toBeGreaterThan(0);
    expect(fautes, `legibility faults:\n${fautes.join('\n')}`).toEqual([]);
  });
}
