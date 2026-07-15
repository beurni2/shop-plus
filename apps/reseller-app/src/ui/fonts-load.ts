import { DISPLAY_FAMILY, TEXT_FAMILY, TEXT_FAMILY_SEMIBOLD, TEXT_FAMILY_BOLD } from './faso-fonts';

/**
 * WO-FP-SHOP — the expo-font load map for the reseller surface. ISOLATED here
 * because it `require`s .ttf assets (Metro-only): App.tsx is the sole importer,
 * so the kit, the signature module, and every vitest source-scan stay free of
 * asset requires. The faces are STEP 0's committed bytes (assets/fonts/*.ttf).
 *
 * Three faces load — the three the type scale actually renders: display is
 * always Bricolage 800, text is Instrument 400 (body) and 700 (rows/labels),
 * each under its OWN family key so 700 is a real face, never a faux-bold on
 * Android. Bricolage 700 is embedded (STEP 0) but unused by the scale, so it is
 * not loaded (a face you don't render is RAM you don't spend on a 1 GB phone).
 */
export const FONTS_TO_LOAD = {
  [DISPLAY_FAMILY]: require('../../assets/fonts/Bricolage-ExtraBold.ttf') as number,
  [TEXT_FAMILY]: require('../../assets/fonts/Instrument-Regular.ttf') as number,
  // 600 backs the reconcile whisper (WO-FP-PWA STEP 0 forward-fix); 500 ships in
  // the shared assets for the PWA but the reseller doesn't render it, so it is
  // not loaded here (a face you don't draw is RAM you don't spend on a 1 GB phone).
  [TEXT_FAMILY_SEMIBOLD]: require('../../assets/fonts/Instrument-SemiBold.ttf') as number,
  [TEXT_FAMILY_BOLD]: require('../../assets/fonts/Instrument-Bold.ttf') as number,
} as const;
