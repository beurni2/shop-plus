#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/**
 * CI gate: no-supplier-contact (SP-I03: "Customer-facing pages MUST show the
 * reseller as the commercial relationship and MUST NOT expose supplier
 * identity/contact or commission."). Recursively scans a customer-surface
 * payload for banned key families: supplier identity/contact, commission,
 * seller economics, pickup locations.
 *
 * PORTES-FRANCAISES-1 (AUDIT-SHOP-2 F-11) — THE GATE READS FRENCH, AND READS
 * VALUES. Five English regexes over KEYS let `{fournisseur, telFournisseur,
 * whatsapp, adresseEntrepot, prixBase, marge, sellerPhone}` through with
 * « OK » (measured). This codebase names things in French, so the next leak
 * key will be French. Now every key is split into accent-folded words
 * (`telFournisseur` → « tel fournisseur », `prix_de_base` → « prix de base »)
 * and matched against BOTH spellings of every family — and every string VALUE
 * is swept for a phone-shaped run of digits with `supply-consumer`'s own
 * CONTACT_NUMBER, the one high-signal content leak (a number typed into a
 * description). Only an ISO date/time SHAPE is excused from the value sweep,
 * never a key name: a leak under `updatedAt` would be a leak.
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: no-supplier-contact.mjs <customer-surface.json>');
  process.exit(2);
}
let payload;
try {
  payload = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`no-supplier-contact: cannot read surface ${file}: ${String(err)}`);
  process.exit(2);
}

/** `telFournisseur` → « tel fournisseur », `adresse_entrepôt` → « adresse entrepot ». */
function motsDeCle(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Matched against the WORDS of a key (see motsDeCle), so « hotel » never
// trips « tel » and « resellerId » never trips « seller ». `(re)?seller net`
// keeps the reseller's own economics off the buyer's page, as the original
// substring match did.
const BANNED = [
  { name: 'supplier identity/contact', regex: /\b(supplier|fournisseur|grossiste)\b/ },
  { name: 'commission', regex: /\bcommission\b/ },
  { name: 'reseller margin', regex: /\b(marge|markup)\b/ },
  { name: 'seller economics', regex: /\b(re)?seller (net|base price|platform fee|gross( earnings)?|phone|tel|telephone|contact|whatsapp)\b/ },
  // `d ?` — « prix d'achat » arrives as prixDAchat, whose words are « prix dachat ».
  { name: 'base price decomposition', regex: /\bbase (price|fcfa)\b|\bprix (de |d ?)?(base|fournisseur|gros|achat)\b/ },
  { name: 'pickup location', regex: /\b(pickup|pick up|entrepot|depot|retrait|enlevement)\b/ },
  { name: 'phone / messaging contact', regex: /\b(tel|telephone|phone|whatsapp|portable)\b/ },
];
// supply-consumer's CONTACT_NUMBER, verbatim: eight or more digits, each
// optionally followed by a space, dot or dash — a Burkina number in any
// customary spelling. An ISO date/time carries eight digits too and is the
// one shape excused.
const CONTACT_NUMBER = /(?:\d[\s.\-]?){8,}/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const hits = [];
function walk(value, path) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'string') {
    if (!ISO_DATE_TIME.test(value) && CONTACT_NUMBER.test(value)) hits.push(`${path} — phone-shaped value`);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const mots = motsDeCle(k);
      for (const { name, regex } of BANNED) {
        if (regex.test(mots)) hits.push(`${path}.${k} — ${name}`);
      }
      walk(v, `${path}.${k}`);
    }
  }
}
walk(payload, '$');
if (hits.length === 0) {
  console.log(`no-supplier-contact OK — ${file} carries no supplier identity/contact/commission (SP-I03)`);
  process.exit(0);
}
console.error(`no-supplier-contact FAILED (SP-I03) — ${hits.length} banned key(s)/value(s) on a customer surface:`);
for (const h of hits) console.error(`  - ${h}`);
process.exit(1);
