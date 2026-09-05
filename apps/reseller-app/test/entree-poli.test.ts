import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedColour, shopColour } from '@platform/ui-tokens';
import { interaction } from '@platform/ui-tokens/legacy';
import rawCatalog from '../i18n/catalog.json';

/**
 * ═══ ENTREE-POLI-1 — the appearance pins (founder 2026-09-05: « go with A ») ═══
 *
 * The approved canvas: one WHITE card on the paper holding the form, a label
 * ABOVE every field, the WhatsApp number behind a « +226 » the service already
 * assumes, the note in green, the chosen rayons ticked in plum, a two-step rail
 * on the signup screen AND on the code door. A walk may not claim any of that
 * (`rendu-entree-poli` proves the screen WORKS); this file pins the shape by
 * TOKEN and by MEASURED RATIO — never by a copied hex — the opportunites-blanc
 * discipline.
 */

const appDir = join(new URL('.', import.meta.url).pathname, '..');
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const app = (): string => stripComments(readFileSync(join(appDir, 'App.tsx'), 'utf8'));
const styleOf = (src: string, key: string): string =>
  new RegExp(`\\n  ${key}:\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? 'STYLE NOT FOUND';

const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('ENTREE-POLI-1 — the card, by token', () => {
  it('the form lives on ONE white card with the canon card radius and a hairline edge', () => {
    const carte = styleOf(app(), 'entreeCarte');
    expect(carte, 'entreeCarte must exist').not.toBe('STYLE NOT FOUND');
    expect(carte).toContain('backgroundColor: sharedColour.card');
    expect(carte).toContain('borderRadius: radius.card');
    expect(carte).toContain('borderColor: sharedColour.hairline');
    expect(sharedColour.card).toBe('#FFFFFF');
  });

  it('every field carries a label ABOVE it in the caps scale, and the field itself is a token frame on the paper', () => {
    const src = app();
    const label = styleOf(src, 'champLabel');
    expect(label).toContain('t2.scale.caps.size');
    expect(label).toContain("textTransform: 'uppercase'");
    expect(label).toContain('CAPS_TRACK');
    const input = styleOf(src, 'champInput');
    expect(input).toContain('minHeight: touch.minTargetPx');
    expect(input).toContain('borderColor: sharedColour.hairlineInput');
    expect(input).toContain('backgroundColor: sharedColour.paper');
    // Label-above means the input no longer NAMES itself by placeholder — the
    // four signup fields and the two login fields must all read their name
    // from the label, and keep the accessibilityLabel the walks type into.
    const ecran = src.slice(src.indexOf('function EcranCompte('), src.indexOf('function EcranAdmission('));
    for (const cle of ['compte.nom', 'compte.telephone', 'compte.email', 'compte.mot_de_passe']) {
      expect(ecran, `${cle} must be the field's label`).toMatch(new RegExp(`<Text style=\\{styles\\.champLabel\\}>\\{t\\('${cle.replace('.', '\\.')}'\\)\\}</Text>`));
      expect(ecran, `${cle} must stay the field's accessibilityLabel`).toContain(`accessibilityLabel={t('${cle}')}`);
      expect(ecran, `${cle} must not double as a placeholder`).not.toContain(`placeholder={t('${cle}')}`);
    }
  });

  it('the number sits behind « +226 » — the prefix the service already assumes for an 8-digit number', () => {
    const src = app();
    expect(src).toMatch(/const INDICATIF_BF = '\+226';/);
    expect(src).toContain('{INDICATIF_BF}');
    // …and the WhatsApp note is the green note, with the phone glyph beside it.
    const note = styleOf(src, 'noteVerte');
    expect(note).toContain('backgroundColor: sharedColour.okBg');
    expect(styleOf(src, 'noteVerteTexte')).toContain('color: sharedColour.okFg');
    expect(src).toMatch(/<IconTelephone size=\{dimension\.iconSizePx\.listRow\} color=\{sharedColour\.okFg\} \/>\s*<Text style=\{styles\.noteVerteTexte\}>\{t\('compte\.telephone_aide'\)\}<\/Text>/);
  });

  it('a chosen rayon carries the tick, in plum, beside its name', () => {
    const src = app();
    expect(src).toMatch(/\{choisi && <IconCoche size=\{dimension\.iconSizePx\.badge\} color=\{shopColour\.primary\} \/>\}/);
    expect(styleOf(src, 'oppChipOn')).toContain('borderColor: shopColour.primary');
  });

  it('the rail is on BOTH screens — signup as step 1, the code door as step 2 — and it is one component', () => {
    const src = app();
    expect(src).toMatch(/<RailEntree etape="compte" \/>/);
    expect(src).toMatch(/<RailEntree etape="code" \/>/);
    expect((src.match(/function RailEntree\(/g) ?? []).length).toBe(1);
    // Step 1 done = the tick on the ok ground; the current step = plum.
    const rail = src.slice(src.indexOf('function RailEntree('), src.indexOf('function EcranCompte('));
    expect(rail).toContain('styles.railBulleFait : styles.railBulleOn');
    expect(styleOf(src, 'railBulleOn')).toContain('backgroundColor: shopColour.primary');
    expect(styleOf(src, 'railBulleFait')).toContain('backgroundColor: sharedColour.okBg');
  });

  it('the link row names BOTH the state and the act (« J\'ai déjà un compte » · « Me connecter ») with the canon chevron', () => {
    const src = app();
    const ecran = src.slice(src.indexOf('function EcranCompte('), src.indexOf('function EcranAdmission('));
    expect(ecran).toMatch(/<Text style=\{styles\.lienTexte\}>\{t\('compte\.deja'\)\}<\/Text>\s*<Text style=\{styles\.lienAction\}>\{t\('compte\.se_connecter'\)\}<\/Text>/);
    expect(ecran).toMatch(/<Text style=\{styles\.lienAction\}>\{t\('compte\.nouveau'\)\}<\/Text>/);
    expect(ecran).toMatch(/<IconChevron size=\{dimension\.iconSizePx\.listRow\} color=\{shopColour\.primary\} \/>/);
    expect(styleOf(src, 'lienRangee')).toContain('minHeight: touch.minTargetPx');
  });

  it('the new sentences exist in the catalog with their registers', () => {
    const catalog = rawCatalog as readonly { key: string; fr: string; register: string }[];
    const byKey = new Map(catalog.map((e) => [e.key, e]));
    expect(byKey.get('compte.etape_compte')?.fr).toBe('Votre compte');
    expect(byKey.get('compte.gratuit')?.fr).toBe('Gratuit. Votre compte est prêt en deux minutes.');
    expect(byKey.get('compte.gratuit')?.register).toBe('selling');
    // Founder 2026-09-05: « make voir/cacher » — his word « view », shorter and
    // warmer than Android's own « Afficher / Masquer ».
    expect(byKey.get('compte.voir')?.fr).toBe('Voir');
    expect(byKey.get('compte.cacher')?.fr).toBe('Cacher');
    expect(byKey.has('compte.afficher'), 'the retired key must be gone').toBe(false);
    expect(byKey.has('compte.masquer'), 'the retired key must be gone').toBe(false);
  });

  it('the password toggle is a ≥48dp control that PAIRS the eye with its word, and the field is masked by default', () => {
    const src = app();
    const ecran = src.slice(src.indexOf('function EcranCompte('), src.indexOf('function EcranAdmission('));
    expect(ecran).toContain('secureTextEntry={!mdpVisible}');
    // Anchored on THIS state: a bare `useState(false)` is also `plein`'s, and
    // would pass with the password visible by default (the verifier's catch).
    expect(ecran).toContain('const [mdpVisible, setMdpVisible] = useState(false);');
    expect(ecran).toMatch(/<IconOeil size=\{dimension\.iconSizePx\.listRow\} color=\{shopColour\.deep\} \/>\s*<Text style=\{styles\.mdpBasculeTexte\}>\{t\(mdpVisible \? 'compte\.cacher' : 'compte\.voir'\)\}<\/Text>/);
    expect(styleOf(src, 'mdpBascule')).toContain('minHeight: touch.minTargetPx');
  });

  it('the primary button carries the canvas\'s top-light: a native gradient from the on-primary tint into the plum, at a token-derived veil, with the colour still on backgroundColor', () => {
    const kit = stripComments(readFileSync(join(appDir, 'src/ui/kit.tsx'), 'utf8'));
    expect(kit).toContain("import { LinearGradient } from 'expo-linear-gradient';");
    // The veil is built ONCE (`LumiereBouton`) and rendered by the primary
    // button — and by the accueil hero (founder: « make the hero match »).
    const lumiereFn = kit.slice(kit.indexOf('export function LumiereBouton('), kit.indexOf('export function PrimaryButton('));
    expect(lumiereFn).toMatch(/<LinearGradient pointerEvents="none" colors=\{\[shopColour\.onPrimary, shopColour\.primary\]\} style=\{styles\.buttonLumiere\} \/>/);
    const bouton = kit.slice(kit.indexOf('export function PrimaryButton('), kit.indexOf('export function SecondaryButton('));
    expect(bouton).toMatch(/<LumiereBouton \/>\s*<Text style=\{styles\.buttonPrimaryText\}>/);
    // The clip must be APPLIED, not merely defined: without this the kit's
    // buttons would paint a square-cornered veil over the rounded plum while
    // the style-block pin below stayed green (the verifier's catch).
    expect(bouton).toContain('styles.buttonPrimaryHote');
    expect(styleOf(kit, 'buttonPrimary')).toContain('backgroundColor: shopColour.primary');
    // The hero: the same veil as the FIRST child of its Pressable, and its
    // style clips it — otherwise the veil paints square corners over the plum.
    const src = app();
    expect(src).toMatch(/styles\.sparkleCta, pressed && styles\.pressed\]\} onPress=\{\(\) => go\('opportunites'\)\} accessibilityRole="button">\s*(?:\{\}\s*)?<LumiereBouton \/>\s*<Text style=\{styles\.sparkleCtaText\}>/);
    expect(styleOf(src, 'sparkleCta')).toContain("overflow: 'hidden'");
    expect(styleOf(src, 'sparkleCta')).toContain('backgroundColor: shopColour.primary');
    expect((src.match(/<LumiereBouton \/>/g) ?? []).length, 'the hero is the ONE place outside the kit that renders the veil').toBe(1);
    const lumiere = styleOf(kit, 'buttonLumiere');
    expect(lumiere).toContain('StyleSheet.absoluteFill');
    expect(lumiere).toContain('interaction.pressedOpacity');
    expect(lumiere).not.toMatch(/opacity:\s*0?\.\d+/); // no bare number
    expect(styleOf(kit, 'buttonPrimaryHote')).toContain("overflow: 'hidden'");
    // The veil is between 10 % and 20 % — the canvas's 14 % white, in order of
    // magnitude — computed from the TOKEN, so a moved press-dim moves this pin.
    const veil = (1 - interaction.pressedOpacity) * 2;
    expect(veil).toBeGreaterThanOrEqual(0.1);
    expect(veil).toBeLessThanOrEqual(0.2);
  });
});

