import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WO-VITRINE-FLOW (founder redirect) — the marge slider obeys the tokens and the
 * pure clamp. Source-discipline (no RN renderer in the sandbox, like signature.test):
 * zero hardcoded colour/size, the value routes through the pinned `snapMarkup`, it is
 * a real gesture control (PanResponder) and an accessible adjustable.
 */

const appDir = join(import.meta.dirname, '..');
const src = readFileSync(join(appDir, 'src/ui/margin-slider.tsx'), 'utf8');

describe('MarginSlider (reseller-app)', () => {
  it('SCAN: zero hardcoded colours — every colour is a token', () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/(?:color|backgroundColor|borderColor):\s*'(?!#)[a-z]+'/);
  });

  it('SCAN: zero hardcoded size/spacing/radius — every number is a token expression', () => {
    const SIZE_PROPS =
      /(?:fontSize|lineHeight|borderRadius|border[A-Za-z]*Width|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|margin[A-Za-z]*|minHeight|minWidth|maxWidth|height|width|gap|letterSpacing|top|bottom|left|right):\s*(\d+(?:\.\d+)?)\b/g;
    const offenders: string[] = [];
    for (const m of src.matchAll(SIZE_PROPS)) {
      if (Number(m[1]) !== 0) offenders.push(m[0]);
    }
    expect(offenders, `margin-slider hardcodes: ${offenders.join(' · ')}`).toEqual([]);
  });

  it('the value routes through the PURE snapMarkup (step + clamp), never re-derived here', () => {
    expect(src).toMatch(/import \{ snapMarkup \} from '\.\.\/vitrine\/margin'/);
    expect(src).toMatch(/snapMarkup\(raw, capRef\.current\)/);
  });

  it('it is a real gesture control (PanResponder), tap or drag, and an accessible adjustable', () => {
    expect(src).toMatch(/PanResponder\.create/);
    expect(src).toMatch(/onStartShouldSetPanResponder/);
    expect(src).toMatch(/onPanResponderMove/);
    expect(src).toMatch(/accessibilityRole="adjustable"/);
    expect(src).toMatch(/accessibilityValue=\{\{ min: 0, max: cap, now: value \}\}/);
  });

  it('the piste + pouce come from tokens (planche fpr geometry, RN-rebuilt)', () => {
    expect(src).toMatch(/import \{[^}]*\} from '@platform\/ui-tokens';/);
    expect(src).toMatch(/import \{[^}]*\} from '@platform\/ui-tokens\/legacy';/);
    expect(src).toMatch(/backgroundColor: shopColour\.primary/); // the pouce + fill accent
    expect(src).toMatch(/height: spacing\.sm/); // the 8 px piste
  });
});
