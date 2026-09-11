/**
 * WO-4.0 — the PREVIEW PROFILE signal. `EXPO_PUBLIC_PROFILE` is inlined at
 * bundle time by Expo. UNSET means 'preview': a local Expo Go run, the
 * sandbox that wears « Aperçu — bac à sable » on every screen. The published
 * channel sets it explicitly to 'production' (expo-preview.yml — PROFIL-PUBLIÉ,
 * AUDIT-SHOP-2 F-43): since ACCES-ARME-2 that channel is the delivery road to
 * real resellers, and the explicit value is the only way out of the banner —
 * so a preview build can never be mistaken for it, and it never for one.
 */
export const PREVIEW_PROFILE = 'preview';

export function isPreviewProfile(profile: string | undefined): boolean {
  return (profile ?? PREVIEW_PROFILE) === PREVIEW_PROFILE;
}

// Dot access, deliberately: babel-preset-expo inlines EXPO_PUBLIC_* only on
// the member-expression form — bracket access would survive to runtime unset.
export const IS_PREVIEW = isPreviewProfile(process.env.EXPO_PUBLIC_PROFILE);
