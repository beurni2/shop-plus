/**
 * NOM-BOUTIQUE-1 (Building Plan SP5.2 « Store-name moderation on create/rename »).
 *
 * THE ONE RULE SET for a shop's name, applied at the AUTHORITY — the storefront
 * service — on the create command and on the rename patch, never only in the
 * app (an app is one client of many; its limits stop existing the moment a
 * second caller shows up — the MONEY-SHAPE-1 lesson, applied to names).
 *
 * DETERMINISTIC AND EXPLAINABLE (law 5, SP-I18): three named refusals, each a
 * plain rule she can read on her screen, no scoring, no model:
 *
 *   · `name_impersonates_platform` — the name carries a platform name (Shop+,
 *     Boutik+, Séra). SP-I19: the identity hierarchy is Product → Reseller →
 *     Séra → Shop+, never inverted; a shop that calls itself the platform
 *     inverts it. Matched on the accent-stripped, case-folded form so
 *     « SHOP PLUS » and « shop+ » are the same word; « Séra » is matched WITH
 *     its accent only — « sera » is the verb (« Ce sera chic » is a fine name).
 *   · `name_carries_contact` — a phone number, a link, an @handle or a
 *     WhatsApp mention in the name. The name is the one text every customer
 *     surface carries; a number in it is an invitation to pay off the link
 *     (law 2: no personal-account payments, ever) and a channel the signed
 *     link already provides. Her contact has its own field (CONTACT-WHATSAPP-1).
 *   · `name_offensive` — a short list of unambiguous French insults, matched
 *     as WHOLE words on the stripped form (« con » is not listed: « Concorde »,
 *     « confiance »). A SAFEST DEFAULT the founder extends; it is data here,
 *     not a rule, so growing it changes no logic.
 *
 * Order is fixed (platform → contact → words) so the same name always earns the
 * same reason. `undefined` = the name passes this policy (bounds are the
 * core's own checks, before this one).
 */

export type StoreNameRefusal = 'name_impersonates_platform' | 'name_carries_contact' | 'name_offensive';

/** Accent-stripped, case-folded, whitespace-collapsed — the comparison form. */
function stripped(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PLATFORM_WORDS = /\bshop\s*(?:\+|plus)|\bshopplus\b|\bboutik\s*(?:\+|plus)|\bboutikplus\b/;
/** « Séra » as a WHOLE word on the NFC, case-folded raw form (verifier finding:
 *  « Séraphine » and « Séraphin » are first names, not the platform). */
const SERA_WORD = /(?<![a-zà-ÿ])séra(?![a-zà-ÿ])/;

/**
 * A phone number as it is written here: eight or more digits in a row, four
 * groups of two (« 70 12 34 56 »), or an international prefix (« +226 … »).
 * NOT two years with a dash (« Collection 2024-2025 » is a name — verifier
 * finding); « 7012 3456 » therefore also passes, a known gap — the rule is a
 * deterrent against off-link payment, not a wall, and it is journalled.
 */
const PHONE = /\d{8,}|(?:\d{2}[\s.-]){3,}\d{2}|\+\s?\d{3}[\s.-]?\d/;
const LINK = /https?:\/\/|www\.|\.(?:com|bf|net|org|fr|io|co|app|shop)\b/;
const HANDLE = /@[a-z0-9_.]{2,}/;
/** Whole words: « Le Télégramme » is a name (verifier finding). */
const MESSAGING = /\bwhatsapp\b|\bwa\.me\b|\btelegram\b/;

/**
 * FOUNDER-EXTENDABLE safest default — whole words, stripped form. Kept to the
 * UNAMBIGUOUS: « bâtard » (the loaf) and « bite » (the English word, « Quick
 * Bite ») were removed on the verifier's finding — a list that refuses a bakery
 * is a list nobody trusts. He may add or remove; it is data.
 */
const OFFENSIVE_WORDS: ReadonlySet<string> = new Set([
  'merde', 'putain', 'pute', 'putes', 'salope', 'salopes', 'salaud', 'salauds',
  'connard', 'connards', 'connasse', 'connasses', 'encule', 'encules', 'enculee', 'enculees',
  'nique', 'niquer', 'niquez', 'niquee', 'couille', 'couilles', 'chier', 'fdp', 'ntm',
]);

export function refuseStoreName(name: string): StoreNameRefusal | undefined {
  const s = stripped(name);
  if (PLATFORM_WORDS.test(s) || SERA_WORD.test(name.normalize('NFC').toLowerCase())) {
    return 'name_impersonates_platform';
  }
  if (PHONE.test(s) || LINK.test(s) || HANDLE.test(s) || MESSAGING.test(s)) {
    return 'name_carries_contact';
  }
  for (const word of s.split(/[^a-z]+/)) {
    if (word !== '' && OFFENSIVE_WORDS.has(word)) return 'name_offensive';
  }
  return undefined;
}
