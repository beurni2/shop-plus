import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shopColour, type as t2, radius } from '@platform/ui-tokens';
import { interaction } from '@platform/ui-tokens/legacy';

/**
 * WO-FP-SHOP · the signature module obeys the tokens. Same DoD as the kit's
 * scan ("zero hardcoded colors/sizes — a scan proves it"), plus the six named
 * elements are present, money is tabular, typefaces are the canon families, and
 * ranges resolve through the one documented rule. Source-discipline: the repo
 * asserts the source (no RN renderer), like grand-teint.test.ts / ui-kit.test.ts.
 */

const appDir = join(import.meta.dirname, '..');
const src = readFileSync(join(appDir, 'src/ui/signature.tsx'), 'utf8');

describe('WO-FP-SHOP signature module (reseller-app)', () => {
  it('SCAN: zero hardcoded colors — every colour is a token', () => {
    expect(src, 'signature.tsx carries a hex color').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src, 'signature.tsx carries an rgb() color').not.toMatch(/\brgba?\(/);
    expect(src, 'signature.tsx carries a named CSS color literal').not.toMatch(/(?:color|backgroundColor|borderColor):\s*'(?!#)[a-z]+'/);
  });

  it('SCAN: zero hardcoded size/spacing/radius values — every number is a token expression', () => {
    const SIZE_PROPS =
      /(?:fontSize|lineHeight|borderRadius|border[A-Za-z]*Width|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|margin[A-Za-z]*|minHeight|minWidth|maxWidth|height|width|gap|letterSpacing|top|bottom|left|right):\s*(\d+(?:\.\d+)?)\b/g;
    const offenders: string[] = [];
    for (const m of src.matchAll(SIZE_PROPS)) {
      if (Number(m[1]) !== 0) offenders.push(m[0]);
    }
    expect(offenders, `signature.tsx hardcodes size values: ${offenders.join(' · ')}`).toEqual([]);
  });

  it('the six ownable elements are all exported', () => {
    for (const name of ['WovenBand', 'HeroLedger', 'DuotoneTile', 'SelectionSwap', 'CornerTicks', 'QuoteRule']) {
      expect(src, `missing signature element ${name}`).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it('colour/type/radius resolve to Faso Premium v2; the deferred geometry groups resolve to /legacy', () => {
    // v2 root — the reskinned groups
    expect(src).toMatch(/import \{[^}]*\} from '@platform\/ui-tokens';/);
    expect(src).toMatch(/sharedColour|shopColour/);
    // /legacy — the groups v2 defers to their own slices (spacing, interaction, band, money)
    expect(src).toMatch(/import \{[^}]*\} from '@platform\/ui-tokens\/legacy';/);
    expect(src).toMatch(/spacing[^']*from '@platform\/ui-tokens\/legacy'/s);
  });

  it('typefaces are the canon token families (faso-fonts), never a literal family string', () => {
    expect(src).toMatch(/import \{ DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_SEMIBOLD, TEXT_FAMILY_BOLD \} from '\.\/faso-fonts'/);
    // display for the money hero + tile glyph; text (regular + semibold + bold) for labels/rules
    expect(src).toMatch(/fontFamily: DISPLAY_FAMILY/);
    expect(src).toMatch(/fontFamily: TEXT_FAMILY\b/);
    expect(src).toMatch(/fontFamily: TEXT_FAMILY_BOLD/);
    // the reconcile whisper now names the loaded 600 face (the forward-fix)
    expect(src).toMatch(/fontFamily: TEXT_FAMILY_SEMIBOLD/);
    expect(src, 'a literal font-family string leaked').not.toMatch(/fontFamily:\s*'[^']+'/);
  });

  it('every franc figure renders tabular (money-render discipline) and the hero is Bricolage 800', () => {
    // the hero ledger amount + the quote rule are tabular
    expect(src.match(/fontVariant: \['tabular-nums'\]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // the hero money is the display face at the canon weight, not an invented size
    expect(src).toMatch(/fontSize: rmax\(t2\.scale\.heroMoney\.size\)/);
    expect(t2.scale.heroMoney.wght).toBe(800);
  });

  it('ranges resolve through the ONE documented rule (rmax → max), never a collapsed literal', () => {
    expect(src).toMatch(/const rmax = /);
    // heroMoney size is a canon range; it must go through rmax, not a hand-picked number
    expect(src).toMatch(/rmax\(t2\.scale\.heroMoney\.size\)/);
    expect(t2.scale.heroMoney.size).toHaveProperty('max');
  });

  it('selection is STRUCTURAL — the swap changes shape (plus to canon check), the ticks are an accent frame', () => {
    // the swap is a real shape change, not a tint: off = bordered disc, on = filled accent
    expect(src).toMatch(/swapOff:.*borderWidth: interaction\.hairline\.strong/s);
    expect(src).toMatch(/swapOn: \{ backgroundColor: shopColour\.primary \}/);
    // the selected check is the CANON SVG glyph (no emoji/text symbol in chrome, §8)
    expect(src).toMatch(/import \{ IconCoche \} from '\.\/icons'/);
    expect(src).toMatch(/<IconCoche size=\{dimension\.iconSizePx\.badge\}/);
    expect(src, 'the swap uses a text checkmark instead of the canon glyph').not.toMatch(/[\u{2600}-\u{27BF}]/u);
    // the corner ticks come from the interaction token, four corners
    expect(src).toMatch(/interaction\.cornerTick\.sizePx/);
    expect(interaction.cornerTick.strokePx).toBeGreaterThan(0);
    expect(radius.pill).toBeGreaterThan(0);
    expect(shopColour.primary).toMatch(/^#/);
  });
});