describe('ENTREE-POLI-1 — what the card does to legibility, measured', () => {
  it('every text on its ground clears AA', () => {
    const pairs: ReadonlyArray<readonly [string, string, string]> = [
      ['label (sub) on the white card', sharedColour.sub, sharedColour.card],
      ['typed text (ink) on the paper field', sharedColour.ink, sharedColour.paper],
      ['the +226 (deep) on the paper field', shopColour.deep, sharedColour.paper],
      ['the green note', sharedColour.okFg, sharedColour.okBg],
      ['the link (primary) on the paper', shopColour.primary, sharedColour.paper],
      ['the button label on the plum', shopColour.onPrimary, shopColour.primary],
      ['the ticked rayon (deep) on the soft', shopColour.deep, shopColour.soft],
      ['the subtitle (body) on the paper', sharedColour.body, sharedColour.paper],
    ];
    for (const [what, fg, bg] of pairs) {
      expect(ratio(fg, bg), `${what}: ${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1 — below AA 4.5`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the card edge is a hairline on the paper, not a border that shouts — and the card lifts off the paper', () => {
    expect(ratio(sharedColour.card, sharedColour.paper)).toBeGreaterThan(1.05);
    expect(ratio(sharedColour.hairline, sharedColour.card)).toBeLessThan(1.5);
  });
});
